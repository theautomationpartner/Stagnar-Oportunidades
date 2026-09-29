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

export const OTROS = 'Otros'

const ESTADOS_DE_TRANSICION = {
  estadoCotizacion: ['Cotizar', 'Cotizando'],
  estadoEnvio: ['Enviar', 'Enviando'],
}

const COLUMNA_DE_ESTADO = {
  estadoOportunidad: 'deal_stage',
  estadoCotizacion: 'color_mm51n7aa',
  estadoEnvio: 'color_mm4wr1t4',
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
  tipoSujeto: '',
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

function etiquetasDelFiltro(clave, valor) {
  return valor === OTROS ? ESTADOS_DE_TRANSICION[clave] ?? [] : [valor]
}

// Cuántos filtros hay puestos: un rango cuenta una vez, tenga desde, hasta o los dos.
export function cantidadDeFiltrosActivos(filtros) {
  const sueltos = ['estadoOportunidad', 'estadoCotizacion', 'estadoEnvio', 'tipoSujeto', 'asignado'].filter(
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
    const indices = etiquetasDelFiltro(clave, filtros[clave])
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
    if (filtros[clave] && !etiquetasDelFiltro(clave, filtros[clave]).includes(opp[clave])) return false
  }
  if (filtros.tipoSujeto && opp.tipoSujeto !== filtros.tipoSujeto) return false
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
