import mondaySdk from 'monday-sdk-js'

// SDK cliente de monday (no confundir con `callMondayApi` de acá abajo, que pega
// contra /api/monday con la API key del servidor) — se usa solo para lo que hace
// falta el contexto del VIEWER (quién está mirando la app ahora mismo dentro de
// monday), ver fetchCurrentMondayUser más abajo. `monday.get('context')` habla por
// postMessage con la ventana padre (monday.com) — fuera de ese iframe (dev local,
// preview de Vercel abierta suelta) nunca llega respuesta, por eso esa función corre
// con un timeout en vez de esperar para siempre.
const monday = mondaySdk()

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
  'numeric_mm658a9j', // Recotizaciones
  'color_mm51n7aa', // Estado Cotizacion
  'color_mm51mm5v', // Tipo de Sujeto
  'color_mm4wr1t4', // Estado Envio
  'numeric_mm527wpm', // Edad
  'dropdown_mm5jqdk', // Tipo
  'date_mm516agw', // Fecha Nacimiento
  'board_relation_mm54tq30', // Departamento
  'board_relation_mm5sqf8t', // Localidad (reemplaza a la vieja Ubicación Circulacion)
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
      items_count
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

// Crea la oportunidad desde el formulario "Agregar Oportunidades" — SIN column_values.
// Ojo, esto es a propósito: si el create_item incluye column_values en el mismo
// mutation, monday no dispara las automatizaciones de "cuando cambia esta columna"
// (ni siquiera algunas de "cuando se crea el ítem" si dependen del valor inicial de una
// columna) — el valor queda asentado como estado inicial, no como un "cambio" real que
// el motor de automatizaciones pueda escuchar. Confirmado por el problema real: la
// automatización de "cuando se crea el ítem, hacer algo" no disparaba con el
// create_item viejo que sí mandaba column_values. Por eso ahora el ítem se crea pelado
// y todos los valores se asientan después, en un segundo mutation separado
// (setMultipleColumnValues) — eso sí genera eventos de cambio reales.
const CREATE_ITEM_MUTATION = `
  mutation CreateOpportunity($boardId: ID!, $itemName: String!) {
    create_item(board_id: $boardId, item_name: $itemName) {
      id
    }
  }
`

export async function createOpportunityItem(itemName) {
  const data = await callMondayApi(CREATE_ITEM_MUTATION, {
    boardId: OPPORTUNITIES_BOARD_ID,
    itemName,
  })
  return data.create_item
}

// delete_item no pide board_id (el item_id ya identifica el tablero solo) — sirve tanto
// para un ítem de Oportunidades como de Clientes. A pedido: rollback de "Guardar" en
// CrearOportunidadForm.jsx — si falla algún paso DESPUÉS de crear el ítem (y/o el
// Cliente nuevo), se borran acá para no dejar ítems huérfanos a medio cargar en monday
// (la operación completa es atómica: se hace toda, o no queda nada).
const DELETE_ITEM_MUTATION = `
  mutation DeleteItem($itemId: ID!) {
    delete_item(item_id: $itemId) {
      id
    }
  }
`

export async function deleteItem(itemId) {
  await callMondayApi(DELETE_ITEM_MUTATION, { itemId })
}

// column_values va como JSON *stringificado* (mismo motivo que change_column_value: el
// scalar "JSON" de monday espera un string con el JSON adentro, no un objeto anidado,
// confirmado ya varias veces contra la API real).
const CHANGE_MULTIPLE_COLUMN_VALUES_MUTATION = `
  mutation ChangeMultipleColumnValues($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
    change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
      id
    }
  }
`

export async function setMultipleColumnValues(itemId, columnValues) {
  const data = await callMondayApi(CHANGE_MULTIPLE_COLUMN_VALUES_MUTATION, {
    boardId: OPPORTUNITIES_BOARD_ID,
    itemId,
    columnValues: JSON.stringify(columnValues),
  })
  return data.change_multiple_column_values
}

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

