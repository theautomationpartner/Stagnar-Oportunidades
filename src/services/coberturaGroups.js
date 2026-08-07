// Agrupa las coberturas (columna dropdown_mm4w8n8p del tablero de subitems) en 2
// familias de negocio — GLOBAL (cobertura todo riesgo) y TRIPLE (cobertura parcial) —
// para las solapas "General / GLOBAL / TRIPLE" del paso "Comparar y enviar". Verificado
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

export const COBERTURA_TABS = [
  { key: 'general', label: 'General' },
  { key: 'GLOBAL', label: 'GLOBAL' },
  { key: 'TRIPLE', label: 'TRIPLE' },
]

// null si la cobertura no matchea ninguna de las 2 familias (dato viejo/inesperado) —
// en ese caso solo aparece en la solapa "General", nunca en GLOBAL ni TRIPLE.
export function coberturaGroupOf(cobertura) {
  const normalized = (cobertura ?? '').trim().toUpperCase()
  if (GLOBAL_COBERTURAS.has(normalized)) return 'GLOBAL'
  if (TRIPLE_COBERTURAS.has(normalized)) return 'TRIPLE'
  return null
}
