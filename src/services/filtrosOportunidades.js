// Filtros de la tabla de Oportunidades (reunión del 24/09).
//
// Dos criterios nuevos:
//  - Estado de la cotización y Estado de envío: lo que importa saber es si salió bien o
//    mal. Las etiquetas de transición (Cotizar/Cotizando, Enviar/Enviando) duran segundos
//    y se agrupan en una sola opción, "Otros".
//  - Se suman Estado de la oportunidad, Asignado y tres rangos de fechas (desde/hasta).
//
// Cada filtro se resuelve de dos maneras que tienen que decir lo mismo: como regla de la
// API de monday (reglasDeFiltros, sin texto de búsqueda) y en el navegador sobre lo ya
// traído (cumpleFiltros, con texto de búsqueda — la API no deja mezclar el "o" de la
// búsqueda con el "y" de los filtros, ver buildOpportunitiesQueryParams).

import { RESULTADO, resultadoDe } from './dashboardOportunidades'

export const OTROS = 'Otros'

// "Concretada" y las tres "Ganada" juntas (el mismo criterio que el dashboard, ver
// dashboardOportunidades.js#resultadoDe). Es la opción a la que lleva la tarjeta
// "Concretadas" del dashboard.
export const CONCRETADAS_TODAS = 'Concretadas (todas)'

const ESTADOS_DE_TRANSICION = {
  estadoCotizacion: ['Cotizar', 'Cotizando'],
  estadoEnvio: ['Enviar', 'Enviando'],
  estadoCreacion: ['Crear', 'Creando'],
  validacionPoliza: ['Validar', 'Validando'],
}

// Crear póliza y Validación póliza se sumaron para que las tarjetas de "Requiere
// atención hoy" del dashboard lleven a la tabla ya filtrada.
const COLUMNA_DE_ESTADO = {
  estadoOportunidad: 'deal_stage',
  estadoCotizacion: 'color_mm51n7aa',
  estadoEnvio: 'color_mm4wr1t4',
  estadoCreacion: 'color_mm5ejysv',
  validacionPoliza: 'color_mm7ash2k',
}

// `campo` es la fecha ya normalizada a AAAA-MM-DD en la oportunidad (ver
// opportunityMapper.js). El Registro de creación viene en UTC: una oportunidad creada
// después de las 21 h de Uruguay cuenta para el día siguiente.
export const RANGOS_DE_FECHA = [
  { clave: 'fechaCotizacion', label: 'Última cotización', columna: 'date_mm52w0h8', campo: 'fechaCotizacionIso' },
  { clave: 'fechaCierre', label: 'Fecha Cierre', columna: 'deal_expected_close_date', campo: 'fechaCierreIso' },
  { clave: 'creacion', label: 'Registro de creación', columna: 'pulse_log_mm4pzxca', campo: 'creacionIso' },
]

export const FILTROS_VACIOS = {
  estadoOportunidad: '',
  estadoCotizacion: '',
  estadoEnvio: '',
  estadoCreacion: '',
  validacionPoliza: '',
  tipoSujeto: '',
  // A pedido: check "Solo empresas" (true / ''). Como Tipo de Sujeto, se filtra en el
  // navegador: el tipo viene del cliente vinculado (ver mondayApi.js#conTipoDeCliente).
  soloEmpresas: '',
  // id de monday de la persona (columna people "Asignado").
  asignado: '',
  ...Object.fromEntries(RANGOS_DE_FECHA.flatMap((r) => [[`${r.clave}Desde`, ''], [`${r.clave}Hasta`, '']])),
}

// Las opciones que se ofrecen para un estado: las de la columna, con las de transición
// reemplazadas por "Otros".
export function opcionesDeEstado(clave, opciones) {
  const transicion = ESTADOS_DE_TRANSICION[clave]
  if (!transicion) return opciones
  const quedan = opciones.filter((o) => !transicion.includes(o))
  return opciones.some((o) => transicion.includes(o)) ? [...quedan, OTROS] : quedan
}

// `todas`: las etiquetas de la columna (para expandir "Concretadas (todas)").
function etiquetasDelFiltro(clave, valor, todas = []) {
  if (clave === 'estadoOportunidad' && valor === CONCRETADAS_TODAS) {
    return todas.filter((e) => resultadoDe(e) === RESULTADO.CONCRETADA)
  }
  return valor === OTROS ? ESTADOS_DE_TRANSICION[clave] ?? [] : [valor]
}

// Cuántos filtros hay puestos: un rango cuenta una vez, tenga desde, hasta o los dos.
export function cantidadDeFiltrosActivos(filtros) {
  const sueltos = [
    'estadoOportunidad',
    'estadoCotizacion',
    'estadoEnvio',
    'estadoCreacion',
    'validacionPoliza',
    'tipoSujeto',
    'soloEmpresas',
    'asignado',
  ].filter(
    (k) => filtros[k]
  ).length
  const rangos = RANGOS_DE_FECHA.filter((r) => filtros[`${r.clave}Desde`] || filtros[`${r.clave}Hasta`]).length
  return sueltos + rangos
}

