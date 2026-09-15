// MON-13: limpia los labels de "Tipo de Actividad" y "Medio de Comunicación" en
// Actividades (reemplaza el campo genérico anterior por dos columnas bien definidas,
// ya existían separadas pero con labels sueltos/con errores), agrega las columnas
// opcionales Archivo/Link para la actividad de Inspección/Autorización, y en
// Oportunidades agrega 3 etiquetas nuevas a "Estado Oportunidad" para el gate previo a
// cargar la póliza: Ganada - Póliza / Ganada - Requiere Inspección / Ganada - Requiere
// Autorización. "Concretada" NO se toca — sigue siendo el estado final real, recién
// cuando se emite la póliza (5 ítems reales ya la usan hoy).
// Idempotente: si ya está en el estado deseado, no vuelve a escribir. Dry-run por
// default, `--apply` para escribir de verdad.
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const APLICAR = process.argv.includes('--apply')
const ACTIVIDADES_BOARD = '18390062302'
const OPORTUNIDADES_BOARD = '18420863013'

async function gql(query, variables) {
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: env.MONDAY_API_KEY },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 1000))
  return j.data
}

// El campo `settings` (estructurado) es el que trae el `id` PERSISTENTE de cada label —
// distinto del `index` (posición visual) y de la key numérica de `settings_str.labels`
// (que en realidad TAMBIÉN es el id, no el índice — confirmado contra la API real: ahí
// "Concretada" aparece con key "1" pero su `index` real, en `settings`, es 5). Hace falta
// mandar ese `id` en cada label ya existente del payload de `update_status_column` — sin
// él, monday no lo reconoce como "el mismo label" y devuelve "Unable to delete a label
// already in use" apenas alguno de los labels tiene ítems reales apuntándole.
async function leerColumna(boardId, columnId) {
  const data = await gql(
    `{ boards(ids:[${boardId}]) { columns(ids:["${columnId}"]) { revision settings_str settings } } }`
  )
  const col = data.boards[0].columns[0]
  const settingsStr = JSON.parse(col.settings_str)
  const estructurado = col.settings.labels // [{id,label,index,is_done,...}] — `settings` ya viene como objeto, no como string
  const porId = {}
  for (const l of estructurado) {
    porId[l.id] = {
      label: l.label,
      index: l.index,
      isDone: l.is_done,
      varName: settingsStr.labels_colors?.[l.id]?.var_name,
    }
  }
  return { revision: col.revision, porId }
}

// Renombra/agrega labels por TEXTO actual — si "from" matchea el texto de un label
// existente lo renombra a "to" (conserva id/índice/color/is_done salvo que se pida
// otro color); si "from" es null, es un label nuevo de verdad. Idempotente: si "to" ya
// existe como texto de algún label (en cualquier id), no hace nada — cubre tanto un
// rename ya aplicado como una adición ya aplicada.
async function aplicarLabels(boardId, columnId, columnTitle, cambios) {
  const { revision, porId } = await leerColumna(boardId, columnId)
  const entradas = Object.entries(porId) // [id, {label,index,isDone,varName}]
  const textosActuales = new Set(entradas.map(([, v]) => v.label).filter((l) => l !== ''))
  let siguienteIndex = Math.max(0, ...entradas.map(([, v]) => v.index)) + 1

  const diffs = []
  const porIdFinal = { ...porId } // se muta acá abajo con los renames
  const nuevos = [] // labels sin id todavía

  for (const { from, to, color } of cambios) {
    if (textosActuales.has(to)) continue // ya aplicado (rename o alta), no hacer nada
    if (from) {
      const entradaId = entradas.find(([, v]) => v.label === from)?.[0]
      if (entradaId == null) {
        throw new Error(`${columnTitle}: no encontré ningún label con el texto actual "${from}"`)
      }
      diffs.push(`~ "${from}" -> "${to}"`)
      porIdFinal[entradaId] = { ...porIdFinal[entradaId], label: to, color }
    } else {
      diffs.push(`+ agregar "${to}"`)
      nuevos.push({ label: to, index: siguienteIndex++, color, isDone: false })
    }
  }

  if (!diffs.length) {
    console.log(`= ${columnTitle}: sin cambios`)
    return
  }
  console.log(`${columnTitle}:`)
  for (const d of diffs) console.log(`  ${d}`)

  // Hay que mandar TODOS los labels existentes (con su `id` real) más los nuevos — la
  // mutation reemplaza el settings completo de la columna, no hace merge parcial.
  const resolverColor = (label, colorPedido, varName) => {
    const color = colorPedido ?? varNameToEnum(varName)
    if (!color) {
      throw new Error(
        `${columnTitle}: no sé a qué color de StatusColumnColors corresponde "${varName}" ` +
          `(label "${label}") — falta en VAR_NAME_TO_ENUM, agregalo antes de aplicar.`
      )
    }
    return color
  }

  const labelsPayload = [
    ...Object.entries(porIdFinal).map(([id, v]) => ({
      id: Number(id),
      label: v.label,
      index: v.index,
      is_done: v.isDone,
      color: resolverColor(v.label, v.color, v.varName),
    })),
    ...nuevos.map((n) => ({
      label: n.label,
      index: n.index,
      is_done: n.isDone,
      color: resolverColor(n.label, n.color, null),
    })),
  ]
  // OJO: NO filtrar los labels con texto vacío (slots sin usar, ej. id 5 en Estado
  // Oportunidad) — confirmado contra la API real que omitir un label existente del
  // payload lo BORRA (la mutation reemplaza todo el settings, no hace merge), así que un
  // slot vacío hay que seguir mandándolo igual que cualquier otro para conservarlo.

  if (process.env.DEBUG_PAYLOAD) console.log('PAYLOAD:', JSON.stringify(labelsPayload, null, 2), 'rev:', revision)
  if (!APLICAR) return
  await gql(
    `mutation($b:ID!,$id:String!,$rev:String!,$settings:UpdateStatusColumnSettingsInput!){
      update_status_column(board_id:$b, id:$id, revision:$rev, settings:$settings) { id }
    }`,
    { b: boardId, id: columnId, rev: revision, settings: { labels: labelsPayload } }
  )
  console.log(`  ✓ aplicado`)
}

