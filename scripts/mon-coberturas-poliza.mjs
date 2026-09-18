// Carga en PANEL el grupo "Coberturas": cómo nombra cada compañía sus coberturas y a cuál
// de las nuestras corresponde.
//
// Por qué existe: al validar una póliza emitida hay que comparar su cobertura contra la
// que se cotizó, y no se llaman igual. PORTO escribe "1. DAÑOS, HURTO, INCENDIO Y
// RESPONSABILIDAD CIVIL" donde nosotros tenemos "GLOBAL". El Run code sabe deducirlo con
// las reglas de cada compañía (REGLAS_POR_COMPANIA en validacion-poliza.run-code.js), pero
// una fila acá le gana a la deducción: es alguien diciendo qué es, y se corrige en monday
// sin tocar el código del escenario.
//
// EL NOMBRE DE LA FILA ES EL TEXTO ORIGINAL DE LA COMPAÑÍA. Es contra eso que se compara
// la cobertura leída de la póliza. La comparación ignora mayúsculas, acentos y puntuación,
// así que "1. DAÑOS..." y "1- Daños..." son el mismo texto — pero las palabras tienen que
// estar. Si aparece un texto que no está en esta lista, conviene agregarlo tal cual sale
// del PDF.
//
// Dos filas pueden tener el mismo nombre a propósito:
//   SURA "COBERTURA TOTAL"  → TOTAL  y también  TOTAL c/ Mov
//   BSE  "GLOBAL"           → GLOBAL - anual  y también  GLOBAL - 3x2 (el bloque 3X2)
// Son casos donde el texto de la compañía no alcanza para distinguir cuál de las dos es.
// El Run code junta todas las filas que matchean, así que cualquiera de las dos cotizada
// valida, que es lo correcto: no hay forma de saberlo por el texto.
//
// Una cobertura por fila porque esa columna admite una sola (label_limit_count: 1).
//
// Idempotente: la clave es compañía + nombre + cobertura.
//
// Uso:
//   node scripts/mon-coberturas-poliza.mjs            # muestra qué haría
//   node scripts/mon-coberturas-poliza.mjs --apply
import fs from 'node:fs'

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const APLICAR = process.argv.includes('--apply')
const PANEL = '18421072511'
const GRUPO_COLUMN = 'color_mm5fdknw'
const COMPANIA_COLUMN = 'dropdown_mm52feqr'
const COBERTURA_COLUMN = 'dropdown_mm5frxag'
const GRUPO = 'Coberturas'

// Los textos tal cual los escribe cada compañía.
const FILAS = [
  ['PORTO', '1. DAÑOS, HURTO, INCENDIO Y RESPONSABILIDAD CIVIL', 'GLOBAL'],
  ['PORTO', '1. DAÑOS, HURTO, INCENDIO Y RESPONSABILIDAD CIVIL CON DEDUCIBLE INCREMENTADO', 'GLOBAL ded Alto'],
  ['PORTO', '2. HURTO, INCENDIO Y RESPONSABILIDAD CIVIL', 'TRIPLE'],
  ['PORTO', '2.5. HURTO, INCENDIO Y RESPONSABILIDAD CIVIL CON AGENTES EXTERNOS', 'TRIPLE'],

  ['SURA', 'COBERTURA 4 EN 1', '4 EN 1'],
  ['SURA', 'RC HURTO E INCENDIO', 'TRIPLE'],
  ['SURA', 'COBERTURA TOTAL PLUS', 'TOTAL PLUS'],
  ['SURA', 'COBERTURA TOTAL', 'TOTAL'],
  ['SURA', 'COBERTURA TOTAL', 'TOTAL c/ Mov'],

  ['SANCOR', 'PARCIAL', 'PARCIAL'],
  ['SANCOR', 'PARCIAL PLUS', 'PARCIAL PLUS'],
  ['SANCOR', 'TOTAL 2500', 'TOTAL 2500'],
  ['SANCOR', 'TOTAL 800', 'TOTAL 800'],
  ['SANCOR', 'TOTAL 600', 'TOTAL 600'],
  ['SANCOR', 'TOTAL 1500', 'TOTAL 1500'],

  ['BSE', 'GLOBAL', 'GLOBAL - anual'],
  ['BSE', 'TRIPLE', 'TRIPLE - anual'],
  ['BSE', 'GLOBAL', 'GLOBAL - 3x2'],
  ['BSE', 'TRIPLE', 'TRIPLE - 3X2'],
].map(([compania, texto, nuestra]) => ({ compania, texto, nuestra }))

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

