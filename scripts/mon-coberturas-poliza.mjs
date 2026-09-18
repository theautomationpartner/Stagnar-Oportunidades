// Crea en PANEL el grupo "Coberturas": la tabla que dice, para cada compañía, a qué
// cobertura nuestra equivale el texto que esa compañía escribe en la póliza.
//
// Por qué existe: al validar una póliza emitida hay que comparar su cobertura contra la
// que se cotizó, y no se llaman igual. PORTO escribe "1- Daños, Hurto, Incendio y
// Responsabilidad Civil" donde nosotros tenemos "TOTAL 2500". Sin esta tabla el código
// tiene que adivinar por las palabras del texto, que acierta la mayoría de las veces pero
// no siempre, y cuando falla lo hace en silencio.
//
// No hace falta ninguna columna nueva: PANEL ya tiene Compañias de Seguro y Cobertura, y
// esta última es multi-select. Eso último importa: un texto de la póliza no equivale a
// UNA cobertura nuestra. "Daños, Hurto, Incendio y RC" es cualquiera de las Total, que
// entre ellas se diferencian por el deducible, no por lo que cubren. Se marcan todas.
//
// Cómo se completa: el nombre de la fila es el texto TAL CUAL figura en la póliza. Si no
// coincide letra por letra no se encuentra, así que conviene copiarlo y pegarlo del PDF.
// Una fila sin compañía vale para todas, para los textos que usan varias.
//
// Las filas se siembran solo con lo verificado contra una póliza real. El resto se va
// cargando a medida que aparecen: el escenario avisa cuál falta en "faltantes".
//
// Idempotente: si la fila ya existe la deja como está.
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

// Todas las Total del catálogo. Un texto de póliza que describe todo riesgo equivale a
// cualquiera de ellas: se diferencian por deducible, no por lo que cubren.
const TODAS_LAS_TOTAL = ['TOTAL 600', 'TOTAL 800', 'TOTAL 1500', 'TOTAL 2500', 'TOTAL', 'TOTAL PLUS', 'TOTAL c/ Mov', 'GLOBAL', 'GLOBAL - anual', 'GLOBAL - 3x2', 'GLOBAL ded Alto']

const FILAS = [
  {
    texto: '1- Daños, Hurto, Incendio y Responsabilidad Civil',
    compania: 'PORTO',
    nuestras: TODAS_LAS_TOTAL,
  },
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

const board = (await gql(`{ boards(ids: ${PANEL}) { columns { id title type settings_str } groups { id title } } }`)).boards[0]
const grupoCol = board.columns.find((c) => c.id === GRUPO_COLUMN)
const etiquetasGrupo = Object.values(JSON.parse(grupoCol.settings_str).labels || {})

// La etiqueta del grupo no se puede crear con una mutación de columna: la API no deja
// tocar settings_str de un status. Sí se crea al escribirla en un ítem con
// create_labels_if_missing, que es lo que hace este script.
if (!etiquetasGrupo.includes(GRUPO)) {
  console.log(`La etiqueta "${GRUPO}" todavía no existe en la columna Grupo. Se crea al escribir la primera fila.`)
  console.log(`Etiquetas actuales: ${etiquetasGrupo.join(', ')}`)
  console.log()
}

const coberturasValidas = Object.values(JSON.parse(board.columns.find((c) => c.id === COBERTURA_COLUMN).settings_str).labels || {}).map((l) => (typeof l === 'string' ? l : l.name))
const desconocidas = [...new Set(FILAS.flatMap((f) => f.nuestras))].filter((c) => !coberturasValidas.includes(c))
if (desconocidas.length) {
  console.error(`Estas coberturas no existen en el dropdown de PANEL: ${desconocidas.join(', ')}`)
  process.exit(1)
}

const data = await gql(`{ boards(ids: ${PANEL}) { items_page(limit: 300) { items { id name column_values(ids: ["${GRUPO_COLUMN}"]) { id text } } } } }`)
const existentes = new Set(
  data.boards[0].items_page.items
    .filter((i) => (i.column_values[0]?.text || '').trim() === GRUPO)
    .map((i) => i.name.trim().toLowerCase())
)

const faltan = FILAS.filter((f) => !existentes.has(f.texto.trim().toLowerCase()))

console.log(`${existentes.size} filas ya en el grupo "${GRUPO}", ${faltan.length} a crear`)
for (const f of faltan) {
  console.log(`  crear  ${f.compania || '(todas)'}  "${f.texto}"`)
  console.log(`         → ${f.nuestras.join(', ')}`)
}

if (!faltan.length) {
  console.log('Nada que hacer.')
} else if (!APLICAR) {
  console.log()
  console.log('Simulación. Para aplicarlo: node scripts/mon-coberturas-poliza.mjs --apply')
} else {
  for (const f of faltan) {
    const valores = {
      [GRUPO_COLUMN]: { label: GRUPO },
      [COBERTURA_COLUMN]: { labels: f.nuestras },
    }
    if (f.compania) valores[COMPANIA_COLUMN] = { labels: [f.compania] }
    const creado = await gql(
      `mutation($boardId: ID!, $name: String!, $values: JSON!) {
         create_item(board_id: $boardId, item_name: $name, column_values: $values, create_labels_if_missing: true) { id name }
       }`,
      { boardId: PANEL, name: f.texto, values: JSON.stringify(valores) }
    )
    console.log(`creada ${creado.create_item.id}  ${creado.create_item.name}`)
  }
  console.log()
  console.log(`listo: ${faltan.length} filas`)
}
