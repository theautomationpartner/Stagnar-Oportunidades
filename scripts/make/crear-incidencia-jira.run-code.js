// Run code del escenario de Make "[TAP] Crear Incidencia en Jira": arma, a partir de la
// Oportunidad de monday, el pedido para crear la incidencia SEGURO NUEVO del proyecto AUTO.
// No llama a nadie: valida, mapea y devuelve el payload listo; Jira y monday los tocan los
// módulos que siguen.
//
// Vive en el repo aunque corra en Make por lo mismo que validacion-poliza.run-code.js: el
// precio se calcula igual que en la app (src/services/pricingEngine.js y recargoPanel.js),
// y si las dos copias no se ven se despegan. Matías pidió que en Jira vaya el precio que
// vio el cliente, no el contado que trae Wink.
//
// Reglas: "Monday → Jira: botón Seguro Nuevo Autos" (9/10) y las decisiones que se
// tomaron después (doc "Botón Cargar en Jira: puntos a aclarar").
//
// ENTRADA:
//   input.oportunidadId     = {{2.id}}            (módulo Get Oportunidad, Get Item)
//   input.oportunidadNombre = {{2.name}}
//   input.oportunidad       = {{2.column_values}} — el arreglo de columnas tal cual.
//   input.cotizaciones      = {{3.body}} — query 1 (crear-incidencia-jira.cotizacion.graphql):
//                             las que tienen "Propuesta elegida" tildada. Tiene que ser una
//                             sola. Sirve también {{3.body.data.boards[1].items_page.items}}.
//   input.complementos      = {{9.body}} — query 2 (crear-incidencia-jira.complementos.graphql).
//   Con el body entero, un error de la consulta (monday lo contesta con status 200) se
//   informa como tal.
// No se usa {{1.event.userId}}: el cambio de columna lo hace la cuenta de la integración
// (The Automation Partner), no la persona, y desde la app el disparo trae solo el pulseId.
// Cualquiera de las entradas puede llegar también como JSON en texto.
//
// SALIDA:
//   ok           = false si falta algo para crear la incidencia: no se crea nada.
//   error        = el motivo, para la actualización del ítem (solo con ok = false).
//   payloadJson  = el body de POST /rest/api/3/issue, como texto. El assignee va como
//                  "__ASSIGNEE__": Jira no acepta emails, así que el accountId se busca
//                  antes con GET /rest/api/3/user/search?query={{asignadoEmail}} y se
//                  reemplaza con replace().
//   asignadoEmail, asignadoNombre
//   resumen      = el summary, para los mensajes.
//   adjuntos     = [{ assetId, nombre }]: assetId para monday "Download a file", nombre
//                  (con prefijo "CI - ", "LIBRETA - "…) para Jira "Add an attachment".
//   respuestaJson = solo con ok = false: el body para el Webhook Response.
//   faltaCompletar, avisos = listas de texto para la actualización del ítem.

// ───────────────────────── columnas de monday ─────────────────────────
const COL = {
  // Oportunidad
  nombre: 'text_mm51b055',
  apellido: 'text_mm51ez7e',
  cedula: 'numeric_mm51mb0s',
  fechaNacimiento: 'date_mm516agw',
  edad: 'numeric_mm527wpm',
  telefono: 'phone_mm519m27',
  asignado: 'deal_owner',
  tipoRiesgo: 'color_mm5atxav',
  tipoOportunidad: 'color_mm5jk7cb',
  uso: 'color_mm52ey1d',
  cuotasElegidas: 'color_mm71kfpr',
  modelo: 'text_mm54fb7m',
  anio: 'dropdown_mm51mdmq',
  tipo: 'dropdown_mm5jqdk',
  combustible: 'dropdown_mm52jp01',
  matricula: 'text_mm71dyf0',
  chasis: 'text_mm711jjs',
  motor: 'text_mm711cng',
  ubicacionCirculacion: 'location_mm51e7g7',
  ubicacionResidencia: 'location_mm52sy4j',
  localidad: 'board_relation_mm5sqf8t',
  contacto: 'board_relation_mm4t623x',
  cliente: 'board_relation_mm4qg1n2',
  archivoCedula: 'file_mm5pc008',
  archivoVehiculo: 'file_mm51jy06',
  archivoCotizacion: 'file_mm54css0',
  // "Jira Link": si ya tiene la incidencia, no se crea otra (botón apretado dos veces).
  incidenciaJira: 'link_mm83vpa3',
  // Contactos
  ctoTelefono: 'contact_phone',
  ctoEmail: 'contact_email',
  ctoTipo: 'dropdown_mm7q3zhr',
  // Clientes
  cliCedula: 'text_mm4vk9aq',
  cliDireccion: 'long_text_mm6m7d8c',
  cliCedulaFrente: 'file_mm65486d',
  cliLocalidad: 'board_relation_mm65e7he',
  // Subitem (cotización)
  subElegida: 'boolean_mm5bn41n',
  subCompania: 'dropdown_mm51f4va',
  subCobertura: 'dropdown_mm4w8n8p',
  subContado: 'numeric_mm4pc2y1',
  subDeducible: 'numeric_mm519my9',
  subDeducibleSancor: 'numeric_mm59qzvf',
  subEdad: 'numeric_mm592zyk',
  subDeducibleBSE: 'dropdown_mm52dm1j',
  subDeducibleSURA: 'dropdown_mm5fb4y0',
  subBonif: 'numeric_mm52ey7f',
  subBns: 'numeric_mm7nrezs',
  subFlota: 'numeric_mm7nmnk0',
  subEdadBSE: 'dropdown_mm52p7yx',
  subRc: 'dropdown_mm5954ma',
  subGranizo: 'boolean_mm5fsr46',
  subCristales: 'boolean_mm5fqazp',
  subCocheCortesia: 'boolean_mm5fxd9x',
  subUsoRural: 'boolean_mm6z3j9j',
  subSuraTeLleva: 'boolean_mm6zhfhd',
  subAp: 'boolean_mm6zzwq5',
  subAutoExtra: 'color_mm6zpx3j',
  // PANEL
  panGrupo: 'color_mm5fdknw',
  panCompania: 'dropdown_mm52feqr',
  panCuota: 'numeric_mm52f3n3',
  panRecargo: 'numeric_mm52yezv',
  panValor: 'numeric_mm5fmjh0',
}

