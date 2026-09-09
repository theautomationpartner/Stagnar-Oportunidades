export function formatMoney(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$ ${Number(value).toLocaleString('es-UY')}`
}

// LOG-10: mismo separador de miles que formatMoney pero en dólares, con un único prefijo
// para toda la app (antes el deducible de SANCOR era el único monto en USD y lo armaba a
// mano, sin formato).
export function formatUsd(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `USD ${Number(value).toLocaleString('es-UY')}`
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

// Matchea sin distinguir mayúsculas — el dato real de Autodata a veces difiere en
// casing de nuestra opción real (ej. "Diesel" vs nuestro "DIesel"). Si no hay dato o no
// coincide con ninguna opción real, devuelve vacío en vez de forzar un valor inventado.
// Compartido entre CrearOportunidadForm.jsx (elegir Modelo), que pasa las opciones ya
// como {value,label} del Dropdown, y CotizarStepPanel.jsx (editar Vehículo de una
// oportunidad ya creada), que las pasa como strings sueltos del schema — de ahí que
// tanto la comparación como el valor devuelto acepten las dos formas.
// LOG-23: además del casing, se ignoran acentos y espacios de más — "CAMIONETAS FURGON"
// y "CAMIONETAS FURGÓN" (o un doble espacio de tipeo) son el mismo tipo, y antes
// cualquiera de esas diferencias dejaba el campo vacío como si el dato no existiera.
export const normalizarParaMatch = (texto) =>
  String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

export function matchOption(options, rawValue) {
  if (!rawValue) return ''
  const buscado = normalizarParaMatch(rawValue)
  const found = options.find((o) => normalizarParaMatch(o?.value ?? o) === buscado)
  if (found == null) return ''
  return found.value ?? found
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
