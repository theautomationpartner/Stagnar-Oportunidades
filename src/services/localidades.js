import { sinCodigoPostal } from './format'

// Opciones de "Zona principal de circulación" para un desplegable (reunión del 24/09): sin
// el código postal, y con UN solo renglón por nombre dentro de cada departamento — sin el
// CP, "Colonia Nicolich - CP14000" y "Colonia Nicolich - CP15000" se ven iguales, y a
// pedido queda la primera que aparece. Si la que ya está guardada es una de las
// repetidas, queda esa (así el desplegable no aparece vacío).
//
// El valor sigue siendo el id del ítem de Localidades: el nombre completo, con CP, es el
// que usa el robot en WINK y no se toca.
export function opcionesDeLocalidad(localidades, { departamento, seleccionadaId } = {}) {
  const lista = departamento ? localidades.filter((l) => l.departamento === departamento) : localidades
  const porNombre = new Map()
  for (const l of lista) {
    const label = sinCodigoPostal(l.name)
    const clave = `${l.departamento}|${label.toLowerCase()}`
    const ya = porNombre.get(clave)
    // Map conserva la posición de la primera: reemplazar el valor no la cambia de lugar.
    if (!ya || String(l.id) === String(seleccionadaId ?? '')) porNombre.set(clave, { value: l.id, label })
  }
  return [...porNombre.values()]
}
