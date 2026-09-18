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
//   input.cliente     = opcional, el ítem del Cliente vinculado: { name, column_values }.
//                       Solo se usa como respaldo si la oportunidad no trae el dato.
//   input.coberturas  = filas del PANEL: cada una del grupo "Coberturas" dice, para una
//                       compañía, a qué cobertura(s) nuestra(s) equivale el texto que usa
//                       esa compañía en la póliza. Se puede pasar PANEL entero sin filtrar:
//                       acá se queda con las del grupo que corresponde. Sin esto se cae a
//                       adivinar por las palabras del texto, que acierta menos.
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
  // PANEL (filas del grupo "Coberturas")
  panGrupo: 'color_mm5fdknw',
  panCompania: 'dropdown_mm52feqr',
  panCobertura: 'dropdown_mm5frxag',
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

// "TOTAL c/ Mov" (SURA) está a propósito sin familia: se sacó de Total a pedido y en la
// app aparece solo en la solapa General (ver coberturaGroups.js). No es que falte
// mapearla, así que no se puede decidir por familia y hay que mirarla a mano. Se
// distingue de una cobertura desconocida para que el motivo no acuse un error que no es.
const COBERTURAS_SIN_FAMILIA = ['TOTAL C/ MOV']

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

// Equivalencias de cobertura cargadas en PANEL. El nombre de la fila es el texto tal
// cual lo escribe la compañía en la póliza y la columna Cobertura dice a cuál de las
// nuestras equivale.
//
// Una cobertura por fila, porque esa columna admite una sola (label_limit_count: 1) y no
// se va a cambiar: las otras 100 filas de PANEL se refieren a una cobertura cada una. Con
// eso alcanza igual, porque abajo se compara por familia: si PANEL dice que el texto de
// PORTO es GLOBAL, una GLOBAL ded Alto cotizada también valida, que es lo correcto —
// entre ellas cambia el deducible, no lo que cubren. Si hace falta más precisión se
// agrega otra fila con el mismo texto y otra cobertura.
// Se filtra acá y no en la consulta a propósito: en monday, filtrar una columna de estado
// por el TEXTO de la etiqueta devuelve cero filas y ningún error (hay que pasar el índice
// numérico). Un escenario armado así mostraría "no hay equivalencias cargadas" para
// siempre, sin una sola pista de por qué. Traer PANEL entero y filtrar acá no tiene ese
// modo de falla, y son 100 filas.
const equivalencias = (input.coberturas || [])
  .map((fila) => {
    const cv = fila.column_values || fila.columnValues || []
    return {
      grupo: valorDe(cv, COL.panGrupo),
      texto: String(fila.name ?? '').trim(),
      compania: valorDe(cv, COL.panCompania),
      nuestra: valorDe(cv, COL.panCobertura),
    }
  })
  // Sin la columna Grupo se asume que ya vinieron filtradas.
  .filter((e) => !e.grupo || normalizar(e.grupo) === 'coberturas')