// Mapeo var_name -> enum de StatusColumnColors, confirmado a mano contra la API real
// (creando y borrando un tablero descartable) porque la API no lo expone directo — hace
// falta para no perder el color que ya tenía un label al renombrarlo.
const VAR_NAME_TO_ENUM = {
  orange: 'working_orange',
  'green-shadow': 'done_green',
  'red-shadow': 'stuck_red',
  'blue-links': 'dark_blue',
  purple: 'purple',
  grey: 'explosive',
  'grass-green': 'grass_green',
  'bright-blue': 'bright_blue',
  mustered: 'saladish',
  yellow: 'egg_yolk',
  'soft-black': 'blackish',
  'dark-red': 'dark_red',
  'dark-pink': 'sofia_pink',
  'light-pink': 'lipstick',
  'dark-purple': 'dark_purple',
  'lime-green': 'bright_green',
  turquoise: 'chili_blue',
  'trolley-grey': 'american_gray',
  brown: 'brown',
  'dark-orange': 'dark_orange',
  sunset: 'sunset',
  bubble: 'bubble',
  peach: 'peach',
  berry: 'berry',
  winter: 'winter',
  river: 'river',
  navy: 'navy',
  australia: 'aquamarine',
  indigo: 'indigo',
  dark_indigo: 'dark_indigo',
  pecan: 'pecan',
  light_magic: 'lavender',
  sky: 'royal',
  cold_blue: 'steel',
  kids: 'orchid',
  purple_gray: 'lilac',
  corona: 'tan',
  sail: 'sky',
  old_rose: 'coffee',
  eden: 'teal',
}
function varNameToEnum(varName) {
  return VAR_NAME_TO_ENUM[varName]
}

// --- 1) Actividades: Tipo de Actividad (color_mm722yy0) ---
// Reemplaza el campo genérico por labels claros: Cotización, Recotización, Seguimiento,
// Inspección, Autorización (mismos 5 índices que ya existían, "Listo" no pertenecía acá
// y pasa a ser Autorización).
await aplicarLabels(ACTIVIDADES_BOARD, 'color_mm722yy0', 'Actividades / Tipo de Actividad', [
  { from: 'Recotizacion', to: 'Recotización' },
  { from: 'Listo', to: 'Autorización' },
  { from: 'Seguimiento de Cotizacion', to: 'Seguimiento' },
  { from: 'Cotizace', to: 'Cotización', color: 'dark_blue' },
  { from: 'Inspeccion', to: 'Inspección' },
])

// --- 2) Actividades: Medio de Comunicación (activity_type) ---
await aplicarLabels(ACTIVIDADES_BOARD, 'activity_type', 'Actividades / Medio de Comunicación', [
  { from: 'Whatsapp', to: 'WhatsApp' },
  { from: 'Mensaje', to: 'Email' },
  { from: 'Reunión', to: 'Reunión presencial' },
  { from: 'Llamada telefónica', to: 'Llamada' },
  { from: null, to: 'Visita a campo', color: 'teal' },
])

// --- 3) Actividades: columnas opcionales Archivo / Link (Inspección/Autorización) ---
const board = await gql(`{ boards(ids:[${ACTIVIDADES_BOARD}]) { columns { id title type } } }`)
const existentes = board.boards[0].columns
const NUEVAS_COLUMNAS = [
  { title: 'Archivo', type: 'file' },
  { title: 'Link', type: 'link' },
]
for (const col of NUEVAS_COLUMNAS) {
  const ya = existentes.find((c) => c.title.toLowerCase() === col.title.toLowerCase())
  if (ya) {
    console.log(`= Actividades / ${col.title}: ya existía -> ${ya.id}`)
    continue
  }
  if (!APLICAR) {
    console.log(`+ Actividades: crearía columna "${col.title}" (${col.type})`)
    continue
  }
  const d = await gql(
    `mutation($b:ID!,$t:String!,$ct:ColumnType!){create_column(board_id:$b,title:$t,column_type:$ct){id title}}`,
    { b: ACTIVIDADES_BOARD, t: col.title, ct: col.type }
  )
  console.log(`+ Actividades: creada "${col.title}" -> ${d.create_column.id}`)
}

// --- 4) Oportunidades: Estado Oportunidad (deal_stage) ---
// Las 3 son etiquetas NUEVAS — "Concretada" no se toca para nada (sigue siendo el
// estado final real, recién cuando se emite la póliza; 5 ítems reales ya la usan hoy).
// Colores elegidos a mano para no repetir ninguno de los que ya usan las demás (monday
// exige colores únicos dentro de la misma columna): "Concretada" usa grass-green,
// "Cotizacion aceptada" usa done_green, "Cotizacion Emitida" usa egg_yolk.
await aplicarLabels(OPORTUNIDADES_BOARD, 'deal_stage', 'Oportunidades / Estado Oportunidad', [
  { from: null, to: 'Ganada - Requiere Inspección', color: 'dark_orange' },
  { from: null, to: 'Ganada - Póliza', color: 'bright_green' },
  { from: null, to: 'Ganada - Requiere Autorización', color: 'chili_blue' },
])

if (!APLICAR) console.log('\n(simulación — corré con --apply para escribir)')
