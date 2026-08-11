export function formatMoney(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$ ${Number(value).toLocaleString('es-UY')}`
}

// Compartido entre QuoteCard.jsx (paso "Comparar y enviar") y ConfirmarStepPanel.jsx
// (paso "Confirmar", mismo lenguaje visual de tarjeta) — las 4 cuotas que trae toda
// cotización real (recargo3/6/8/10 en el subitem de monday, ver pricingEngine.js).
export const CUOTA_COUNTS = [3, 6, 8, 10]

// recargoN (raw[`recargo${n}`]) viene como fracción (0.079 = 7.9%) — mismo helper que
// usa QuoteCard.jsx para sus propios campos editables, reusado acá solo para mostrar
// (nunca para escribir de vuelta, eso se queda en QuoteCard.jsx junto a fromPercentString).
export function toPercentString(rawValue) {
  const n = parseFloat(rawValue)
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 100 * 10000) / 10000)
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
