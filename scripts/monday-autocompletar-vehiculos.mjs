// Autocompleta Combustible y Tipo en AUTODATA V1/V2 a partir de "Modelos_listado Monday.xlsx".
// Uso:   node scripts/monday-autocompletar-vehiculos.mjs            (simulación, no escribe)
//        node scripts/monday-autocompletar-vehiculos.mjs --apply    (escribe en Monday)
//        --solo V1 | --solo V2   para limitar a un tablero
// Requiere: MONDAY_API_KEY en .env, y `npm i xlsx` (o ajustar el require).
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const APPLY = process.argv.includes('--apply')
const SOLO = process.argv[process.argv.indexOf('--solo') + 1]
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('='))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))
const KEY = env.MONDAY_API_KEY
if (!KEY) throw new Error('Falta MONDAY_API_KEY en .env')

const BOARDS = {
  V1: { id: 18421913144, combustible: 'dropdown_mm5wybn4', tipo: 'dropdown_mm5w8xbm', modelo: 'text_mm58391w', anios: 'dropdown_mm584cbx' },
  V2: { id: 18421911963, combustible: 'dropdown_mm5w74r6', tipo: 'dropdown_mm5wx4s6', modelo: 'text_mm58pyh1', anios: 'dropdown_mm583r6w' },
}
const COL = { tabla: 0, name: 1, marca: 2, modelo: 3, anios: 4, combustible: 6, tipo: 7 }
// Años es dropdown multi-valor: se compara como conjunto ordenado
const normAnios = s => String(s ?? '').split(',').map(x => x.trim()).filter(Boolean).sort().join(', ')
// "Sin datos" (Combustible) y "Otros" (Tipo) no se cargan como etiqueta: la celda queda vacía.
// "Sin motor" y "Sin tipo" sí se cargan tal cual (son clasificaciones reales, no "no sé").
const BLANK = { combustible: 'Sin datos', tipo: 'Otros' }
const desired = (raw, blankValue) => (!raw || raw === blankValue) ? null : raw

async function gql(query, variables) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch('https://api.monday.com/v2', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: KEY },
      body: JSON.stringify({ query, variables }),
    })
    const txt = await r.text()
    let j; try { j = JSON.parse(txt) } catch { j = { errors: [{ message: 'HTTP ' + r.status + ' ' + txt.slice(0, 80) }] } }
    if (r.status === 429 || j.errors?.some(e => /complexity|rate|429|busy|timeout/i.test(e.message))) {
      const wait = Number(r.headers.get('retry-after') || 0) * 1000 || 20000 * (i + 1)
      process.stdout.write(`
  límite de Monday, espero ${wait / 1000}s...`); await new Promise(s => setTimeout(s, wait)); continue
    }
    if (j.errors) throw new Error(JSON.stringify(j.errors))
    return j.data
  }
  throw new Error('Rate limit persistente')
}

async function getColumn(boardId, colId) {
  const d = await gql(`{boards(ids:[${boardId}]){columns(ids:["${colId}"]){revision settings_str}}}`)
  const c = d.boards[0].columns[0]
  return { revision: c.revision, settings: JSON.parse(c.settings_str) }
}

// Crea, una por una y en serie, las etiquetas que el Excel necesita y el dropdown todavía no tiene.
// Evita la condición de carrera de create_labels_if_missing cuando varias escrituras en paralelo
// intentan crear la misma etiqueta nueva a la vez (cada una gana su propia copia duplicada).
async function ensureLabels(boardId, colId, neededNames) {
  const need = [...new Set(neededNames.filter(Boolean))]
  let { settings } = await getColumn(boardId, colId)
  let existing = new Set(settings.labels.map(l => l.name))
  const missing = need.filter(n => !existing.has(n))
  if (!missing.length) return
  console.log(`  creando ${missing.length} etiqueta(s) nueva(s) en ${colId}: ${missing.join(', ')}`)
  const M = `mutation($b:ID!,$id:String!,$rev:String!,$s:UpdateDropdownColumnSettingsInput!){
    update_dropdown_column(board_id:$b, id:$id, revision:$rev, settings:$s){ id }
  }`
  for (const name of missing) {
    const { revision, settings: s } = await getColumn(boardId, colId)
    const labels = s.labels.map(l => ({ id: l.id, label: l.name, is_deactivated: s.deactivated_labels?.includes(l.id) ?? false }))
    labels.push({ label: name, is_deactivated: false }) // sin id: Monday le asigna uno nuevo
    await gql(M, { b: String(boardId), id: colId, rev: String(revision), s: { labels, limit_select: s.limit_select ?? true, label_limit_count: s.label_limit_count ?? 1 } })
  }
}

