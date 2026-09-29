// Reunión del 24/09 — bonificaciones:
//
// 1) PANEL: bonificación comercial precargada por compañía, en su propio Grupo
//    ("Bonificacion", etiqueta nueva de color_mm5fdknw). Una fila por compañía; el % va
//    en "Valor" (numeric_mm5fmjh0). La app la usa como punto de partida editable de la
//    bonificación de cada cotización (ver recargoPanel.js#buildBonificaciones):
//
//      SANCOR 15 · PORTO 10 · BSE 10 · SURA 0
//
// 2) Subitems de Oportunidades (cotizaciones): dos columnas numéricas nuevas para las
//    bonificaciones especiales de BSE, "BNS (%)" (bonificación por no siniestro) y
//    "Flota (%)". Son datos de la póliza que da el Banco de Seguros y se usan también en
//    renovaciones, por eso se guardan en la cotización y no quedan solo en pantalla.
//
// Crear columnas o filas no dispara automatizaciones.
//
// Idempotente: lo que ya existe no se vuelve a crear, y nunca pisa un valor cargado a mano.
//
// Uso:
//   node scripts/mon-bonificaciones.mjs            # muestra qué haría
//   node scripts/mon-bonificaciones.mjs --apply    # lo aplica
import fs from 'node:fs'

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const APLICAR = process.argv.includes('--apply')
const PANEL_BOARD = '18421072511'
const PANEL_GRUPO = 'group_mm526v30'
const SUBITEMS_BOARD = '18420863061'
const GRUPO_BONIFICACION = 'Bonificacion'
const NOMBRE_FILA = 'Bonificación comercial'
const COL = {
  compania: 'dropdown_mm52feqr',
  grupo: 'color_mm5fdknw',
  valor: 'numeric_mm5fmjh0',
  descripcion: 'text_mm5fmqdw',
}

const BONIFICACIONES = [
  ['SANCOR', 15],
  ['PORTO', 10],
  ['BSE', 10],
  ['SURA', 0],
]

const COLUMNAS_SUBITEM = [
  { titulo: 'BNS (%)', descripcion: 'BSE: bonificación por no siniestro de la póliza (la da el Banco de Seguros).' },
  { titulo: 'Flota (%)', descripcion: 'BSE: bonificación por pertenecer a una flota (la da el Banco de Seguros).' },
]

async function gql(query, variables) {
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: env.MONDAY_API_KEY, 'API-Version': '2024-10' },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400))
  return j.data
}

// ---- 1) PANEL
const panel = await gql(
  `{ boards(ids: ${PANEL_BOARD}) { items_page(limit: 300) { items { id name column_values(ids: ["${COL.compania}","${COL.grupo}","${COL.valor}"]) { id text } } } } }`
)
const existentes = panel.boards[0].items_page.items.map((i) => {
  const cv = Object.fromEntries(i.column_values.map((c) => [c.id, c.text || '']))
  return { id: i.id, name: i.name.trim(), compania: cv[COL.compania], grupo: cv[COL.grupo], valor: cv[COL.valor] }
})
const filasACrear = BONIFICACIONES.filter(
  ([compania]) => !existentes.some((e) => e.grupo === GRUPO_BONIFICACION && e.compania === compania)
)
console.log(`PANEL: ${filasACrear.length} fila(s) de bonificación a crear`)
for (const [compania, valor] of filasACrear) console.log(`  crear      ${compania} · ${valor}%`)
for (const [compania] of BONIFICACIONES.filter((b) => !filasACrear.includes(b))) {
  console.log(`  sin tocar  ${compania} (ya existe)`)
}

// ---- 2) Columnas del tablero de cotizaciones
const sub = await gql(`{ boards(ids: ${SUBITEMS_BOARD}) { name columns { id title type } } }`)
const columnasACrear = COLUMNAS_SUBITEM.filter(
  (c) => !sub.boards[0].columns.some((x) => x.title.trim().toLowerCase() === c.titulo.toLowerCase())
)
console.log(`\n${sub.boards[0].name}: ${columnasACrear.length} columna(s) a crear`)
for (const c of columnasACrear) console.log(`  crear      ${c.titulo} (números)`)
for (const c of sub.boards[0].columns.filter((x) => COLUMNAS_SUBITEM.some((c) => c.titulo.toLowerCase() === x.title.trim().toLowerCase()))) {
  console.log(`  ya existe  ${c.title} → ${c.id}`)
}

if (!APLICAR) {
  console.log('\nSimulación. Para aplicarlo: node scripts/mon-bonificaciones.mjs --apply')
} else {
  for (const [compania, valor] of filasACrear) {
    await gql(
      `mutation($boardId: ID!, $groupId: String!, $name: String!, $values: JSON!) {
         create_item(board_id: $boardId, group_id: $groupId, item_name: $name, column_values: $values, create_labels_if_missing: true) { id }
       }`,
      {
        boardId: PANEL_BOARD,
        groupId: PANEL_GRUPO,
        name: NOMBRE_FILA,
        values: JSON.stringify({
          [COL.compania]: { labels: [compania] },
          [COL.grupo]: { label: GRUPO_BONIFICACION },
          [COL.valor]: String(valor),
          [COL.descripcion]: `Bonificación comercial (%) con la que arranca cada cotización de ${compania}. Se puede cambiar en la tarjeta de cada cotización.`,
        }),
      }
    )
    console.log(`creada     ${compania} · ${valor}%`)
  }
  for (const c of columnasACrear) {
    const r = await gql(
      `mutation($boardId: ID!, $title: String!, $description: String) {
         create_column(board_id: $boardId, title: $title, column_type: numbers, description: $description) { id title }
       }`,
      { boardId: SUBITEMS_BOARD, title: c.titulo, description: c.descripcion }
    )
    console.log(`creada     columna ${r.create_column.title} → ${r.create_column.id}`)
  }
  console.log('\nlisto')
}