const VALIDACIONES = [
  ['Persona', 'color_mm7a2pek', 'text_mm7aht52'],
  ['Vehículo', 'color_mm7a61dm', 'text_mm7az2f0'],
  ['Compañía', 'color_mm7a9rjz', 'text_mm7ap30z'],
  ['Cotización', 'color_mm7agwbv', 'text_mm7ab1sw'],
]

const MONDAY_URL = 'https://stagnariseguros.monday.com/boards/18420863013/pulses/'

// ───────────────────────── equivalencias con Jira ─────────────────────────
// Siempre el id de la opción, no el texto (metadatos de creación de AUTO / SEGURO NUEVO).
const JIRA = {
  proyecto: 'AUTO',
  tipoIncidencia: '10001',
  documento: 'customfield_10067',
  vehiculo: 'customfield_10048',
  zona: 'customfield_10107',
  uso: 'customfield_10108',
  inicioVigencia: 'customfield_10024',
  compania: 'customfield_10031',
  cobertura: 'customfield_10051',
  coberturaVehiculos: 'customfield_10152',
  periodo: 'customfield_10044',
  costoTotal: 'customfield_10049',
  moneda: 'customfield_10145',
  cuotas: 'customfield_10090',
  bonificacion: 'customfield_10050',
  deducible: 'customfield_10054',
  celular: 'customfield_10029',
  email: 'customfield_10028',
  domicilio: 'customfield_10027',
  referencia: 'customfield_10030',
}

// BARBUSS no tiene opción: la Compañía queda en blanco (en el resumen sí va).
const COMPANIA_JIRA = {
  BSE: '10008', SANCOR: '10009', SURA: '10010', PORTO: '10011', MAPFRE: '10272',
  SBI: '10288', METLIFE: '10374', BERKLEY: '10380',
}
const COMPANIAS_BLOQUEADAS = ['CAUCIONES']

const COB_TOTAL = '10398'
const COB_RC_HTO_INC = '10396'
const COB_RC_HTO_INC_PT = '10401'
const COBERTURA_JIRA = {
  'GLOBAL - 3X2': COB_TOTAL, 'GLOBAL - ANUAL': COB_TOTAL, GLOBAL: COB_TOTAL, 'GLOBAL DED ALTO': COB_TOTAL,
  'TRIPLE - ANUAL': COB_RC_HTO_INC, TRIPLE: COB_RC_HTO_INC, 'TRIPLE - 3X2': COB_RC_HTO_INC,
  TOTAL: COB_TOTAL, 'TOTAL 600': COB_TOTAL, 'TOTAL 800': COB_TOTAL, 'TOTAL 1500': COB_TOTAL,
  'TOTAL 2500': COB_TOTAL, 'TOTAL PLUS': COB_TOTAL, 'TOTAL C/ MOV': COB_TOTAL,
  PARCIAL: COB_RC_HTO_INC, 'PARCIAL PLUS': COB_RC_HTO_INC_PT, '4 EN 1': COB_RC_HTO_INC_PT,
}
const PERIODO_3_ANIOS = '10032'
const PERIODO_ANUAL = '10031'
const MONEDA_PESOS = '10375'

// Los usos sin equivalencia (alquiler, ambulancia, carga, etc.) quedan en blanco.
const USO_JIRA = {
  PARTICULAR: '10243', 'PARTICULAR Y TRABAJO': '10245', 'TRABAJO PERSONAL': '10244',
  APLICACIONES: '10246', UBER: '10246', REMISE: '10247', TAXIMETRO: '10247',
}

// "#¡REF!" (10383) existe en Jira y no se usa nunca.
const CUOTAS_JIRA = { 1: '10282', 2: '10286', 3: '10285', 5: '10291', 6: '10283', 8: '10318', 10: '10284' }

