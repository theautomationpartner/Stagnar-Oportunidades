// Agrupa las coberturas (columna dropdown_mm4w8n8p del tablero de subitems) en 2
// familias de negocio — GLOBAL (cobertura todo riesgo) y TRIPLE (cobertura parcial) —
// para las solapas "Todo Riesgo / Parcial / General" del paso "Comparar y enviar"
// (las claves siguen siendo GLOBAL/TRIPLE, ver FAMILIA_LABEL). Verificado
// contra las labels reales del dropdown (settings_str vía API). "TOTAL C/ MOV" (SURA)
// se sacó de GLOBAL a pedido — queda sin familia, solo aparece en "General".
const GLOBAL_COBERTURAS = new Set([
  'GLOBAL - ANUAL',
  'GLOBAL - 3X2',
  'GLOBAL',
  'GLOBAL DED ALTO',
  'TOTAL 600',
  'TOTAL 800',
  'TOTAL 1500',
  'TOTAL 2500',
  'TOTAL',
  'TOTAL PLUS',
])

const TRIPLE_COBERTURAS = new Set(['TRIPLE - ANUAL', 'TRIPLE - 3X2', 'TRIPLE', 'PARCIAL', 'PARCIAL PLUS', '4 EN 1'])

// EST-03: "GLOBAL" y "TRIPLE" son los nombres internos que usa BSE para sus coberturas
// — como nombre de la FAMILIA (lo que ve el cliente y lo que dice el vendedor) van
// "Todo Riesgo" y "Parcial". Ojo: solo cambia la etiqueta visible. Las claves GLOBAL/
// TRIPLE siguen siendo las mismas en todo el código, y también viajan así en el nombre
// de archivo que consume Make (ver makeWebhook.js#buildImageFileName): renombrar la
// clave rompería ese contrato del lado del escenario.
export const FAMILIA_LABEL = {
  GLOBAL: 'Todo Riesgo',
  TRIPLE: 'Parcial',
}

// A pedido: GLOBAL primero (también la solapa que arranca activa por defecto, ver
// coberturaTabIndex en OpportunityDetail.jsx), después TRIPLE, General al final.
export const COBERTURA_TABS = [
  { key: 'GLOBAL', label: FAMILIA_LABEL.GLOBAL },
  { key: 'TRIPLE', label: FAMILIA_LABEL.TRIPLE },
  { key: 'general', label: 'General' },
]

// null si la cobertura no matchea ninguna de las 2 familias (dato viejo/inesperado) —
// en ese caso solo aparece en la solapa "General", nunca en GLOBAL ni TRIPLE.
export function coberturaGroupOf(cobertura) {
  const normalized = (cobertura ?? '').trim().toUpperCase()
  if (GLOBAL_COBERTURAS.has(normalized)) return 'GLOBAL'
  if (TRIPLE_COBERTURAS.has(normalized)) return 'TRIPLE'
  return null
}

// Descripción en una línea de cada familia — la usan la imagen de WhatsApp y la versión
// en texto (LOG-17), que tienen que decir lo mismo del mismo plan. Si la cobertura no
// cae en ninguna familia, quien la muestre arma un texto genérico con su nombre.
export const SUBTITULO_POR_FAMILIA = {
  GLOBAL: 'Cobertura completa del vehículo y responsabilidad civil.',
  TRIPLE: 'Responsabilidad civil, hurto e incendio.',
}
