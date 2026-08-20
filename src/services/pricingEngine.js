import { formatMoney } from './format'

// Reimplementacion en JS de las formulas reales del tablero "Subelementos de Oportunidades"
// (columnas formula_... del board 18420863061). No leemos el texto ya calculado por monday
// porque esas formulas encadenadas a veces devuelven vacio via API; en cambio recalculamos
// nosotros a partir de los valores crudos, lo que tambien permite recalcular en vivo cuando
// el usuario edita los datos de esa cotización. Detalle completo en /logica-monday-vibe.md.
//
// "overrides" usa los MISMOS nombres de campo que "raw" (contado, bonif, edad, deducibleBase,
// deducibleBSE, edadBSE, deducibleSURA, deducibleSancorUsd, recargo3/6/8/10) — son, literalmente,
// todos los datos fijos con los que se calcula la cotización, editables uno por uno, con el
// valor real cargado en monday como default. La única excepción es "descuento", que no es una
// columna real de monday: es un ajuste manual extra que se suma por arriba.

const BSE_DEDUCIBLE_DISCOUNT = { '1': 0, '0.5': -0.16, '1.5': 0.07, '2': 0.13, '2.5': 0.18, '3': 0.23 }
const BSE_EDAD_DISCOUNT = { '35 a 75': 0.06, '56 a 75': 0.08 }
const SURA_DEDUCIBLE_DISCOUNT = { '1': 0, '1.3': 0, '2': 0.2 }

const BSE_TRIPLE_COBERTURAS = ['TRIPLE - anual', 'TRIPLE - 3X2']
const SURA_TOTAL_FAMILY = ['TOTAL PLUS', 'TOTAL c/ Mov', 'TOTAL', 'TRIPLE']
const SANCOR_STANDARD_FAMILY = ['TOTAL 600', 'TOTAL 800', 'PARCIAL', 'TOTAL 1500', 'TOTAL 2500']
const PORTO_FAMILY = ['GLOBAL', 'GLOBAL ded Alto', 'TRIPLE']
// GLOBAL y GLOBAL ded Alto comparten texto INCLUYE (solo cambia deducible/precio, no el
// texto) y son las únicas que ofrecen los 3 opcionales (Granizo/Cristales/Coche
// Cortesía) — TRIPLE (RC+Hurto+Incendio, nivel más bajo de PORTO) no los ofrece.
const PORTO_GLOBAL_FAMILY = ['GLOBAL', 'GLOBAL ded Alto']

// Promo "N cuotas SIN RECARGO" por débito automático — verificado contra el Excel de
// referencia (hoja WHATS): BSE/SURA ofrecen 10, SANCOR 2, PORTO 5. Es el total (sin
// ningún recargo) dividido en N, no la fila "10 CTAS" de la tabla de cuotas (esa sí
// tiene recargo). Ver /logica-monday-vibe.md.
const PROMO_CUOTAS_SIN_RECARGO = { BSE: 10, SURA: 10, SANCOR: 2, PORTO: 5 }

const CUOTA_COUNTS = [3, 6, 8, 10]

// Coberturas cuyo texto INCLUYE real (verificado contra la fórmula de monday antes de
// migrarlo a PANEL) agrega la viñeta "REPUESTOS ORIGINALES" si el año del vehículo es
// mayor o igual al mínimo configurado en PANEL (Grupo=Configuracion). Las 3 que NO
// están acá (SURA "TOTAL", "TOTAL c/ Mov", "TOTAL PLUS") no la agregan nunca — "TOTAL"
// aclara explícitamente que NO incluye repuestos originales, "TOTAL c/ Mov" nunca la
// menciona, y "TOTAL PLUS" ya la trae fija en su texto (evitar duplicarla).
const REPUESTOS_ORIGINALES_COBERTURAS = new Set([
  'GLOBAL - anual',
  'GLOBAL - 3x2',
  'TRIPLE - anual',
  'TRIPLE - 3X2',
  'TRIPLE', // SURA (distinto de "TRIPLE - anual"/"TRIPLE - 3X2" de BSE) y PORTO (comparten el string)
  '4 EN 1',
  'TOTAL 600',
  'TOTAL 800',
  'TOTAL 1500',
  'TOTAL 2500',
  'PARCIAL',
  'PARCIAL PLUS',
  'GLOBAL', // PORTO
  'GLOBAL ded Alto', // PORTO
])

