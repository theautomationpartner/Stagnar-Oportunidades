// Lectura de `column_values` de la API de monday — antes reimplementado en
// opportunityMapper.js, quoteMapper.js, recargoPanel.js y en línea en
// OpportunityDetail.jsx (auditoría: una sola definición).

// Texto plano de una columna (status, texto, número, fecha…). '' si no está.
export function textOf(columnValues, columnId) {
  return columnValues?.find((cv) => cv.id === columnId)?.text?.trim() || ''
}

// Las columnas "conectada" (board_relation) devuelven `text` vacío/null vía API sin
// importar si tienen un ítem vinculado o no — hay que pedir `display_value` (fragmento
// GraphQL "... on BoardRelationValue", ver mondayApi.js) en su lugar. Confirmado contra
// la API real: `text` da `null` incluso en ítems con Departamento cargado.
export function boardRelationDisplayOf(columnValues, columnId) {
  return columnValues?.find((cv) => cv.id === columnId)?.display_value?.trim() || ''
}
