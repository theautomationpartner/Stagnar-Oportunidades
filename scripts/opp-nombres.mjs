// Renombra los ítems ya existentes del tablero de Oportunidades al formato acordado
// (ver src/services/nombreOportunidad.js), que es el mismo que usa la app al crear y al
// editar una oportunidad.
//
// Por qué hace falta: los nombres se armaban al crear el ítem y no se volvían a tocar,
// así que quedaron tres clases de nombre malo —
//   - con separadores vacíos, de cuando el vehículo todavía no estaba elegido
//     ("Matías Stagnari--OMODA-", "Federico Imparatta--");
//   - desactualizados, de cuando el vehículo se editó después del alta
//     ("MARISA VILLAR CAMPOS-PIAGGIO-2001-Porter Furgón" — hoy es un NISSAN Qashqai 2024);
//   - repetidos entre sí ("Marcel Stagnari-PEUGEOT-2025" dos veces).
//
// Es idempotente: calcula el nombre de cada ítem a partir de sus columnas y solo escribe
// los que difieren. Correrlo dos veces seguidas no hace nada la segunda vez.
//
// Uso:
//   node scripts/opp-nombres.mjs            # muestra qué cambiaría, no escribe nada
//   node scripts/opp-nombres.mjs --apply    # aplica
import fs from 'node:fs'

// Mismo módulo que usa la app: el renombrado masivo y el alta no pueden divergir.
const { nombreDeOportunidad } = await import(new URL('../src/services/nombreOportunidad.js', import.meta.url).href)

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const APLICAR = process.argv.includes('--apply')
const BOARD = '18420863013'
const COLS = {
  nombre: 'text_mm51b055',
  apellido: 'text_mm51ez7e',
  marca: 'dropdown_mm51ykrd',
  anio: 'dropdown_mm51mdmq',
  modelo: 'text_mm54fb7m',
  matricula: 'text_mm71dyf0',
  tipoRiesgo: 'color_mm5atxav',
}

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

// Se pagina: 100 es el máximo por página y el tablero va a crecer.
async function traerItems() {
  const ids = JSON.stringify(Object.values(COLS))
  const items = []
  let cursor = null
  do {
    const pagina = cursor
      ? `next_items_page(limit: 100, cursor: "${cursor}") { cursor items { id name column_values(ids: ${ids}) { id text } } }`
      : `boards(ids: ${BOARD}) { items_page(limit: 100) { cursor items { id name column_values(ids: ${ids}) { id text } } } }`
    const data = await gql(`{ ${pagina} }`)
    const page = cursor ? data.next_items_page : data.boards[0].items_page
    items.push(...page.items)
    cursor = page.cursor
  } while (cursor)
  return items
}

const items = await traerItems()

const calculado = new Map()
for (const it of items) {
  const texto = Object.fromEntries(it.column_values.map((c) => [c.id, c.text || '']))
  const datos = Object.fromEntries(Object.entries(COLS).map(([k, id]) => [k, texto[id]]))
  calculado.set(it.id, nombreDeOportunidad(datos))
}

// Dos oportunidades del mismo cliente por el mismo vehículo dan el mismo nombre — y son
// legítimas (el mismo auto se cotiza dos veces). Cuando pasa, lo único que las distingue
// es el número de oportunidad, así que se lo agrega SOLO a las que chocan: el resto de
// los nombres queda limpio.
const porNombre = new Map()
for (const [id, nombre] of calculado) porNombre.set(nombre, [...(porNombre.get(nombre) ?? []), id])
for (const [nombre, ids] of porNombre) {
  if (ids.length < 2) continue
  for (const id of ids) calculado.set(id, `${nombre} · ID-${id}`)
}

const cambios = []
for (const it of items) {
  const nuevo = calculado.get(it.id)
  if (nuevo !== it.name) cambios.push({ id: it.id, antes: it.name, despues: nuevo })
}

console.log(`${items.length} ítems, ${cambios.length} a renombrar\n`)
for (const c of cambios) {
  console.log(`  ${c.id}`)
  console.log(`    antes:   ${c.antes}`)
  console.log(`    después: ${c.despues}`)
}

// Los nombres repetidos son justamente lo que este cambio viene a sacar: si el formato
// nuevo deja dos iguales, hay que verlo antes de escribir, no después.
const cuenta = new Map()
for (const n of calculado.values()) cuenta.set(n, (cuenta.get(n) || 0) + 1)
const repetidos = [...cuenta].filter(([, c]) => c > 1)
if (repetidos.length) {
  console.log('\n⚠ quedarían nombres repetidos:')
  for (const [n, c] of repetidos) console.log(`  ${c}x  ${n}`)
}

// Sin process.exit(): con handles todavía abiertos, node en Windows corta con un
// "Assertion failed" de libuv y devuelve un código de salida que no es el real.
if (cambios.length && !APLICAR) {
  console.log()
  console.log('Simulación. Para aplicarlo: node scripts/opp-nombres.mjs --apply')
} else if (cambios.length) {
  // Los nombres viejos no se pueden recuperar de ningún lado una vez pisados, así que
  // se guardan antes de escribir. Para volver atrás: leer este archivo y mandar cada
  // "antes" con la misma mutación.
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const respaldo = `scripts/opp-nombres-respaldo-${sello}.json`
  fs.writeFileSync(respaldo, JSON.stringify(cambios, null, 1))
  console.log()
  console.log(`nombres anteriores guardados en ${respaldo}`)
  for (const c of cambios) {
    await gql(
      `mutation($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
         change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
       }`,
      { boardId: BOARD, itemId: c.id, columnValues: JSON.stringify({ name: c.despues }) }
    )
    console.log(`renombrado ${c.id}`)
  }
  console.log()
  console.log(`listo: ${cambios.length} ítems`)
}