// SANCOR "PARCIAL" siempre dice 3 servicios (no depende del Uso); las demás coberturas
// SANCOR (TOTAL 600/800/1500/2500 y PARCIAL PLUS) sí varían según Uso = PARTICULAR.
function sancorAuxilioMecanico(eff) {
  const servicios =
    eff.cobertura === 'PARCIAL' || eff.uso !== 'PARTICULAR'
      ? '3 SERVICIOS POR AÑO, MÁX. 2 EN UN MES'
      : '10 SERVICIOS POR AÑO, MÁX. 2 EN UN MES'
  return `AUXILIO MECÁNICO SIN LÍMITE DE KM EN UY Y HASTA 300 KM EN MERCOSUR. ${servicios}`
}

// PORTO TRIPLE siempre dice "3 SERVICIOS POR AÑO" (fijo); GLOBAL/GLOBAL ded Alto varían
// según antigüedad del vehículo — "SERVICIOS ILIMITADOS" si el año es mayor o igual al
// configurado en PANEL ("Antigüedad servicios ilimitados PORTO", Grupo=Configuracion),
// si no "5 SERVICIOS POR AÑO". Verificado contra la fórmula real del Excel (hoja WHATS,
// bloque PORTO) antes de que existiera como columna de monday.
function portoAuxilioMecanico(eff, serviciosIlimitadosPortoMinYear) {
  if (eff.cobertura === 'TRIPLE') {
    return 'AUXILIO MECÁNICO SIN LÍMITE DE KM DENTRO DE MERCOSUR, 3 SERVICIOS POR AÑO'
  }
  const anio = Number(eff.anioVehiculo)
  const minYear = Number(serviciosIlimitadosPortoMinYear)
  const ilimitado = Number.isFinite(anio) && Number.isFinite(minYear) && anio >= minYear
  return `AUXILIO MECÁNICO SIN LÍMITE DE KM DENTRO DE MERCOSUR, ${
    ilimitado ? 'SERVICIOS ILIMITADOS' : '5 SERVICIOS POR AÑO'
  }`
}

// Opcionales de PORTO - TOTAL (Granizo/Cristales/Coche Cortesía): en el Excel son 3
// celdas SI/NO que la persona que cotiza carga a mano por cotización (WHATS!AV88/AV90/
// AV92) — acá son los checkboxes reales del subitem (raw.granizo/cristales/cocheCortesia,
// ver quoteMapper.js), porque es un dato real de la cotización, no un ajuste de prueba
// (a diferencia de Bonificación/Descuento en QuoteCard, esto se persiste en monday apenas
// se tilda). Si está tildado, la viñeta dice "INCLUYE ..."; si no, "OPCIONAL: ... + $N"
// con el precio que carga el precioOpcionalesPorto (PANEL, Grupo=Configuracion).
const PORTO_OPCIONALES = [
  { field: 'granizo', precioKey: 'granizo', label: 'GRANIZO SIN DEDUCIBLE' },
  { field: 'cocheCortesia', precioKey: 'cocheCortesia', label: 'COCHE CORTESÍA (15 DÍAS)' },
  { field: 'cristales', precioKey: 'cristales', label: 'VIDRIOS HASTA U$S 200 SIN DEDUCIBLE' },
]

function portoOpcionalesBullets(eff, preciosOpcionalesPorto) {
  return PORTO_OPCIONALES.map(({ field, precioKey, label }) => {
    if (eff[field]) return `INCLUYE ${label}`
    const precio = preciosOpcionalesPorto?.[precioKey]
    return `OPCIONAL: ${label} + ${formatMoney(precio)}`
  })
}

