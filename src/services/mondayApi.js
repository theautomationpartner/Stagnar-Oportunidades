// Configurables por variable de entorno (VITE_ para que el navegador las lea) para
// poder apuntar un deploy de Vercel (ej. Preview, para que otras personas testeen) a un
// tablero de prueba distinto del real de producción, sin tocar código. Sin configurar,
// caen al tablero real actual.
export const OPPORTUNITIES_BOARD_ID = Number(import.meta.env.VITE_MONDAY_BOARD_ID) || 18420863013
export const SUBITEMS_BOARD_ID = Number(import.meta.env.VITE_MONDAY_SUBITEMS_BOARD_ID) || 18420863061

const OPPORTUNITY_COLUMN_IDS = [
  'text_mm51b055', // Nombre
  'text_mm51ez7e', // Apellido
  'numeric_mm51mb0s', // CI
  'phone_mm519m27', // Teléfono
  'dropdown_mm51ykrd', // Marca
  'dropdown_mm51mdmq', // Año
  'text_mm54fb7m', // Modelo - Autodata
  'dropdown_mm52jp01', // Combustible
  'color_mm52ey1d', // Uso
  'deal_stage', // Estado Oportunidad
  'deal_owner', // Asignado
  'date_mm52w0h8', // Fecha Cot.
  'date__1', // Ultima Interaccion
  'color_mm51n7aa', // Estado Cotizacion
  'color_mm51mm5v', // Tipo de Sujeto
  'color_mm4wr1t4', // Estado Envio
  'numeric_mm527wpm', // Edad
  'dropdown_mm5jqdk', // Tipo
  'date_mm516agw', // Fecha Nacimiento
  'board_relation_mm54tq30', // Departamento
  'location_mm51e7g7', // Ubicación Circulacion
  'file_mm51jy06', // Libreta de Conducir / Carta Automovil
  'file_mm5pc008', // Cedula
  'file_mm5bzdd4', // Poliza
  'color_mm5ejysv', // Crear Poliza (estado)
  'color_mm51n4j', // Posee Vehiculo?
  'color_mm5rzrhk', // Leer Cedula y Archivo Automovil
]

const ITEMS_QUERY = `
  query GetOpportunities($boardId: ID!, $limit: Int!, $columnIds: [String!]) {
    boards(ids: [$boardId]) {
      items_page(limit: $limit) {
        items {
          id
          name
          column_values(ids: $columnIds) {
            id
            text
            ... on BoardRelationValue {
              display_value
            }
          }
          subitems {
            column_values(ids: ["dropdown_mm51f4va", "dropdown_mm4w8n8p"]) {
              id
              text
            }
          }
        }
      }
    }
  }
`

// Columnas de subitem: solo datos de entrada — el precio y los textos INCLUYE se
// recalculan/arman en JS (pricingEngine.js) a partir de estas más el tarifario
// centralizado en el tablero PANEL (services/recargoPanel.js), no de columnas
// "formula_..." del subitem (esas se sacaron del tablero: eran demasiado frágiles,
// se rompían en cadena cada vez que se borraba alguna de la que dependían).
const SUBITEM_COLUMN_IDS = [
  'dropdown_mm4w8n8p', // Cobertura
  'dropdown_mm51f4va', // Compañías de Seguro
  'numeric_mm4pc2y1', // Contado/Costo
  'numeric_mm519my9', // Deducible (base)
  'numeric_mm59qzvf', // Deducible SANCOR (USD)
  'numeric_mm592zyk', // Edad
  'dropdown_mm52dm1j', // Deducible BSE
  'dropdown_mm5fb4y0', // Deducible SURA (recreada — la original dropdown_mm58af0r se borró)
  'numeric_mm52ey7f', // Bonif
  'dropdown_mm52p7yx', // Edad BSE
  'dropdown_mm5954ma', // RC
  'numeric_mm52qx0e', // Recargo 3 Cuotas
  'numeric_mm529754', // Recargo 6 Cuotas
  'numeric_mm52xw0m', // Recargo 8 Cuotas
  'numeric_mm52bnpa', // Recargo 10 Cuotas
  'boolean_mm4wjdnw', // Incluir Propuesta
  'boolean_mm5bn41n', // Propuesta elegida
  'boolean_mm5fsr46', // Granizo (opcional PORTO)
  'boolean_mm5fqazp', // Cristales (opcional PORTO)
  'boolean_mm5fxd9x', // Coche Cortesía (opcional PORTO)
]