// Localidad (board_relation_mm5sqf8t, "📍Localidades") en el formulario de "Agregar
// Oportunidades" — 475 ítems (confirmado contra la API real), se puede precargar
// entero de una sola vez (limit 500, por debajo del máximo de items_page). A
// diferencia de Departamentos, acá también hace falta la columna "Departamento"
// (text_mm5wbef5, texto simple con el nombre — no el board_relation
// board_relation_mm5sq5km, que devuelve `text: null` como cualquier board_relation) para
// poder filtrar las localidades por el departamento elegido en el formulario.
const LOCALIDADES_BOARD_ID = 18424578859
const LOCALIDAD_DEPARTAMENTO_COLUMN_ID = 'text_mm5wbef5'

const LOCALIDADES_QUERY = `
  query GetLocalidades($boardId: ID!) {
    boards(ids: [$boardId]) {
      items_page(limit: 500) {
        items {
          id
          name
          column_values(ids: ["${LOCALIDAD_DEPARTAMENTO_COLUMN_ID}"]) {
            id
            text
          }
        }
      }
    }
  }
`

// Modelo (board_relation_mm5422v9) conecta con estos dos tableros de Autodata, que
// combinados superan los 15.000 ítems — a diferencia de Departamentos, no se pueden
// precargar enteros. V1 y V2 tienen cobertura de marcas/modelos distinta (no son
// duplicados uno del otro, confirmado contra la API real) y usan IDs DE COLUMNA
// DISTINTOS para los mismos conceptos, así que todo lo de Autodata queda parametrizado
// por tablero acá en vez de asumir una columna compartida.
const AUTODATA_BOARDS = [
  {
    boardId: 18421913144,
    modeloColumnId: 'text_mm58391w', // "Modelo" (texto simple, más preciso que "name" para buscar)
    marcaColumnId: 'dropdown_mm581chr',
    anioColumnId: 'dropdown_mm584cbx',
    combustibleColumnId: 'dropdown_mm5wybn4',
    tipoColumnId: 'dropdown_mm5w8xbm',
  },
  {
    boardId: 18421911963,
    modeloColumnId: 'text_mm58pyh1',
    marcaColumnId: 'dropdown_mm5861x5',
    anioColumnId: 'dropdown_mm583r6w',
    combustibleColumnId: 'dropdown_mm5w74r6',
    tipoColumnId: 'dropdown_mm5wx4s6',
  },
]

// $rules/$operator van tipados como los input types reales de la API (ItemsQueryRule/
// ItemsQueryOperator), no como un JSON genérico — confirmado que se puede pasar un
// array de reglas armado dinámicamente en JS como variable GraphQL normal. $columnIds
// trae Combustible/Tipo del ítem elegido, para autocompletar esos campos del
// formulario (ver CrearOportunidadForm.jsx).
const SEARCH_AUTODATA_QUERY = `
  query SearchAutodata($boardId: ID!, $rules: [ItemsQueryRule!], $operator: ItemsQueryOperator, $columnIds: [String!], $limit: Int!) {
    boards(ids: [$boardId]) {
      items_page(limit: $limit, query_params: { rules: $rules, operator: $operator }) {
        items {
          id
          name
          column_values(ids: $columnIds) {
            id
            text
          }
        }
      }
    }
  }
`

// Selecciona el ÍTEM entero (id + name, para la conexión board_relation) aunque el
// filtro haya sido sobre la columna "Modelo" puntual, no sobre "name" — más
// combustible/tipo ya resueltos para autocompletar.
function mapAutodataItem(item, board) {
  const cv = Object.fromEntries(item.column_values.map((c) => [c.id, c.text]))
  return {
    id: item.id,
    name: item.name,
    combustible: cv[board.combustibleColumnId] || null,
    tipo: cv[board.tipoColumnId] || null,
  }
}

