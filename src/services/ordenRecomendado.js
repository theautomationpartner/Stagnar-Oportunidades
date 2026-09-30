import { isQuoteSelectable } from './pricingEngine'

// "Orden recomendado" de las cotizaciones en "Comparar y enviar" (es el orden por
// defecto; los demás siguen disponibles). A pedido, un orden FIJO por puestos, uno para
// cada familia de cobertura:
//
//          Total                              Parcial
//   1°  BSE Total (anual)                  BSE Triple (anual)
//   2°  SURA Total                         SURA Triple y 4 EN 1
//   3°  PORTO Total                        PORTO Triple
//   4°  SANCOR: la Total con el menor      SANCOR Parcial y Parcial Plus
//       deducible (600/800/1500/2500)
//   5°  BSE Total 3x2                      BSE Triple 3x2
//   después, el resto por precio (las que no tienen costo, al final).
//
// Cuando dos comparten puesto (SURA y SANCOR en Parcial) van entre ellas por precio. En la
// solapa General, donde se ven todas, va primero el ranking de Total y después el de
// Parcial.
//
// Si alguna no cotizó (no hay cotización de esa compañía y cobertura), su lugar se saltea
// y la siguiente sube: no bloquea nada. Si cotizó pero vino en 0 (tarjeta gris, WINK no
// supo el valor), queda en su puesto igual — así se ve que falta y se puede completar a
// mano ("Completar manualmente").
const PUESTOS_TOTAL = [
  [{ compania: 'BSE', cobertura: 'GLOBAL - ANUAL' }],
  [{ compania: 'SURA', cobertura: 'TOTAL' }],
  [{ compania: 'PORTO', cobertura: 'GLOBAL' }],
  'SANCOR_MENOR_DEDUCIBLE',
  [{ compania: 'BSE', cobertura: 'GLOBAL - 3X2' }],
]
const PUESTOS_PARCIAL = [
  [{ compania: 'BSE', cobertura: 'TRIPLE - ANUAL' }],
  [
    { compania: 'SURA', cobertura: 'TRIPLE' },
    { compania: 'SURA', cobertura: '4 EN 1' },
  ],
  [{ compania: 'PORTO', cobertura: 'TRIPLE' }],
  [
    { compania: 'SANCOR', cobertura: 'PARCIAL' },
    { compania: 'SANCOR', cobertura: 'PARCIAL PLUS' },
  ],
  [{ compania: 'BSE', cobertura: 'TRIPLE - 3X2' }],
]
const POSICION_RESTO = PUESTOS_TOTAL.length + PUESTOS_PARCIAL.length

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

// La posición de cada cotización (por id): los puestos de Total, después los de Parcial,
// y POSICION_RESTO para el resto.
function posiciones(entries) {
  const sancorTotales = entries.filter((e) => companiaDe(e) === 'SANCOR' && SANCOR_TOTAL.test(normal(e.raw.cobertura)))
  const sancorMenor = sancorTotales.reduce((min, e) => (min && deducibleSancor(min) <= deducibleSancor(e) ? min : e), null)
  const cumple = (e, puesto) => (puesto === 'SANCOR_MENOR_DEDUCIBLE' ? e === sancorMenor : puesto.some((ref) => es(e, ref)))

  const mapa = new Map()
  for (const e of entries) {
    const total = PUESTOS_TOTAL.findIndex((puesto) => cumple(e, puesto))
    const parcial = PUESTOS_PARCIAL.findIndex((puesto) => cumple(e, puesto))
    const posicion = total >= 0 ? total : parcial >= 0 ? PUESTOS_TOTAL.length + parcial : POSICION_RESTO
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
    // Mismo puesto (dos que lo comparten, o el resto): por precio, y las que no tienen
    // costo al final.
    const sa = isQuoteSelectable(a.quote)
    const sb = isQuoteSelectable(b.quote)
    if (sa !== sb) return sa ? -1 : 1
    return total(a) - total(b)
  })
}