// ───────────────────── precio: copia de pricingEngine.js ─────────────────────
const BSE_DEDUCIBLE_DISCOUNT = { '1': 0, '0.5': -0.16, '1.5': 0.07, '2': 0.13, '2.5': 0.18, '3': 0.23 }
const BSE_EDAD_DISCOUNT = { '35 a 75': 0.06, '56 a 75': 0.08 }
const SURA_DEDUCIBLE_DISCOUNT = { '1': 0, '1.3': 0, '2': 0.2 }
const BSE_TRIPLE_COBERTURAS = ['TRIPLE - anual', 'TRIPLE - 3X2']
const SURA_TOTAL_FAMILY = ['TOTAL PLUS', 'TOTAL c/ Mov', 'TOTAL', 'TRIPLE']
const SANCOR_STANDARD_FAMILY = ['TOTAL 600', 'TOTAL 800', 'PARCIAL', 'TOTAL 1500', 'TOTAL 2500']
const PORTO_FAMILY = ['GLOBAL', 'GLOBAL ded Alto', 'TRIPLE']
const PROMO_CUOTAS_SIN_RECARGO = { BSE: 10, SURA: 10, SANCOR: 2, PORTO: 5 }
const PROMO_CON_DEBITO = ['BSE', 'SURA']
const DEDUCIBLE_POR_DEFECTO = { BSE: '0.5', SURA: '1' }
const SANCOR_DEDUCIBLE_PARCIAL_USD = 400
const BONIF_MAX = 99
const GLOBAL_COBERTURAS = ['GLOBAL - ANUAL', 'GLOBAL - 3X2', 'GLOBAL', 'GLOBAL DED ALTO', 'TOTAL 600', 'TOTAL 800',
  'TOTAL 1500', 'TOTAL 2500', 'TOTAL', 'TOTAL PLUS']
const TRIPLE_COBERTURAS = ['TRIPLE - ANUAL', 'TRIPLE - 3X2', 'TRIPLE', 'PARCIAL', 'PARCIAL PLUS', '4 EN 1']
const OPCIONALES = {
  PORTO: [['granizo', 'Granizo'], ['cristales', 'Cristales'], ['usoRural', 'Uso rural']],
  SURA: [['granizo', 'Granizo'], ['suraTeLleva', 'SURA te lleva'], ['ap', 'AP']],
}

// ───────────────────────── utilidades ─────────────────────────
const texto = (v) => String(v ?? '').trim()
const mayus = (v) => texto(v).toUpperCase()
const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '')
const num = (v, fallback = 0) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}
const valorDe = (cvs, id) => texto((cvs || []).find((c) => c.id === id)?.text)
const columnaDe = (cvs, id) => (cvs || []).find((c) => c.id === id)
const tildado = (cvs, id) => {
  const t = valorDe(cvs, id).toLowerCase()
  return t === 'v' || t === 'true'
}
const parsear = (v) => {
  if (!v) return null
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch (e) { return null }
}
const unir = (partes, sep = ' · ') => partes.filter(Boolean).map(texto).filter(Boolean).join(sep)
const pesos = (n) => '$ ' + Math.round(n).toLocaleString('es-UY')
// Jira rechaza los campos de texto de más de 255 caracteres.
const corto = (v, max = 255) => (texto(v).length > max ? texto(v).slice(0, max - 1) + '…' : texto(v))
const grupoCobertura = (c) => {
  const n = mayus(c)
  if (GLOBAL_COBERTURAS.includes(n)) return 'GLOBAL'
  if (TRIPLE_COBERTURAS.includes(n)) return 'TRIPLE'
  return null
}
const fechaUY = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(iso))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

// "598097132809" → "097 132 809". Un número que no es uruguayo se deja como vino.
function celularUY(v) {
  let d = soloDigitos(v)
  if (!d) return ''
  if (d.startsWith('598')) d = d.slice(3)
  if (d.length === 8 && d.startsWith('9')) d = '0' + d
  if (d.length === 9 && d.startsWith('09')) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return texto(v)
}

// ───────────────────────── datos de entrada ─────────────────────────
// respuestaJson va tal cual al Webhook Response: la app lee {"error": "..."} (ver
// src/services/makeWebhook.js#leerErrorDeMake) y armarlo a mano en Make se rompe con
// cualquier comilla del mensaje.
const fallo = (error) => ({ ok: false, error, respuestaJson: JSON.stringify({ error }) })
const lista0 = (v) => {
  const x = parsear(v)
  return Array.isArray(x) ? x : x ? [x] : []
}
// monday contesta los errores de GraphQL con status 200, así que el módulo de Make no
// falla: si se le pasa el body entero ({{N.body}}), el error se detecta acá en vez de
// terminar en un "no hay cotización elegida" que confunde.
const cuerpo = (v) => {
  let x = parsear(v) || {}
  if (x.body) x = parsear(x.body) || x.body
  return x
}
const erroresGraphql = [cuerpo(input.cotizaciones), cuerpo(input.complementos)]
  .flatMap((x) => (Array.isArray(x.errors) ? x.errors : []))
  .map((e) => texto(e.message))
if (erroresGraphql.length) return fallo('Falló la consulta a monday: ' + erroresGraphql.join('; '))

let comp = cuerpo(input.complementos)
if (comp.data) comp = comp.data
let cotizacionesEntrada = cuerpo(input.cotizaciones)
if (cotizacionesEntrada.data) cotizacionesEntrada = cotizacionesEntrada.data.boards?.[0]?.items_page?.items || []

const cv = lista0(input.oportunidad)
if (!cv.length || !input.oportunidadId) return fallo('No se encontró la oportunidad en monday.')
const item = {
  id: String(input.oportunidadId),
  name: texto(input.oportunidadNombre),
}
const usuarios = comp.users || []
const panel = comp.panel?.[0]?.items_page?.items || []