async function queryAutodataBoards(buildRules, operator, limit) {
  const results = await Promise.all(
    AUTODATA_BOARDS.map(async (board) => {
      const data = await callMondayApi(SEARCH_AUTODATA_QUERY, {
        boardId: board.boardId,
        rules: buildRules(board),
        operator,
        limit,
        columnIds: [board.combustibleColumnId, board.tipoColumnId],
      })
      const items = data.boards[0]?.items_page.items ?? []
      return items.map((item) => mapAutodataItem(item, board))
    })
  )
  return results.flat()
}

// A pedido: la búsqueda apunta puntualmente a la columna "Modelo" de cada tablero
// (texto simple, ej. "Corolla") en vez de "name" (que trae de arreastre la marca y la
// ficha completa, ej. "TOYOTA  - Corolla 1.6 4p. (E20)") — más preciso para buscar,
// aunque lo que se selecciona/guarda sigue siendo el ítem entero. Separa por palabras
// (AND) para no depender del orden ni de coincidencia exacta del texto completo; si no
// encuentra nada, reintenta con OR. Como ya es una búsqueda por texto bastante
// específica, alcanza con un límite chico.
export async function searchAutodataModelos(searchText) {
  const term = (searchText ?? '').trim()
  if (term.length < 2) return []
  const words = term.split(/\s+/).filter(Boolean)
  const buildRules = (board) =>
    words.map((word) => ({ column_id: board.modeloColumnId, compare_value: [word], operator: 'contains_text' }))

  const andResults = await queryAutodataBoards(buildRules, 'and', 12)
  if (andResults.length > 0 || words.length < 2) return andResults

  return queryAutodataBoards(buildRules, 'or', 12)
}

