// Oportunidades asignadas a una persona, y su reasignación. Lo usa la baja de un usuario de
// monday (ver api/auth/admin/usuarios.js): a pedido, antes de desactivarlo se elige a
// quién pasarle sus oportunidades o si quedan sin asignar — si no, quedarían a nombre de
// alguien que ya no puede entrar.
//
// Solo el "Asignado" (deal_owner) del tablero de Oportunidades, que es el que maneja la
// app. Los otros tableros con columnas de personas (Ejecutivo Virtual, Actividades,
// Pólizas…) no se tocan.

import { config } from './env.js'

const COLUMNA_ASIGNADO = 'deal_owner'

async function gql(query, variables) {
  if (!config.mondayApiKey) throw new Error('MONDAY_API_KEY no está configurada')
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: config.mondayApiKey, 'API-Version': '2024-10' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error('La API de monday devolvió ' + res.status)
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(' · '))
  return json.data
}

const personasDe = (valor) => {
  try {
    return (JSON.parse(valor || '{}').personsAndTeams ?? []).filter((p) => p.kind === 'person').map((p) => String(p.id))
  } catch {
    return []
  }
}

// Las oportunidades donde esta persona figura como Asignado. El filtro de una columna de
// personas se escribe "person-<id>" (probado contra la API: el id pelado no trae nada).
export async function oportunidadesAsignadasA(mondayUserId) {
  const items = []
  let cursor = null
  do {
    const data = cursor
      ? await gql(
          `query ($cursor: String!) { next_items_page(limit: 200, cursor: $cursor) { cursor items { id name column_values(ids: ["${COLUMNA_ASIGNADO}"]) { value } } } }`,
          { cursor }
        )
      : await gql(
          `query ($boardId: ID!, $qp: ItemsQuery) {
             boards(ids: [$boardId]) {
               items_page(limit: 200, query_params: $qp) { cursor items { id name column_values(ids: ["${COLUMNA_ASIGNADO}"]) { value } } }
             }
           }`,
          {
            boardId: config.oportunidadesBoardId,
            qp: { rules: [{ column_id: COLUMNA_ASIGNADO, compare_value: ['person-' + mondayUserId], operator: 'any_of' }] },
          }
        )
    const pagina = cursor ? data.next_items_page : data.boards?.[0]?.items_page
    for (const it of pagina?.items ?? []) {
      items.push({ id: String(it.id), nombre: it.name, personas: personasDe(it.column_values[0]?.value) })
    }
    cursor = pagina?.cursor ?? null
  } while (cursor)
  return items
}

// Saca a `de` del Asignado de cada oportunidad y, si hay `a`, lo pone en su lugar. Si la
// oportunidad tenía además a otra persona asignada, esa se conserva. Sin `a` y sin nadie
// más, la oportunidad queda sin asignar.
export async function reasignarOportunidades(items, de, a) {
  let hechas = 0
  for (const it of items) {
    const personas = it.personas.filter((p) => p !== String(de))
    if (a && !personas.includes(String(a))) personas.push(String(a))
    await gql(
      `mutation ($boardId: ID!, $itemId: ID!, $valor: JSON!) {
         change_column_value(board_id: $boardId, item_id: $itemId, column_id: "${COLUMNA_ASIGNADO}", value: $valor) { id }
       }`,
      {
        boardId: config.oportunidadesBoardId,
        itemId: it.id,
        valor: JSON.stringify({ personsAndTeams: personas.map((id) => ({ id: Number(id), kind: 'person' })) }),
      }
    )
    hechas++
  }
  return hechas
}
