// MON-11 / LOG-21: crea en el tablero Oportunidades las 3 columnas que le faltan al lado
// "lo que se cotizó" para poder contrastarlo contra la póliza emitida.
//
// El lado "lo que se emitió" NO necesita columnas nuevas: el escenario de póliza ya crea
// un ítem en 🚘 Vehículos (18420863009 — con Matrícula, Motor y Chasis leídos del PDF) y
// lo vincula a la Oportunidad por "Bien Asegurado" (board_relation_mm4pngbs).
//
// Acá se agregan los mismos 3 datos del lado de la Oportunidad, que los completa la
// lectura de la Carta Automóvil al crearla. Marca/Año/Modelo no van: ya existen, y del
// lado del Vehículo son copia de la Oportunidad (compararlos sería compararlos contra sí
// mismos). Ver services/polizaCheck.js.
//
// De tipo texto: matrícula, chasis y motor son códigos, no números ni etiquetas de un
// catálogo cerrado.
//
// Idempotente: si ya existe una columna con ese título, la reusa y solo informa su id.
// Sin --apply no escribe nada.
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const APLICAR = process.argv.includes('--apply')
const OPORTUNIDADES_BOARD = '18420863013'

const COLUMNAS = [
  { titulo: 'Matrícula', lado: 'vehículo cotizado' },
  { titulo: 'Chasis', lado: 'vehículo cotizado' },
  { titulo: 'Motor', lado: 'vehículo cotizado' },
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

const data = await gql(`query { boards(ids: [${OPORTUNIDADES_BOARD}]) { name columns { id title type } } }`)
const board = data.boards[0]
const porTitulo = new Map(board.columns.map((c) => [c.title.trim().toLowerCase(), c]))

console.log(`Tablero: ${board.name} (${OPORTUNIDADES_BOARD}) — ${board.columns.length} columnas`)
console.log(APLICAR ? '\nMODO APLICAR: se crean las que falten.\n' : '\nDRY RUN (agregá --apply para crear).\n')

const resultado = []
for (const col of COLUMNAS) {
  const existente = porTitulo.get(col.titulo.toLowerCase())
  if (existente) {
    console.log(`  = ya existe   "${col.titulo}" (${existente.id}, ${existente.type})`)
    resultado.push({ ...col, id: existente.id, creada: false })
    continue
  }
  if (!APLICAR) {
    console.log(`  + se crearía  "${col.titulo}"  [texto, lado ${col.lado}]`)
    continue
  }
  const creada = await gql(
    `mutation($b: ID!, $t: String!) { create_column(board_id: $b, title: $t, column_type: text) { id title } }`,
    { b: OPORTUNIDADES_BOARD, t: col.titulo }
  )
  const id = creada.create_column.id
  console.log(`  + creada      "${col.titulo}" -> ${id}`)
  resultado.push({ ...col, id, creada: true })
}

if (APLICAR) {
  console.log('\n--- ids para pegar en la app y en el escenario de Make ---')
  for (const r of resultado) console.log(`${r.titulo.padEnd(20)} ${r.id}   (lado ${r.lado})`)
}