const OPPORTUNITY_DETAIL_QUERY = `
  query GetOpportunityDetail($itemId: ID!, $columnIds: [String!], $subitemColumnIds: [String!]) {
    items(ids: [$itemId]) {
      id
      name
      column_values(ids: $columnIds) {
        id
        text
        ... on BoardRelationValue {
          display_value
        }
      }
      subitems {
        id
        name
        column_values(ids: $subitemColumnIds) {
          id
          text
        }
      }
    }
  }
`

// Metadata de columnas (labels, colores, dropdowns) leida en el momento — no se
// hardcodean opciones ni colores, para que reflejen siempre la config actual del tablero.
const COLUMNS_SETTINGS_QUERY = `
  query GetColumnsSettings($boardId: ID!, $columnIds: [String!]) {
    boards(ids: [$boardId]) {
      columns(ids: $columnIds) {
        id
        title
        type
        settings_str
      }
    }
  }
`

// Escritura real a monday. change_simple_column_value sirve para columnas de texto,
// numero, fecha, ubicacion (como texto simple), dropdown y status (por label).
// Usada por el botón "Cotizar" del paso 1 y por la edición de campos del paso Cotizar.
const CHANGE_SIMPLE_VALUE_MUTATION = `
  mutation ChangeSimpleColumnValue($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
    change_simple_column_value(
      board_id: $boardId
      item_id: $itemId
      column_id: $columnId
      value: $value
      create_labels_if_missing: false
    ) {
      id
    }
  }
`

// Para columnas "conectada" (board_relation), el valor es un JSON con los ids de los
// items vinculados — no se puede escribir con change_simple_column_value.
const CHANGE_COLUMN_VALUE_MUTATION = `
  mutation ChangeColumnValue($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
    change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
      id
    }
  }
`

// Vaciar una columna "file" (botón "Eliminar" de Libreta/Carta/Póliza) no lo soporta
// change_simple_column_value (rechaza explícitamente FileColumn — ver
// /logica-monday-vibe.md). El mutation correcto es update_assets_on_item mandando
// "files: []" — reemplaza la lista completa de archivos de la columna por una vacía.
// Verificado contra la API real: limpió una columna que tenía un archivo cargado
// (quedó `text: ""` al releerla).
const CLEAR_FILE_COLUMN_MUTATION = `
  mutation ClearFileColumn($boardId: ID!, $itemId: ID!, $columnId: String!) {
    update_assets_on_item(board_id: $boardId, item_id: $itemId, column_id: $columnId, files: []) {
      id
    }
  }
`

const DEPARTAMENTOS_BOARD_ID = 18384987039

const DEPARTAMENTOS_QUERY = `
  query GetDepartamentos($boardId: ID!) {
    boards(ids: [$boardId]) {
      items_page(limit: 50) {
        items {
          id
          name
        }
      }
    }
  }
`

// Modelo (board_relation_mm5422v9) conecta con estos dos tableros de Autodata, que
// combinados superan los 15.000 ítems — a diferencia de Departamentos, no se pueden
// precargar enteros. V1 y V2 tienen cobertura de marcas/modelos distinta (no son
// duplicados uno del otro, confirmado contra la API real), así que hay que buscar en
// los dos y unir los resultados.
const AUTODATA_BOARD_IDS = [18421913144, 18421911963]

