export function formatMoney(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$ ${Number(value).toLocaleString('es-UY')}`
}

// Filtro de búsqueda para Dropdown (@vibe/core) searchable — a diferencia del filtro
// por defecto de la librería (que solo matchea desde el principio del label), esto
// filtra por palabra en CUALQUIER lugar de la opción: alcanza con escribir "Boxer
// Minibus" para encontrar "PEUGEOT - Boxer Minibus 1905 cc Turbo Diesel" aunque "Boxer"
// no sea la primera palabra. Compartido entre CrearOportunidadForm.jsx (todos sus
// campos searchable) y CotizarStepPanel.jsx (edición del paso "Cotizar").
export function matchesSearchQuery(label, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = label.toLowerCase()
  return words.every((word) => haystack.includes(word))
}