// Todas las coberturas nuestras cargadas para ese texto. Se busca por texto y compañía;
// las filas sin compañía valen para todas, para los textos genéricos que usan varias.
// Mandan las de la compañía si existen: lo específico le gana a lo general.
const coberturasEquivalentes = (texto, compania) => {
  const t = normalizar(texto)
  if (!t) return []
  const filas = equivalencias.filter((e) => normalizar(e.texto) === t && e.nuestra)
  const propias = filas.filter((e) => e.compania && normalizar(e.compania) === normalizar(compania))
  return (propias.length ? propias : filas.filter((e) => !e.compania)).map((e) => e.nuestra)
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
// El documento sale de la CI de la OPORTUNIDAD, que es contra lo que se cotizó. Esa
// columna va a pasar a llamarse "CI/RUT": el titular puede ser una persona (cédula) o
// una empresa (RUT) y ahí va el que corresponda. Mientras tanto puede tener una cédula
// de 8 dígitos donde la póliza trae un RUT de 12: eso no es "no coincide", son dos
// documentos distintos que no se pueden comparar. Cuando pasa, se resuelve por nombre y
// el motivo dice que el documento no se pudo comparar, en vez de inventar un error.
let persona
const docPoliza = soloDigitos(poliza.rut) || soloDigitos(poliza.cedula)
const esEmpresa = Boolean(soloDigitos(poliza.rut))
const docNuestro = soloDigitos(op.cedula) || soloDigitos(cliente.documento)
const nombreNuestro = op.nombre || cliente.razonSocial || cliente.nombre
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
  faltantes.push('CI/RUT o nombre en la oportunidad')
  persona = mal('No se puede validar: la oportunidad no tiene documento ni nombre cargado.')
} else if (docPoliza && docNuestro && docPoliza === docNuestro) {
  persona =
    titular && nombreNuestro && nombreComparable(titular) !== nombreComparable(nombreNuestro)
      ? ok(`El documento coincide. El nombre figura distinto: "${titular}" en la póliza y "${nombreNuestro}" en la oportunidad.`)
      : ok()
} else if (docPoliza && docNuestro && esEmpresa && docNuestro.length <= 9) {
  // RUT contra cédula: no son comparables. Se resuelve por nombre y se avisa qué falta.
  faltantes.push('RUT en la oportunidad')
  persona =
    titular && nombreNuestro && nombreComparable(titular) === nombreComparable(nombreNuestro)
      ? ok(`La póliza está a nombre de ${titular} (RUT ${poliza.rut}), que coincide con la oportunidad. El RUT no se pudo comparar: en la oportunidad figura ${op.cedula || docNuestro}, que no es un RUT.`)
      : mal(`La póliza está a nombre de ${titular || 'una empresa'} (RUT ${poliza.rut}) y la oportunidad es de ${nombreNuestro || 'otro'} (${docNuestro}). En la oportunidad no está el RUT, así que no se pudo comparar el documento.`)
} else if (docPoliza && docNuestro) {
  persona = mal(
    `La póliza está a nombre del documento ${poliza.rut || poliza.cedula}${titular ? ` (${titular})` : ''} y la oportunidad es de ${docNuestro}${nombreNuestro ? ` (${nombreNuestro})` : ''}.`
  )
} else if (titular && nombreNuestro) {
  persona =
    nombreComparable(titular) === nombreComparable(nombreNuestro)
      ? ok('Confirmado por nombre; no había documento para comparar de los dos lados.')
      : mal(`La póliza está a nombre de "${titular}" y la oportunidad es de "${nombreNuestro}". No hay documento para comparar de los dos lados.`)
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
const equivalentes = coberturasEquivalentes(poliza.cobertura, poliza.compania)
if (!elegida) {
  cotizacion = mal('No se puede validar: la oportunidad no tiene una cotización marcada como elegida.')
} else if (!poliza.cobertura) {
  cotizacion = mal('No se puede validar: no se pudo leer la cobertura en la póliza.')
} else if (equivalentes.length) {
  // Con la equivalencia cargada no hay nada que interpretar: alguien ya dijo qué es.
  const cotizada = normalizar(elegida.cobertura)
  const misma = equivalentes.some((c) => normalizar(c) === cotizada)
  // Misma familia y distinto nombre es un deducible distinto, no otra cobertura. Eso lo
  // define el precio, que se mira aparte; acá lo que importa es que no se haya emitido
  // una parcial habiendo cotizado una total.
  const mismaFamilia = Boolean(familiaCot) && equivalentes.some((c) => familiaDeCatalogo(c) === familiaCot)
  const listado = equivalentes.join(' o ')
  if (misma) cotizacion = ok()
  else if (mismaFamilia) cotizacion = ok(`La póliza dice "${poliza.cobertura}", que en PANEL figura como ${listado}; se cotizó ${elegida.cobertura}, de la misma familia.`)
  else cotizacion = mal(`La póliza dice "${poliza.cobertura}", que según PANEL es ${listado}, y se cotizó ${elegida.cobertura}.`)
} else if (COBERTURAS_SIN_FAMILIA.includes(String(elegida.cobertura ?? '').trim().toUpperCase())) {
  // Se cotizó una cobertura que el sistema no clasifica como total ni parcial: no hay
  // contra qué comparar la familia, solo queda el nombre.
  cotizacion =
    normalizar(poliza.cobertura) === normalizar(elegida.cobertura)
      ? ok(`La póliza dice lo mismo que se cotizó (${elegida.cobertura}).`)
      : mal(`Hay que revisarla a mano: se cotizó ${elegida.cobertura}, que el sistema no clasifica como total ni parcial, y la póliza dice "${poliza.cobertura}".`)
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

// Si el texto de la póliza no está en PANEL, lo de arriba lo resolvió adivinando por las
// palabras. Se avisa para que alguien cargue la fila y la próxima no haya que adivinar.
if (poliza.cobertura && !equivalentes.length) faltantes.push(`equivalencia de "${poliza.cobertura}" en PANEL`)

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
