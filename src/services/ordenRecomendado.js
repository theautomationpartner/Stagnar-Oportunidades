import { isQuoteSelectable } from './pricingEngine'

// "Orden recomendado" de las cotizaciones en "Comparar y enviar" (es el orden por
// defecto; los demás siguen disponibles). A pedido, un orden FIJO:
//
//   1° BSE Total (anual)
//   2° SURA Total
//   3° PORTO Total
//   4° SANCOR, la opción Total con el menor deducible que haya cotizado (600/800/1500/2500)
//   5° BSE Total 3x2
//   después, el resto por precio (las que no tienen costo, al final).
//
// Si alguna de las primeras no cotizó (no hay cotización de esa compañía y cobertura), su
// lugar se saltea y la siguiente sube: no bloquea nada. Si cotizó pero vino en 0 (tarjeta
// gris, WINK no supo el valor), queda en su posición fija igual — así se ve que falta y se
// puede completar a mano ("Completar manualmente").
//
// Antes (reunión del 24/09) las cuatro principales iban ordenadas por precio entre ellas;
// el criterio vigente las fija en este orden.
const PRIMERAS = [
  { compania: 'BSE', cobertura: 'GLOBAL - ANUAL' },
  { compania: 'SURA', cobertura: 'TOTAL' },
  { compania: 'PORTO', cobertura: 'GLOBAL' },
]
const POSICION_SANCOR = PRIMERAS.length // 4°
const BSE_3X2 = { compania: 'BSE', cobertura: 'GLOBAL - 3X2' }
const POSICION_BSE_3X2 = POSICION_SANCOR + 1 // 5°
const POSICION_RESTO = POSICION_BSE_3X2 + 1

// Las opciones Total de SANCOR se llaman por su deducible ("TOTAL 600", "TOTAL 800"…).
const SANCOR_TOTAL = /^TOTAL\s+(\d+)$/

const normal = (texto) => String(texto ?? '').trim().toUpperCase()
const companiaDe = (e) => normal(e.compania ?? e.raw.compania)
const es = (e, ref) => companiaDe(e) === ref.compania && normal(e.raw.cobertura) === ref.cobertura

// El deducible de una opción Total de SANCOR: el que trae la cotización o, si no vino, el
// que dice su nombre.
function deducibleSancor(e) {
  const usd = Number(e.raw.deducibleSancorUsd)
  if (usd > 0) return usd
  const m = normal(e.raw.cobertura).match(SANCOR_TOTAL)
  return m ? Number(m[1]) : Infinity
}

// La posición de cada cotización (por id): 0..4 las fijas, POSICION_RESTO el resto.
function posiciones(entries) {
  const sancorTotales = entries.filter((e) => companiaDe(e) === 'SANCOR' && SANCOR_TOTAL.test(normal(e.raw.cobertura)))
  const sancorMenor = sancorTotales.reduce((min, e) => (min && deducibleSancor(min) <= deducibleSancor(e) ? min : e), null)
  const mapa = new Map()
  for (const e of entries) {
    const fija = PRIMERAS.findIndex((ref) => es(e, ref))
    const posicion =
      fija >= 0 ? fija : e === sancorMenor ? POSICION_SANCOR : es(e, BSE_3X2) ? POSICION_BSE_3X2 : POSICION_RESTO
    mapa.set(e.raw.id, posicion)
  }
  return mapa
}

// Devuelve las cotizaciones ordenadas; no modifica la lista recibida.
export function ordenarRecomendado(entries) {
  const posicion = posiciones(entries)
  const total = (e) => Number(e.quote.total) || 0
  return [...entries].sort((a, b) => {
    const pa = posicion.get(a.raw.id)
    const pb = posicion.get(b.raw.id)
    if (pa !== pb) return pa - pb
    // Solo el resto llega acá (las fijas tienen cada una su posición): por precio, y las
    // que no tienen costo al final.
    const sa = isQuoteSelectable(a.quote)
    const sb = isQuoteSelectable(b.quote)
    if (sa !== sb) return sa ? -1 : 1
    return total(a) - total(b)
  })
}
