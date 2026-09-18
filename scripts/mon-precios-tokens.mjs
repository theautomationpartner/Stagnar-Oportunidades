// Reemplaza en los textos "Incluye" de PANEL los importes escritos a mano por el token
// {precio ...}, que se resuelve contra la fila de Configuracion de esa compañía.
//
// Por qué: el importe escrito adentro de la frase envejece en silencio. Se actualiza el
// precio en su fila de Configuracion y el texto que ve el cliente sigue diciendo el
// viejo. Estaba pasando con tres opcionales de SURA a la vez:
//
//   GRANIZO           el texto decía $ 1.200   y vale 1250
//   COCHE CORTESÍA    el texto decía $ 1697    y vale 1765
//   SURA TE LLEVA     el texto decía $1.500    y vale 1560
//
// El token se resuelve por compañía (ver pricingEngine.js#expandirPrecio), por eso el
// script verifica que exista la fila de Configuracion de ESA compañía con ese nombre
// exacto antes de escribir: un token que no resuelve queda escrito tal cual en la
// cotización.
//
// Idempotente: si el texto ya tiene el token, no hace nada.
//
// Uso:
//   node scripts/mon-precios-tokens.mjs            # muestra qué haría
//   node scripts/mon-precios-tokens.mjs --apply
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
const TEXTO_COLUMN = 'text_mm5f1wnh'
const VALOR_COLUMN = 'numeric_mm5fmjh0'

// Cada reemplazo dice de qué compañía es el precio, para poder verificar que el token
// vaya a resolver antes de escribirlo.
const REEMPLAZOS = [
  { fila: 'SURA-TOTAL c/ Mov', de: '+$1.500', a: '+{precio SURA te lleva}', compania: 'SURA', clave: 'SURA te lleva' },
  { fila: 'SURA-TOTAL c/ Mov', de: '+$ 1.200', a: '+{precio Granizo}', compania: 'SURA', clave: 'Granizo' },
  { fila: 'SURA-TOTAL', de: '+$ 1697', a: '+{precio Auto extra 15 días}', compania: 'SURA', clave: 'Auto extra 15 días' },
  { fila: 'SURA-TOTAL', de: '+$1.500', a: '+{precio SURA te lleva}', compania: 'SURA', clave: 'SURA te lleva' },
  { fila: 'SURA-TOTAL', de: '+$ 1.200', a: '+{precio Granizo}', compania: 'SURA', clave: 'Granizo' },
  { fila: 'SURA-4 EN 1', de: '+$ 1.200', a: '+{precio Granizo}', compania: 'SURA', clave: 'Granizo' },
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
  `{ boards(ids: ${PANEL}) { items_page(limit: 300) { items { id name column_values(ids: ["${GRUPO_COLUMN}","${COMPANIA_COLUMN}","${TEXTO_COLUMN}","${VALOR_COLUMN}"]) { id text } } } } }`
)
const items = data.boards[0].items_page.items
const valor = (item, id) => (item.column_values.find((c) => c.id === id)?.text || '').trim()

// Los precios disponibles, por compañía y nombre exacto de la fila.
const precios = new Map()
for (const i of items) {
  if (valor(i, GRUPO_COLUMN) !== 'Configuracion') continue
  precios.set(`${valor(i, COMPANIA_COLUMN)}|${i.name.trim()}`, valor(i, VALOR_COLUMN))
}

const sinPrecio = REEMPLAZOS.filter((r) => !precios.has(`${r.compania}|${r.clave}`))
if (sinPrecio.length) {
  console.error('Estos tokens no van a resolver porque no existe esa fila en Configuracion:')
  for (const r of sinPrecio) console.error(`  ${r.compania} → "${r.clave}"`)
  process.exit(1)
}

const cambios = new Map()
for (const r of REEMPLAZOS) {
  const item = items.find((i) => i.name.trim() === r.fila && valor(i, GRUPO_COLUMN) === 'Incluye')
  if (!item) {
    console.error(`No se encontró la fila "${r.fila}" en el grupo Incluye`)
    process.exit(1)
  }
  const actual = cambios.get(item.id)?.texto ?? valor(item, TEXTO_COLUMN)
  if (actual.includes(r.a)) continue // ya tiene el token
  const ocurrencias = actual.split(r.de).length - 1
  if (ocurrencias !== 1) {
    console.error(`En "${r.fila}" el texto "${r.de}" aparece ${ocurrencias} veces; se esperaba 1. No se toca nada.`)
    process.exit(1)
  }
  cambios.set(item.id, {
    nombre: item.name,
    original: cambios.get(item.id)?.original ?? valor(item, TEXTO_COLUMN),
    texto: actual.split(r.de).join(r.a),
  })
}

if (!cambios.size) {
  console.log('Los textos ya tienen los tokens. Nada que hacer.')
} else {
  console.log(`${cambios.size} filas a actualizar`)
  for (const [id, c] of cambios) {
    console.log(`\n── ${c.nombre}  (${id})`)
    for (const r of REEMPLAZOS.filter((x) => x.fila === c.nombre.trim())) {
      console.log(`     ${r.de.padEnd(10)} → ${r.a.padEnd(32)} ($ ${precios.get(`${r.compania}|${r.clave}`)})`)
    }
  }

  if (!APLICAR) {
    console.log()
    console.log('Simulación. Para aplicarlo: node scripts/mon-precios-tokens.mjs --apply')
  } else {
    for (const [id, c] of cambios) {
      await gql(
        `mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
           change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
         }`,
        { boardId: PANEL, itemId: id, columnId: TEXTO_COLUMN, value: c.texto }
      )
      console.log(`actualizada ${c.nombre}`)
    }
    console.log()
    console.log(`listo: ${cambios.size} filas`)
  }
}