// Get Item trae de los vinculados solo el nombre (linked_items); el resto sale de la query 2.
const contacto = comp.contacto?.[0] || null
const cliente = comp.cliente?.[0] || null
const localidadOp = columnaDe(cv, COL.localidad)?.linked_items?.[0] || null
const ctoCv = contacto?.column_values || []
const cliCv = cliente?.column_values || []

const errores = []
const faltaCompletar = []
const avisos = []

// ───────────────────────── validaciones previas ─────────────────────────
const tipoRiesgo = valorDe(cv, COL.tipoRiesgo)
if (!/autom[oó]vil/i.test(tipoRiesgo)) errores.push(`el Tipo de Riesgo es "${tipoRiesgo || 'vacío'}", tiene que ser Automóvil`)

if (/renovaci[oó]n/i.test(valorDe(cv, COL.tipoOportunidad))) errores.push('es una renovación: este botón es solo para seguros nuevos')

const elegidas = lista0(cotizacionesEntrada).filter((s) => tildado(s.column_values, COL.subElegida))
if (elegidas.length === 0) errores.push('no hay ninguna cotización marcada como Propuesta elegida')
if (elegidas.length > 1) errores.push(`hay ${elegidas.length} cotizaciones marcadas como Propuesta elegida y tiene que haber una sola`)

const nombre = valorDe(cv, COL.nombre)
const apellido = valorDe(cv, COL.apellido)
const ci = soloDigitos(columnaDe(cv, COL.cedula)?.text) || soloDigitos(valorDe(cliCv, COL.cliCedula))
if (!nombre) errores.push('falta el Nombre')
if (!apellido) errores.push('falta el Apellido')
if (!ci) errores.push('falta la CI')

if (COL.incidenciaJira && valorDe(cv, COL.incidenciaJira)) {
  errores.push(`ya tiene una incidencia en Jira (${valorDe(cv, COL.incidenciaJira)})`)
}

// Asignado: el de la oportunidad, que tiene que ser una sola persona. Vacío o con varios se
// pide corregirlo en vez de elegir uno: no hay forma de saber quién apretó el botón.
// Get Item trae la columna de personas como JSON en `value`: {"personsAndTeams":[{id, kind}]}.
const personas = (parsear(columnaDe(cv, COL.asignado)?.value)?.personsAndTeams || []).filter((p) => p.kind === 'person')
const usuarioPorId = (id) => usuarios.find((u) => String(u.id) === String(id)) || null
let asignado = null
if (personas.length === 0) errores.push('la oportunidad no tiene Asignado: asignala a alguien y volvé a intentar')
else if (personas.length > 1) errores.push('la oportunidad tiene más de un Asignado: dejá solo a quien va a llevar la emisión')
else asignado = usuarioPorId(personas[0].id)
if (personas.length === 1 && !asignado) errores.push('no se encontró el usuario Asignado en monday')
if (asignado && !texto(asignado.email)) errores.push(`${asignado.name} no tiene email en monday: no se puede buscar en Jira`)

const elegida = elegidas.length === 1 ? elegidas[0].column_values || [] : []
const compania = mayus(valorDe(elegida, COL.subCompania))
const cobertura = valorDe(elegida, COL.subCobertura)
if (elegidas.length === 1 && COMPANIAS_BLOQUEADAS.includes(compania)) errores.push(`${compania} no aplica a autos`)
if (elegidas.length === 1 && !compania) errores.push('la cotización elegida no tiene Compañía')
if (elegidas.length === 1 && !cobertura) errores.push('la cotización elegida no tiene Cobertura')

if (errores.length) {
  return fallo('No se creó la incidencia en Jira: ' + errores.join('; ') + '.')
}

// ───────────────────────── PANEL ─────────────────────────
const recargos = {}
const bonifPorDefecto = {}
const preciosOpcionales = {}
for (const fila of panel) {
  const pcv = fila.column_values || []
  const grupo = valorDe(pcv, COL.panGrupo)
  const cia = valorDe(pcv, COL.panCompania)
  if (!cia) continue
  if (grupo === 'Cuotas') {
    const cuota = Number(valorDe(pcv, COL.panCuota))
    const pct = Number(valorDe(pcv, COL.panRecargo))
    if (valorDe(pcv, COL.panCuota) && Number.isFinite(cuota) && valorDe(pcv, COL.panRecargo) && Number.isFinite(pct)) {
      recargos[cia] = recargos[cia] || {}
      recargos[cia][cuota] = pct / 100
    }
  } else if (grupo === 'Bonificacion' || grupo === 'Configuracion') {
    const valor = Number(valorDe(pcv, COL.panValor))
    if (!valorDe(pcv, COL.panValor) || !Number.isFinite(valor)) continue
    if (grupo === 'Bonificacion') bonifPorDefecto[cia] = valor
    else {
      preciosOpcionales[cia] = preciosOpcionales[cia] || {}
      preciosOpcionales[cia][texto(fila.name)] = valor
    }
  }
}

