// LOG-13: crea en el tablero Oportunidades la columna donde queda asentado con cuántas
// cuotas se cierra la venta — el último pedazo del paso "Confirmar", que hasta ahora no
// se podía guardar en ningún lado.
//
// A nivel OPORTUNIDAD y no del subitem (a pedido): es una decisión de la venta, no un
// dato de cada cotización, y así se puede filtrar y agrupar por forma de pago en el
// tablero.
//
// De tipo status y con las etiquetas creadas de entrada: la app escribe con
// create_labels_if_missing en false (a propósito — evita que un typo genere etiquetas
// nuevas), así que un label que no exista se descarta en silencio.
//
// Las "N cuotas sin recargo" son 3 etiquetas distintas y no una sola porque la cantidad
// depende de la compañía (BSE y SURA promocionan 10, SANCOR 2, PORTO 5) y "10 cuotas" con
// recargo no es lo mismo que "10 cuotas sin recargo": mismo número, precio distinto. Ver
// PROMO_CUOTAS_SIN_RECARGO en services/pricingEngine.js.
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const APLICAR = process.argv.includes('--apply')
const OPORTUNIDADES_BOARD = '18420863013'
const TITULO = 'Cuotas elegidas'

const ETIQUETAS = [
  'Contado',
  '3 cuotas',
  '6 cuotas',
  '8 cuotas',
  '10 cuotas',
  '2 cuotas sin recargo',
  '5 cuotas sin recargo',
  '10 cuotas sin recargo',
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
const existente = board.columns.find((c) => c.title.trim().toLowerCase() === TITULO.toLowerCase())

console.log(`Tablero: ${board.name} (${OPORTUNIDADES_BOARD}) — ${board.columns.length} columnas\n`)

if (existente) {
  console.log(`= ya existe "${TITULO}" (${existente.id}, ${existente.type}) — no se toca`)
  process.exit(0)
}

if (!APLICAR) {
  console.log(`+ se crearía "${TITULO}" [status] con las etiquetas:`)
  ETIQUETAS.forEach((e) => console.log(`     ${e}`))
  console.log('\nDRY RUN — agregá --apply para crearla.')
  process.exit(0)
}

// `defaults` es como monday recibe las etiquetas de un status al crearlo: un objeto
// {índice: nombre}. Sin esto la columna nace con las 3 etiquetas genéricas de siempre.
const defaults = JSON.stringify({
  labels: Object.fromEntries(ETIQUETAS.map((nombre, i) => [String(i), nombre])),
})
const creada = await gql(
  `mutation($b: ID!, $t: String!, $d: JSON!) {
    create_column(board_id: $b, title: $t, column_type: status, defaults: $d) { id title }
  }`,
  { b: OPORTUNIDADES_BOARD, t: TITULO, d: defaults }
)
console.log(`+ creada "${TITULO}" -> ${creada.create_column.id}`)
console.log('\nid para pegar en la app:', creada.create_column.id)
