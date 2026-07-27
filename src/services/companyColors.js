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