// El texto "base" (compañía+cobertura) sale de PANEL (services/recargoPanel.js#fetchPanelData,
// Grupo=Incluye) — ahí solo vive lo que NO cambia por oportunidad. Acá se arma alrededor
// lo que sí depende de la oportunidad puntual: para SANCOR y PORTO, el auxilio mecánico +
// la cantidad de servicios (según Uso o antigüedad); para las coberturas de
// REPUESTOS_ORIGINALES_COBERTURAS, esa viñeta si el año del vehículo llega al mínimo
// configurado en PANEL; para PORTO además la viñeta de "REPOSICIÓN 0KM" (mismo mecanismo,
// otro mínimo configurado) y, solo para GLOBAL/GLOBAL ded Alto, los 3 opcionales de
// Granizo/Cristales/Coche Cortesía (TRIPLE no los ofrece). Reemplaza la vieja cadena de
// columnas "formula_..." del subitem (demasiado frágil ante cualquier columna que se
// borrara en el medio). Ver /logica-monday-vibe.md.
function buildIncluyeBullets(eff, panelContext) {
  const {
    incluyeLookup,
    repuestosOriginalesMinYear,
    reposicion0kmMinYear,
    serviciosIlimitadosPortoMinYear,
    preciosOpcionalesPorto,
  } = panelContext

  const baseText = incluyeLookup?.[eff.compania]?.[eff.cobertura]
  if (!baseText) return []

  const bullets = baseText
    .split('●')
    .map((s) => s.trim())
    .filter(Boolean)

  if (eff.compania === 'SANCOR') {
    bullets.unshift(sancorAuxilioMecanico(eff))
  }
  if (eff.compania === 'PORTO') {
    bullets.unshift(portoAuxilioMecanico(eff, serviciosIlimitadosPortoMinYear))
  }

  if (eff.compania === 'PORTO') {
    const anio = Number(eff.anioVehiculo)
    const minYear = Number(reposicion0kmMinYear)
    if (Number.isFinite(anio) && Number.isFinite(minYear) && anio >= minYear) {
      bullets.push('REPOSICIÓN 0KM EL PRIMER AÑO DE EMPADRONADO')
    }
  }

  if (REPUESTOS_ORIGINALES_COBERTURAS.has(eff.cobertura)) {
    const anio = Number(eff.anioVehiculo)
    const minYear = Number(repuestosOriginalesMinYear)
    if (Number.isFinite(anio) && Number.isFinite(minYear) && anio >= minYear) {
      bullets.push('REPUESTOS ORIGINALES')
    }
  }

  if (eff.compania === 'PORTO' && PORTO_GLOBAL_FAMILY.includes(eff.cobertura)) {
    bullets.push(...portoOpcionalesBullets(eff, preciosOpcionalesPorto))
  }

  return bullets
}

