// Agrupa las coberturas (columna dropdown_mm4w8n8p del tablero de subitems) en 2
// familias de negocio — GLOBAL (cobertura todo riesgo) y TRIPLE (cobertura parcial) —
// para las solapas "Total / Parcial / General" del paso "Comparar y enviar"
// (las claves siguen siendo GLOBAL/TRIPLE, ver FAMILIA_LABEL). Verificado
// contra las labels reales del dropdown (settings_str vía API). "TOTAL C/ MOV" (SURA)
// se sacó de GLOBAL a pedido — queda sin familia, solo aparece en "General".
const GLOBAL_COBERTURAS = new Set([
  'GLOBAL - ANUAL',
  'GLOBAL - 3X2',
  'GLOBAL',
  'GLOBAL DED ALTO',
  'TOTAL 600',
  'TOTAL 800',
  'TOTAL 1500',
  'TOTAL 2500',
  'TOTAL',
  'TOTAL PLUS',
])

const TRIPLE_COBERTURAS = new Set(['TRIPLE - ANUAL', 'TRIPLE - 3X2', 'TRIPLE', 'PARCIAL', 'PARCIAL PLUS', '4 EN 1'])

// EST-03: "GLOBAL" y "TRIPLE" son los nombres internos que usa BSE para sus coberturas
// — como nombre de la FAMILIA (lo que ve el cliente y lo que dice el vendedor) van
// "Total" y "Parcial". Ojo: solo cambia la etiqueta visible. Las claves GLOBAL/
// TRIPLE siguen siendo las mismas en todo el código, y también viajan así en el nombre
// de archivo que consume Make (ver makeWebhook.js#buildImageFileName): renombrar la
// clave rompería ese contrato del lado del escenario.
export const FAMILIA_LABEL = {
  GLOBAL: 'Total',
  TRIPLE: 'Parcial',
}

// A pedido: GLOBAL primero (también la solapa que arranca activa por defecto, ver
// coberturaTabIndex en OpportunityDetail.jsx), después TRIPLE, General al final.
export const COBERTURA_TABS = [
  { key: 'GLOBAL', label: FAMILIA_LABEL.GLOBAL },
  { key: 'TRIPLE', label: FAMILIA_LABEL.TRIPLE },
  { key: 'general', label: 'General' },
]

// null si la cobertura no matchea ninguna de las 2 familias (dato viejo/inesperado) —
// en ese caso solo aparece en la solapa "General", nunca en GLOBAL ni TRIPLE.
export function coberturaGroupOf(cobertura) {
  const normalized = (cobertura ?? '').trim().toUpperCase()
  if (GLOBAL_COBERTURAS.has(normalized)) return 'GLOBAL'
  if (TRIPLE_COBERTURAS.has(normalized)) return 'TRIPLE'
  return null
}

// Descripción en una línea de cada familia — la usan la imagen de WhatsApp y la versión
// en texto (LOG-17), que tienen que decir lo mismo del mismo plan. Si la cobertura no
// cae en ninguna familia, quien la muestre arma un texto genérico con su nombre.
export const SUBTITULO_POR_FAMILIA = {
  GLOBAL: 'Cobertura completa del vehículo y responsabilidad civil.',
  TRIPLE: 'Responsabilidad civil, hurto e incendio.',
}

// A pedido: "Global" y "Triple" son como llaman las compañías a esas coberturas puertas
// adentro; de cara al cliente se llaman "Total" y "Parcial". El reemplazo es SOLO de
// presentación, y por eso vive acá y no al leer la cotizacion: el nombre real es la clave
// con la que se buscan el precio y los textos de PANEL, y la que viaja en el nombre de
// archivo que consume Make (ver makeWebhook.js). Traducirlo en el origen rompe las tres.
//
// Se tocan esas dos palabras sueltas y nada más: cualquier otro nombre de producto pasa
// tal cual ("TOTAL PLUS", "4 EN 1", "PARCIAL PLUS"), y el resto del nombre se conserva
// ("GLOBAL ded Alto" queda "TOTAL ded Alto"). Si alguna compañía llegara a tener un
// producto que se llame literalmente "Global" o "Triple" y deba conservarlo, la excepción
// va acá.
const REEMPLAZOS_COMERCIALES = [
  [/\bglobal\b/gi, 'total'],
  [/\btriple\b/gi, 'parcial'],
]

// Conserva cómo venía escrita la palabra: GLOBAL -> TOTAL, Global -> Total.
function conMismaCaja(original, reemplazo) {
  if (original === original.toUpperCase()) return reemplazo.toUpperCase()
  if (original[0] === original[0].toUpperCase()) return reemplazo[0].toUpperCase() + reemplazo.slice(1)
  return reemplazo
}

export function nombreComercialCobertura(nombre) {
  let texto = String(nombre ?? '')
  for (const [patron, reemplazo] of REEMPLAZOS_COMERCIALES) {
    texto = texto.replace(patron, (m) => conMismaCaja(m, reemplazo))
  }
  return texto
}

// El nombre con el que se muestra una cotización: la cobertura si está y, si no, el nombre
// del subitem, que arrastra lo mismo ("BSE-GLOBAL - anual").
export function coberturaParaMostrar(raw) {
  return nombreComercialCobertura(raw?.cobertura || raw?.name || '')
}
