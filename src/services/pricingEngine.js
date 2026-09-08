import { formatMoney, formatUsd } from './format'
import { coberturaGroupOf } from './coberturaGroups'

// Reimplementacion en JS de las formulas reales del tablero "Subelementos de Oportunidades"
// (columnas formula_... del board 18420863061). No leemos el texto ya calculado por monday
// porque esas formulas encadenadas a veces devuelven vacio via API; en cambio recalculamos
// nosotros a partir de los valores crudos, lo que tambien permite recalcular en vivo cuando
// el usuario edita los datos de esa cotización. Detalle completo en /logica-monday-vibe.md.
//
// "overrides" usa los MISMOS nombres de campo que "raw" (contado, bonif, edad, deducibleBase,
// deducibleBSE, edadBSE, deducibleSURA, deducibleSancorUsd, recargo3/6/8/10) — son, literalmente,
// todos los datos fijos con los que se calcula la cotización, editables uno por uno, con el
// valor real cargado en monday como default.
//
// LOG-11: antes había además un "descuento" suelto (sin columna real) que se multiplicaba
// después de la bonificación, así que cargar 10 y 10 no daba 20% sino 19%. Quedó una sola
// palanca: la Bonificación, aplicada una vez sobre el total (ver computeQuote).

const BSE_DEDUCIBLE_DISCOUNT = { '1': 0, '0.5': -0.16, '1.5': 0.07, '2': 0.13, '2.5': 0.18, '3': 0.23 }
const BSE_EDAD_DISCOUNT = { '35 a 75': 0.06, '56 a 75': 0.08 }
const SURA_DEDUCIBLE_DISCOUNT = { '1': 0, '1.3': 0, '2': 0.2 }

const BSE_TRIPLE_COBERTURAS = ['TRIPLE - anual', 'TRIPLE - 3X2']
const SURA_TOTAL_FAMILY = ['TOTAL PLUS', 'TOTAL c/ Mov', 'TOTAL', 'TRIPLE']
const SANCOR_STANDARD_FAMILY = ['TOTAL 600', 'TOTAL 800', 'PARCIAL', 'TOTAL 1500', 'TOTAL 2500']
const PORTO_FAMILY = ['GLOBAL', 'GLOBAL ded Alto', 'TRIPLE']

// Promo "N cuotas SIN RECARGO" por débito automático — verificado contra el Excel de
// referencia (hoja WHATS): BSE/SURA ofrecen 10, SANCOR 2, PORTO 5. Es el total (sin
// ningún recargo) dividido en N, no la fila "10 CTAS" de la tabla de cuotas (esa sí
// tiene recargo). Ver /logica-monday-vibe.md.
const PROMO_CUOTAS_SIN_RECARGO = { BSE: 10, SURA: 10, SANCOR: 2, PORTO: 5 }
// LOG-16: condición para acceder a esas cuotas sin recargo. Solo BSE y SURA la tienen.
const PROMO_CONDICION = {
  BSE: 'Pagando con tarjeta o débito en cuenta',
  SURA: 'Pagando con tarjeta o débito en cuenta',
}

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

// Opcionales por compañía. Cada uno es una columna real del subitem (ver quoteMapper.js),
// porque es un dato de la cotización que se persiste en monday apenas se tilda — a
// diferencia de la Bonificación en QuoteCard, que es un ajuste de prueba.
// `precioKey` es el NOMBRE de la fila en PANEL (Grupo=Configuracion) de esa compañía, ver
// recargoPanel.js#buildConfiguracion.
//
// LOG-14/LOG-15: hasta ahora esto solo cambiaba el texto de la viñeta y el precio nunca
// se movía. Ahora los opcionales SUMAN al total (ver computeAdicionales), salvo el AP de
// SURA, que ya viene adentro del contado que trae el portal: ese arranca tildado y, al
// destildarlo, se RESTA.
const OPCIONALES = {
  PORTO: [
    { field: 'granizo', precioKey: 'Granizo', label: 'GRANIZO SIN DEDUCIBLE' },
    { field: 'cristales', precioKey: 'Cristales', label: 'VIDRIOS HASTA U$S 200 SIN DEDUCIBLE' },
    { field: 'usoRural', precioKey: 'Uso rural', label: 'USO RURAL' },
  ],
  SURA: [
    { field: 'granizo', precioKey: 'Granizo', label: 'GRANIZO SIN DEDUCIBLE' },
    { field: 'suraTeLleva', precioKey: 'SURA te lleva', label: 'SURA TE LLEVA' },
    // Incluido en el precio del portal: destildarlo descuenta.
    { field: 'ap', precioKey: 'AP', label: 'ACCIDENTES PERSONALES', incluidoPorDefecto: true },
  ],
}

