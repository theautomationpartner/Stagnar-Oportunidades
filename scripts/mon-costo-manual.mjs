// Crea en el tablero de cotizaciones (subitems) la casilla "Costo cargado a mano": la
// app la tilda cuando el vendedor completa a mano una cotización que WINK trajo en 0
// (ver CotizacionManualModal.jsx), y la tarjeta la muestra como "Cargada a mano".
//
//   node scripts/mon-costo-manual.mjs            # muestra qué haría
//   node scripts/mon-costo-manual.mjs --apply    # la crea
import fs from 'node:fs'

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const APLICAR = process.argv.includes('--apply')
const SUBITEMS_BOARD = '18420863061'
const TITULO = 'Costo cargado a mano'
const DESCRIPCION = 'Lo tilda la app cuando el costo y el deducible los cargó el vendedor a mano (WINK la trajo en 0).'

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

const sub = await gql(`{ boards(ids: ${SUBITEMS_BOARD}) { name columns { id title type } } }`)
const existente = sub.boards[0].columns.find((c) => c.title.trim().toLowerCase() === TITULO.toLowerCase())
if (existente) {
  console.log(`ya existe  ${existente.title} → ${existente.id} (${existente.type})`)
} else if (!APLICAR) {
  console.log(`crearía    columna ${TITULO} (checkbox) en ${sub.boards[0].name}`)
} else {
  const r = await gql(
    `mutation ($boardId: ID!, $title: String!, $description: String) {
       create_column(board_id: $boardId, title: $title, column_type: checkbox, description: $description) { id title }
     }`,
    { boardId: SUBITEMS_BOARD, title: TITULO, description: DESCRIPCION }
  )
  console.log(`creada     columna ${r.create_column.title} → ${r.create_column.id}`)
}
