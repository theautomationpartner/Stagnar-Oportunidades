// Convierte los subitems crudos de monday (Cotización por compañía/cobertura) en el
// modelo "raw" que consume pricingEngine.computeQuote, mas metadatos de exhibicion.

function textOf(columnValues, columnId) {
  return columnValues.find((cv) => cv.id === columnId)?.text?.trim() || ''
}

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
    // Opcionales de PORTO (Granizo/Cristales/Coche Cortesía) — ver
    // pricingEngine.js#buildIncluyeBullets y /logica-monday-vibe.md.
    granizo: boolOf(cv, 'boolean_mm5fsr46'),
    cristales: boolOf(cv, 'boolean_mm5fqazp'),
    cocheCortesia: boolOf(cv, 'boolean_mm5fxd9x'),
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