// ───────────────────── precio (igual que computeQuote) ─────────────────────
const raw = {
  compania,
  cobertura,
  contado: valorDe(elegida, COL.subContado),
  edad: valorDe(elegida, COL.subEdad),
  deducibleBSE: valorDe(elegida, COL.subDeducibleBSE) || (compania === 'BSE' ? DEDUCIBLE_POR_DEFECTO.BSE : ''),
  deducibleSURA: valorDe(elegida, COL.subDeducibleSURA) || (compania === 'SURA' ? DEDUCIBLE_POR_DEFECTO.SURA : ''),
  edadBSE: valorDe(elegida, COL.subEdadBSE),
  bonif: valorDe(elegida, COL.subBonif) !== '' ? valorDe(elegida, COL.subBonif) : String(bonifPorDefecto[compania] ?? ''),
  bns: valorDe(elegida, COL.subBns),
  flota: valorDe(elegida, COL.subFlota),
  granizo: tildado(elegida, COL.subGranizo),
  cristales: tildado(elegida, COL.subCristales),
  usoRural: tildado(elegida, COL.subUsoRural),
  suraTeLleva: tildado(elegida, COL.subSuraTeLleva),
  ap: tildado(elegida, COL.subAp),
  autoExtra: valorDe(elegida, COL.subAutoExtra),
  recargo3: valorDe(elegida, 'numeric_mm52qx0e'),
  recargo6: valorDe(elegida, 'numeric_mm529754'),
  recargo8: valorDe(elegida, 'numeric_mm52xw0m'),
  recargo10: valorDe(elegida, 'numeric_mm52bnpa'),
}
for (const n of [3, 6, 8, 10]) {
  if (recargos[compania]?.[n] != null) raw[`recargo${n}`] = recargos[compania][n]
}

function contadoBase(e) {
  const c = num(e.contado)
  if (e.compania === 'BSE') {
    const dtoDed = BSE_DEDUCIBLE_DISCOUNT[e.deducibleBSE] ?? 0
    const dtoEdad = BSE_EDAD_DISCOUNT[e.edadBSE] ?? 0
    if (e.cobertura === 'GLOBAL - anual' || e.cobertura === 'GLOBAL - 3x2') return Math.round(c * (1 - dtoEdad) * (1 - dtoDed))
    if (BSE_TRIPLE_COBERTURAS.includes(e.cobertura)) return Math.round(c)
    return null
  }
  if (e.compania === 'SURA') {
    const dtoDed = SURA_DEDUCIBLE_DISCOUNT[e.deducibleSURA] ?? 0
    if (SURA_TOTAL_FAMILY.includes(e.cobertura)) return Math.round(c * (1 - dtoDed))
    if (e.cobertura === '4 EN 1') return Math.round(c)
    return null
  }
  if (e.compania === 'SANCOR') {
    if (e.cobertura === 'PARCIAL PLUS' || SANCOR_STANDARD_FAMILY.includes(e.cobertura)) return Math.round(c)
    return null
  }
  if (e.compania === 'PORTO') return PORTO_FAMILY.includes(e.cobertura) ? Math.round(c) : null
  return null
}

const esBse3x2 = compania === 'BSE' && /3x2$/i.test(cobertura)
const sancorSinDescuento = compania === 'SANCOR' && num(raw.edad) > 0 && (num(raw.edad) < 25 || num(raw.edad) > 70)
const bonifAplicada = sancorSinDescuento || esBse3x2 ? 0 : Math.min(BONIF_MAX, Math.max(0, num(raw.bonif)))
const factorEspeciales = compania === 'BSE' ? (1 - num(raw.bns) / 100) * (1 - (esBse3x2 ? 0 : num(raw.flota)) / 100) : 1

const todosIncluidos = compania === 'SURA' && cobertura === 'TOTAL PLUS'
function opcionalesDisponibles() {
  const de = OPCIONALES[compania]
  if (!de) return []
  if (compania === 'SURA') {
    if (cobertura === 'TOTAL' || cobertura === 'TOTAL PLUS') return de
    if (cobertura === '4 EN 1') return de.filter(([campo]) => campo === 'granizo')
    return []
  }
  return grupoCobertura(cobertura) === 'GLOBAL' ? de : []
}
function autoExtraDisponible() {
  if (todosIncluidos || !OPCIONALES[compania]) return false
  if (compania === 'SURA') return cobertura === 'TOTAL'
  return ['GLOBAL', 'TRIPLE'].includes(grupoCobertura(cobertura))
}
let adicionales = 0
if (!todosIncluidos) {
  const precios = preciosOpcionales[compania] || {}
  for (const [campo, clave] of opcionalesDisponibles()) if (raw[campo]) adicionales += num(precios[clave])
  if (raw.autoExtra && autoExtraDisponible()) adicionales += num(precios[`Auto extra ${raw.autoExtra}`])
}

const base = contadoBase(raw)
let totalContado
if (base === null) {
  // La app no deja elegir una cotización sin fórmula, pero si llega se manda el contado de
  // Wink y se avisa, en vez de frenar la carga.
  totalContado = Math.round(num(raw.contado))
  avisos.push(`La app no tiene fórmula de precio para ${compania} ${cobertura}: el Costo Total es el contado de Wink, sin bonificaciones.`)
} else {
  totalContado = Math.round(base * factorEspeciales * (1 - bonifAplicada / 100) + adicionales)
}

