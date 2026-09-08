// Convierte los subitems crudos de monday (Cotización por compañía/cobertura) en el
// modelo "raw" que consume pricingEngine.computeQuote, mas metadatos de exhibicion.
import { textOf } from './mondayColumns'


function boolOf(columnValues, columnId) {
  return textOf(columnValues, columnId) === 'v' || textOf(columnValues, columnId).toLowerCase() === 'true'
}

export function mapSubitemToRawQuote(subitem) {
  const cv = subitem.column_values
  return {
    id: subitem.id,
    name: subitem.name,
    cobertura: textOf(cv, 'dropdown_mm4w8n8p'),
    compania: textOf(cv, 'dropdown_mm51f4va'),
    contado: textOf(cv, 'numeric_mm4pc2y1'),
    deducibleBase: textOf(cv, 'numeric_mm519my9'),
    deducibleSancorUsd: textOf(cv, 'numeric_mm59qzvf'),
    edad: textOf(cv, 'numeric_mm592zyk'),
    deducibleBSE: textOf(cv, 'dropdown_mm52dm1j'),
    deducibleSURA: textOf(cv, 'dropdown_mm5fb4y0'),
    bonif: textOf(cv, 'numeric_mm52ey7f'),
    edadBSE: textOf(cv, 'dropdown_mm52p7yx'),
    rc: textOf(cv, 'dropdown_mm5954ma'),
    // Uso y Año Vehículo ya no viven en el subitem (se sacaron por duplicar datos que
    // ya están en la oportunidad) — OpportunityDetail.jsx los inyecta en el `raw`
    // efectivo desde `opportunity.uso`/`opportunity.anio` antes de llegar a QuoteCard.
    recargo3: textOf(cv, 'numeric_mm52qx0e'),
    recargo6: textOf(cv, 'numeric_mm529754'),
    recargo8: textOf(cv, 'numeric_mm52xw0m'),
    recargo10: textOf(cv, 'numeric_mm52bnpa'),
    incluirPropuesta: boolOf(cv, 'boolean_mm4wjdnw'),
    propuestaElegida: boolOf(cv, 'boolean_mm5bn41n'),
    // Opcionales de la cotización — ver pricingEngine.js#OPCIONALES. Granizo lo comparten
    // PORTO y SURA (el precio lo pone la compañía de la cotización, ver PANEL); el resto
    // es de una sola. "Auto extra" no es un tilde sino la duración elegida ("7 días" /
    // "15 días" / "30 días"), vacío si no se eligió ninguna.
    granizo: boolOf(cv, 'boolean_mm5fsr46'),
    cristales: boolOf(cv, 'boolean_mm5fqazp'),
    usoRural: boolOf(cv, 'boolean_mm6z3j9j'),
    suraTeLleva: boolOf(cv, 'boolean_mm6zhfhd'),
    // El AP de SURA viene incluido en el precio del portal: sin dato cargado se asume
    // tildado, y solo cuenta como "sacado" cuando está explícitamente destildado.
    ap: textOf(cv, 'boolean_mm6zzwq5') === '' ? true : boolOf(cv, 'boolean_mm6zzwq5'),
    autoExtra: textOf(cv, 'color_mm6zpx3j'),
  }
}

export function groupQuotesByCompania(rawQuotes) {
  const groups = new Map()
  for (const q of rawQuotes) {
    const key = q.compania || 'Sin compañía'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(q)
  }
  return [...groups.entries()].map(([compania, quotes]) => ({ compania, quotes }))
}