function num(value, fallback = 0) {
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

function round(value) {
  return Math.round(value)
}

function roundUpCents(value) {
  return Math.ceil(value)
}

// Deducible BSE/SURA (ver QuoteCard.jsx#handleReset): a diferencia del resto de los
// campos (Bonificación, Descuento, RC...), acá el dato real del subitem no es un valor
// comercial que tenga sentido recuperar — "Restablecer" debe dejarlo sin definir en vez
// de reaparecer solo con lo que sea que traiga monday. Por eso, para estas 2 claves
// puntuales, un override vacío SÍ pisa el valor real (a propósito distinto del resto).
const EXPLICITLY_CLEARABLE_KEYS = ['deducibleBSE', 'deducibleSURA']

// Combina el subitem real con los overrides del usuario: un override solo pisa el
// valor real cuando no está vacío — un campo vaciado por el usuario vuelve a usar el
// dato real de monday en vez de calcular con "0" o "undefined" (salvo
// EXPLICITLY_CLEARABLE_KEYS, ver arriba).
function mergeRawWithOverrides(raw, overrides) {
  const effective = { ...raw }
  for (const [key, value] of Object.entries(overrides)) {
    if ((value === '' || value == null) && !EXPLICITLY_CLEARABLE_KEYS.includes(key)) continue
    effective[key] = value ?? ''
  }
  return effective
}

// Calcula el total "contado" base de un subitem segun compañia + cobertura.
// Devuelve null si la combinacion compañia/cobertura no tiene formula definida
// (mismo comportamiento que las formulas de monday, que devuelven "" en ese caso).
function computeContado(eff) {
  const contado = num(eff.contado)
  const bonif = num(eff.bonif) / 100

  if (eff.compania === 'BSE') {
    const dtoDed = BSE_DEDUCIBLE_DISCOUNT[eff.deducibleBSE] ?? 0
    const dtoEdad = BSE_EDAD_DISCOUNT[eff.edadBSE] ?? 0
    if (eff.cobertura === 'GLOBAL - anual') return round(contado * (1 - bonif) * (1 - dtoEdad) * (1 - dtoDed))
    if (eff.cobertura === 'GLOBAL - 3x2') return round(contado * (1 - dtoEdad) * (1 - dtoDed))
    if (BSE_TRIPLE_COBERTURAS.includes(eff.cobertura)) return round(contado * (1 - bonif))
    return null
  }

  if (eff.compania === 'SURA') {
    const dtoDed = SURA_DEDUCIBLE_DISCOUNT[eff.deducibleSURA] ?? 0
    if (SURA_TOTAL_FAMILY.includes(eff.cobertura)) return round(contado * (1 - dtoDed) * (1 - bonif))
    if (eff.cobertura === '4 EN 1') return round(contado)
    return null
  }

  if (eff.compania === 'SANCOR') {
    if (eff.cobertura === 'PARCIAL PLUS') return round(contado)
    if (SANCOR_STANDARD_FAMILY.includes(eff.cobertura)) return round(contado * (1 - bonif))
    return null
  }

  if (eff.compania === 'PORTO') {
    if (PORTO_FAMILY.includes(eff.cobertura)) return round(contado * (1 - bonif))
    return null
  }

  return null
}

// A diferencia de "computeContado" (que devuelve null cuando no hay fórmula posible),
// esto detecta condiciones que SÍ tienen un número calculable pero no cumplen un
// requisito del negocio — se muestra igual la cotización, con una advertencia.
// {short, full}: "short" es lo que se ve siempre en la tarjeta (a nivel cotización, sin
// desplegar nada); "full" es la versión con el detalle completo (compañía, requisito
// puntual), que recién se muestra al desplegar "Ver más" — y la que se manda en la
// imagen de WhatsApp (ver whatsappImage.js), donde sí conviene el detalle completo.
function computeWarning(eff) {
  if (eff.compania === 'SANCOR' && SANCOR_STANDARD_FAMILY.includes(eff.cobertura)) {
    const edad = num(eff.edad)
    if (edad > 0 && edad < 25) {
      return {
        short: 'Edad del titular no cumple el mínimo requerido',
        full: 'Edad del titular no cumple el mínimo requerido por SANCOR (25 años). Cotización orientativa.',
      }
    }
  }
  return null
}

function deducibleDisplay(eff) {
  const base = num(eff.deducibleBase)
  if (eff.compania === 'BSE') {
    if (['GLOBAL - anual', 'GLOBAL - 3x2'].includes(eff.cobertura) && eff.deducibleBSE) {
      return `${Math.ceil(base * num(eff.deducibleBSE))} +IVA`
    }
    if (BSE_TRIPLE_COBERTURAS.includes(eff.cobertura)) return `${Math.ceil(base)} +IVA`
    return '—'
  }
  if (eff.compania === 'SURA') {
    if (SURA_TOTAL_FAMILY.includes(eff.cobertura) && eff.deducibleSURA) {
      return `${Math.ceil(base * num(eff.deducibleSURA))}`
    }
    if (eff.cobertura === '4 EN 1') return `${Math.ceil(base)}`
    return '—'
  }
  if (eff.compania === 'SANCOR') {
    return eff.deducibleSancorUsd ? `USD ${num(eff.deducibleSancorUsd)}` : base ? `${base}` : '—'
  }
  if (eff.compania === 'PORTO') {
    return base ? `${base}` : '—'
  }
  return '—'
}

// overrides: mismos campos que "raw" (contado, bonif, edad, deducibleBase, deducibleBSE,
// edadBSE, deducibleSURA, deducibleSancorUsd, recargo3/6/8/10) + "descuento" (fracción, sin
// columna real). Todos opcionales — un campo ausente o vacío usa el valor real del subitem.
// panelContext: { incluyeLookup, repuestosOriginalesMinYear, reposicion0kmMinYear,
// serviciosIlimitadosPortoMinYear, preciosOpcionalesPorto } — de
// recargoPanel.js#fetchPanelData (schema cargado una vez al iniciar la app), no un dato
// del subitem.
export function computeQuote(raw, overrides = {}, panelContext = {}) {
  const eff = mergeRawWithOverrides(raw, overrides)
  const contadoResult = computeContado(eff)

  if (contadoResult === null) {
    return { blocked: true, blockedReason: 'No hay fórmula definida para esta combinación de compañía y cobertura' }
  }

  const descuento = num(overrides.descuento)
  const total = round(contadoResult * (1 - descuento))

  const cuotas = {}
  for (const n of CUOTA_COUNTS) {
    const recargo = num(eff[`recargo${n}`])
    const totalConRecargo = round(total * (1 + recargo))
    cuotas[n] = { total: totalConRecargo, valor: roundUpCents(totalConRecargo / n) }
  }

  const promoCount = PROMO_CUOTAS_SIN_RECARGO[eff.compania] ?? null
  const promo = promoCount ? { count: promoCount, valor: roundUpCents(total / promoCount) } : null

  return {
    blocked: false,
    total,
    cuotas,
    promo,
    deducibleDisplay: deducibleDisplay(eff),
    warning: computeWarning(eff),
    incluye: buildIncluyeBullets(eff, panelContext),
    rc: eff.rc || '',
  }
}