// Forma de pago elegida → Costo Total y Cuotas.
// Contado, "N cuotas sin recargo" y "Sin confirmar" van al precio contado. "N cuotas" (con
// recargo) va al total con el recargo de esa cantidad: pendiente de confirmar por Matías.
const cuotasElegidas = valorDe(cv, COL.cuotasElegidas)
let cantidadCuotas = null
let sinRecargo = false
let costoTotal = totalContado
let lineaFormaPago = ''
const mCuotas = /^(\d+)\s*cuotas?(\s+sin recargo)?$/i.exec(cuotasElegidas)
if (/^contado$/i.test(cuotasElegidas)) {
  cantidadCuotas = 1
  lineaFormaPago = `Contado → ${pesos(totalContado)}`
} else if (mCuotas) {
  cantidadCuotas = Number(mCuotas[1])
  sinRecargo = Boolean(mCuotas[2])
  if (sinRecargo) {
    if (PROMO_CUOTAS_SIN_RECARGO[compania] !== cantidadCuotas) {
      avisos.push(`${compania} no tiene ${cantidadCuotas} cuotas sin recargo en la app: revisar la forma de pago.`)
    }
    lineaFormaPago = `${cuotasElegidas} → ${cantidadCuotas} x ${pesos(Math.ceil(totalContado / cantidadCuotas))} (${pesos(totalContado)})`
    if (PROMO_CON_DEBITO.includes(compania)) lineaFormaPago += ' · Sin recargo con débito automático'
  } else {
    const recargo = num(raw[`recargo${cantidadCuotas}`])
    costoTotal = Math.round(totalContado * (1 + recargo))
    lineaFormaPago = `${cuotasElegidas} → ${cantidadCuotas} x ${pesos(Math.ceil(costoTotal / cantidadCuotas))} (${pesos(costoTotal)})`
  }
} else {
  faltaCompletar.push('cuotas (en monday dice "' + (cuotasElegidas || 'vacío') + '")')
}
const cuotasJira = cantidadCuotas ? CUOTAS_JIRA[cantidadCuotas] : null
if (cantidadCuotas && !cuotasJira) avisos.push(`Jira no tiene la opción de ${cantidadCuotas} cuotas: el campo Cuotas quedó en blanco.`)

// Deducible: SANCOR en dólares; BSE y SURA según el deducible elegido, como en la app.
let deducible = ''
const dedBase = num(valorDe(elegida, COL.subDeducible))
if (compania === 'SANCOR') {
  let usd = num(valorDe(elegida, COL.subDeducibleSancor))
  if (!(usd > 0) && grupoCobertura(cobertura) === 'TRIPLE') usd = SANCOR_DEDUCIBLE_PARCIAL_USD
  if (!(usd > 0)) usd = dedBase
  if (usd > 0) deducible = `U$S ${Math.round(usd)}`
} else if (compania === 'BSE' && ['GLOBAL - anual', 'GLOBAL - 3x2'].includes(cobertura) && raw.deducibleBSE) {
  if (dedBase > 0) deducible = String(Math.ceil(dedBase * num(raw.deducibleBSE)))
} else if (compania === 'SURA' && SURA_TOTAL_FAMILY.includes(cobertura) && raw.deducibleSURA) {
  if (dedBase > 0) deducible = String(Math.ceil(dedBase * num(raw.deducibleSURA)))
} else if (dedBase > 0) {
  deducible = String(Math.ceil(dedBase))
}

// ───────────────────────── persona y contacto ─────────────────────────
// El nombre tal como está antes de " · " en el nombre del ítem: no se reordena porque a
// veces el segundo nombre quedó cargado en Apellido.
const partesNombre = texto(item.name).split(' · ')
const nombreCompleto = mayus(partesNombre.length > 1 ? partesNombre[0] : `${nombre} ${apellido}`)

// Los campos del titular (Celular, Email) son los que salen en la póliza, así que solo se
// llenan con los datos del Contacto cuando el Contacto es el mismo Cliente. Si el seguro
// se negoció con otra persona (un familiar, un socio), sus datos van a la descripción como
// "Negociado con …" y los del titular quedan para completar (Matías, 13/10).
// "Homónimo del cliente" = es el mismo. Si el tipo no está cargado (pasa en la oportunidad
// de referencia), se compara el nombre con el del Cliente.
const tipoContacto = valorDe(ctoCv, COL.ctoTipo)
const claveNombre = (v) => mayus(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '')
const contactoEsTercero =
  Boolean(contacto) &&
  (tipoContacto
    ? !/hom[oó]nimo del cliente/i.test(tipoContacto)
    : claveNombre(contacto.name) !== claveNombre(cliente?.name || nombreCompleto))
// El Teléfono de la oportunidad es el de quien negocia: con un tercero, tampoco es del titular.
const celularContacto = celularUY(valorDe(cv, COL.telefono)) || celularUY(valorDe(ctoCv, COL.ctoTelefono))
const emailContacto = valorDe(ctoCv, COL.ctoEmail)
const celular = contactoEsTercero ? '' : celularContacto
const email = contactoEsTercero ? '' : emailContacto
const aclaracionContacto = contactoEsTercero
  ? unir([
      `Negociado con ${texto(contacto.name)} (${tipoContacto || 'tipo de contacto sin cargar'})`,
      celularContacto && `Cel ${celularContacto}`,
      emailContacto && `Mail ${emailContacto}`,
    ])
  : ''

const localidadCliente = columnaDe(cliCv, COL.cliLocalidad)?.linked_items?.[0]?.name || ''
const direccion = valorDe(cliCv, COL.cliDireccion)
let domicilio = [texto(localidadCliente), direccion].filter(Boolean).join(' - ')
if (!direccion) domicilio = valorDe(cv, COL.ubicacionResidencia) || domicilio

