// Run code del escenario de Make que valida una póliza recién cargada contra lo que se
// cotizó. Recibe los datos crudos de monday y decide una de tres cosas: que hay que leer
// los documentos, que falta un dato que tiene que cargar una persona, o el veredicto de
// las cuatro validaciones.
//
// Vive en el repo aunque corra en Make: las reglas de comparación también existen del
// lado de la app (src/services/polizaCheck.js, vehiculoIdentificacion.js) y si viven en
// dos lugares sin verse se despegan. Ya pasó en este proyecto con el precio del granizo y
// con los importes de RC escritos a mano.
//
// ENTRADA (todo opcional salvo `oportunidad`):
//   input.oportunidad = column_values de la Oportunidad, tal cual los devuelve monday:
//                       [{ id, text }, ...]
//   input.subitems    = subitems de la Oportunidad, cada uno con sus column_values.
//                       De ahí sale la cotización elegida, sin tener que mapearla.
//   input.cliente     = el ítem del Cliente vinculado: { name, column_values }. El dato
//                       de la persona vive ahí; la CI de la oportunidad es una copia.
//   input.poliza      = lo leído del PDF: { cedula, rut, titular, matricula, chasis,
//                       motor, marca, anio, compania, cobertura, premio, observaciones }
//                       La IA devuelve TEXTO LITERAL: no conoce nuestro catálogo de
//                       coberturas ni normaliza documentos. Eso se resuelve acá.
//
// SALIDA:
//   { accion, general, persona, vehiculo, compania, cotizacion, faltantes }
//   accion = 'leer-documentos' cuando falta un dato que está en un archivo sin leer;
//            'validar' cuando ya se puede (o no se puede y hay que avisar).

// ───────────────────────── columnas de monday ─────────────────────────
const COL = {
  // Oportunidad
  nombre: 'text_mm51b055',
  apellido: 'text_mm51ez7e',
  cedula: 'numeric_mm51mb0s',
  marca: 'dropdown_mm51ykrd',
  anio: 'dropdown_mm51mdmq',
  modelo: 'text_mm54fb7m',
  matricula: 'text_mm71dyf0',
  chasis: 'text_mm711jjs',
  motor: 'text_mm711cng',
  cartaAutomovil: 'file_mm51jy06',
  cedulaArchivo: 'file_mm5pc008',
  estadoLectura: 'color_mm5rzrhk',
  // Cliente
  cliCedula: 'text_mm4vk9aq',
  cliRazonSocial: 'text_mm51hysn',
  cliTipo: 'color_mm51rgar',
  // Subitem (cotización)
  subPropuestaElegida: 'boolean_mm5bn41n',
  subCompania: 'dropdown_mm51f4va',
  subCobertura: 'dropdown_mm4w8n8p',
  subContado: 'numeric_mm4pc2y1',
}

// Cuánto puede alejarse el premio de la póliza del precio cotizado sin que se considere
// un problema. El precio guardado en el subitem es el CONTADO que devolvió el portal; lo
// que vio el cliente se calcula en la app con bonificación y recargos, así que un calce
// exacto no existe. Por eso el monto avisa pero no define identidad.
const TOLERANCIA_PREMIO = 0.1

// Familia de cada cobertura del catálogo, igual que coberturaGroups.js en la app: TOTAL
// es todo riesgo (cubre daños propios) y PARCIAL es responsabilidad civil, hurto e
// incendio. Se compara por familia y no por nombre exacto porque la póliza describe la
// cobertura con las palabras de la compañía ("1- Daños, Hurto, Incendio y Responsabilidad
// Civil"), que no son las del catálogo.
const FAMILIA_POR_COBERTURA = {
  'GLOBAL - ANUAL': 'TOTAL', 'GLOBAL - 3X2': 'TOTAL', GLOBAL: 'TOTAL', 'GLOBAL DED ALTO': 'TOTAL',
  'TOTAL 600': 'TOTAL', 'TOTAL 800': 'TOTAL', 'TOTAL 1500': 'TOTAL', 'TOTAL 2500': 'TOTAL',
  TOTAL: 'TOTAL', 'TOTAL PLUS': 'TOTAL',
  'TRIPLE - ANUAL': 'PARCIAL', 'TRIPLE - 3X2': 'PARCIAL', TRIPLE: 'PARCIAL',
  PARCIAL: 'PARCIAL', 'PARCIAL PLUS': 'PARCIAL', '4 EN 1': 'PARCIAL',
}