// Reglas para items_page. Los estados van por índice de etiqueta (any_of), que es lo que
// permite pedir varias a la vez ("Otros"). "Tipo de Sujeto" no está: es una columna mirror
// y la API la rechaza — se filtra siempre en el navegador (ver App.jsx).
export function reglasDeFiltros(filtros, schema) {
  const reglas = []
  for (const [clave, columnId] of Object.entries(COLUMNA_DE_ESTADO)) {
    if (!filtros[clave]) continue
    const indices = etiquetasDelFiltro(clave, filtros[clave], Object.keys(schema?.[clave]?.indexByLabel ?? {}))
      .map((etiqueta) => schema?.[clave]?.indexByLabel?.[etiqueta])
      .filter((i) => i != null)
      .map(Number)
    if (indices.length) reglas.push({ column_id: columnId, compare_value: indices, operator: 'any_of' })
  }
  if (filtros.asignado) {
    reglas.push({ column_id: 'deal_owner', compare_value: [`person-${filtros.asignado}`], operator: 'any_of' })
  }
  for (const rango of RANGOS_DE_FECHA) {
    const desde = filtros[`${rango.clave}Desde`]
    const hasta = filtros[`${rango.clave}Hasta`]
    if (desde && hasta) {
      reglas.push({ column_id: rango.columna, compare_value: [desde, hasta], operator: 'between' })
    } else if (desde) {
      reglas.push({ column_id: rango.columna, compare_value: ['EXACT', desde], operator: 'greater_than_or_equals' })
    } else if (hasta) {
      reglas.push({ column_id: rango.columna, compare_value: ['EXACT', hasta], operator: 'lower_than_or_equal' })
    }
  }
  return reglas
}

// Mismo criterio que reglasDeFiltros, sobre una oportunidad ya traída. `nombreAsignado`
// es el nombre de la persona elegida: en el listado la columna people llega como texto.
export function cumpleFiltros(opp, filtros, { nombreAsignado } = {}) {
  for (const clave of Object.keys(COLUMNA_DE_ESTADO)) {
    if (!filtros[clave]) continue
    if (clave === 'estadoOportunidad' && filtros[clave] === CONCRETADAS_TODAS) {
      if (resultadoDe(opp[clave]) !== RESULTADO.CONCRETADA) return false
      continue
    }
    if (!etiquetasDelFiltro(clave, filtros[clave]).includes(opp[clave])) return false
  }
  if (filtros.tipoSujeto && opp.tipoSujeto !== filtros.tipoSujeto) return false
  if (filtros.soloEmpresas && opp.clienteTipo !== 'Empresa') return false
  if (filtros.asignado) {
    const asignados = String(opp.asignado ?? '').split(',').map((n) => n.trim())
    if (!nombreAsignado || !asignados.includes(nombreAsignado)) return false
  }
  for (const rango of RANGOS_DE_FECHA) {
    const desde = filtros[`${rango.clave}Desde`]
    const hasta = filtros[`${rango.clave}Hasta`]
    if (!desde && !hasta) continue
    const fecha = opp[rango.campo]
    if (!fecha) return false
    if (desde && fecha < desde) return false
    if (hasta && fecha > hasta) return false
  }
  return true
}

// Los "problemas" (accesos rápidos de la tabla y tarjetas de "Requiere atención hoy"). A
// pedido, el error de un paso tiene que coincidir con el estado de la oportunidad en ese
// paso — si no, es una oportunidad que ya siguió de largo y el error quedó viejo:
//   - error en la cotización → la oportunidad sigue en Nueva;
//   - error en el envío      → sigue en Cotización Emitida;
//   - error en la emisión    → está en Concretada (la póliza se crea al concretar);
//   - diferencias en la validación de la póliza → está en Ganada - Póliza (la póliza ya
//     se emitió y la validación encontró diferencias con lo cotizado).
export const PROBLEMAS = {
  cotizacion: { estadoCotizacion: 'Error', estadoOportunidad: 'Nueva' },
  envio: { estadoEnvio: 'Error', estadoOportunidad: 'Cotizacion Emitida' },
  emision: { estadoCreacion: 'Error', estadoOportunidad: 'Concretada' },
  diferencias: { validacionPoliza: 'Con diferencias', estadoOportunidad: 'Ganada - Póliza' },
}

// ¿La oportunidad tiene este problema? Es exactamente el filtro de la tabla (cumpleFiltros),
// así el número de la tarjeta y el de la lista filtrada no pueden diferir.
export function tieneProblema(opp, clave) {
  return cumpleFiltros(opp, { ...FILTROS_VACIOS, ...PROBLEMAS[clave] })
}

// ¿Los filtros puestos son justo los de este problema?
export function problemaActivo(filtros, clave) {
  return Object.entries(PROBLEMAS[clave]).every(([campo, valor]) => filtros[campo] === valor)
}
