// Carga en PANEL los textos de Responsabilidad Civil que ve el cliente en la cotización
// que se le manda (Grupo = "RC"). Una fila por nivel de cada compañía; el NOMBRE de la
// fila es el nivel tal cual lo muestra la app, que es con lo que la busca
// (ver recargoPanel.js#buildRcLookup y rcPorCompania.js):
//
//   BSE     40 / 30 / 20 / 10
//   PORTO   Nivel 4 / 3 / 2 / 1
//   SANCOR  US$ 1.000.000 / US$ 500.000   (el importe que se elige)
//   SURA    US$ 1.000.000 / US$ 1.500.000 (lo fija la cobertura: Total / Total Plus)
//
// Las viñetas se separan con "●", igual que los textos INCLUYE.
//
// Los niveles que todavía no tienen valores confirmados se crean VACÍOS a propósito: la
// app no muestra nada en vez de inventar límites, y se completan desde monday sin tocar
// código.
//
// Idempotente: si la fila ya existe la actualiza, y nunca pisa un texto cargado a mano
// con uno vacío.
//
// Uso:
//   node scripts/mon-rc-panel.mjs            # muestra qué haría
//   node scripts/mon-rc-panel.mjs --apply    # lo aplica
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
const COL = {
  compania: 'dropdown_mm52feqr',
  grupo: 'color_mm5fdknw',
  texto: 'text_mm5f1wnh',
}

const FILAS = [
  // BSE: solo el nivel 40 tiene valores confirmados.
  ['BSE', '40', 'Límite por personas (muerte/lesión): 5.000.000 UI ≈ US$ 825.000●Límite daños materiales: 5.000.000 UI ≈ US$ 825.000●Límite catástrofe (agregado): 15.000.000 UI ≈ US$ 2.476.000'],
  ['BSE', '30', ''],
  ['BSE', '20', ''],
  ['BSE', '10', ''],

  // PORTO: límite combinado por nivel. Falta confirmar el de catástrofe de cada uno.
  ['PORTO', 'Nivel 4', 'Límite combinado (materiales + personales): USD 800.000'],
  ['PORTO', 'Nivel 3', 'Límite combinado (materiales + personales): USD 600.000'],
  ['PORTO', 'Nivel 2', 'Límite combinado (materiales + personales): USD 400.000'],
  ['PORTO', 'Nivel 1', 'Límite combinado (materiales + personales): USD 200.000'],

  // SANCOR: dos límites, con el importe que se haya elegido.
  ['SANCOR', 'US$ 1.000.000', 'Límite por personas (muerte/lesión): US$ 1.000.000●Límite daños materiales: US$ 1.000.000'],
  ['SANCOR', 'US$ 500.000', 'Límite por personas (muerte/lesión): US$ 500.000●Límite daños materiales: US$ 500.000'],

  // SURA: límite combinado, según el plan.
  ['SURA', 'US$ 1.000.000', 'Límite combinado (materiales + personales): US$ 1.000.000'],
  ['SURA', 'US$ 1.500.000', 'Límite combinado (materiales + personales): US$ 1.500.000'],
]

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

const data = await gql(
  `{ boards(ids: ${PANEL_BOARD}) { items_page(limit: 300) { items { id name column_values(ids: ["${COL.compania}","${COL.grupo}","${COL.texto}"]) { id text } } } } }`
)
const existentes = data.boards[0].items_page.items.map((i) => {
  const cv = Object.fromEntries(i.column_values.map((c) => [c.id, c.text || '']))
  return { id: i.id, name: i.name.trim(), compania: cv[COL.compania], grupo: cv[COL.grupo], texto: cv[COL.texto] }
})

const crear = []
const actualizar = []
const dejar = []

for (const [compania, nivel, texto] of FILAS) {
  const ya = existentes.find((e) => e.grupo === 'RC' && e.compania === compania && e.name === nivel)
  if (!ya) {
    crear.push({ compania, nivel, texto })
  } else if (ya.texto === texto) {
    dejar.push({ compania, nivel, motivo: 'ya está igual' })
  } else if (!texto && ya.texto) {
    // Nunca pisar con vacío lo que alguien cargó a mano.
    dejar.push({ compania, nivel, motivo: 'ya tiene texto cargado' })
  } else {
    actualizar.push({ id: ya.id, compania, nivel, texto, antes: ya.texto })
  }
}

console.log(`${crear.length} a crear, ${actualizar.length} a actualizar, ${dejar.length} sin tocar`)
for (const c of crear) console.log(`  crear      ${c.compania} · ${c.nivel}${c.texto ? '' : '   (vacía, para completar a mano)'}`)
for (const a of actualizar) console.log(`  actualizar ${a.compania} · ${a.nivel}`)
for (const d of dejar) console.log(`  sin tocar  ${d.compania} · ${d.nivel}   (${d.motivo})`)

const valores = (compania, texto) =>
  JSON.stringify({
    [COL.compania]: { labels: [compania] },
    [COL.grupo]: { label: 'RC' },
    [COL.texto]: texto,
  })

if (!APLICAR) {
  console.log()
  console.log('Simulación. Para aplicarlo: node scripts/mon-rc-panel.mjs --apply')
} else {
  for (const c of crear) {
    await gql(
      `mutation($boardId: ID!, $groupId: String!, $name: String!, $values: JSON!) {
         create_item(board_id: $boardId, group_id: $groupId, item_name: $name, column_values: $values) { id }
       }`,
      { boardId: PANEL_BOARD, groupId: PANEL_GRUPO, name: c.nivel, values: valores(c.compania, c.texto) }
    )
    console.log(`creada     ${c.compania} · ${c.nivel}`)
  }
  for (const a of actualizar) {
    await gql(
      `mutation($boardId: ID!, $itemId: ID!, $values: JSON!) {
         change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $values) { id }
       }`,
      { boardId: PANEL_BOARD, itemId: a.id, values: valores(a.compania, a.texto) }
    )
    console.log(`actualizada ${a.compania} · ${a.nivel}`)
  }
  console.log()
  console.log('listo')
}