const SEARCH_AUTODATA_QUERY = `
  query SearchAutodata($boardId: ID!, $searchText: String!) {
    boards(ids: [$boardId]) {
      items_page(
        limit: 12
        query_params: { rules: [{ column_id: "name", compare_value: [$searchText], operator: contains_text }] }
      ) {
        items {
          id
          name
        }
      }
    }
  }
`

export async function searchAutodataModelos(searchText) {
  const term = (searchText ?? '').trim()
  if (term.length < 2) return []
  const results = await Promise.all(
    AUTODATA_BOARD_IDS.map((boardId) => callMondayApi(SEARCH_AUTODATA_QUERY, { boardId, searchText: term }))
  )
  return results.flatMap((data) => data.boards[0]?.items_page.items ?? [])
}

// Tablero "PANEL": tarifario de recargos por compañía + cantidad de cuotas, textos
// INCLUYE por compañía + cobertura, y valores de configuración (todo centralizado acá,
// no en el tablero de subitems de la oportunidad) — se distingue por la columna
// "Grupo" (status: Cuotas / Incluye / Configuracion). El recargo (`numeric_mm52yezv`,
// "Recarg") es una sola columna numérica simple para las 4 compañías — antes SANCOR
// tenía una columna FORMULA aparte (con un valor de prueba que nunca se terminó de
// cargar bien); se unificó todo en esta única columna, sin fórmulas.
const PANEL_BOARD_ID = 18421072511

const PANEL_ITEMS_QUERY = `
  query GetPanelItems($boardId: ID!) {
    boards(ids: [$boardId]) {
      items_page(limit: 100) {
        items {
          id
          name
          column_values(ids: [
            "color_mm5fdknw",
            "numeric_mm52f3n3",
            "dropdown_mm52feqr",
            "numeric_mm52yezv",
            "dropdown_mm5frxag",
            "text_mm5f1wnh",
            "numeric_mm5fmjh0"
          ]) {
            id
            text
          }
        }
      }
    }
  }
`

// Cuando "Estado Cotizacion" o "Estado Envio" caen en "Error", el robot/automatización
// que genera las cotizaciones o el escenario de Make.com que envía por WhatsApp postea
// el detalle del error como un Update nativo de monday sobre el ítem — no una columna
// propia. `updates` viene ordenado del más nuevo al más viejo (confirmado contra la API
// real). Traemos varios (no solo el último) porque, si las dos automatizaciones llegan a
// fallar cerca en el tiempo, el Update más reciente puede pertenecer a la otra — hace
// falta poder buscar hacia atrás el último que arranque con el tag del paso que nos
// importa (ver `tag` en fetchLatestUpdate). `text_body` ya viene en texto plano (sin el
// HTML de `body`), listo para mostrar tal cual.
const LATEST_UPDATE_QUERY = `
  query GetLatestUpdates($itemId: ID!) {
    items(ids: [$itemId]) {
      updates(limit: 15) {
        text_body
        created_at
      }
    }
  }
`

async function callMondayApi(query, variables) {
  const response = await fetch('/api/monday', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  const payload = await response.json()
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message)
  }
  return payload.data
}

export async function fetchOpportunities(limit = 10) {
  const data = await callMondayApi(ITEMS_QUERY, {
    boardId: OPPORTUNITIES_BOARD_ID,
    limit,
    columnIds: OPPORTUNITY_COLUMN_IDS,
  })
  return data.boards[0]?.items_page.items ?? []
}

export async function fetchOpportunityDetail(itemId) {
  const data = await callMondayApi(OPPORTUNITY_DETAIL_QUERY, {
    itemId,
    columnIds: OPPORTUNITY_COLUMN_IDS,
    subitemColumnIds: SUBITEM_COLUMN_IDS,
  })
  return data.items?.[0] ?? null
}

export async function fetchColumnsSettings(columnIds, boardId = OPPORTUNITIES_BOARD_ID) {
  const data = await callMondayApi(COLUMNS_SETTINGS_QUERY, {
    boardId,
    columnIds,
  })
  return data.boards[0]?.columns ?? []
}

