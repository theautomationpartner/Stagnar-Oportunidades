// Tablero "PANEL" (id 18421072511): fuente centralizada de recargos por cuota, textos
// INCLUYE por compañía+cobertura, y valores de configuración — reemplaza tanto las
// columnas de recargo del propio subitem (fallback si falta el combo) como la vieja
// cadena de columnas "formula_..." de INCLUYE en el subitem (demasiado frágil — se
// rompía cada vez que se borraba alguna columna de la que dependía en cadena). Los tres
// tipos de fila conviven en el mismo tablero, distinguidos por la columna "Grupo"
// (status: Cuotas / Incluye / Configuracion). Ver /logica-monday-vibe.md.
//
// numeric_mm52yezv ("Recarg") es una sola columna numérica simple para las 4
// compañías (BSE, SURA, PORTO, SANCOR) — antes SANCOR usaba una columna FORMULA aparte
// con un valor de prueba que nunca se terminó de cargar bien; se unificó todo acá,
// verificado contra el Excel (hoja "PANEL" interna, tabla "SANCOR PARA COTIZACIONES").
import { fetchPanelItems } from './mondayApi'

function textOf(columnValues, columnId) {
  return columnValues.find((cv) => cv.id === columnId)?.text?.trim() || ''
}

function grupoOf(columnValues) {
  return textOf(columnValues, 'color_mm5fdknw')
}

// { [compania]: { [cuota]: fraccion } }, p. ej. { BSE: { 3: 0, 4: 0.036, ... } }
function buildRecargoLookup(items) {
  const lookup = {}

  for (const item of items) {
    const cv = item.column_values
    if (grupoOf(cv) !== 'Cuotas') continue

    const compania = textOf(cv, 'dropdown_mm52feqr')
    const cuota = Number(textOf(cv, 'numeric_mm52f3n3'))
    if (!compania || !Number.isFinite(cuota)) continue

    const percent = Number(textOf(cv, 'numeric_mm52yezv'))
    if (!Number.isFinite(percent)) continue

    if (!lookup[compania]) lookup[compania] = {}
    lookup[compania][cuota] = percent / 100
  }

  return lookup
}

// { [compania]: { [cobertura]: textoIncluye } } — texto "base" tal cual se cargó en
// PANEL, sin las partes que arma pricingEngine.js en código (auxilio mecánico +
// cantidad de servicios de SANCOR, viñeta de REPUESTOS ORIGINALES).
function buildIncluyeLookup(items) {
  const lookup = {}

  for (const item of items) {
    const cv = item.column_values
    if (grupoOf(cv) !== 'Incluye') continue

    const compania = textOf(cv, 'dropdown_mm52feqr')
    const cobertura = textOf(cv, 'dropdown_mm5frxag')
    const texto = textOf(cv, 'text_mm5f1wnh')
    if (!compania || !cobertura) continue

    if (!lookup[compania]) lookup[compania] = {}
    lookup[compania][cobertura] = texto
  }

  return lookup
}

// Valores de configuración sueltos (Grupo = "Configuracion"): año mínimo para
// "REPUESTOS ORIGINALES" y los 3 precios de opcionales de PORTO (Granizo/Cristales/
// Coche Cortesía) comparten la misma columna `numeric_mm5fmjh0` — se distinguen por el
// NOMBRE del ítem, no por columna. { [nombreDelItem]: numero }
function buildConfiguracion(items) {
  const config = {}
  for (const item of items) {
    const cv = item.column_values
    if (grupoOf(cv) !== 'Configuracion') continue
    const valor = Number(textOf(cv, 'numeric_mm5fmjh0'))
    if (Number.isFinite(valor)) config[item.name.trim()] = valor
  }
  return config
}

// Un solo fetch a PANEL para las cuatro cosas — se pide una vez al cargar la app
// (App.jsx), no por cada oportunidad.
export async function fetchPanelData() {
  const items = await fetchPanelItems()
  const configuracion = buildConfiguracion(items)
  return {
    recargoLookup: buildRecargoLookup(items),
    incluyeLookup: buildIncluyeLookup(items),
    repuestosOriginalesMinYear: configuracion['Año mínimo Repuestos Originales'] ?? null,
    // Los siguientes 2 son específicos de PORTO (ver pricingEngine.js#buildIncluyeBullets):
    // año mínimo para la viñeta "REPOSICIÓN 0KM EL PRIMER AÑO DE EMPADRONADO", y año
    // mínimo para que el auxilio mecánico de GLOBAL/GLOBAL ded Alto diga "SERVICIOS
    // ILIMITADOS" en vez de "5 SERVICIOS POR AÑO".
    reposicion0kmMinYear: configuracion['Año mínimo Reposición 0km'] ?? null,
    serviciosIlimitadosPortoMinYear: configuracion['Antigüedad servicios ilimitados PORTO'] ?? null,
    // Precios de los opcionales de PORTO (viñeta "OPCIONAL: ... + $N" en
    // pricingEngine.js#buildIncluyeBullets si el checkbox del subitem no está tildado).
    preciosOpcionalesPorto: {
      granizo: configuracion['Granizo'] ?? null,
      cristales: configuracion['Cristales'] ?? null,
      cocheCortesia: configuracion['Coche Cortesía'] ?? null,
    },
  }
}

// Reemplaza recargo3/6/8/10 de cada cotización cruda con el valor real del tarifario
// (según su compañía). Si la compañía o la cuota puntual no está en el panel, se
// mantiene el valor que ya traía el subitem como respaldo.
export function applyRecargoLookup(rawQuotes, recargoLookup) {
  return rawQuotes.map((raw) => {
    const byCuota = recargoLookup[raw.compania]
    if (!byCuota) return raw

    const next = { ...raw }
    for (const n of [3, 6, 8, 10]) {
      if (byCuota[n] != null) next[`recargo${n}`] = byCuota[n]
    }
    return next
  })
}
