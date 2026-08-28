export function formatMoney(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$ ${Number(value).toLocaleString('es-UY')}`
}

// Las columnas "date" de monday devuelven texto tipo "2026-08-11" o, si la columna
// tiene hora habilitada, "2026-08-11 11:39:00" — acá se corta a dd/mm/aa siempre,
// sin hora, sin importar cuál de los 2 formatos llegó (ver opportunityMapper.js,
// "Última cotización" en la tabla de Oportunidades).
export function formatShortDate(text) {
  if (!text) return '—'
  const [year, month, day] = text.slice(0, 10).split('-')
  if (!year || !month || !day) return text
  return `${day}/${month}/${year.slice(2)}`
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

// El nombre de un modelo de Autodata ya trae la marca adelante ("PEUGEOT - 206 1.6
// Presence Full…"). Para textos donde la marca ya se menciona aparte (nombre del ítem
// "Nombre-Marca-Año-Modelo", tarjeta de WhatsApp) se la quita del principio junto con el
// separador. Si el modelo no empieza con la marca, vuelve tal cual.
export function modeloSinMarca(marca, modelo) {
  const m = (marca ?? '').trim()
  const texto = (modelo ?? '').trim()
  if (!m || !texto.toUpperCase().startsWith(m.toUpperCase())) return texto
  return texto.slice(m.length).replace(/^[\s\-–·]+/, '').trim()
}
