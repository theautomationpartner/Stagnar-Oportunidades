import { isQuoteSelectable } from './pricingEngine'

// "Orden recomendado" de las cotizaciones en "Comparar y enviar" (es el orden por
// defecto; los demás siguen disponibles). A pedido (Marcel: ver rápido cuál es la más
// económica de cada grupo), 3 bloques con orden fijo ENTRE ellos y por costo, de menor a
// mayor, ADENTRO de cada uno:
//
//                  Total                              Parcial
//   Bloque 1   BSE Total (anual)                  BSE Triple (anual)
//   (1° a 4°)  SURA Total                         SURA Triple y 4 EN 1
//              PORTO Total                        PORTO Triple
//              SANCOR: la Total con el menor      SANCOR Parcial y Parcial Plus
//              deducible (600/800/1500/2500)
//   Bloque 2   BSE Total 3x2                      BSE Triple 3x2
//   (5°)       — va aparte porque es por 3 años, no se compara con las anuales.
//   Bloque 3   el resto, por costo.
//
// En la solapa General, donde se ven todas, van los bloques 1 y 2 de Total, después los
// de Parcial, y al final el resto.
//
// Si alguna no cotizó (no hay cotización de esa compañía y cobertura), simplemente no
// está y la siguiente sube. Las que cotizaron pero vinieron en 0 (tarjeta gris, WINK no
// supo el valor) no tienen costo con qué ordenarse: quedan al final de SU bloque — así se
// ve que falta y se puede completar a mano ("Completar manualmente").
const PRINCIPALES_TOTAL = [
  { compania: 'BSE', cobertura: 'GLOBAL - ANUAL' },
  { compania: 'SURA', cobertura: 'TOTAL' },
  { compania: 'PORTO', cobertura: 'GLOBAL' },
  'SANCOR_MENOR_DEDUCIBLE',
]
const TRIENAL_TOTAL = { compania: 'BSE', cobertura: 'GLOBAL - 3X2' }
const PRINCIPALES_PARCIAL = [
  { compania: 'BSE', cobertura: 'TRIPLE - ANUAL' },
  { compania: 'SURA', cobertura: 'TRIPLE' },
  { compania: 'SURA', cobertura: '4 EN 1' },
  { compania: 'PORTO', cobertura: 'TRIPLE' },
  { compania: 'SANCOR', cobertura: 'PARCIAL' },
  { compania: 'SANCOR', cobertura: 'PARCIAL PLUS' },
]
const TRIENAL_PARCIAL = { compania: 'BSE', cobertura: 'TRIPLE - 3X2' }

// Orden de los bloques (el número es la posición del bloque, no de la tarjeta).
const BLOQUE = { principalesTotal: 0, trienalTotal: 1, principalesParcial: 2, trienalParcial: 3, resto: 4 }

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

// El bloque de cada cotización (por id).
function bloques(entries) {
  const sancorTotales = entries.filter((e) => companiaDe(e) === 'SANCOR' && SANCOR_TOTAL.test(normal(e.raw.cobertura)))
  const sancorMenor = sancorTotales.reduce((min, e) => (min && deducibleSancor(min) <= deducibleSancor(e) ? min : e), null)
  const esPrincipal = (e, lista) => lista.some((ref) => (ref === 'SANCOR_MENOR_DEDUCIBLE' ? e === sancorMenor : es(e, ref)))

  const mapa = new Map()
  for (const e of entries) {
    const bloque = esPrincipal(e, PRINCIPALES_TOTAL)
      ? BLOQUE.principalesTotal
      : es(e, TRIENAL_TOTAL)
        ? BLOQUE.trienalTotal
        : esPrincipal(e, PRINCIPALES_PARCIAL)
          ? BLOQUE.principalesParcial
          : es(e, TRIENAL_PARCIAL)
            ? BLOQUE.trienalParcial
            : BLOQUE.resto
    mapa.set(e.raw.id, bloque)
  }
  return mapa
}

// Devuelve las cotizaciones ordenadas; no modifica la lista recibida.
export function ordenarRecomendado(entries) {
  const bloque = bloques(entries)
  const total = (e) => Number(e.quote.total) || 0
  return [...entries].sort((a, b) => {
    const ba = bloque.get(a.raw.id)
    const bb = bloque.get(b.raw.id)
    if (ba !== bb) return ba - bb
    // Mismo bloque: por costo de menor a mayor, y las que no tienen costo al final.
    const sa = isQuoteSelectable(a.quote)
    const sb = isQuoteSelectable(b.quote)
    if (sa !== sb) return sa ? -1 : 1
    return total(a) - total(b)
  })
}
