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
import { textOf } from './mondayColumns'

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

// Texto "base" tal cual se cargó en PANEL, sin las partes que arma pricingEngine.js en
// código (auxilio mecánico + cantidad de servicios de SANCOR, viñeta de REPUESTOS
// ORIGINALES). Devuelve:
//   porCobertura: { [compania]: { [cobertura]: texto } }
//   porCompania:  { [compania]: texto }
// MON-08: una fila con compañía pero SIN cobertura son los beneficios diferenciales de esa
// aseguradora, que valen para todas sus coberturas (auto de cortesía de SURA, talleres
// acreditados de PORTO, etc.). Van en una sola fila y no repetidos en cada cobertura, que
// es lo que obligaría a editarlos en cinco lugares cada vez que cambian.
function buildIncluyeLookup(items) {
  const porCobertura = {}
  const porCompania = {}

  for (const item of items) {
    const cv = item.column_values
    if (grupoOf(cv) !== 'Incluye') continue

    const compania = textOf(cv, 'dropdown_mm52feqr')
    const cobertura = textOf(cv, 'dropdown_mm5frxag')
    const texto = textOf(cv, 'text_mm5f1wnh')
    if (!compania) continue

    if (!cobertura) {
      porCompania[compania] = texto
      continue
    }
    if (!porCobertura[compania]) porCobertura[compania] = {}
    porCobertura[compania][cobertura] = texto
  }

  return { porCobertura, porCompania }
}

// Valores de configuración sueltos (Grupo = "Configuracion"): años mínimos de las
// viñetas y precios de opcionales, todos en la misma columna `numeric_mm5fmjh0` — se
// distinguen por el NOMBRE del ítem, no por columna.
// MON-06: los precios ahora se separan además por compañía, porque el mismo concepto
// tiene precio distinto según la aseguradora ("Granizo" son $1.279 en PORTO y $1.250 en
// SURA). Las filas sin compañía siguen siendo globales (los años mínimos).
// Devuelve { globales: {nombre: numero}, porCompania: {COMPANIA: {nombre: numero}} }
function buildConfiguracion(items) {
  const globales = {}
  const porCompania = {}
  for (const item of items) {
    const cv = item.column_values
    if (grupoOf(cv) !== 'Configuracion') continue
    const valor = Number(textOf(cv, 'numeric_mm5fmjh0'))
    if (!Number.isFinite(valor)) continue
    const nombre = item.name.trim()
    const compania = (textOf(cv, 'dropdown_mm52feqr') ?? '').trim()
    if (compania) {
      if (!porCompania[compania]) porCompania[compania] = {}
      porCompania[compania][nombre] = valor
    } else {
      globales[nombre] = valor
    }
  }
  return { globales, porCompania }
}

// Un solo fetch a PANEL para las cuatro cosas — se pide una vez al cargar la app
// (App.jsx), no por cada oportunidad.
export async function fetchPanelData() {
  const items = await fetchPanelItems()
  const configuracion = buildConfiguracion(items)
  return {
    recargoLookup: buildRecargoLookup(items),
    incluyeLookup: buildIncluyeLookup(items),
    repuestosOriginalesMinYear: configuracion.globales['Año mínimo Repuestos Originales'] ?? null,
    // Los siguientes 2 son específicos de PORTO (ver pricingEngine.js#buildIncluyeBullets):
    // año mínimo para la viñeta "REPOSICIÓN 0KM EL PRIMER AÑO DE EMPADRONADO", y año
    // mínimo para que el auxilio mecánico de GLOBAL/GLOBAL ded Alto diga "SERVICIOS
    // ILIMITADOS" en vez de "5 SERVICIOS POR AÑO".
    reposicion0kmMinYear: configuracion.globales['Año mínimo Reposición 0km'] ?? null,
    serviciosIlimitadosPortoMinYear: configuracion.globales['Antigüedad servicios ilimitados PORTO'] ?? null,
    // MON-06: precios de los opcionales por compañía, tal cual están cargados en PANEL
    // ({ PORTO: { Granizo: 1279, ... }, SURA: { ... } }). pricingEngine los usa tanto para
    // la viñeta "OPCIONAL: ... + $N" como para sumarlos al total cuando están tildados.
    preciosOpcionales: configuracion.porCompania,
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