// ───────────────────────── vehículo ─────────────────────────
const matricula = mayus(valorDe(cv, COL.matricula))
const chasis = mayus(valorDe(cv, COL.chasis))
const motor = mayus(valorDe(cv, COL.motor))
// "DONGFENG Nammi 330 70 KW Extra Full (2026)" → "DONGFENG NAMMI 330 70 KW EXTRA FULL 2026"
const descripcionVehiculo = mayus(partesNombre.length > 1 ? partesNombre.slice(1).join(' · ') : valorDe(cv, COL.modelo))
  .replace(/\((\d{4})\)/g, '$1')
  .replace(/\s+/g, ' ')
// Sin matrícula el documento dice "0KM", pero eso solo cierra en un auto del año (o del
// anterior): un usado al que todavía no se le cargó la matrícula sale "SIN MATRÍCULA".
const anioVehiculo = Number(valorDe(cv, COL.anio))
const es0km = !matricula && (!anioVehiculo || anioVehiculo >= new Date().getFullYear() - 1)
const vehiculoResumen = `${descripcionVehiculo} ${matricula || (es0km ? '0KM' : 'SIN MATRÍCULA')}`
const vehiculoCampo = matricula ? vehiculoResumen : `${vehiculoResumen}${chasis ? ` - CHASIS ${chasis}` : ''}`

const zona = valorDe(cv, COL.ubicacionCirculacion) || texto(localidadOp?.name)
const uso = mayus(valorDe(cv, COL.uso))

// ───────────────────────── resumen ─────────────────────────
const anioCorto = String(new Date().getFullYear()).slice(-2)
const resumen = corto(`${nombreCompleto} - ${compania} - ${vehiculoResumen} (N${anioCorto})`)

// ───────────────────────── adjuntos ─────────────────────────
// Cada columna de archivo puede tener varios: van todos. El value de la columna ya trae
// el assetId y el nombre de cada uno; Make los baja con monday "Download a file" (assetId)
// y los sube con Jira "Add an attachment".
function archivosDe(cvs, columnaId) {
  const valor = parsear(columnaDe(cvs, columnaId)?.value)
  return (valor?.files || [])
    .map((f) => ({ assetId: String(f.assetId ?? f.asset_id ?? ''), nombre: texto(f.name) }))
    .filter((f) => f.assetId)
}
const adjuntos = []
const agregar = (lista, prefijo) => {
  for (const a of lista) adjuntos.push({ assetId: a.assetId, nombre: corto(`${prefijo}${a.nombre || a.assetId}`) })
}
let cedulas = archivosDe(cv, COL.archivoCedula)
if (!cedulas.length) cedulas = archivosDe(cliCv, COL.cliCedulaFrente)
agregar(cedulas, 'CI - ')
const documentosVehiculo = archivosDe(cv, COL.archivoVehiculo)
agregar(documentosVehiculo, matricula ? 'LIBRETA - ' : 'DOCUMENTO VEHÍCULO - ')
agregar(archivosDe(cv, COL.archivoCotizacion), 'COTIZACION - ')
if (!cedulas.length) faltaCompletar.push('archivo de la CI')
if (!documentosVehiculo.length) faltaCompletar.push('libreta o carta 0 km')

// ───────────────────────── falta completar ─────────────────────────
if (!celular) faltaCompletar.push('celular')
if (!email) faltaCompletar.push('mail')
if (!domicilio) faltaCompletar.push('domicilio')
if (!matricula) faltaCompletar.push('matrícula')
if (!matricula && !chasis) faltaCompletar.push('chasis')
if (!zona) faltaCompletar.push('zona de circulación')
if (!USO_JIRA[uso]) faltaCompletar.push(`uso (en monday: ${uso || 'vacío'})`)
if (compania && !COMPANIA_JIRA[compania]) faltaCompletar.push(`compañía (${compania} no tiene opción en Jira)`)
if (!COBERTURA_JIRA[mayus(cobertura)]) faltaCompletar.push(`cobertura vehículos (${cobertura} no tiene equivalencia)`)
faltaCompletar.push('inicio de vigencia', 'forma de pago y datos de débito')

// ───────────────────────── descripción (ADF) ─────────────────────────
// Jira rechaza los nodos de texto vacíos: cada línea se arma solo si tiene contenido.
const t = (s, marcas) => (marcas ? { type: 'text', text: s, marks: marcas } : { type: 'text', text: s })
const parrafo = (...nodos) => ({ type: 'paragraph', content: nodos.filter((n) => n && n.text) })
const titulo = (s) => ({ type: 'heading', attrs: { level: 3 }, content: [t(s)] })
const lista = (lineas) => {
  const items = lineas.filter(Boolean).map(texto).filter(Boolean)
  return items.length
    ? { type: 'bulletList', content: items.map((l) => ({ type: 'listItem', content: [parrafo(t(l))] })) }
    : null
}

