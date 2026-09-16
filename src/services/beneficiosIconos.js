// Ícono para cada beneficio de la imagen de WhatsApp (ver biblioteca_beneficios/ y su
// README: 25 SVG en el verde oscuro de marca, uno por concepto).
//
// Los textos de los beneficios viven en monday (quote.incluye — frases largas en
// mayúsculas, ver scripts/mon-08-beneficios-compania.mjs) y NO son los títulos cortos de
// la biblioteca, así que acá se matchea por palabras clave, en orden: la primera regla
// que pega gana, y las específicas van antes que las genéricas (ej. "GRANIZO SIN
// DEDUCIBLE" tiene que dar granizo, no descuento-deducible). Un texto que no matchea
// devuelve null y la imagen dibuja el tilde genérico de siempre — un beneficio nuevo
// jamás rompe la cotización, a lo sumo sale con tilde hasta agregarle regla.

// Vite: glob de los 25 SVG → { slug: url }, sin 25 imports a mano; un ícono nuevo en la
// carpeta queda disponible solo.
const modulos = import.meta.glob('../assets/beneficios/*.svg', { eager: true, query: '?url', import: 'default' })
const URL_POR_SLUG = Object.fromEntries(
  Object.entries(modulos).map(([ruta, url]) => [ruta.match(/([^/]+)\.svg$/)[1], url])
)

// Sin tildes y en minúsculas, para que "MECÁNICA" matchee /mecanica/.
function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const REGLAS = [
  [/financiacion/, 'financiacion-deducible'],
  [/danos parciales|pequenos danos|accidente|choque|siniestro/, 'danos-parciales'],
  [/granizo|climatic/, 'granizo-clima'],
  [/cristal/, 'cristales'],
  [/neumatic/, 'cambio-neumatico'],
  [/bateria/, 'asistencia-bateria'],
  [/combustible/, 'combustible'],
  [/auxilio mecanic|asistencia mecanic|emergencia mecanic|remolque|grua/, 'asistencia-mecanica'],
  [/mercosur/, 'cobertura-uruguay-mercosur'],
  [/24 horas|24 hs/, 'asistencia-24-horas'],
  [/fallas mecanicas|fallas electricas|mecanicas y electricas/, 'fallas-mecanicas-electricas'],
  [/cerrajeria|llaves|apertura de puertas/, 'cerrajeria'],
  [/sustituto|cortesia/, 'auto-sustituto'],
  [/ocupantes|asistencia a personas|traslado y alojamiento/, 'asistencia-personas'],
  [/juridic/, 'asistencia-juridica'],
  [/reposicion/, 'reposicion-0km'],
  [/repuestos/, 'repuestos-originales'],
  [/alquiler|europcar/, 'alquiler-auto'],
  [/lavado/, 'descuento-lavado'],
  [/telemetria|strix|rastreo|gps|localizacion/, 'seguridad-telemetria'],
  [/servicios tecnicos|gomeria/, 'servicios-tecnicos'],
  // "TALLERES ACREDITADOS: ... DESCUENTO EN EL DEDUCIBLE" empieza hablando del taller;
  // "DTO 15% EN EL DEDUCIBLE REPARANDO EN TALLERES" empieza por el descuento. El ancla ^
  // decide por cómo arranca la frase.
  [/^taller/, 'talleres'],
  [/deducible/, 'descuento-deducible'],
  [/taller/, 'talleres'],
  [/garantia/, 'garantia-reparacion'],
  [/auxilio/, 'asistencia-mecanica'],
  [/descuento|dto |beneficio/, 'descuentos-servicios'],
]

// URL del SVG para un texto de beneficio, o null si ninguna regla lo reconoce.
export function iconoUrlParaBeneficio(texto) {
  const t = normalizar(texto)
  for (const [regla, slug] of REGLAS) {
    if (regla.test(t)) return URL_POR_SLUG[slug] ?? null
  }
  return null
}
