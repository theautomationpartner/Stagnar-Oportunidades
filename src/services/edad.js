// Edad del cliente, calculada desde la fecha de nacimiento (YYYY-MM-DD, como la devuelve
// la columna date de monday).
//
// La columna Edad de la Oportunidad (numeric_mm527wpm) la llenaba un escenario de Make al
// cambiar la Fecha de Nacimiento; esa automatización se apagó y la app la escribe al
// cotizar (ver handleMarcarParaCotizar en OpportunityDetail.jsx), que es cuando el robot la
// lee. Calcularla en ese momento, y no al cargar la fecha, además evita que quede vieja
// con el paso de los años.
export const EDAD_COLUMN_ID = 'numeric_mm527wpm'

export function edadDesde(fechaIso, hoy = new Date()) {
  if (!fechaIso) return null
  const [y, m, d] = String(fechaIso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  let edad = hoy.getFullYear() - y
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad -= 1
  return edad > 0 && edad < 130 ? edad : null
}
