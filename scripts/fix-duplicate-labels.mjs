// Fusiona etiquetas duplicadas (mismo nombre, distinto id) creadas por la carrera de
// create_labels_if_missing durante la escritura en paralelo, y borra las sobrantes.
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const KEY = env.MONDAY_API_KEY

async function gql(query, variables) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch('https://api.monday.com/v2', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: KEY },
      body: JSON.stringify({ query, variables }),
    })
    const txt = await r.text()
    let j; try { j = JSON.parse(txt) } catch { j = { errors: [{ message: 'HTTP ' + r.status + ' ' + txt.slice(0, 120) }] } }
    if (r.status === 429 || j.errors?.some(e => /complexity|rate|429|busy/i.test(e.message))) {
      await new Promise(s => setTimeout(s, 15000 * (i + 1))); continue
    }
    if (j.errors) throw new Error(JSON.stringify(j.errors))
    return j.data
  }
  throw new Error('Rate limit persistente')
}

// groups: [{ keep: idMayoritario, remove: [ids duplicados con 1 ítem cada uno] }]
const TARGETS = [
  { board: 18421913144, col: 'dropdown_mm5wybn4', name: 'V1 Combustible', groups: [{ keep: 4, remove: [5] }] },
  { board: 18421913144, col: 'dropdown_mm5w8xbm', name: 'V1 Tipo Wink', groups: [{ keep: 3, remove: [4] }, { keep: 5, remove: [6, 7, 8, 9] }] },
  { board: 18421911963, col: 'dropdown_mm5w74r6', name: 'V2 Combustible', groups: [{ keep: 5, remove: [6, 7, 8, 9, 10, 11] }] },
  { board: 18421911963, col: 'dropdown_mm5wx4s6', name: 'V2 Tipo', groups: [
    { keep: 4, remove: [5, 6] },
    { keep: 7, remove: [8] },
    { keep: 9, remove: [10, 11, 12, 13] },
    { keep: 14, remove: [15, 16, 17, 18, 19] },
    { keep: 20, remove: [21, 22, 23] },
  ] },
]

async function fetchItemsWithLabel(boardId, colId, labelIds) {
  const wanted = new Set(labelIds)
  const hits = []
  let cursor = null
  do {
    const q = cursor
      ? `query($c:String!){next_items_page(cursor:$c,limit:500){cursor items{id column_values(ids:["${colId}"]){value}}}}`
      : `query($b:[ID!]){boards(ids:$b){items_page(limit:500){cursor items{id column_values(ids:["${colId}"]){value}}}}}`
    const d = await gql(q, cursor ? { c: cursor } : { b: [String(boardId)] })
    const p = cursor ? d.next_items_page : d.boards[0].items_page
    for (const it of p.items) {
      const v = it.column_values[0]?.value
      if (!v) continue
      const ids = JSON.parse(v).ids || []
      const bad = ids.filter(id => wanted.has(id))
      if (bad.length) hits.push({ id: it.id, ids })
    }
    cursor = p.cursor
  } while (cursor)
  return hits
}

async function getColumn(boardId, colId) {
  const d = await gql(`{boards(ids:[${boardId}]){columns(ids:["${colId}"]){revision settings_str}}}`)
  const c = d.boards[0].columns[0]
  return { revision: c.revision, settings: JSON.parse(c.settings_str) }
}

for (const t of TARGETS) {
  console.log(`\n== ${t.name} ==`)
  const remapAll = new Map() // minorId -> majorId
  for (const g of t.groups) for (const r of g.remove) remapAll.set(r, g.keep)

  const hits = await fetchItemsWithLabel(t.board, t.col, [...remapAll.keys()])
  console.log(`  ítems a reasignar: ${hits.length}`)
  for (const h of hits) {
    const newIds = [...new Set(h.ids.map(id => remapAll.get(id) ?? id))]
    const M = `mutation($b:ID!,$i:ID!,$v:JSON!){change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v){id}}`
    await gql(M, { b: String(t.board), i: String(h.id), v: JSON.stringify({ [t.col]: { ids: newIds } }) })
  }
  console.log(`  reasignados ${hits.length} ítems`)

  // verificar que ya no queda nadie en los ids removidos
  const still = await fetchItemsWithLabel(t.board, t.col, [...remapAll.keys()])
  if (still.length) { console.log(`  ABORTO: todavía quedan ${still.length} ítems en ids duplicados, no borro etiquetas`); continue }

  // Monday no permite borrar más de una etiqueta por llamada: una a la vez, revisión fresca cada vez.
  const M2 = `mutation($b:ID!,$id:String!,$rev:String!,$s:UpdateDropdownColumnSettingsInput!){
    update_dropdown_column(board_id:$b, id:$id, revision:$rev, settings:$s){ id }
  }`
  for (const toRemove of remapAll.keys()) {
    const { revision, settings } = await getColumn(t.board, t.col)
    const keepLabels = settings.labels.filter(l => l.id !== toRemove)
    const settingsInput = {
      labels: keepLabels.map(l => ({ id: l.id, label: l.name, is_deactivated: settings.deactivated_labels?.includes(l.id) ?? false })),
      limit_select: settings.limit_select ?? true,
      label_limit_count: settings.label_limit_count ?? 1,
    }
    await gql(M2, { b: String(t.board), id: t.col, rev: String(revision), s: settingsInput })
    console.log(`  etiqueta borrada: ${toRemove}`)
  }
}
