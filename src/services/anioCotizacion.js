// Con qué año se le pide la cotización a las aseguradoras.
//
// Un 0km puede venir con el año de modelo adelantado: en 2026 se vende un 2027. Ese es el
// año real del vehículo —el que ve el cliente, el que va en el nombre del ítem y el que
// usan las reglas de beneficios por antigüedad—, pero las aseguradoras todavía no cotizan
// un año que no empezó. Entonces se cotiza con el año en curso.
//
// Por eso son dos datos distintos y no uno: la columna "Año" guarda el del vehículo y
// "Año a cotizar" (text_mm7ann8x) el que lee el robot. Meterlos en la misma columna
// obligaría a elegir a cuál de los dos mentirle.
export const ANIO_COTIZACION_COLUMN_ID = 'text_mm7ann8x'

// Se recalcula en cada llamada en vez de guardarse: el 1º de enero, un 2027 deja de ser
// futuro solo, sin que nadie tenga que acordarse de nada.
export function anioParaCotizar(anio, hoy = new Date()) {
  const n = Number(String(anio ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return ''
  return String(Math.min(n, hoy.getFullYear()))
}

// Si el año del vehículo se adelantó al calendario. Lo usa la interfaz para avisar que se
// va a cotizar con otro año: que el precio venga de un año distinto del que el vendedor
// eligió es justo el tipo de cosa que, sin decirla, parece un error.
export function esAnioAdelantado(anio, hoy = new Date()) {
  const n = Number(String(anio ?? '').trim())
  return Number.isFinite(n) && n > hoy.getFullYear()
}