// "Auto extra" no es un tilde sino una duración elegida (7/15/30 días en PORTO, solo 15
// en SURA): cada opción tiene su propia fila de precio en PANEL.
const AUTO_EXTRA_LABEL = 'AUTO EXTRA'
const autoExtraPrecioKey = (dias) => `Auto extra ${dias}`

function preciosDe(eff, preciosOpcionales) {
  return preciosOpcionales?.[eff.compania] ?? {}
}

// LOG-15: qué coberturas ofrecen opcionales. "Todo riesgo" y "parcial" no son nombres de
// cobertura sino las 2 familias que la app ya usa para las solapas del paso Comparar —
// GLOBAL es todo riesgo y TRIPLE es parcial (ver coberturaGroups.js).
//  - Los opcionales que se tildan van solo en TODO RIESGO.
//  - "Auto extra" es la excepción: va en todo riesgo Y en parcial (ver autoExtraDisponible).
//  - SURA es más restrictivo por encima de eso: solo TOTAL (y TOTAL PLUS, que ya los trae
//    todos incluidos), más Granizo en 4 EN 1.
function opcionalesDisponibles(eff) {
  const delaCompania = OPCIONALES[eff.compania]
  if (!delaCompania) return []
  if (eff.compania === 'SURA') {
    if (eff.cobertura === 'TOTAL' || eff.cobertura === 'TOTAL PLUS') return delaCompania
    if (eff.cobertura === '4 EN 1') return delaCompania.filter((o) => o.field === 'granizo')
    return []
  }
  return coberturaGroupOf(eff.cobertura) === 'GLOBAL' ? delaCompania : []
}

// Auto extra: única opción que también se ofrece en cobertura parcial (familia TRIPLE),
// no solo en todo riesgo. En SURA sigue mandando la regla propia de la compañía: solo
// TOTAL (TOTAL PLUS ya lo trae incluido, ver todosIncluidos).
function autoExtraDisponible(eff) {
  if (todosIncluidos(eff) || !OPCIONALES[eff.compania]) return false
  if (eff.compania === 'SURA') return eff.cobertura === 'TOTAL'
  const familia = coberturaGroupOf(eff.cobertura)
  return familia === 'GLOBAL' || familia === 'TRIPLE'
}

// SURA TOTAL PLUS ya viene con todos los opcionales adentro: se muestran como incluidos y
// no suman ni restan nada.
const todosIncluidos = (eff) => eff.compania === 'SURA' && eff.cobertura === 'TOTAL PLUS'

// Qué opcionales puede tocar el usuario en esta cotización — lo usa QuoteCard para no
// mostrar controles que no harían nada (ej. PORTO TRIPLE no ofrece ninguno). Es la misma
// regla que decide el precio, para que UI y cálculo no se contradigan.
export function opcionalesEditables(raw) {
  if (todosIncluidos(raw)) return { campos: [], autoExtra: false }
  return { campos: opcionalesDisponibles(raw).map((o) => o.field), autoExtra: autoExtraDisponible(raw) }
}

// Lo que hay que sumarle (o restarle) al precio base por los opcionales de esta
// cotización. Los que vienen incluidos por defecto (AP de SURA) restan cuando se
// destildan; el resto suma cuando se tilda.
function computeAdicionales(eff, preciosOpcionales) {
  if (todosIncluidos(eff)) return 0
  const precios = preciosDe(eff, preciosOpcionales)
  let total = 0
  for (const opc of opcionalesDisponibles(eff)) {
    const precio = num(precios[opc.precioKey])
    if (!precio) continue
    if (opc.incluidoPorDefecto) {
      if (eff[opc.field] === false) total -= precio
    } else if (eff[opc.field]) {
      total += precio
    }
  }
  if (eff.autoExtra && autoExtraDisponible(eff)) total += num(precios[autoExtraPrecioKey(eff.autoExtra)])
  return total
}