const urlItem = MONDAY_URL + item.id
const fechaNac = fechaUY(valorDe(cv, COL.fechaNacimiento))
const edad = valorDe(cv, COL.edad)
const ahora = new Date()
const hoy = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()}`

const adicionalesTexto = [
  raw.granizo && 'Granizo',
  raw.cristales && 'Cristales',
  tildado(elegida, COL.subCocheCortesia) && 'Coche Cortesía',
  raw.ap && 'AP',
  raw.autoExtra && `Auto extra ${raw.autoExtra}`,
  raw.suraTeLleva && 'SURA te lleva',
  raw.usoRural && 'Uso rural',
  valorDe(elegida, COL.subRc) && `RC ${valorDe(elegida, COL.subRc)}`,
].filter(Boolean)

const validacionesMal = VALIDACIONES
  .filter(([, estado]) => valorDe(cv, estado) === 'Incorrecto')
  .map(([etiqueta, , motivo]) => `${etiqueta}: ${valorDe(cv, motivo) || 'sin motivo'}`)

const bloques = [
  parrafo(t(`Cargado desde monday el ${hoy}. Asignado en la oportunidad: ${asignado.name}.`)),
  parrafo(t('Oportunidad monday: '), { type: 'text', text: urlItem, marks: [{ type: 'link', attrs: { href: urlItem } }] }),
  titulo('ASEGURADO'),
  lista([
    unir([nombreCompleto, `CI ${ci}`]),
    fechaNac && `Nacimiento: ${fechaNac}${edad ? ` (${edad} años)` : ''}`,
    domicilio && `Domicilio: ${domicilio}`,
    unir([celular && `Cel: ${celular}`, email && `Mail: ${email}`]),
    aclaracionContacto,
  ]),
  titulo('VEHÍCULO'),
  lista([
    unir([valorDe(cv, COL.modelo) || descripcionVehiculo, valorDe(cv, COL.anio) && `Año ${valorDe(cv, COL.anio)}`,
      valorDe(cv, COL.tipo), valorDe(cv, COL.combustible)]),
    unir([matricula ? `Matrícula ${matricula}` : (es0km ? '0 km (sin matrícula)' : 'Sin matrícula cargada'), chasis && `Chasis ${chasis}`, motor && `Motor ${motor}`]),
    unir([zona && `Circulación: ${zona}`, uso && `Uso: ${uso}`]),
  ]),
  titulo('SEGURO ELEGIDO'),
  lista([
    unir([compania, cobertura, deducible && `Deducible ${compania === 'SANCOR' ? deducible : pesos(num(deducible))}`]),
    `Contado: ${pesos(totalContado)}`,
    lineaFormaPago && `Forma elegida: ${lineaFormaPago}`,
    unir([bonifAplicada > 0 && `Bonif ${bonifAplicada}%`, num(raw.bns) > 0 && `BNS ${num(raw.bns)}%`,
      !esBse3x2 && num(raw.flota) > 0 && compania === 'BSE' && `Flota ${num(raw.flota)}%`]),
    adicionalesTexto.length && `Adicionales: ${adicionalesTexto.join(', ')}`,
  ]),
]
if (validacionesMal.length) bloques.push(titulo('VALIDACIONES MONDAY'), lista(validacionesMal))
if (avisos.length) bloques.push(titulo('AVISOS'), lista(avisos))
bloques.push(titulo('FALTA COMPLETAR'), lista(faltaCompletar))

const descripcion = {
  type: 'doc',
  version: 1,
  content: bloques.filter((b) => b && (b.type !== 'paragraph' || b.content.length)),
}

// ───────────────────────── payload ─────────────────────────
const fields = {
  project: { key: JIRA.proyecto },
  issuetype: { id: JIRA.tipoIncidencia },
  summary: resumen,
  description: descripcion,
  [JIRA.documento]: ci,
  [JIRA.vehiculo]: corto(vehiculoCampo),
  [JIRA.moneda]: { id: MONEDA_PESOS },
  [JIRA.costoTotal]: costoTotal,
  // Decisión: el Inicio de Vigencia se completa en Jira. Si no se manda, Jira pone la
  // fecha del día por defecto; null lo deja vacío.
  [JIRA.inicioVigencia]: null,
  [JIRA.cobertura]: corto(cobertura),
  [JIRA.periodo]: { id: /3x2/i.test(cobertura) ? PERIODO_3_ANIOS : PERIODO_ANUAL },
  assignee: { accountId: '__ASSIGNEE__' },
}
if (zona) fields[JIRA.zona] = corto(zona)
if (USO_JIRA[uso]) fields[JIRA.uso] = { id: USO_JIRA[uso] }
if (COMPANIA_JIRA[compania]) fields[JIRA.compania] = { id: COMPANIA_JIRA[compania] }
if (COBERTURA_JIRA[mayus(cobertura)]) fields[JIRA.coberturaVehiculos] = { id: COBERTURA_JIRA[mayus(cobertura)] }
if (cuotasJira) fields[JIRA.cuotas] = { id: cuotasJira }
if (bonifAplicada > 0) fields[JIRA.bonificacion] = bonifAplicada
if (deducible) fields[JIRA.deducible] = corto(deducible)
if (celular) fields[JIRA.celular] = corto(celular)
if (email) fields[JIRA.email] = corto(email)
if (domicilio) fields[JIRA.domicilio] = corto(domicilio)
if (contactoEsTercero) fields[JIRA.referencia] = `Contacto en Monday: ${texto(contacto.name)}`

return {
  ok: true,
  error: '',
  payloadJson: JSON.stringify({ fields }),
  asignadoEmail: texto(asignado.email),
  asignadoNombre: texto(asignado.name),
  resumen,
  costoTotal,
  adjuntos,
  faltaCompletar,
  avisos,
}
