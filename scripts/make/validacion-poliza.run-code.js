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
//   input.poliza      = lo leído del PDF: { cedula, titular, matricula, chasis, motor,
//                       marca, anio, compania, cobertura, premio }
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
    .replace(/[̀-ͯ]/g, '')
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

// Persona: la cédula manda (es única); el nombre es de apoyo, porque se escribe de mil
// formas y un acento de más no es un error de emisión.
let persona
if (!op.cedula) {
  faltantes.push('cédula del cliente')
  persona = mal('No se puede validar: la oportunidad no tiene cédula cargada.')
} else if (!soloDigitos(poliza.cedula)) {
  persona = mal('No se puede validar: no se pudo leer la cédula del titular en la póliza.')
} else if (soloDigitos(poliza.cedula) !== soloDigitos(op.cedula)) {
  persona = mal(
    `La póliza está a nombre de la cédula ${poliza.cedula}${poliza.titular ? ` (${poliza.titular})` : ''} y la oportunidad es de ${op.cedula}${op.nombre ? ` (${op.nombre})` : ''}.`
  )
} else if (poliza.titular && op.nombre && normalizar(poliza.titular) !== normalizar(op.nombre)) {
  persona = ok(`La cédula coincide. El nombre figura distinto: "${poliza.titular}" en la póliza y "${op.nombre}" en la oportunidad.`)
} else {
  persona = ok()
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
let cotizacion
if (!elegida) {
  cotizacion = mal('No se puede validar: la oportunidad no tiene una cotización marcada como elegida.')
} else if (!poliza.cobertura) {
  cotizacion = mal('No se puede validar: no se pudo leer la cobertura en la póliza.')
} else if (normalizar(poliza.cobertura) !== normalizar(elegida.cobertura)) {
  cotizacion = mal(`La póliza es ${poliza.cobertura} y se cotizó ${elegida.cobertura}.`)
} else {
  const premio = numero(poliza.premio)
  const contado = numero(elegida.contado)
  if (premio && contado) {
    const diferencia = Math.abs(premio - contado) / contado
    cotizacion =
      diferencia > TOLERANCIA_PREMIO
        ? ok(`La cobertura coincide. El premio de la póliza (${premio}) difiere ${Math.round(diferencia * 100)}% del precio cotizado (${contado}); conviene revisarlo.`)
        : ok()
  } else {
    cotizacion = ok()
  }
}

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
