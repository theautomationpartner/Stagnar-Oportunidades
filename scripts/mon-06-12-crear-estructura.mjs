// MON-06 / MON-12: crea las columnas de opcionales en el tablero de subitems y deja
// cargados los precios en PANEL (Grupo = Configuracion), separados por compañía.
// Idempotente: si una columna o fila ya existe, la reusa en vez de duplicarla.
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const APLICAR = process.argv.includes('--apply')
const SUBITEMS_BOARD = '18420863061'
const PANEL_BOARD = '18421072511'
const PANEL_GRUPO = 'group_mm526v30'

async function gql(query, variables) {
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: env.MONDAY_API_KEY },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400))
  return j.data
}

// --- 1) Columnas nuevas en Subelementos de Oportunidades
const COLUMNAS = [
  { title: 'Auto extra', type: 'status', defaults: { labels: { 1: '7 días', 2: '15 días', 3: '30 días' } } },
  { title: 'AP', type: 'checkbox' },
  { title: 'SURA te lleva', type: 'checkbox' },
  { title: 'Uso rural', type: 'checkbox' },
]

const board = await gql(`{boards(ids:[${SUBITEMS_BOARD}]){columns{id title type}}}`)
const existentes = board.boards[0].columns
const creadas = {}

for (const col of COLUMNAS) {
  const ya = existentes.find((c) => c.title.toLowerCase() === col.title.toLowerCase())
  if (ya) {
    console.log(`= ya existía: ${col.title} -> ${ya.id}`)
    creadas[col.title] = ya.id
    continue
  }
  if (!APLICAR) {
    console.log(`+ crearía columna: ${col.title} (${col.type})`)
    continue
  }
  const d = await gql(
    `mutation($b:ID!,$t:String!,$ct:ColumnType!,$def:JSON){create_column(board_id:$b,title:$t,column_type:$ct,defaults:$def){id title}}`,
    { b: SUBITEMS_BOARD, t: col.title, ct: col.type, def: col.defaults ? JSON.stringify(col.defaults) : null }
  )
  creadas[col.title] = d.create_column.id
  console.log(`+ creada: ${col.title} -> ${d.create_column.id}`)
}

// --- 2) PANEL: precios por compañía (Grupo = Configuracion)
const PRECIOS = [
  { compania: 'PORTO', name: 'Granizo', valor: 1279, desc: 'Precio del opcional Granizo para PORTO.' },
  { compania: 'PORTO', name: 'Cristales', valor: 1225, desc: 'Precio del opcional Cristales y espejos para PORTO. No aplica en el interior.' },
  { compania: 'PORTO', name: 'Auto extra 7 días', valor: 970, desc: 'Precio del opcional Auto extra por 7 días (PORTO).' },
  { compania: 'PORTO', name: 'Auto extra 15 días', valor: 1950, desc: 'Precio del opcional Auto extra por 15 días (PORTO). Antes se llamaba "Coche Cortesía".' },
  { compania: 'PORTO', name: 'Auto extra 30 días', valor: 2950, desc: 'Precio del opcional Auto extra por 30 días (PORTO).' },
  { compania: 'PORTO', name: 'Uso rural', valor: 2900, desc: 'Precio del opcional Uso rural (PORTO).' },
  { compania: 'SURA', name: 'Granizo', valor: 1250, desc: 'Precio del opcional Granizo para SURA.' },
  { compania: 'SURA', name: 'Auto extra 15 días', valor: 1765, desc: 'Precio del auto de cortesía por 15 días (SURA).' },
  { compania: 'SURA', name: 'SURA te lleva', valor: 1560, desc: 'Precio del opcional "SURA te lleva".' },
  { compania: 'SURA', name: 'AP', valor: 750, desc: 'Precio de Accidentes Personales (SURA). Viene incluido por defecto; al destildarlo se descuenta del total.' },
]

const panel = await gql(
  `{boards(ids:[${PANEL_BOARD}]){items_page(limit:100){items{id name column_values(ids:["color_mm5fdknw","dropdown_mm52feqr","numeric_mm5fmjh0"]){id text}}}}}`
)
const filasPanel = panel.boards[0].items_page.items.map((i) => ({
  id: i.id,
  name: i.name,
  ...Object.fromEntries(i.column_values.map((c) => [c.id, c.text])),
}))
const configActual = filasPanel.filter((f) => f.color_mm5fdknw === 'Configuracion')

// La vieja "Coche Cortesía" pasa a ser el Auto extra de 15 días de PORTO
const cocheCortesia = configActual.find((f) => f.name === 'Coche Cortesía')

// Una fila del tablero no puede servir para dos precios distintos: "Granizo" existe para
// PORTO y para SURA con valores diferentes, y sin esto la segunda pisaba a la primera en
// vez de crear su propia fila.
const usadas = new Set()

for (const p of PRECIOS) {
  let fila =
    configActual.find((f) => !usadas.has(f.id) && f.name === p.name && f.dropdown_mm52feqr === p.compania) ??
    configActual.find((f) => !usadas.has(f.id) && f.name === p.name && !f.dropdown_mm52feqr)
  if (!fila && p.compania === 'PORTO' && p.name === 'Auto extra 15 días' && cocheCortesia && !usadas.has(cocheCortesia.id)) {
    fila = cocheCortesia
  }
  if (fila) usadas.add(fila.id)

  const valores = {
    color_mm5fdknw: { label: 'Configuracion' },
    dropdown_mm52feqr: { labels: [p.compania] },
    numeric_mm5fmjh0: String(p.valor),
    text_mm5fmqdw: p.desc,
  }

  if (fila) {
    const cambios = []
    if (fila.name !== p.name) cambios.push(`nombre "${fila.name}" -> "${p.name}"`)
    if (String(fila.numeric_mm5fmjh0 ?? '') !== String(p.valor)) cambios.push(`valor ${fila.numeric_mm5fmjh0 || '-'} -> ${p.valor}`)
    if (fila.dropdown_mm52feqr !== p.compania) cambios.push(`compañía ${fila.dropdown_mm52feqr || '-'} -> ${p.compania}`)
    if (!cambios.length) { console.log(`= sin cambios: ${p.compania} / ${p.name}`); continue }
    if (!APLICAR) { console.log(`~ actualizaría ${p.compania} / ${p.name}: ${cambios.join(', ')}`); continue }
    await gql(`mutation($b:ID!,$i:ID!,$v:JSON!){change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v){id}}`,
      { b: PANEL_BOARD, i: fila.id, v: JSON.stringify(valores) })
    if (fila.name !== p.name) {
      await gql(`mutation($b:ID!,$i:ID!,$v:String!){change_simple_column_value(board_id:$b,item_id:$i,column_id:"name",value:$v){id}}`,
        { b: PANEL_BOARD, i: fila.id, v: p.name })
    }
    console.log(`~ actualizada ${p.compania} / ${p.name}: ${cambios.join(', ')}`)
  } else {
    if (!APLICAR) { console.log(`+ crearía fila ${p.compania} / ${p.name} = ${p.valor}`); continue }
    const d = await gql(`mutation($b:ID!,$g:String!,$n:String!,$v:JSON!){create_item(board_id:$b,group_id:$g,item_name:$n,column_values:$v){id}}`,
      { b: PANEL_BOARD, g: PANEL_GRUPO, n: p.name, v: JSON.stringify(valores) })
    console.log(`+ creada fila ${p.compania} / ${p.name} = ${p.valor} (id ${d.create_item.id})`)
  }
}

if (!APLICAR) console.log('\n(simulación — corré con --apply para escribir)')
