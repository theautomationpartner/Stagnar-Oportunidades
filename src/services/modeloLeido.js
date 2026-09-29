import { matchesSearchQuery } from './format'

// Reunión del 24/09 — el modelo que lee la IA de la Carta del vehículo casi nunca coincide
// con el nombre del modelo en Autodata ("NAMMI 330" contra "DONGFENG - Nammi 330 EV …"),
// así que no se elige solo: se usa para dejar el desplegable de Modelo ya filtrado.
//
// Con qué texto se filtra:
//  1. Se saca la marca si la carta la repite adelante ("PEUGEOT 208" → "208").
//  2. Se sacan del principio las palabras que no dicen qué modelo es ("Nuevo Uno" → "Uno").
//     A confirmar con Marcel si hay más además de estas.
//  3. Se prueba con todo el texto; si no hay ningún modelo que coincida, se va sacando una
//     palabra del final hasta que alguno coincida ("Nuevo Uno 1.4 Way" → "Uno 1.4" → …).
//     Si ni la primera palabra coincide, no se filtra (se ven todos).
// El resultado queda escrito en el buscador del desplegable: se puede seguir escribiendo o
// borrarlo para ver todos.
const PALABRAS_SIN_SIGNIFICADO = ['nuevo', 'nueva', 'new']

export function filtroParaModeloLeido(modeloLeido, opciones, marca = '') {
  let palabras = String(modeloLeido ?? '').trim().split(/\s+/).filter(Boolean)
  const marcaMin = String(marca ?? '').trim().toLowerCase()
  if (marcaMin && palabras.length > 1 && palabras[0].toLowerCase() === marcaMin) palabras = palabras.slice(1)
  while (palabras.length > 1 && PALABRAS_SIN_SIGNIFICADO.includes(palabras[0].toLowerCase())) {
    palabras = palabras.slice(1)
  }
  for (let n = palabras.length; n > 0; n--) {
    const texto = palabras.slice(0, n).join(' ')
    if (opciones.some((o) => matchesSearchQuery(o.label, texto))) return texto
  }
  return ''
}
