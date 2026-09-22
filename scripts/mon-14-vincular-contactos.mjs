// MON-14, backfill: vincula el Contacto de las Oportunidades viejas (creadas antes de
// que el alta escribiera la conexión "Contacto", board_relation_mm4t623x) — sin esto, la
// columna Contacto de la tabla cae al teléfono copiado en vez del nombre.
//
// Cómo elige el contacto de cada oportunidad, en orden:
//   1) Los Contactos del Cliente vinculado (Contacto.Cliente = ese cliente): si hay UNO
//      solo, ese. Si hay varios, desempata el teléfono copiado en la oportunidad
//      (phone_mm519m27) contra el contact_phone del contacto (últimos 8 dígitos, así el
//      0/+598 de prefijo no molesta).
//   2) Sin Cliente vinculado o sin contactos suyos: el teléfono contra TODOS los
//      contactos, solo si matchea exactamente uno.
// Ambiguo o sin candidato: lo lista y no lo toca — mejor sin vincular que vinculado mal.
//
// Idempotente: saltea las oportunidades que ya tienen contacto vinculado.
// Sin --apply no escribe nada.
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const APLICAR = process.argv.includes('--apply')

const OPORTUNIDADES_BOARD = 18420863013
const CONTACTOS_BOARD = 18420863016
const OPP_CONTACTO_COLUMN = 'board_relation_mm4t623x' // Oportunidad -> Contacto
const OPP_CLIENTE_COLUMN = 'board_relation_mm4qg1n2' // Oportunidad -> Cliente
const OPP_TELEFONO_COLUMN = 'phone_mm519m27' // teléfono copiado al crear
const CONTACTO_CLIENTE_COLUMN = 'board_relation_mm4tdbm9' // Contacto -> Cliente

async function gql(query, variables) {
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: env.MONDAY_API_KEY, 'API-Version': '2024-10' },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 500))
  return j.data
}
const espera = (ms) => new Promise((res) => setTimeout(res, ms))

// Últimos 8 dígitos: suficiente para un celular uruguayo (09x xxx xxx) y tolera 0/+598.
const colaTelefono = (s) => (s ?? '').replace(/\D/g, '').slice(-8)

async function traerTodo(boardId, columnIds) {
  const items = []
  let cursor = null
  do {
    const q = cursor
      ? `query($cursor: String!) { next_items_page(cursor: $cursor, limit: 100) { cursor items { id name column_values(ids: ${JSON.stringify(columnIds)}) { id text ... on BoardRelationValue { linked_items { id name } } } } } }`
      : `query { boards(ids: [${boardId}]) { items_page(limit: 100) { cursor items { id name column_values(ids: ${JSON.stringify(columnIds)}) { id text ... on BoardRelationValue { linked_items { id name } } } } } } }`
    const data = await gql(q, cursor ? { cursor } : undefined)
    const pagina = cursor ? data.next_items_page : data.boards[0].items_page
    items.push(...pagina.items)
    cursor = pagina.cursor
  } while (cursor)
  return items
}

const cvDe = (item, id) => item.column_values.find((c) => c.id === id)

const oportunidades = await traerTodo(OPORTUNIDADES_BOARD, [
  OPP_CONTACTO_COLUMN,
  OPP_CLIENTE_COLUMN,
  OPP_TELEFONO_COLUMN,
])
const contactos = await traerTodo(CONTACTOS_BOARD, ['contact_phone', CONTACTO_CLIENTE_COLUMN])

const contactosPorCliente = new Map()
for (const c of contactos) {
  const clienteId = cvDe(c, CONTACTO_CLIENTE_COLUMN)?.linked_items?.[0]?.id
  if (!clienteId) continue
  if (!contactosPorCliente.has(clienteId)) contactosPorCliente.set(clienteId, [])
  contactosPorCliente.get(clienteId).push(c)
}

const plan = []
let yaVinculadas = 0
for (const opp of oportunidades) {
  if (cvDe(opp, OPP_CONTACTO_COLUMN)?.linked_items?.length) {
    yaVinculadas++
    continue
  }
  const clienteId = cvDe(opp, OPP_CLIENTE_COLUMN)?.linked_items?.[0]?.id
  const tel = colaTelefono(cvDe(opp, OPP_TELEFONO_COLUMN)?.text)
  const delCliente = clienteId ? contactosPorCliente.get(clienteId) ?? [] : []

  let elegido = null
  let motivo = ''
  if (delCliente.length === 1) {
    elegido = delCliente[0]
    motivo = 'único contacto del cliente'
  } else if (delCliente.length > 1) {
    const porTel = tel ? delCliente.filter((c) => colaTelefono(cvDe(c, 'contact_phone')?.text) === tel) : []
    if (porTel.length === 1) {
      elegido = porTel[0]
      motivo = 'teléfono, entre los del cliente'
    } else {
      motivo = `AMBIGUO: ${delCliente.length} contactos del cliente y el teléfono no desempata`
    }
  } else if (tel) {
    const porTel = contactos.filter((c) => colaTelefono(cvDe(c, 'contact_phone')?.text) === tel)
    if (porTel.length === 1) {
      elegido = porTel[0]
      motivo = 'teléfono, único en todo Contactos'
    } else {
      motivo = porTel.length === 0 ? 'sin candidato (teléfono no está en Contactos)' : `AMBIGUO: teléfono en ${porTel.length} contactos`
    }
  } else {
    motivo = 'sin candidato (ni cliente con contactos ni teléfono)'
  }
  plan.push({ opp, elegido, motivo })
}

console.log(`Oportunidades: ${oportunidades.length} — ya vinculadas: ${yaVinculadas} — a revisar: ${plan.length}\n`)
for (const { opp, elegido, motivo } of plan) {
  const marca = elegido ? '->' : ' x'
  console.log(`${marca} ${opp.id}  ${opp.name.slice(0, 55)}`)
  console.log(`     ${elegido ? `vincular "${elegido.name}" (${elegido.id})` : 'sin vincular'} — ${motivo}`)
}

const aEscribir = plan.filter((p) => p.elegido)
console.log(`\nTotal a vincular: ${aEscribir.length} / ${plan.length}`)
if (!APLICAR) {
  console.log('Corrida en seco (sin --apply): no se escribió nada.')
  process.exit(0)
}

for (const { opp, elegido } of aEscribir) {
  await gql(
    `mutation($itemId: ID!, $values: JSON!) { change_multiple_column_values(board_id: ${OPORTUNIDADES_BOARD}, item_id: $itemId, column_values: $values) { id } }`,
    { itemId: opp.id, values: JSON.stringify({ [OPP_CONTACTO_COLUMN]: { item_ids: [Number(elegido.id)] } }) }
  )
  console.log(`ok ${opp.id} -> ${elegido.name}`)
  await espera(250)
}
console.log('Listo.')