const ESTADO = { valido: 'Válido', incorrecto: 'Incorrecto', sinValidar: 'Sin validar' }
const GENERAL = { validando: 'Validando', validos: 'Datos válidos', conDiferencias: 'Con diferencias' }

// ───────────────────────── helpers ─────────────────────────
const valorDe = (columnValues, id) => {
  const col = (columnValues || []).find((c) => c && c.id === id)
  return col ? String(col.text ?? '').trim() : ''
}

// Mismo criterio que la app (format.js#normalizarParaMatch): sin acentos, espacios
// colapsados, minúsculas.
const normalizar = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

// Para códigos (chasis, matrícula, motor): además se sacan espacios y guiones, porque
// "8AP-1234 5678" y "8AP12345678" son el mismo chasis escrito distinto.
const codigo = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '')

const numero = (v) => {
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// El VIN es de 17 y excluye I, O y Q justamente para no confundirlas con 1 y 0:
// encontrarlas significa que la lectura falló, no que el auto sea raro. Antes de 1981 no
// era obligatorio, así que ahí no se exige nada.
const chasisConfiable = (chasis, anio) => {
  const v = codigo(chasis)
  if (!v) return false
  const a = numero(anio)
  if (a && a < 1981) return v.length >= 5
  return v.length === 17 && !/[IOQ]/.test(v)
}

// La matrícula uruguaya vigente son 3 letras + 4 dígitos, pero conviven chapas viejas con
// otros formatos: solo se exige un largo plausible, sin inventar reglas.
const matriculaConfiable = (m) => {
  const v = codigo(m)
  return v.length >= 6 && v.length <= 8
}

// La familia de una cobertura del catálogo.
const familiaDeCatalogo = (cobertura) => FAMILIA_POR_COBERTURA[String(cobertura ?? '').trim().toUpperCase()] || null

// La familia que describe el texto de la póliza. Lo que separa una de otra es si cubre
// DAÑOS al propio vehículo: una parcial solo cubre responsabilidad civil, hurto e
// incendio. Si el texto no alcanza para decidir, devuelve null y se dice que no se pudo
// confirmar, en vez de adivinar.
const familiaDeTextoPoliza = (texto) => {
  const t = normalizar(texto)
  if (!t) return null
  if (familiaDeCatalogo(texto)) return familiaDeCatalogo(texto)
  // "daños a terceros" es responsabilidad civil, no daño propio: si no se saca antes,
  // toda parcial que lo diga con esas palabras se leería como total.
  const propios = t.replace(/dan(o|os|io|ios) (a|contra) (terceros|personas|cosas|bienes)/g, ' ')
  if (/dan(o|os|io|ios)|todo riesgo|casco/.test(propios)) return 'TOTAL'
  if (/responsabilidad civil|hurto|incendio/.test(t)) return 'PARCIAL'
  return null
}

const ok = (motivo) => ({ estado: ESTADO.valido, motivo: motivo || '' })
const mal = (motivo) => ({ estado: ESTADO.incorrecto, motivo })

// ───────────────────────── datos de entrada ─────────────────────────
const oportunidad = input.oportunidad || []
const poliza = input.poliza || {}
const subitems = input.subitems || []

const op = {
  nombre: [valorDe(oportunidad, COL.nombre), valorDe(oportunidad, COL.apellido)].filter(Boolean).join(' '),
  cedula: valorDe(oportunidad, COL.cedula),
  marca: valorDe(oportunidad, COL.marca),
  anio: valorDe(oportunidad, COL.anio),
  matricula: valorDe(oportunidad, COL.matricula),
  chasis: valorDe(oportunidad, COL.chasis),
  motor: valorDe(oportunidad, COL.motor),
  tieneCarta: Boolean(valorDe(oportunidad, COL.cartaAutomovil)),
  tieneCedula: Boolean(valorDe(oportunidad, COL.cedulaArchivo)),
  estadoLectura: valorDe(oportunidad, COL.estadoLectura),
}

// El cliente vinculado, si vino. Sin él se cae a lo que tenga la oportunidad.
const clienteCv = (input.cliente && (input.cliente.column_values || input.cliente.columnValues)) || []
const cliente = {
  nombre: (input.cliente && input.cliente.name) || '',
  razonSocial: valorDe(clienteCv, COL.cliRazonSocial),
  documento: valorDe(clienteCv, COL.cliCedula),
  tipo: valorDe(clienteCv, COL.cliTipo),
}

// La cotización elegida sale de los subitems: es la que tiene "Propuesta elegida" tildada.
const elegidaItem = subitems.find((s) => {
  const v = valorDe(s.column_values || s.columnValues || [], COL.subPropuestaElegida)
  return v === 'v' || normalizar(v) === 'true' || v === '1'
})
const elegida = elegidaItem
  ? {
      compania: valorDe(elegidaItem.column_values || elegidaItem.columnValues, COL.subCompania),
      cobertura: valorDe(elegidaItem.column_values || elegidaItem.columnValues, COL.subCobertura),
      contado: valorDe(elegidaItem.column_values || elegidaItem.columnValues, COL.subContado),
    }
  : null

// ───────────── 1) ¿falta algo que se puede leer de un archivo? ─────────────
// Se relee UNA sola vez: si la lectura ya corrió ("Leidos") y el dato sigue vacío, no hay
// nada que ganar con pedirla de nuevo — se avisa para que lo carguen a mano.
const yaSeLeyo = normalizar(op.estadoLectura) === 'leidos'
const faltaIdentificacion = !codigo(op.chasis) && !codigo(op.matricula)

if (faltaIdentificacion && op.tieneCarta && !yaSeLeyo) {
  return {
    accion: 'leer-documentos',
    general: GENERAL.validando,
    faltantes: ['chasis', 'matrícula'],
    mensaje: 'La oportunidad no tiene chasis ni matrícula y hay una Carta Automóvil sin leer: se pide la lectura antes de validar.',
  }
}

// ───────────── 2) veredictos ─────────────
const faltantes = []

// Persona: el documento manda (es único); el nombre es de apoyo, porque se escribe de
// mil formas y un acento de más no es un error de emisión.
//
// El titular puede ser una persona (cédula) o una empresa (RUT). Hoy el sistema guarda
// un solo documento por cliente y no distingue cuál es: un RUT tiene 12 dígitos y una
// cédula 7 u 8, así que comparar uno contra otro daría "no coincide" siempre, en todas
// las pólizas de empresas. Cuando pasa eso no se miente: se compara por nombre y se dice
// que el documento no se pudo comparar.
let persona
const docPoliza = soloDigitos(poliza.rut) || soloDigitos(poliza.cedula)
const esEmpresa = Boolean(soloDigitos(poliza.rut))
const docNuestro = soloDigitos(cliente.documento) || soloDigitos(op.cedula)
const nombreNuestro = cliente.razonSocial || cliente.nombre || op.nombre
const titular = String(poliza.titular ?? '').trim()
// Los nombres de empresa cambian de forma ("S.A.", "SA", "S. A.") sin ser otra empresa:
// se comparan sin puntuación, sin espacios y sin el sufijo societario del final.
const SUFIJOS_SOCIALES = ['sociedadanonima', 'srl', 'sas', 'ltda', 'sa']
const nombreComparable = (v) => {
  let t = normalizar(v).replace(/[^a-z0-9]/g, '')
  for (const sufijo of SUFIJOS_SOCIALES) {
    // El mínimo evita comer el nombre cuando termina en esas letras por casualidad.
    if (t.endsWith(sufijo) && t.length - sufijo.length >= 4) return t.slice(0, -sufijo.length)
  }
  return t
}

if (!docPoliza && !titular) {
  persona = mal('No se puede validar: la póliza no trae ni documento ni nombre del titular.')
} else if (!docNuestro && !nombreNuestro) {
  faltantes.push('documento o nombre del cliente')
  persona = mal('No se puede validar: la oportunidad no tiene cliente con documento ni nombre cargado.')
} else if (docPoliza && docNuestro && docPoliza === docNuestro) {
  persona =
    titular && nombreNuestro && nombreComparable(titular) !== nombreComparable(nombreNuestro)
      ? ok(`El documento coincide. El nombre figura distinto: "${titular}" en la póliza y "${nombreNuestro}" en el cliente.`)
      : ok()
} else if (docPoliza && docNuestro && esEmpresa && docNuestro.length <= 9) {
  // RUT contra cédula: no son comparables. Se resuelve por nombre y se avisa qué falta.
  faltantes.push('RUT del cliente')
  persona =
    titular && nombreNuestro && nombreComparable(titular) === nombreComparable(nombreNuestro)
      ? ok(`La póliza está a nombre de ${titular} (RUT ${poliza.rut}), que coincide con el cliente. El RUT no se pudo comparar: el sistema guarda ${cliente.documento || op.cedula}, que no es un RUT.`)
      : mal(`La póliza está a nombre de ${titular || 'una empresa'} (RUT ${poliza.rut}) y el cliente es ${nombreNuestro || 'otro'} (${docNuestro}). El sistema no guarda RUT, así que no se pudo comparar el documento.`)
} else if (docPoliza && docNuestro) {
  persona = mal(
    `La póliza está a nombre del documento ${poliza.rut || poliza.cedula}${titular ? ` (${titular})` : ''} y el cliente es ${docNuestro}${nombreNuestro ? ` (${nombreNuestro})` : ''}.`
  )
} else if (titular && nombreNuestro) {
  persona =
    nombreComparable(titular) === nombreComparable(nombreNuestro)
      ? ok('Confirmado por nombre; no había documento para comparar de los dos lados.')
      : mal(`La póliza está a nombre de "${titular}" y el cliente es "${nombreNuestro}". No hay documento para comparar de los dos lados.`)
} else {
  persona = mal('No se puede validar: falta el documento o el nombre de alguno de los dos lados.')
}

// Vehículo: el chasis es el único identificador real — es único y no cambia nunca. La
// matrícula cambia (reempadronamiento, cambio de departamento) y un 0km todavía no la
// tiene. El motor no identifica: se puede cambiar y es el que más errores de lectura da.
let vehiculo
const chasisOp = codigo(op.chasis)
const chasisPol = codigo(poliza.chasis)
const matOp = codigo(op.matricula)
const matPol = codigo(poliza.matricula)

if (chasisOp && chasisPol) {
  if (!chasisConfiable(op.chasis, op.anio) || !chasisConfiable(poliza.chasis, poliza.anio || op.anio)) {
    vehiculo = mal(
      `No se puede confiar en la comparación: alguno de los chasis no tiene formato válido (oportunidad "${op.chasis}", póliza "${poliza.chasis}"). Un chasis tiene 17 caracteres y no lleva I, O ni Q.`
    )
  } else if (chasisOp !== chasisPol) {
    vehiculo = mal(`Es otro vehículo: el chasis de la póliza es ${poliza.chasis} y el de la oportunidad es ${op.chasis}.`)
  } else if (matOp && matPol && matOp !== matPol) {
    // Mismo chasis con otra chapa no es otro auto: es un cambio de matrícula.
    vehiculo = ok(`El chasis coincide. La matrícula figura distinta: ${poliza.matricula} en la póliza y ${op.matricula} en la oportunidad.`)
  } else {
    vehiculo = ok()
  }
} else if (matOp && matPol) {
  if (!matriculaConfiable(op.matricula) || !matriculaConfiable(poliza.matricula)) {
    vehiculo = mal(`No se puede confiar en la comparación: alguna matrícula no tiene un largo plausible (oportunidad "${op.matricula}", póliza "${poliza.matricula}").`)
  } else if (matOp !== matPol) {
    vehiculo = mal(`La matrícula de la póliza (${poliza.matricula}) no es la de la oportunidad (${op.matricula}), y no hay chasis para confirmar.`)
  } else {
    vehiculo = ok('Confirmado por matrícula; no se pudo comparar el chasis.')
  }
} else {
  faltantes.push('chasis o matrícula')
  vehiculo = mal(
    yaSeLeyo
      ? 'Se leyó la Carta Automóvil y no trajo chasis ni matrícula: hay que cargarlos a mano para poder validar.'
      : 'No hay chasis ni matrícula para comparar contra la póliza.'
  )
}

// Compañía: contra la de la cotización elegida.
let compania
if (!elegida) {
  faltantes.push('cotización elegida')
  compania = mal('No se puede validar: la oportunidad no tiene una cotización marcada como elegida.')
} else if (!poliza.compania) {
  compania = mal('No se puede validar: no se pudo leer la compañía en la póliza.')
} else if (normalizar(poliza.compania) !== normalizar(elegida.compania)) {
  compania = mal(`La póliza es de ${poliza.compania} y la cotización elegida es de ${elegida.compania}.`)
} else {
  compania = ok()
}

// Cotización: la cobertura define; el monto solo avisa. El precio guardado es el contado
// del portal y lo que vio el cliente se calcula con bonificación y recargos, así que un
// calce exacto no existe y exigirlo daría error siempre.
//
// La cobertura se compara por FAMILIA (total / parcial) y no por nombre: la póliza la
// describe con las palabras de la compañía ("1- Daños, Hurto, Incendio y Responsabilidad
// Civil") y exigir el nombre del catálogo daría "no coincide" en casi todas. Lo que
// importa es que no se haya emitido una parcial cuando se cotizó una total.
let cotizacion
const familiaCot = elegida ? familiaDeCatalogo(elegida.cobertura) : null
const familiaPol = familiaDeTextoPoliza(poliza.cobertura)
const etiqueta = (familia) => (familia === 'TOTAL' ? 'cobertura total' : 'cobertura parcial')
if (!elegida) {
  cotizacion = mal('No se puede validar: la oportunidad no tiene una cotización marcada como elegida.')
} else if (!poliza.cobertura) {
  cotizacion = mal('No se puede validar: no se pudo leer la cobertura en la póliza.')
} else if (!familiaCot) {
  // No es un problema de la póliza: es una cobertura nueva que este código no conoce.
  cotizacion = mal(`No se puede validar: la cobertura cotizada ("${elegida.cobertura}") no figura en la lista de coberturas de este código. Hay que agregarla.`)
} else if (!familiaPol) {
  cotizacion = mal(`No se pudo determinar si la póliza es total o parcial. Dice: "${poliza.cobertura}". Se cotizó ${elegida.cobertura}.`)
} else if (familiaPol !== familiaCot) {
  cotizacion = mal(`La póliza es ${etiqueta(familiaPol)} ("${poliza.cobertura}") y se cotizó ${etiqueta(familiaCot)} (${elegida.cobertura}).`)
} else {
  const partes = []
  if (normalizar(poliza.cobertura) !== normalizar(elegida.cobertura)) {
    partes.push(`Coincide la ${etiqueta(familiaCot)}: la póliza la nombra "${poliza.cobertura}" y en el sistema es ${elegida.cobertura}.`)
  }
  const premio = numero(poliza.premio)
  const contado = numero(elegida.contado)
  if (premio && contado) {
    const diferencia = Math.abs(premio - contado) / contado
    if (diferencia > TOLERANCIA_PREMIO) {
      partes.push(`El premio de la póliza (${premio}) difiere ${Math.round(diferencia * 100)}% del precio cotizado (${contado}); conviene revisarlo.`)
    }
  }
  cotizacion = ok(partes.join(' '))
}

// Lo que la IA haya anotado al leer va al motivo de la cotización: casi siempre es sobre
// la cobertura, y es el aviso de que la lectura no estaba segura de algo.
const notaLectura = String(poliza.observaciones ?? '').trim()
if (notaLectura) cotizacion.motivo = `${cotizacion.motivo} Nota de la lectura: ${notaLectura}`.trim()

const hayDiferencias = [persona, vehiculo, compania, cotizacion].some((v) => v.estado === ESTADO.incorrecto)

return {
  accion: 'validar',
  general: hayDiferencias ? GENERAL.conDiferencias : GENERAL.validos,
  persona,
  vehiculo,
  compania,
  cotizacion,
  faltantes,
}