function opcionalesBullets(eff, preciosOpcionales) {
  const disponibles = opcionalesDisponibles(eff)
  if (!disponibles.length) return []
  const precios = preciosDe(eff, preciosOpcionales)
  const bullets = []
  for (const opc of disponibles) {
    const incluido = todosIncluidos(eff) || (opc.incluidoPorDefecto ? eff[opc.field] !== false : Boolean(eff[opc.field]))
    if (incluido) bullets.push(`INCLUYE ${opc.label}`)
    else bullets.push(`OPCIONAL: ${opc.label} + ${formatMoney(precios[opc.precioKey])}`)
  }
  if (eff.autoExtra) {
    bullets.push(`INCLUYE ${AUTO_EXTRA_LABEL} (${eff.autoExtra.toUpperCase()})`)
  } else if (autoExtraDisponible(eff)) {
    const preciosAutoExtra = Object.keys(precios)
      .filter((k) => k.startsWith('Auto extra '))
      .map((k) => num(precios[k]))
      .filter(Boolean)
    if (preciosAutoExtra.length) {
      bullets.push(`OPCIONAL: ${AUTO_EXTRA_LABEL} desde ${formatMoney(Math.min(...preciosAutoExtra))}`)
    }
  }
  return bullets
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
    preciosOpcionales,
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

  bullets.push(...opcionalesBullets(eff, preciosOpcionales))

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
// LOG-11: la bonificación ya NO se aplica acá. Esto devuelve el precio base con los
// descuentos propios de cada compañía (deducible y edad en BSE, deducible en SURA); la
// bonificación se aplica una sola vez sobre ese total, en computeQuote.
function computeContado(eff) {
  const contado = num(eff.contado)

  if (eff.compania === 'BSE') {
    const dtoDed = BSE_DEDUCIBLE_DISCOUNT[eff.deducibleBSE] ?? 0
    const dtoEdad = BSE_EDAD_DISCOUNT[eff.edadBSE] ?? 0
    if (eff.cobertura === 'GLOBAL - anual' || eff.cobertura === 'GLOBAL - 3x2') {
      return round(contado * (1 - dtoEdad) * (1 - dtoDed))
    }
    if (BSE_TRIPLE_COBERTURAS.includes(eff.cobertura)) return round(contado)
    return null
  }

  if (eff.compania === 'SURA') {
    const dtoDed = SURA_DEDUCIBLE_DISCOUNT[eff.deducibleSURA] ?? 0
    if (SURA_TOTAL_FAMILY.includes(eff.cobertura)) return round(contado * (1 - dtoDed))
    if (eff.cobertura === '4 EN 1') return round(contado)
    return null
  }

  if (eff.compania === 'SANCOR') {
    if (eff.cobertura === 'PARCIAL PLUS') return round(contado)
    if (SANCOR_STANDARD_FAMILY.includes(eff.cobertura)) return round(contado)
    return null
  }

  if (eff.compania === 'PORTO') {
    if (PORTO_FAMILY.includes(eff.cobertura)) return round(contado)
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
// LOG-15: SANCOR no admite descuento si el titular es menor de 25 o mayor de 70 — con la
// edad fuera de ese rango la bonificación se ignora (ver bonificacionAplicable).
function sancorSinDescuento(eff) {
  if (eff.compania !== 'SANCOR' || !SANCOR_STANDARD_FAMILY.includes(eff.cobertura)) return false
  const edad = num(eff.edad)
  return edad > 0 && (edad < 25 || edad > 70)
}

// Coberturas cuya fórmula real nunca tomó bonificación: el precio sale tal cual lo cotizó
// el portal. Se respeta lo que hacían las fórmulas de monday — si alguna de estas sí
// admite bonificación, se saca de esta lista y listo.
const COBERTURAS_SIN_BONIFICACION = new Set(['GLOBAL - 3x2', '4 EN 1', 'PARCIAL PLUS'])

// LOG-11: cuánta bonificación entra en el cálculo, como fracción. 0 cuando la cobertura no
// la admite o cuando SANCOR la bloquea por la edad del titular (LOG-15).
function bonificacionAplicable(eff) {
  if (COBERTURAS_SIN_BONIFICACION.has(eff.cobertura) || sancorSinDescuento(eff)) return 0
  return num(eff.bonif) / 100
}

function computeWarning(eff) {
  if (sancorSinDescuento(eff)) {
    const edad = num(eff.edad)
    // El aviso de la edad mínima ya existía; ahora también cubre el tope de 70 y aclara
    // que por eso no se aplica la bonificación.
    const motivo = edad < 25 ? 'no cumple el mínimo requerido por SANCOR (25 años)' : 'supera el máximo de SANCOR (70 años)'
    return {
      short: edad < 25 ? 'Edad del titular no cumple el mínimo requerido' : 'Edad del titular supera el máximo permitido',
      full: `Edad del titular ${motivo}: no se aplica bonificación. Cotización orientativa.`,
    }
  }
  return null
}

// LOG-10: los montos en pesos salían como número pelado ("18000") — ahora todos pasan por
// formatMoney ("$ 18.000") y los de SANCOR en dólares por formatUsd, para que no queden
// tres formatos distintos de deducible según la compañía.
function deducibleDisplay(eff) {
  const base = num(eff.deducibleBase)
  if (eff.compania === 'BSE') {
    if (['GLOBAL - anual', 'GLOBAL - 3x2'].includes(eff.cobertura) && eff.deducibleBSE) {
      return `${formatMoney(Math.ceil(base * num(eff.deducibleBSE)))} sin IVA`
    }
    if (BSE_TRIPLE_COBERTURAS.includes(eff.cobertura)) return `${formatMoney(Math.ceil(base))} sin IVA`
    return '—'
  }
  if (eff.compania === 'SURA') {
    if (SURA_TOTAL_FAMILY.includes(eff.cobertura) && eff.deducibleSURA) {
      return formatMoney(Math.ceil(base * num(eff.deducibleSURA)))
    }
    if (eff.cobertura === '4 EN 1') return formatMoney(Math.ceil(base))
    return '—'
  }
  if (eff.compania === 'SANCOR') {
    return eff.deducibleSancorUsd ? formatUsd(num(eff.deducibleSancorUsd)) : base ? formatMoney(base) : '—'
  }
  if (eff.compania === 'PORTO') {
    return base ? formatMoney(base) : '—'
  }
  return '—'
}

// overrides: mismos campos que "raw" (contado, bonif, edad, deducibleBase, deducibleBSE,
// edadBSE, deducibleSURA, deducibleSancorUsd, recargo3/6/8/10). Todos opcionales — un
// campo ausente o vacío usa el valor real del subitem.
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

  // LOG-11: una sola palanca comercial (Bonificación), aplicada siempre sobre el total.
  // Antes eran dos (Bonificación y Descuento) que se multiplicaban una tras otra, así que
  // "10 y 10" no daba 20% sino 19%.
  // LOG-14/LOG-15: los opcionales se suman DESPUÉS de la bonificación — no los toca. El AP
  // de SURA es al revés: ya viene incluido en el contado del portal, así que solo mueve el
  // precio cuando se destilda, restando.
  const bonif = bonificacionAplicable(eff)
  const adicionales = computeAdicionales(eff, panelContext.preciosOpcionales)
  const total = round(contadoResult * (1 - bonif) + adicionales)

  const cuotas = {}
  for (const n of CUOTA_COUNTS) {
    const recargo = num(eff[`recargo${n}`])
    const totalConRecargo = round(total * (1 + recargo))
    cuotas[n] = { total: totalConRecargo, valor: roundUpCents(totalConRecargo / n) }
  }

  const promoCount = PROMO_CUOTAS_SIN_RECARGO[eff.compania] ?? null
  const promo = promoCount
    ? {
        count: promoCount,
        valor: roundUpCents(total / promoCount),
        // LOG-16: en BSE y SURA las cuotas sin recargo no son para cualquier forma de
        // pago, y eso no se aclaraba en ningún lado — se mostraban como si fueran la
        // oferta normal. SANCOR y PORTO no tienen esta condición.
        condicion: PROMO_CONDICION[eff.compania] ?? null,
      }
    : null

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

// A pedido: una cotización sin fórmula (blocked) o con COSTO TOTAL en 0 no se puede
// seleccionar para nada — ni para enviar por WhatsApp (paso 2) ni como elegida (paso 3).
// Se muestra atenuada. Regla única para las dos pantallas.
export function isQuoteSelectable(quote) {
  return Boolean(quote) && !quote.blocked && Number(quote.total) > 0
}
