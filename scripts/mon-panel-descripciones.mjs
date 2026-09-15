// Escribe la columna "Descripcion Configuracion" de cada fila de Configuración de PANEL:
// qué significa el valor, cómo se escribe en un texto, dónde influye y cómo cambiarlo.
//
// Existe porque el tablero se edita sin abrir el código: quien toca un número tiene que
// poder saber ahí mismo qué rompe y qué no. Antes las descripciones decían qué era el
// valor pero no cómo usarlo, y por eso los importes terminaban escritos a mano adentro
// del texto (ver el granizo de SURA: se cobraba $ 1.250 y la cotización decía $ 1.200).
//
// Idempotente: solo escribe las que cambian.
//
// Uso:
//   node scripts/mon-panel-descripciones.mjs            # muestra qué cambiaría
//   node scripts/mon-panel-descripciones.mjs --apply
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
const COL = { grupo: 'color_mm5fdknw', compania: 'dropdown_mm52feqr', valor: 'numeric_mm5fmjh0', descripcion: 'text_mm5fmqdw' }

// Cómo se escribe el precio de un opcional dentro de un texto, en vez de a mano.
const comoUsarPrecio = (nombre) =>
  `Se escribe en "Texto Incluye" como {precio ${nombre}} y sale con el precio de acá. ` +
  `Si se escribe el número a mano, al cambiar este valor el texto queda viejo y nadie se entera.`

const DONDE_PRECIO =
  'Influye en dos lugares a la vez: se suma al total cuando el vendedor tilda el opcional, ' +
  'y es el precio que se muestra en la cotización que se le manda al cliente.'

const DESCRIPCIONES = {
  'Valor UI en pesos':
    'Cuánto vale una Unidad Indexada en pesos uruguayos. Se ajusta todos los meses. ' +
    'Se usa junto con "Dólar en pesos" para convertir a dólares los límites de RC que las compañías publican en UI. ' +
    'Se escribe en el texto como {UI 5000000} y sale como "5.000.000 UI ≈ US$ 825.050". ' +
    'Influye en el bloque de Responsabilidad Civil de la cotización que se manda por WhatsApp. ' +
    'Para cambiarlo: poné el valor nuevo en la columna Valor; la app lo toma sola, sin tocar código.',
  'Dólar en pesos':
    'Cotización del dólar en pesos uruguayos, para convertir los límites que están en UI. ' +
    'Si queda vacío, esos límites se muestran solo en UI, sin el equivalente en dólares (preferible a mostrar una conversión vieja). ' +
    'Influye en el bloque de Responsabilidad Civil de la cotización. ' +
    'Para cambiarlo: poné el valor nuevo en la columna Valor.',
  'Año mínimo Repuestos Originales':
    'Año del vehículo a partir del cual la cotización incluye la viñeta "REPUESTOS ORIGINALES". ' +
    'Un auto más viejo que este año no la muestra. ' +
    'Influye en las coberturas que ofrecen repuestos originales. ' +
    'Para cambiarlo: poné el año nuevo en la columna Valor.',
  'Año mínimo Reposición 0km':
    'Año del vehículo a partir del cual PORTO muestra la viñeta "REPOSICIÓN 0KM EL PRIMER AÑO DE EMPADRONADO". ' +
    'Influye solo en las cotizaciones de PORTO. ' +
    'Para cambiarlo: poné el año nuevo en la columna Valor.',
  'Antigüedad servicios ilimitados PORTO':
    'Año del vehículo a partir del cual el auxilio mecánico de PORTO (Total y Total ded Alto) dice "SERVICIOS ILIMITADOS"; ' +
    'para un auto más viejo dice "5 SERVICIOS POR AÑO". ' +
    'Influye solo en las cotizaciones de PORTO. ' +
    'Para cambiarlo: poné el año nuevo en la columna Valor.',
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

const data = await gql(
  `{ boards(ids: ${PANEL_BOARD}) { items_page(limit: 300) { items { id name column_values(ids: ["${COL.grupo}","${COL.compania}","${COL.valor}","${COL.descripcion}"]) { id text } } } } }`
)

const cambios = []
for (const item of data.boards[0].items_page.items) {
  const cv = Object.fromEntries(item.column_values.map((c) => [c.id, c.text || '']))
  if (cv[COL.grupo] !== 'Configuracion') continue

  const nombre = item.name.trim()
  const compania = cv[COL.compania]
  // Las filas con compañía son precios de opcionales; las globales tienen texto propio.
  const nueva = compania
    ? `Precio del opcional "${nombre}" para ${compania}. ${DONDE_PRECIO} ${comoUsarPrecio(nombre)} ` +
      'Para cambiarlo: poné el precio nuevo en la columna Valor.'
    : DESCRIPCIONES[nombre]

  if (!nueva) {
    console.log(`  sin texto definido para "${nombre}" — se deja como está`)
    continue
  }
  if (cv[COL.descripcion] === nueva) continue
  cambios.push({ id: item.id, etiqueta: (compania ? compania + ' · ' : 'global · ') + nombre, nueva })
}

console.log(`${cambios.length} descripciones a escribir`)
for (const c of cambios) console.log('  ' + c.etiqueta)

if (cambios.length && !APLICAR) {
  console.log()
  console.log('Simulación. Para aplicarlo: node scripts/mon-panel-descripciones.mjs --apply')
} else if (cambios.length) {
  for (const c of cambios) {
    await gql(
      `mutation($boardId: ID!, $itemId: ID!, $values: JSON!) {
         change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $values) { id }
       }`,
      { boardId: PANEL_BOARD, itemId: c.id, values: JSON.stringify({ [COL.descripcion]: c.nueva }) }
    )
    console.log(`escrita ${c.etiqueta}`)
  }
  console.log()
  console.log('listo')
}