async function fetchItems(boardId, cols, modeloCol) {
  const byName = new Map(), byModelo = new Map()
  let cursor = null
  do {
    const q = cursor
      ? `query($c:String!){next_items_page(cursor:$c,limit:500){cursor items{id name column_values(ids:${JSON.stringify(cols)}){id text}}}}`
      : `query($b:[ID!]){boards(ids:$b){items_page(limit:500){cursor items{id name column_values(ids:${JSON.stringify(cols)}){id text}}}}}`
    const d = await gql(q, cursor ? { c: cursor } : { b: [String(boardId)] })
    const page = cursor ? d.next_items_page : d.boards[0].items_page
    for (const it of page.items) {
      const rec = { id: it.id, vals: Object.fromEntries(it.column_values.map(c => [c.id, c.text])) }
      byName.set(it.name.trim(), rec)
      const m = (rec.vals[modeloCol] || '').trim()
      if (m) byModelo.set(m, byModelo.has(m) ? null : rec) // null = modelo ambiguo (repetido)
    }
    cursor = page.cursor
    process.stdout.write(`\r  leídos ${byName.size} ítems`)
  } while (cursor)
  console.log()
  return { byName, byModelo }
}

const wb = XLSX.readFile('Modelos_listado Monday.xlsx')
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }).slice(3).filter(r => r[COL.tabla])

for (const [tabla, b] of Object.entries(BOARDS)) {
  if (SOLO && SOLO !== tabla) continue
  console.log(`\n== ${tabla} (board ${b.id}) ==`)
  const filaTabla = rows.filter(r => r[COL.tabla] === tabla)
  if (APPLY) {
    await ensureLabels(b.id, b.combustible, filaTabla.map(r => desired(r[COL.combustible], BLANK.combustible)))
    await ensureLabels(b.id, b.tipo, filaTabla.map(r => desired(r[COL.tipo], BLANK.tipo)))
    await ensureLabels(b.id, b.anios, filaTabla.flatMap(r => normAnios(r[COL.anios]).split(', ')))
  }
  const { byName, byModelo } = await fetchItems(b.id, [b.combustible, b.tipo, b.modelo, b.anios], b.modelo)
  const updates = [], noMatch = []
  for (const r of rows.filter(r => r[COL.tabla] === tabla)) {
    // 1) por Name (Marca - Modelo). 2) si la marca del Excel no es real, por Modelo solo (si es único en el tablero)
    const it = byName.get(String(r[COL.name]).trim()) || byModelo.get(String(r[COL.modelo] ?? '').trim())
    if (!it) { noMatch.push(r[COL.name]); continue }
    const vals = {}
    if (r[COL.anios] && normAnios(it.vals[b.anios]) !== normAnios(r[COL.anios])) vals[b.anios] = { labels: normAnios(r[COL.anios]).split(', ') }
    const desiredCombustible = desired(r[COL.combustible], BLANK.combustible)
    if (desiredCombustible ? it.vals[b.combustible] !== desiredCombustible : it.vals[b.combustible]) vals[b.combustible] = desiredCombustible ? { labels: [desiredCombustible] } : null
    const desiredTipo = desired(r[COL.tipo], BLANK.tipo)
    if (desiredTipo ? it.vals[b.tipo] !== desiredTipo : it.vals[b.tipo]) vals[b.tipo] = desiredTipo ? { labels: [desiredTipo] } : null
    if (Object.keys(vals).length) updates.push({ id: it.id, name: r[COL.name], vals })
  }
  console.log(`  filas Excel: ${rows.filter(r => r[COL.tabla] === tabla).length} | sin match: ${noMatch.length} | a actualizar: ${updates.length}`)
  if (noMatch.length) fs.writeFileSync(`scripts/sin-match-${tabla}.txt`, noMatch.join('\n'))
  if (!APPLY) { console.log('  (simulación: corré con --apply para escribir)'); console.log(updates.slice(0, 3)); continue }

  const M = `mutation($b:ID!,$i:ID!,$v:JSON!){change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v,create_labels_if_missing:true){id}}`
  let done = 0, fails = []
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(updates.slice(i, i + 10).map(u =>
      gql(M, { b: String(b.id), i: String(u.id), v: JSON.stringify(u.vals) }).then(() => done++).catch(e => fails.push({ ...u, err: e.message }))))
    process.stdout.write(`\r  actualizados ${done}/${updates.length}  errores ${fails.length}`)
  }
  console.log()
  if (fails.length) fs.writeFileSync(`scripts/errores-${tabla}.json`, JSON.stringify(fails, null, 1))
}
