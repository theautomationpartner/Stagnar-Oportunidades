import { isQuoteSelectable } from './pricingEngine'

// Reunión del 24/09 — "Orden recomendado" de las cotizaciones en "Comparar y enviar"
// (es el orden por defecto; los demás siguen disponibles):
//
//  1. Las cuatro principales, cada una con su opción de referencia: SURA Total, PORTO
//     Total, BSE Total (anual) y SANCOR con el menor deducible que haya cotizado.
//     Entre ellas, por costo ya bonificado. Si alguna no tiene costo (WINK la trajo en 0)
//     queda igual en este grupo, después de las que sí —así se ve que falta y se puede
//     cargar a mano—, no se va al final.
//  2. BSE Total 3x2.
//  3. El resto, por precio (las que no tienen costo, al final).
const PRINCIPALES = [
  { compania: 'SURA', cobertura: 'TOTAL' },
  { compania: 'PORTO', cobertura: 'GLOBAL' },
  { compania: 'BSE', cobertura: 'GLOBAL - ANUAL' },
]
const BSE_3X2 = { compania: 'BSE', cobertura: 'GLOBAL - 3X2' }
// Las opciones Total de SANCOR se llaman por su deducible ("TOTAL 600", "TOTAL 800"…).
const SANCOR_TOTAL = /^TOTAL\s+(\d+)$/

const normal = (texto) => String(texto ?? '').trim().toUpperCase()
const es = (e, ref) => normal(e.compania ?? e.raw.compania) === ref.compania && normal(e.raw.cobertura) === ref.cobertura

// El deducible de una opción Total de SANCOR: el que trae la cotización o, si no vino, el
// que dice su nombre.
function deducibleSancor(e) {
  const usd = Number(e.raw.deducibleSancorUsd)
  if (usd > 0) return usd
  const m = normal(e.raw.cobertura).match(SANCOR_TOTAL)
  return m ? Number(m[1]) : Infinity
}

// Grupo de cada cotización (por id): 0 principales, 1 BSE 3x2, 2 el resto.
function gruposRecomendados(entries) {
  const sancorTotales = entries.filter(
    (e) => normal(e.compania ?? e.raw.compania) === 'SANCOR' && SANCOR_TOTAL.test(normal(e.raw.cobertura))
  )
  const sancorMenor = sancorTotales.reduce((min, e) => (min && deducibleSancor(min) <= deducibleSancor(e) ? min : e), null)
  const grupos = new Map()
  for (const e of entries) {
    const principal = PRINCIPALES.some((ref) => es(e, ref)) || e === sancorMenor
    grupos.set(e.raw.id, principal ? 0 : es(e, BSE_3X2) ? 1 : 2)
  }
  return grupos
}

// Devuelve las cotizaciones ordenadas; no modifica la lista recibida.
export function ordenarRecomendado(entries) {
  const grupos = gruposRecomendados(entries)
  const total = (e) => Number(e.quote.total) || 0
  return [...entries].sort((a, b) => {
    const ga = grupos.get(a.raw.id)
    const gb = grupos.get(b.raw.id)
    if (ga !== gb) return ga - gb
    const sa = isQuoteSelectable(a.quote)
    const sb = isQuoteSelectable(b.quote)
    if (sa !== sb) return sa ? -1 : 1
    return total(a) - total(b)
  })
}
