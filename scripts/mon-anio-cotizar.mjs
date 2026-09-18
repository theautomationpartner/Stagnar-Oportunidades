// Crea en Oportunidades la columna "Año a cotizar" y la completa en las oportunidades que
// ya existen.
//
// Por qué existe: un 0km puede venir con año de modelo adelantado (un 2027 vendido en
// 2026). Ese es el año real del vehículo y es el que tiene que ver el cliente, pero las
// aseguradoras todavía no cotizan un año que no empezó: hay que pedirles el año en curso.
// Con una columna aparte, "Año" sigue siendo el año del vehículo —el que va en el nombre
// del ítem, en la cotización que se manda y en las reglas de beneficios— y el robot lee
// de acá el año con el que tiene que cotizar. Ver anioCotizacion.js.
//
// Es texto y no un dropdown a propósito: un dropdown obliga a que la etiqueta exista antes
// de escribirla (create_labels_if_missing va en false en toda la app) y cada 1º de enero
// habría que acordarse de agregar la nueva.
//
// Idempotente: si la columna ya existe la reusa, y solo escribe las oportunidades cuyo
// valor difiere del que corresponde.
//
// Uso:
//   node scripts/mon-anio-cotizar.mjs            # muestra qué haría
//   node scripts/mon-anio-cotizar.mjs --apply
import fs from 'node:fs'

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const APLICAR = process.argv.includes('--apply')
const BOARD = '18420863013'
const ANIO_COLUMN = 'dropdown_mm51mdmq'
const TITULO = 'Año a cotizar'

const anioActual = new Date().getFullYear()
// La misma regla que aplica la app (ver src/services/anioCotizacion.js): nunca se le pide
// a una aseguradora un año que todavía no empezó.
const anioParaCotizar = (anio) => {
  const n = Number(String(anio ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return ''
  return String(Math.min(n, anioActual))
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

const columnas = (await gql(`{ boards(ids: ${BOARD}) { columns { id title type } } }`)).boards[0].columns
let columna = columnas.find((c) => c.title.trim().toLowerCase() === TITULO.toLowerCase())

if (columna) {
  console.log(`La columna ya existe: ${columna.id} (${columna.type})`)
} else if (!APLICAR) {
  console.log(`Falta crear la columna "${TITULO}" (texto)`)
} else {
  const creada = await gql(
    `mutation($boardId: ID!, $title: String!) {
       create_column(board_id: $boardId, title: $title, column_type: text) { id title }
     }`,
    { boardId: BOARD, title: TITULO }
  )
  columna = creada.create_column
  console.log(`Columna creada: ${columna.id}`)
}

if (!columna) {
  console.log()
  console.log('Simulación. Para aplicarlo: node scripts/mon-anio-cotizar.mjs --apply')
  process.exitCode = 0
} else {
  const data = await gql(
    `{ boards(ids: ${BOARD}) { items_page(limit: 500) { items { id name column_values(ids: ["${ANIO_COLUMN}","${columna.id}"]) { id text } } } } }`
  )
  const items = data.boards[0].items_page.items

  const cambios = []
  for (const item of items) {
    const cv = Object.fromEntries(item.column_values.map((c) => [c.id, c.text || '']))
    const esperado = anioParaCotizar(cv[ANIO_COLUMN])
    if (!esperado || cv[columna.id] === esperado) continue
    cambios.push({ id: item.id, nombre: item.name, anio: cv[ANIO_COLUMN], esperado, actual: cv[columna.id] })
  }

  console.log(`${items.length} oportunidades, ${cambios.length} a completar`)
  for (const c of cambios.slice(0, 12)) {
    const nota = c.anio !== c.esperado ? `   ← año adelantado (${c.anio})` : ''
    console.log(`  ${c.esperado}  ${c.nombre.slice(0, 54)}${nota}`)
  }
  if (cambios.length > 12) console.log(`  … y ${cambios.length - 12} más`)

  if (cambios.length && !APLICAR) {
    console.log()
    console.log('Simulación. Para aplicarlo: node scripts/mon-anio-cotizar.mjs --apply')
  } else if (cambios.length) {
    for (const c of cambios) {
      await gql(
        `mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
           change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
         }`,
        { boardId: BOARD, itemId: c.id, columnId: columna.id, value: c.esperado }
      )
    }
    console.log()
    console.log(`listo: ${cambios.length} oportunidades`)
  }
}