const board = await gql(
  `{ boards(ids: ${PANEL}) { columns(ids: ["${COBERTURA_COLUMN}"]) { settings_str }
     items_page(limit: 300) { items { id name column_values(ids: ["${GRUPO_COLUMN}","${COMPANIA_COLUMN}","${COBERTURA_COLUMN}"]) { id text } } } } }`
)
const items = board.boards[0].items_page.items
const valor = (item, id) => (item.column_values.find((c) => c.id === id)?.text || '').trim()

const catalogo = Object.values(JSON.parse(board.boards[0].columns[0].settings_str).labels || {}).map((l) =>
  typeof l === 'string' ? l : l.name
)
const fueraDeCatalogo = FILAS.filter((f) => !catalogo.includes(f.nuestra))
if (fueraDeCatalogo.length) {
  console.error('Estas coberturas no existen en el dropdown de PANEL:')
  for (const f of fueraDeCatalogo) console.error(`  ${f.compania} → "${f.nuestra}"`)
  process.exit(1)
}

const clave = (compania, nombre, cobertura) => `${compania}|${nombre.trim().toLowerCase()}|${cobertura}`
const enElGrupo = items.filter((i) => valor(i, GRUPO_COLUMN) === GRUPO)
const existentes = new Set(enElGrupo.map((i) => clave(valor(i, COMPANIA_COLUMN), i.name, valor(i, COBERTURA_COLUMN))))

const faltan = FILAS.filter((f) => !existentes.has(clave(f.compania, f.texto, f.nuestra)))

// Sobran las filas de una corrida anterior que se llamaban como NUESTRA cobertura en vez
// del texto de la compañía. Se reconocen porque su nombre es exactamente una etiqueta del
// catálogo: nadie escribiría eso a mano como texto de una póliza. Cualquier otra fila que
// haya cargado una persona no se toca.
const deseadas = new Set(FILAS.map((f) => clave(f.compania, f.texto, f.nuestra)))
const sobran = enElGrupo.filter(
  (i) =>
    !deseadas.has(clave(valor(i, COMPANIA_COLUMN), i.name, valor(i, COBERTURA_COLUMN))) &&
    catalogo.includes(i.name.trim())
)

console.log(`${enElGrupo.length} filas en "${GRUPO}": ${faltan.length} a crear, ${sobran.length} a borrar`)
for (const f of faltan) console.log(`  crear   ${f.compania.padEnd(7)} "${f.texto}"  →  ${f.nuestra}`)
for (const i of sobran) console.log(`  borrar  ${valor(i, COMPANIA_COLUMN).padEnd(7)} "${i.name}"  (nombre autogenerado, no es el texto de la compañía)`)

if (!faltan.length && !sobran.length) {
  console.log('Nada que hacer.')
} else if (!APLICAR) {
  console.log()
  console.log('Simulación. Para aplicarlo: node scripts/mon-coberturas-poliza.mjs --apply')
} else {
  for (const f of faltan) {
    const valores = {
      [GRUPO_COLUMN]: { label: GRUPO },
      [COMPANIA_COLUMN]: { labels: [f.compania] },
      [COBERTURA_COLUMN]: { labels: [f.nuestra] },
    }
    const creado = await gql(
      `mutation($boardId: ID!, $name: String!, $values: JSON!) {
         create_item(board_id: $boardId, item_name: $name, column_values: $values) { id }
       }`,
      { boardId: PANEL, name: f.texto, values: JSON.stringify(valores) }
    )
    console.log(`creada  ${creado.create_item.id}  ${f.compania}  ${f.nuestra}`)
  }
  for (const i of sobran) {
    await gql(`mutation($itemId: ID!) { delete_item(item_id: $itemId) { id } }`, { itemId: i.id })
    console.log(`borrada ${i.id}  ${valor(i, COMPANIA_COLUMN)}  ${i.name}`)
  }
  console.log()
  console.log(`listo: ${faltan.length} creadas, ${sobran.length} borradas`)
}
