// Color distintivo por compañía, para cualquier lugar de la UI que necesite diferenciar
// compañías de un vistazo (QuoteCard, Confirmar, CotizandoModal, Emitir). La imagen de
// WhatsApp NO los usa: está restringida a BRAND_COLORS (ver abajo).
//
// A pedido, son los tonos REALES de cada marca, muestreados del PDF oficial de logos
// (logo_aseguradoras/logos.pdf): tono dominante saturado de cada logotipo. Los valores
// anteriores estaban elegidos a ojo y tres eran directamente de otra marca (SANCOR verde
// cuando su color es magenta, SURA naranja cuando es azul, PORTO rojo cuando es azul).
// BSE y PORTO son casi el mismo cyan — es así en la realidad; por eso el recuadro de
// PORTO en la UI usa su isotipo y no el color plano (ver CompanyMark.jsx).
export const ACCENT_BY_COMPANIA = {
  BSE: '#009de0',
  SANCOR: '#ac0068',
  SURA: '#2c6cf5',
  PORTO: '#00a0fb',
}

const DEFAULT_ACCENT = '#0073ea'

export function accentForCompania(compania) {
  return ACCENT_BY_COMPANIA[compania] ?? DEFAULT_ACCENT
}

// EST-02: el badge/globito de cada compañía se pinta con SU color, no con un gris o un
// celeste igual para todas. Los dos tonos se DERIVAN del acento de arriba (fondo = el
// acento lavado con blanco, texto = el mismo acento oscurecido) en vez de ser una
// segunda paleta escrita a mano: agregar una compañía a ACCENT_BY_COMPANIA alcanza para
// que su badge salga solo, y nunca pueden quedar desfasados. El acento puro NO sirve
// como fondo con texto blanco — los cyan de BSE/PORTO no llegan al contraste mínimo
// para texto chico (el badge se dibuja a 10-12px): con el par lavado/oscurecido las
// cuatro quedan parejas y legibles (verificado con los tonos reales: SANCOR 9.5:1,
// BSE 5.5:1, SURA 7.4:1, PORTO 5.3:1 — todas sobre 4.5:1 AA).
function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16))
}

function rgbToHex(rgb) {
  return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

// amount = cuánto blanco se mezcla (0 = el color tal cual, 1 = blanco puro).
function lighten(hex, amount) {
  return rgbToHex(hexToRgb(hex).map((v) => v * (1 - amount) + 255 * amount))
}

// amount = cuánto se oscurece (0 = el color tal cual, 1 = negro).
function darken(hex, amount) {
  return rgbToHex(hexToRgb(hex).map((v) => v * (1 - amount)))
}

export function badgeForCompania(compania) {
  const accent = accentForCompania(compania)
  return {
    bg: lighten(accent, 0.88),
    fg: darken(accent, 0.35),
    border: lighten(accent, 0.68),
  }
}

// A pedido: la tarjeta MARCADA se pinta con el tono de su compañía, no con el azul
// genérico — fondo con el acento muy lavado (más suave que el del badge: es toda la
// tarjeta, no un globito) y borde en el acento pleno. `fg` para el radio y cualquier
// detalle chico: el acento puro de los cyan (BSE/PORTO) es demasiado claro para un
// ícono, el oscurecido se ve en las cuatro. Derivado igual que badgeForCompania: una
// compañía nueva en ACCENT_BY_COMPANIA sale sola.
export function selectionForCompania(compania) {
  const accent = accentForCompania(compania)
  return {
    bg: lighten(accent, 0.93),
    border: accent,
    fg: darken(accent, 0.35),
  }
}

// Cantidad fija de subitems (opciones/coberturas) que la automatización de cotizar
// SIEMPRE crea para cada compañía, sin importar el vehículo — confirmado a pedido, no
// se deriva de ningún dato en vivo. Usado por CotizandoModal para saber cuándo una
// compañía ya terminó (llegó a este número) mientras se espera el estado terminal real
// de la automatización (Estado Cotización === "Cotizado (Subitems)").
export const EXPECTED_QUOTE_COUNT_BY_COMPANIA = {
  BSE: 4,
  PORTO: 4,
  SANCOR: 6,
  SURA: 5,
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