export async function setSimpleColumnValue(itemId, columnId, value) {
  const data = await callMondayApi(CHANGE_SIMPLE_VALUE_MUTATION, {
    boardId: OPPORTUNITIES_BOARD_ID,
    itemId,
    columnId,
    value: value ?? '',
  })
  return data.change_simple_column_value
}

export async function setConnectedColumnValue(itemId, columnId, linkedItemIds) {
  const data = await callMondayApi(CHANGE_COLUMN_VALUE_MUTATION, {
    boardId: OPPORTUNITIES_BOARD_ID,
    itemId,
    columnId,
    value: JSON.stringify({ item_ids: linkedItemIds }),
  })
  return data.change_column_value
}

// Columna "checkbox" (boolean_mm5bn41n, Propuesta elegida): change_simple_column_value
// no la soporta (la API responde error explícito para BooleanColumn), hace falta
// change_column_value con un JSON {"checked":"true"|"false"} contra el tablero de
// subitems (no el de oportunidades).
export async function setSubitemCheckboxValue(subitemId, columnId, checked) {
  const data = await callMondayApi(CHANGE_COLUMN_VALUE_MUTATION, {
    boardId: SUBITEMS_BOARD_ID,
    itemId: subitemId,
    columnId,
    value: JSON.stringify({ checked: checked ? 'true' : 'false' }),
  })
  return data.change_column_value
}

// Subir un archivo a una columna "file" (p. ej. Libreta de Conducir / Carta Automóvil,
// paso 3 "Confirmar") es la única mutation de esta API que no es JSON: usa la variable
// GraphQL especial "File!" y hay que mandarla como multipart/form-data al endpoint
// dedicado /v2/file (no /v2), con la convención de monday `variables[file]` para el
// binario — no el multipart-spec genérico de `map`/`operations`. item_id y column_id
// van embebidos como literales en la query (no como variables) porque solo "file"
// necesita serlo; itemId es siempre numérico y columnId siempre una de nuestras propias
// constantes, así que no hay riesgo de inyección.
export async function uploadFileToColumn(itemId, columnId, file) {
  const formData = new FormData()
  formData.append(
    'query',
    `mutation ($file: File!) { add_file_to_column (item_id: ${itemId}, column_id: "${columnId}", file: $file) { id } }`
  )
  formData.append('variables[file]', file, file.name)

  const response = await fetch('/api/monday-file', { method: 'POST', body: formData })
  const payload = await response.json()
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message)
  }
  return payload.data?.add_file_to_column
}

export async function clearFileColumn(itemId, columnId) {
  const data = await callMondayApi(CLEAR_FILE_COLUMN_MUTATION, {
    boardId: OPPORTUNITIES_BOARD_ID,
    itemId,
    columnId,
  })
  return data.update_assets_on_item
}

// `tag` (p. ej. "[COTIZAR]" o "[ENVIO]") filtra a los Updates que arrancan con ese
// prefijo, así el error del paso 2 (cotización) no se confunde con el del envío por
// WhatsApp cuando ambos existen sobre el mismo ítem. Sin `tag`, devuelve el más reciente
// sin filtrar (comportamiento anterior).
export async function fetchLatestUpdate(itemId, tag) {
  const data = await callMondayApi(LATEST_UPDATE_QUERY, { itemId })
  const updates = data.items?.[0]?.updates ?? []
  if (!tag) return updates[0] ?? null
  return updates.find((u) => u.text_body?.trim().startsWith(tag)) ?? null
}

export async function fetchDepartamentos() {
  const data = await callMondayApi(DEPARTAMENTOS_QUERY, { boardId: DEPARTAMENTOS_BOARD_ID })
  return data.boards[0]?.items_page.items ?? []
}

export async function fetchPanelItems() {
  const data = await callMondayApi(PANEL_ITEMS_QUERY, { boardId: PANEL_BOARD_ID })
  return data.boards[0]?.items_page.items ?? []
}
