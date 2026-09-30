// Completa la columna Team (dropdown_mm72rsy7) del tablero "Usuario Habilitados - Lista
// Blanca" con los teams de monday a los que pertenece HOY cada persona, por nombre
// (Admin_App / Ventas_App), tal cual están en monday. Solo escribe esa columna: no toca el
// Rol, ni el Estado, ni mueve a nadie de team. Las filas sin ID Usuario quedan como están.
//
//   node scripts/mon-lista-blanca-teams.mjs            # muestra qué haría
//   node scripts/mon-lista-blanca-teams.mjs --apply    # lo aplica
import fs from 'node:fs'

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const APLICAR = process.argv.includes('--apply')
const BOARD = '18409461390'
const COL = { id: 'text_mm6sdhy6', team: 'dropdown_mm72rsy7', rol: 'color_mm72cf90' }
const TEAMS = [
  { id: '1509544', nombre: 'Admin_App' },
  { id: '1509546', nombre: 'Ventas_App' },
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

const t = await gql(`query ($ids: [ID!]) { teams(ids: $ids) { id name users { id } } }`, { ids: TEAMS.map((x) => x.id) })
const miembros = Object.fromEntries(t.teams.map((x) => [String(x.id), new Set(x.users.map((u) => String(u.id)))]))

const b = await gql(
  `{ boards(ids: ${BOARD}) { items_page(limit: 500) { items { id name column_values(ids: ["${COL.id}", "${COL.team}", "${COL.rol}"]) { id text } } } } }`
)
for (const it of b.boards[0].items_page.items) {
  const v = Object.fromEntries(it.column_values.map((c) => [c.id, (c.text ?? '').trim()]))
  const userId = /^\d+$/.test(v[COL.id]) ? v[COL.id] : null
  if (!userId) {
    console.log(`sin tocar  ${it.name} (no tiene ID Usuario)`)
    continue
  }
  const actuales = v[COL.team] ? v[COL.team].split(',').map((x) => x.trim()).filter(Boolean) : []
  const otras = actuales.filter((x) => !TEAMS.some((tm) => tm.nombre === x || tm.id === x))
  const deMonday = TEAMS.filter((tm) => miembros[tm.id]?.has(userId)).map((tm) => tm.nombre)
  const nuevas = [...otras, ...deMonday]
  if (nuevas.join(',') === actuales.join(',')) {
    console.log(`sin cambio ${it.name}: ${actuales.join(', ') || '(vacío)'}`)
    continue
  }
  console.log(`${APLICAR ? 'escribo   ' : 'escribiría'} ${it.name}: ${actuales.join(', ') || '(vacío)'} → ${nuevas.join(', ') || '(vacío)'}   [Rol: ${v[COL.rol] || '-'}]`)
  if (APLICAR) {
    await gql(
      `mutation ($boardId: ID!, $itemId: ID!, $valores: JSON!) {
         change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $valores, create_labels_if_missing: true) { id }
       }`,
      { boardId: BOARD, itemId: it.id, valores: JSON.stringify({ [COL.team]: { labels: nuevas } }) }
    )
  }
}
