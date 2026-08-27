// Lee en el momento (sin hardcodear) las opciones y colores reales de las columnas
// de status/dropdown del tablero Oportunidades, para que los filtros y los badges de
// estado siempre reflejen la configuración actual de monday. Ver /logica-monday-vibe.md.
import {
  fetchColumnsSettings,
  SUBITEMS_BOARD_ID,
  CLIENTES_BOARD_ID,
  CONTACTO_ESTADO_COLUMN_ID,
} from './mondayApi'

const DEFAULT_COLOR = { bg: '#c4c4c4', border: '#b0b0b0' }

// tipoSujeto (Cliente | Lead) no está acá: vive en el tablero Clientes ("Situación",
// CONTACTO_ESTADO_COLUMN_ID) — la color_mm51mm5v de Oportunidades quedó obsoleta.
const STATUS_COLUMNS = {
  estadoOportunidad: 'deal_stage',
  estadoCotizacion: 'color_mm51n7aa',
  estadoEnvio: 'color_mm4wr1t4',
  estadoCreacion: 'color_mm5ejysv',
  estadoLectura: 'color_mm5rzrhk',
  uso: 'color_mm52ey1d',
  tipoRiesgo: 'color_mm5atxav',
}

const DROPDOWN_COLUMNS = {
  marcas: 'dropdown_mm51ykrd',
  anios: 'dropdown_mm51mdmq',
  combustibles: 'dropdown_mm52jp01',
  tipo: 'dropdown_mm5jqdk',
}

// A diferencia de las anteriores, esta vive en el tablero de subitems (Subelementos de
// Oportunidades), no en el de Oportunidades — se pide con un fetch aparte.
const SUBITEM_DROPDOWN_COLUMNS = {
  rc: 'dropdown_mm5954ma',
}

function parseStatusColumn(column) {
  if (!column) return { options: [], colorsByLabel: {} }
  const settings = JSON.parse(column.settings_str || '{}')
  const labels = settings.labels || {}
  const positions = settings.labels_positions_v2 || {}
  const colors = settings.labels_colors || {}
  const deactivated = new Set(settings.deactivated_labels || [])

  const entries = Object.keys(labels)
    .filter((idx) => labels[idx] && !deactivated.has(idx))
    .sort((a, b) => (positions[a] ?? 0) - (positions[b] ?? 0))
    .map((idx) => ({
      label: labels[idx],
      color: {
        bg: colors[idx]?.color ?? DEFAULT_COLOR.bg,
        border: colors[idx]?.border ?? DEFAULT_COLOR.border,
      },
    }))

  return {
    options: entries.map((e) => e.label),
    colorsByLabel: Object.fromEntries(entries.map((e) => [e.label, e.color])),
  }
}

function parseDropdownColumn(column) {
  if (!column) return []
  const settings = JSON.parse(column.settings_str || '{}')
  const deactivated = new Set(settings.deactivated_labels || [])
  const labels = settings.labels || []
  return labels.filter((l) => l.name && !deactivated.has(l.id)).map((l) => l.name)
}

export async function fetchFilterAndStatusSchema() {
  const allColumnIds = [...Object.values(STATUS_COLUMNS), ...Object.values(DROPDOWN_COLUMNS)]
  const [columns, subitemColumns, clienteColumns] = await Promise.all([
    fetchColumnsSettings(allColumnIds),
    fetchColumnsSettings(Object.values(SUBITEM_DROPDOWN_COLUMNS), SUBITEMS_BOARD_ID),
    fetchColumnsSettings([CONTACTO_ESTADO_COLUMN_ID], CLIENTES_BOARD_ID),
  ])
  const byId = Object.fromEntries(columns.map((c) => [c.id, c]))
  const subitemById = Object.fromEntries(subitemColumns.map((c) => [c.id, c]))

  const statuses = Object.fromEntries(
    Object.entries(STATUS_COLUMNS).map(([key, colId]) => [key, parseStatusColumn(byId[colId])])
  )

  return {
    ...statuses,
    tipoSujeto: parseStatusColumn(clienteColumns[0]),
    marcas: parseDropdownColumn(byId[DROPDOWN_COLUMNS.marcas]).sort((a, b) => a.localeCompare(b)),
    anios: parseDropdownColumn(byId[DROPDOWN_COLUMNS.anios]).sort((a, b) => Number(b) - Number(a)),
    combustibles: parseDropdownColumn(byId[DROPDOWN_COLUMNS.combustibles]),
    tipo: parseDropdownColumn(byId[DROPDOWN_COLUMNS.tipo]),
    rc: parseDropdownColumn(subitemById[SUBITEM_DROPDOWN_COLUMNS.rc]),
  }
}