// Modelo cuando "Posee Vehículo" = "No": en vez de buscar por texto libre, se arma con
// Año + Marca ya elegidos en el formulario, mostrando solo los modelos reales que
// existen para esa combinación en cualquiera de los dos tableros de Autodata. contains_text
// funciona sobre columnas dropdown, no hace falta resolver el id interno de la label
// (que además difiere entre V1 y V2 para la misma marca/año). 500 (el máximo real de
// items_page por página) en vez de 100: confirmado contra la API real que Marca+Año
// solos (sin "Modelo") pueden matchear MUCHO más de 100 variantes — Peugeot 2006 solo en
// V1 son 135 — con el límite de 100 de antes, un modelo real (ej. "Boxer Minibus 1905cc
// Turbo Diesel") quedaba afuera de la lista sin que se notara que existía.
export async function fetchAutodataModelosByAnioMarca(anio, marca) {
  if (!anio || !marca) return []
  const buildRules = (board) => [
    { column_id: board.marcaColumnId, compare_value: [marca], operator: 'contains_text' },
    { column_id: board.anioColumnId, compare_value: [anio], operator: 'contains_text' },
  ]
  return queryAutodataBoards(buildRules, 'and', 500)
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

// `value` (a diferencia de `text`) es el único campo que trae el assetId real de una
// columna "file" — `text` da una URL de "protected_static" que exige sesión de monday
// logueada (devuelve 302 a /users/sign_in si se pide directo, confirmado a mano), así
// que no sirve para descargar el archivo del lado del cliente. Con el assetId sí se
// puede pedir una URL firmada de S3 vía `assets` (ver /api/monday-asset).
const FILE_COLUMN_VALUE_QUERY = `
  query GetFileColumnValue($itemId: ID!, $columnId: [String!]) {
    items(ids: [$itemId]) {
      column_values(ids: $columnId) {
        value
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

// 500 es el máximo real que acepta items_page por página en la API de monday — con eso
// alcanza de sobra para el tamaño actual del tablero (una sola consulta, sin paginar por
// cursor). Devuelve también items_count (el total REAL del tablero, sin el límite) para
// poder avisar si algún día se llega a superar ese techo en vez de truncar en silencio
// (ver App.jsx, boardTotalCount).
export async function fetchOpportunities(limit = 500) {
  const data = await callMondayApi(ITEMS_QUERY, {
    boardId: OPPORTUNITIES_BOARD_ID,
    limit,
    columnIds: OPPORTUNITY_COLUMN_IDS,
  })
  const board = data.boards[0]
  return { items: board?.items_page.items ?? [], totalCount: board?.items_count ?? 0 }
}

export async function fetchOpportunityDetail(itemId) {
  const data = await callMondayApi(OPPORTUNITY_DETAIL_QUERY, {
    itemId,
    columnIds: OPPORTUNITY_COLUMN_IDS,
    subitemColumnIds: SUBITEM_COLUMN_IDS,
  })
  return data.items?.[0] ?? null
}

// Consulta liviana (sin column_values) para saber si un ítem sigue activo — a pedido,
// CrearOportunidadForm.jsx la usa para validar que el Cliente/Lead restaurado de
// localStorage (ver PERSISTED_SEARCH_KEY, hasta 10 minutos viejo) siga existiendo antes
// de reusarlo, en vez de descubrirlo recién al fallar "Guardar". `items()` devuelve
// null/vacío para un id que ya no existe en absoluto (no solo borrado, purgado del
// todo) — de ahí el `?? null`.
const ITEM_STATE_QUERY = `
  query GetItemState($itemId: ID!) {
    items(ids: [$itemId]) {
      id
      name
      state
    }
  }
`

export async function fetchItemState(itemId) {
  const data = await callMondayApi(ITEM_STATE_QUERY, { itemId })
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

// Para columnas tipo "dropdown" NO alcanza con change_simple_column_value/un string
// pelado: confirmado contra la API real que si el label es una cadena puramente
// numérica (ej. un Año como "2006"), monday lo interpreta como el ID interno del label
// en vez de buscarlo por nombre — como esos IDs no coinciden con los reales, el campo
// queda vacío en silencio (no tira error, así que el resto del guardado se ve exitoso).
// El formato que sí resuelve por nombre de forma confiable es el objeto {"labels": [...]}
// vía change_multiple_column_values.
export function dropdownColumnValue(label) {
  return { labels: label ? [label] : [] }
}

export async function setDropdownColumnValue(itemId, columnId, label) {
  return setMultipleColumnValues(itemId, { [columnId]: dropdownColumnValue(label) })
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

// Escenario de Make que lee la Carta Automóvil con IA y devuelve los datos que pudo
// extraer — a pedido, reemplaza al flujo viejo (subir el archivo a un ítem de
// Oportunidad ya creado y esperar a que una automatización de monday lo leyera,
// escribiendo el resultado en columnas del propio ítem). Ahora el archivo se manda
// directo acá, sin crear nada en monday todavía — el ítem de la Oportunidad recién se
// crea al final del paso 3 (ver handleGuardar en CrearOportunidadForm.jsx), ya con los
// datos que haya podido extraer este webhook.
//
// Va a nuestro propio proxy (/api/leer-carta-automovil, ver vite.config.js /
// api/leer-carta-automovil.js), NO directo a la URL de Make — mismo motivo que
// makeWebhook.js: la URL real queda solo en una variable de entorno del lado del
// servidor (MAKE_CARTA_AUTOMOVIL_WEBHOOK_URL, sin prefijo VITE_ a propósito, para que
// nunca llegue al bundle del navegador) y de paso evita el problema de CORS de pegarle
// directo a un Custom Webhook de Make desde el cliente.
export async function leerCartaAutomovil(file) {
  const formData = new FormData()
  formData.append('file', file, file.name)
  const response = await fetch('/api/leer-carta-automovil', { method: 'POST', body: formData })
  if (!response.ok) {
    throw new Error(`El escenario de Make devolvió un error (${response.status})`)
  }
  // El escenario responde directo con el JSON de los datos que pudo extraer
  // (Año/Marca/Combustible/Tipo/Uso, o "error" si no pudo leer nada, ver
  // handleCartaAutomovilChange en CrearOportunidadForm.jsx) — sin envoltorio.
  return response.json()
}

// Escenario de Make que lee la Cédula de Identidad con IA al crear un Lead desde cero
// (ver handleCedulaLeadChange en CrearOportunidadForm.jsx) — mismo patrón que
// leerCartaAutomovil de acá arriba: va a nuestro propio proxy (/api/leer-cedula, ver
// vite.config.js / api/leer-cedula.js), NO directo a la URL de Make (queda solo en
// MAKE_LEER_CEDULA_WEBHOOK_URL del lado del servidor, ver .env). El escenario responde
// con { nombre_completo, ci, fecha_nacimineto, departametno, localidad } — esos 2
// nombres de campo (fecha_nacimineto/departametno) están así, con el typo y todo, en el
// escenario real de Make; CrearOportunidadForm.jsx los lee tal cual llegan.
export async function leerCedula(file) {
  const formData = new FormData()
  formData.append('file', file, file.name)
  const response = await fetch('/api/leer-cedula', { method: 'POST', body: formData })
  if (!response.ok) {
    throw new Error(`El escenario de Make devolvió un error (${response.status})`)
  }
  return response.json()
}

export async function clearFileColumn(itemId, columnId) {
  const data = await callMondayApi(CLEAR_FILE_COLUMN_MUTATION, {
    boardId: OPPORTUNITIES_BOARD_ID,
    itemId,
    columnId,
  })
  return data.update_assets_on_item
}

// A pedido: al elegir en el buscador una Oportunidad que ya tiene Cédula Identidad
// subida, se reusa ese mismo archivo para el campo de acá en vez de tener que volver a
// subirlo a mano (ver handleResultadoSeleccionado en CrearOportunidadForm.jsx). Devuelve
// null si la columna está vacía — no hay nada raro que avisar, simplemente no hay
// archivo para reusar.
export async function fetchFileColumnAsset(itemId, columnId) {
  const data = await callMondayApi(FILE_COLUMN_VALUE_QUERY, { itemId, columnId: [columnId] })
  const raw = data.items?.[0]?.column_values?.[0]?.value
  if (!raw) return null
  const parsed = JSON.parse(raw)
  const file = parsed.files?.[0]
  if (!file?.assetId) return null
  return { assetId: file.assetId, name: file.name }
}

// Descarga el archivo real y lo devuelve como File (mismo tipo que entrega
// <input type="file">) — así encaja tal cual en el resto del flujo de FileField/
// handleCedulaIdentidadChange, sin tocar esa lógica. El assetId se resuelve del lado del
// servidor (ver /api/monday-asset, vite.config.js y api/monday-asset.js) para conseguir
// una URL firmada de S3 y bajarla ahí mismo — misma razón que el resto de los proxies de
// esta app: mantener el API key del lado del servidor, y evitar cualquier sorpresa de
// CORS pegándole directo a un dominio ajeno desde el navegador.
export async function fetchFileColumnAsFile(itemId, columnId) {
  const asset = await fetchFileColumnAsset(itemId, columnId)
  if (!asset) return null
  const response = await fetch(`/api/monday-asset?assetId=${asset.assetId}`)
  if (!response.ok) return null
  const blob = await response.blob()
  return new File([blob], asset.name, { type: blob.type })
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

export async function fetchLocalidades() {
  const data = await callMondayApi(LOCALIDADES_QUERY, { boardId: LOCALIDADES_BOARD_ID })
  const items = data.boards[0]?.items_page.items ?? []
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    departamento: item.column_values.find((cv) => cv.id === LOCALIDAD_DEPARTAMENTO_COLUMN_ID)?.text ?? '',
  }))
}

const CURRENT_USER_QUERY = `
  query GetUser($userId: [ID!]) {
    users(ids: $userId) {
      name
      photo_thumb_small
    }
  }
`

// Corre una promesa con un techo — sin esto, monday.get('context') se queda esperando
// para siempre si la app no está corriendo adentro del iframe real de monday.com (dev
// local, una preview de Vercel abierta suelta en una pestaña) porque esa respuesta
// llega por postMessage desde la ventana padre, que ahí no existe.
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
}

// A pedido: nombre + foto de perfil de la persona que está mirando la app AHORA MISMO
// dentro de monday (Sidebar.jsx, pie de la barra) — a diferencia del resto de este
// archivo (que pega contra /api/monday con la API key del servidor, siempre la misma
// "cuenta de servicio"), esto necesita el SDK cliente de monday para preguntarle a la
// ventana padre quién es el usuario actual. Devuelve null (sin tirar error) si no hay
// contexto de monday disponible (dev/preview standalone) o si algo falla — Sidebar.jsx
// se queda con su fallback genérico en ese caso, nunca rompe la barra.
export async function fetchCurrentMondayUser() {
  try {
    const context = await withTimeout(monday.get('context'), 4000)
    const userId = context?.data?.user?.id
    if (!userId) return null
    const data = await callMondayApi(CURRENT_USER_QUERY, { userId: [String(userId)] })
    const user = data.users?.[0]
    if (!user) return null
    return { name: user.name, photo: user.photo_thumb_small || null }
  } catch {
    return null
  }
}

export async function fetchPanelItems() {
  const data = await callMondayApi(PANEL_ITEMS_QUERY, { boardId: PANEL_BOARD_ID })
  return data.boards[0]?.items_page.items ?? []
}

// Tablero "Clientes" — fuente ÚNICA de búsqueda/autocompletado del formulario "Agregar
// Oportunidades" (reemplaza al esquema anterior de 2 tableros separados: Contactos +
// una búsqueda aparte contra Oportunidades para "Lead"). Un mismo ítem de acá puede ser
// "Cliente" (contacto completo) o "Lead" (persona encontrada a través de una Oportunidad
// vieja, datos más livianos) — CONTACTO_ESTADO_COLUMN_ID dice cuál es de los dos, ya no
// hace falta adivinarlo por en qué tablero apareció.
const CLIENTES_BOARD_ID = 18420863014
const CONTACTO_ESTADO_COLUMN_ID = 'color_mm6570m0' // "Situación": Cliente | Lead
const CONTACTO_CI_COLUMN_ID = 'text_mm4vk9aq'
const CONTACTO_TELEFONO_COLUMN_ID = 'phone_mm65zhnn'
const CONTACTO_FECHA_NACIMIENTO_COLUMN_ID = 'date_mm65sgmw'
const CONTACTO_CI_FRENTE_COLUMN_ID = 'file_mm65486d'
const CONTACTO_LOCALIDAD_COLUMN_ID = 'board_relation_mm65e7he'
// A diferencia de antes (mirror automático desde Localidad), ahora es una conexión
// propia e independiente al mismo tablero de Departamentos que ya usa fetchDepartamentos
// (DEPARTAMENTOS_BOARD_ID) — la consistencia entre los dos la garantiza el propio
// formulario (el Dropdown de Localidad ya se filtra por el Departamento elegido, ver
// CrearOportunidadForm.jsx), no hace falta un mirror de un lado al otro.
const CONTACTO_DEPARTAMENTO_COLUMN_ID = 'board_relation_mm657jse'
const CONTACTO_OPORTUNIDADES_COLUMN_ID = 'board_relation_mm4tpep2'
// Columna en el tablero OPORTUNIDADES (no Clientes) que guarda la misma relación del
// otro lado — se escribe acá cuando se crea una Oportunidad nueva para que el historial
// de "oportunidades vinculadas" del Cliente se arme solo, sin backfill manual.
// board_relation_mm4t623x (la vieja) seguía conectada al tablero Contactos de antes —
// escribirle un id de Clientes (18420863014) tiraba "There are items that are not in
// the connected boards". mm4qg1n2 es la columna nueva, ya conectada a Clientes.
const OPORTUNIDAD_CONTACTO_COLUMN_ID = 'board_relation_mm4qg1n2'

const SEARCH_CONTACTOS_QUERY = `
  query SearchContactos($boardId: ID!, $rules: [ItemsQueryRule!], $limit: Int!) {
    boards(ids: [$boardId]) {
      items_page(limit: $limit, query_params: { rules: $rules, operator: and }) {
        items {
          id
          name
          column_values(ids: ["${CONTACTO_ESTADO_COLUMN_ID}", "${CONTACTO_CI_COLUMN_ID}", "${CONTACTO_TELEFONO_COLUMN_ID}", "${CONTACTO_FECHA_NACIMIENTO_COLUMN_ID}", "${CONTACTO_LOCALIDAD_COLUMN_ID}", "${CONTACTO_DEPARTAMENTO_COLUMN_ID}"]) {
            id
            text
            value
            ... on BoardRelationValue {
              display_value
            }
          }
        }
      }
    }
  }
`

function mapContactoItem(item) {
  const byId = Object.fromEntries(item.column_values.map((cv) => [cv.id, cv]))
  // Mismo formato que phone_mm519m27 de Oportunidades: el código de país solo está en
  // el JSON de "value", no en "text".
  let telefono = ''
  let telefonoCountryShortName = ''
  try {
    const parsedPhone = byId[CONTACTO_TELEFONO_COLUMN_ID]?.value
      ? JSON.parse(byId[CONTACTO_TELEFONO_COLUMN_ID].value)
      : null
    telefono = parsedPhone?.phone || ''
    telefonoCountryShortName = parsedPhone?.countryShortName || ''
  } catch {
    // sin teléfono usable — se deja vacío en vez de romper el resto del resultado
  }
  const situacion = byId[CONTACTO_ESTADO_COLUMN_ID]?.text?.trim() || ''
  return {
    id: item.id,
    name: item.name,
    // Mismos ids internos que ya usa el resto de la app (source) — 'lead' solo si la
    // Situación dice explícitamente eso, 'contacto' para cualquier otro caso (incluido
    // sin valor cargado, mismo criterio conservador que antes).
    source: situacion.toLowerCase() === 'lead' ? 'lead' : 'contacto',
    situacion,
    // CI ahora es una columna de texto libre (antes numérica) — se limpia a solo
    // dígitos acá mismo para que el resto de la app (comparaciones, dedup) siga
    // funcionando igual que cuando venía de una columna numérica pura.
    ci: (byId[CONTACTO_CI_COLUMN_ID]?.text || '').replace(/\D/g, ''),
    fechaNacimiento: byId[CONTACTO_FECHA_NACIMIENTO_COLUMN_ID]?.text?.trim() || '',
    telefono,
    telefonoCountryShortName,
    localidadNombre: byId[CONTACTO_LOCALIDAD_COLUMN_ID]?.display_value?.trim() || '',
    departamentoNombre: byId[CONTACTO_DEPARTAMENTO_COLUMN_ID]?.display_value?.trim() || '',
  }
}

// A pedido: el modo de búsqueda depende de qué se tipeó — si tiene algún dígito, se
// busca por Cédula; si es todo letras, por Nombre. No hace falta mezclar los dos modos
// en la misma consulta.
export async function searchContactos(term) {
  const query = (term ?? '').trim()
  if (query.length < 2) return []
  const isNumeric = /\d/.test(query)
  const rules = isNumeric
    ? [{ column_id: CONTACTO_CI_COLUMN_ID, compare_value: [query.replace(/\D/g, '')], operator: 'contains_text' }]
    : [{ column_id: 'name', compare_value: [query], operator: 'contains_text' }]
  const data = await callMondayApi(SEARCH_CONTACTOS_QUERY, { boardId: CLIENTES_BOARD_ID, rules, limit: 20 })
  const items = data.boards[0]?.items_page.items ?? []
  return items.map(mapContactoItem)
}

// Caso "el contacto no existe": antes de crear la oportunidad se avisa si esa Cédula YA
// está cargada como Cliente, para no duplicar sin darse cuenta. Filtra por coincidencia
// EXACTA después de la consulta (contains_text por sí solo matchearía de más, ej. "593"
// contra "45934226").
export async function findContactoByCedula(ci) {
  const digits = (ci ?? '').replace(/\D/g, '')
  if (!digits) return null
  const data = await callMondayApi(SEARCH_CONTACTOS_QUERY, {
    boardId: CLIENTES_BOARD_ID,
    rules: [{ column_id: CONTACTO_CI_COLUMN_ID, compare_value: [digits], operator: 'contains_text' }],
    limit: 5,
  })
  const items = data.boards[0]?.items_page.items ?? []
  return items.map(mapContactoItem).find((c) => c.ci === digits) ?? null
}

const FETCH_CONTACTO_OPORTUNIDADES_QUERY = `
  query FetchContactoOportunidades($itemId: [ID!], $columnIds: [String!]) {
    items(ids: $itemId) {
      column_values(ids: ["${CONTACTO_OPORTUNIDADES_COLUMN_ID}"]) {
        ... on BoardRelationValue {
          linked_items {
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
  }
`

// A pedido: el historial de "oportunidades anteriores" de un Contacto se lee directo de
// la relación real Contacto→Oportunidades (más precisa que escanear TODAS las
// oportunidades cargadas matcheando por CI, que dependía de que la Cédula estuviera bien
// tipeada en las 2 puntas). Devuelve los ítems CRUDOS (mismo shape que arma ITEMS_QUERY),
// listos para pasar por mapOpportunities (opportunityMapper.js) del lado del que llama.
export async function fetchContactoOportunidades(contactoId) {
  if (!contactoId) return []
  const data = await callMondayApi(FETCH_CONTACTO_OPORTUNIDADES_QUERY, {
    itemId: [contactoId],
    columnIds: OPPORTUNITY_COLUMN_IDS,
  })
  return data.items?.[0]?.column_values?.[0]?.linked_items ?? []
}

// Crea un Cliente nuevo cuando la Oportunidad se carga "desde cero" (sin elegir uno
// existente en el buscador) — a pedido, toda Oportunidad nueva queda con el campo
// Cliente completo, nunca vacío (ver setConnectedColumnValue con
// OPORTUNIDAD_CONTACTO_COLUMN_ID en el guardado). `columnValues` usa los mismos ids de
// columna que documenta mapContactoItem más arriba.
// Factoreado aparte de createContactoItem (que la llama para completar el ítem recién
// creado) para poder reusarla también al EDITAR un Cliente ya existente (ver el popup
// "Editar" en CrearOportunidadForm.jsx) — mismo mutation, solo cambia si el ítem es
// nuevo o no.
export async function setContactoColumnValues(itemId, columnValues) {
  if (!columnValues || Object.keys(columnValues).length === 0) return null
  const data = await callMondayApi(CHANGE_MULTIPLE_COLUMN_VALUES_MUTATION, {
    boardId: CLIENTES_BOARD_ID,
    itemId,
    columnValues: JSON.stringify(columnValues),
  })
  return data.change_multiple_column_values
}

export async function createContactoItem(itemName, columnValues) {
  const created = await callMondayApi(CREATE_ITEM_MUTATION, { boardId: CLIENTES_BOARD_ID, itemName })
  const id = created.create_item.id
  await setContactoColumnValues(id, columnValues)
  return { id }
}

export {
  OPORTUNIDAD_CONTACTO_COLUMN_ID,
  CONTACTO_CI_COLUMN_ID,
  CONTACTO_TELEFONO_COLUMN_ID,
  CONTACTO_FECHA_NACIMIENTO_COLUMN_ID,
  CONTACTO_LOCALIDAD_COLUMN_ID,
  CONTACTO_DEPARTAMENTO_COLUMN_ID,
  CONTACTO_CI_FRENTE_COLUMN_ID,
  CONTACTO_ESTADO_COLUMN_ID,
}
