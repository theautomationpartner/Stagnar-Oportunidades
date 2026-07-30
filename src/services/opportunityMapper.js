// Mapea la respuesta cruda de la API de monday al modelo que consume la tabla de Oportunidades.
// Reglas documentadas en /logica-monday-vibe.md ("Vista: Tablero de Oportunidades").
// Los colores de estado NO se hardcodean: vienen de statusColors, leido en el momento
// desde la config real de las columnas (ver services/boardSchema.js).

const DEFAULT_COLOR = { bg: '#c4c4c4', border: '#b0b0b0' }

function textOf(columnValues, columnId) {
  return columnValues.find((cv) => cv.id === columnId)?.text?.trim() || ''
}

// Las columnas "conectada" (board_relation) devuelven `text` vacío/null vía API sin
// importar si tienen un ítem vinculado o no — hay que pedir `display_value` (fragmento
// GraphQL "... on BoardRelationValue", ver mondayApi.js) en su lugar. Confirmado contra
// la API real: `text` da `null` incluso en ítems con Departamento cargado.
function boardRelationDisplayOf(columnValues, columnId) {
  return columnValues.find((cv) => cv.id === columnId)?.display_value?.trim() || ''
}

function uniqueNonEmpty(values) {
  return [...new Set(values.filter(Boolean))]
}

function initialsOf(name) {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function mapOpportunityItem(item, statusColors = {}) {
  const cv = item.column_values
  const nombre = textOf(cv, 'text_mm51b055')
  const apellido = textOf(cv, 'text_mm51ez7e')
  const clienteNombre = [nombre, apellido].filter(Boolean).join(' ') || item.name

  const marca = textOf(cv, 'dropdown_mm51ykrd')
  const anio = textOf(cv, 'dropdown_mm51mdmq')
  const modelo = textOf(cv, 'text_mm54fb7m')
  const combustible = textOf(cv, 'dropdown_mm52jp01')
  const uso = textOf(cv, 'color_mm52ey1d')

  const bienLinea1 = [marca, modelo || anio].filter(Boolean).join(' ') || item.name
  const bienLinea2 = [combustible, uso].filter(Boolean).join(' · ')

  const coberturas = uniqueNonEmpty(
    (item.subitems ?? []).map((s) => textOf(s.column_values, 'dropdown_mm4w8n8p'))
  )
  const companias = uniqueNonEmpty(
    (item.subitems ?? []).map((s) => textOf(s.column_values, 'dropdown_mm51f4va'))
  )

  const estadoLabel = textOf(cv, 'deal_stage') || 'Sin estado'
  const estadoColor = statusColors.estadoOportunidad?.[estadoLabel] ?? DEFAULT_COLOR

  const ultimaCotizacion = textOf(cv, 'date_mm52w0h8') || textOf(cv, 'date__1') || '—'
  const asignado = textOf(cv, 'deal_owner')

  const estadoCotizacion = textOf(cv, 'color_mm51n7aa')
  const estadoCotizacionColor = statusColors.estadoCotizacion?.[estadoCotizacion] ?? DEFAULT_COLOR
  const tipoSujeto = textOf(cv, 'color_mm51mm5v')
  const estadoEnvio = textOf(cv, 'color_mm4wr1t4')
  const estadoEnvioColor = statusColors.estadoEnvio?.[estadoEnvio] ?? DEFAULT_COLOR
  const estadoCreacion = textOf(cv, 'color_mm5ejysv')
  const estadoCreacionColor = statusColors.estadoCreacion?.[estadoCreacion] ?? DEFAULT_COLOR

  return {
    id: item.id,
    oppNumber: `OPP-${item.id.slice(-4)}`,
    clienteNombre,
    ci: textOf(cv, 'numeric_mm51mb0s'),
    telefono: textOf(cv, 'phone_mm519m27'),
    marca,
    anio,
    modelo,
    combustible,
    uso,
    tipo: textOf(cv, 'dropdown_mm5jqdk'),
    edad: textOf(cv, 'numeric_mm527wpm'),
    fechaNacimiento: textOf(cv, 'date_mm516agw'),
    departamento: boardRelationDisplayOf(cv, 'board_relation_mm54tq30'),
    zonaCirculacion: textOf(cv, 'location_mm51e7g7'),
    libretaConducir: textOf(cv, 'file_mm51jy06'),
    cedula: textOf(cv, 'file_mm5pc008'),
    poliza: textOf(cv, 'file_mm5bzdd4'),
    bienLinea1,
    bienLinea2: bienLinea2 || (coberturas.length ? coberturas.join(' / ') : ''),
    companias: companias.length ? companias.join(', ') : '—',
    estadoLabel,
    estadoColor,
    estadoCotizacion,
    estadoCotizacionColor,
    tipoSujeto,
    estadoEnvio,
    estadoEnvioColor,
    estadoCreacion,
    estadoCreacionColor,
    ultimaCotizacion,
    asignado,
    asignadoIniciales: initialsOf(asignado),
  }
}

export function mapOpportunities(items, statusColors = {}) {
  return items.map((item) => mapOpportunityItem(item, statusColors))
}
