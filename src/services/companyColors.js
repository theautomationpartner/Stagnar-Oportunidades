// Color distintivo por compañía, compartido entre la imagen de WhatsApp
// (services/whatsappImage.js) y cualquier lugar de la UI que necesite diferenciar
// compañías de un vistazo (p. ej. el paso 3 "Confirmar"). Ver /logica-monday-vibe.md.
export const ACCENT_BY_COMPANIA = {
  BSE: '#0057a3',
  SANCOR: '#00a651',
  SURA: '#f58220',
  PORTO: '#e4032e',
}

const DEFAULT_ACCENT = '#0073ea'

export function accentForCompania(compania) {
  return ACCENT_BY_COMPANIA[compania] ?? DEFAULT_ACCENT
}

// Paleta del manual de marca de Stagnari — a diferencia de ACCENT_BY_COMPANIA (colores
// libres, usados en la UI de la app), estos son los únicos colores permitidos en la
// imagen de cotización que se manda al webhook de WhatsApp (a pedido: "100% los colores
// del manual"). Verde es el color más característico de la compañía.
export const BRAND_COLORS = {
  verde: '#008581',
  crema: '#FFF5DE',
  gris: '#818685',
  verdeComplementario: '#7BBB8F',
  blanco: '#FFFFFF',
  negro: '#000000',
}

// Un color de marca distinto por compañía, solo como detalle sutil para identificarla
// (ver whatsappImage.js) — nunca un color fuera de BRAND_COLORS.
const BRAND_MARKER_BY_COMPANIA = {
  BSE: BRAND_COLORS.verde,
  SANCOR: BRAND_COLORS.verdeComplementario,
  SURA: BRAND_COLORS.gris,
  PORTO: BRAND_COLORS.crema,
}

export function brandMarkerForCompania(compania) {
  return BRAND_MARKER_BY_COMPANIA[compania] ?? BRAND_COLORS.gris
}
