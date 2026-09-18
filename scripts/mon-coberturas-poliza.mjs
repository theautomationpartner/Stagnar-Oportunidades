// Crea en PANEL el grupo "Coberturas": la tabla que dice, para cada compañía, a qué
// cobertura nuestra equivale el texto que esa compañía escribe en la póliza.
//
// Por qué existe: al validar una póliza emitida hay que comparar su cobertura contra la
// que se cotizó, y no se llaman igual. PORTO escribe "1- Daños, Hurto, Incendio y
// Responsabilidad Civil" donde nosotros tenemos "GLOBAL". El Run code sabe deducirlo con
// las reglas de cada compañía (ver REGLAS_POR_COMPANIA en validacion-poliza.run-code.js),
// pero una fila acá le gana a la deducción: es alguien diciendo qué es, y se corrige en
// monday sin tocar el código del escenario.
//
// EL NOMBRE DE LA FILA ES LA CLAVE DE BÚSQUEDA: se compara contra el texto de la póliza,
// completo y letra por letra. Las filas que crea este script se llaman como nuestra
// cobertura, que es lo único que se sabe sin tener la póliza delante. A medida que
// aparezcan pólizas reales hay que renombrar cada fila con el texto TAL CUAL figura en el
// PDF —copiado y pegado— o agregar otra fila con ese texto. Mientras tanto no molestan:
// si no matchean, el Run code deduce con las reglas y avisa en "faltantes".
//
// Una cobertura por fila, porque esa columna admite una sola (label_limit_count: 1) y no
// se cambia: las otras 100 filas de PANEL se refieren a una cobertura cada una. Alcanza
// igual, porque el Run code compara por familia — si una fila dice que el texto de PORTO
// es GLOBAL, una GLOBAL ded Alto cotizada también valida.
//
// Qué filas crea: una por cada combinación compañía + cobertura que ya existe en PANEL
// (grupo Incluye), o sea lo que cada compañía vende de verdad. No se inventa ninguna.
//
// Idempotente: la clave es compañía + nombre, así que "TRIPLE" de SURA y "TRIPLE" de
// PORTO son dos filas distintas y ninguna se duplica al correrlo de nuevo.
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

// Solo estas cuatro: son de las que se emiten pólizas y las únicas con reglas de lectura
// en el Run code.
const COMPANIAS = ['SURA', 'PORTO', 'SANCOR', 'BSE']

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
  `{ boards(ids: ${PANEL}) { items_page(limit: 300) { items { id name column_values(ids: ["${GRUPO_COLUMN}","${COMPANIA_COLUMN}","${COBERTURA_COLUMN}"]) { id text } } } } }`
)
const items = data.boards[0].items_page.items
const valor = (item, id) => (item.column_values.find((c) => c.id === id)?.text || '').trim()

// Lo que vende cada compañía sale de PANEL, no de una lista escrita acá: así no se
// inventa ninguna combinación ni queda desactualizada cuando se agrega una cobertura.
const combinaciones = new Map()
for (const i of items) {
  if (valor(i, GRUPO_COLUMN) !== 'Incluye') continue
  const compania = valor(i, COMPANIA_COLUMN)
  const cobertura = valor(i, COBERTURA_COLUMN)
  if (!COMPANIAS.includes(compania) || !cobertura) continue
  combinaciones.set(`${compania}|${cobertura}`, { compania, cobertura })
}

// La clave es compañía + nombre: "TRIPLE" de SURA no es "TRIPLE" de PORTO.
const existentes = new Set(
  items
    .filter((i) => valor(i, GRUPO_COLUMN) === GRUPO)
    .map((i) => `${valor(i, COMPANIA_COLUMN)}|${i.name.trim().toLowerCase()}`)
)

const faltan = [...combinaciones.values()].filter(
  (c) => !existentes.has(`${c.compania}|${c.cobertura.toLowerCase()}`)
)

console.log(`${existentes.size} filas ya en "${GRUPO}", ${combinaciones.size} combinaciones, ${faltan.length} a crear`)
for (const c of faltan) console.log(`  crear  ${c.compania.padEnd(8)} "${c.cobertura}"  →  ${c.cobertura}`)

if (!faltan.length) {
  console.log('Nada que hacer.')
} else if (!APLICAR) {
  console.log()
  console.log('Simulación. Para aplicarlo: node scripts/mon-coberturas-poliza.mjs --apply')
} else {
  for (const c of faltan) {
    const valores = {
      [GRUPO_COLUMN]: { label: GRUPO },
      [COMPANIA_COLUMN]: { labels: [c.compania] },
      [COBERTURA_COLUMN]: { labels: [c.cobertura] },
    }
    const creado = await gql(
      `mutation($boardId: ID!, $name: String!, $values: JSON!) {
         create_item(board_id: $boardId, item_name: $name, column_values: $values) { id name }
       }`,
      { boardId: PANEL, name: c.cobertura, values: JSON.stringify(valores) }
    )
    console.log(`creada ${creado.create_item.id}  ${c.compania}  ${creado.create_item.name}`)
  }
  console.log()
  console.log(`listo: ${faltan.length} filas`)
}
