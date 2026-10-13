// A pedido: "compartir la oportunidad" — copiar un link que, al abrirlo otra persona, le
// abre esa misma oportunidad en la app.
//
// La app corre adentro de monday (en un iframe): su dirección interna (#/oportunidades/id)
// no se ve en la barra del navegador. Lo que se comparte es la URL de la PÁGINA de monday
// donde está la app (la da el SDK con monday.get('location')) con ?oportunidad=<id>. Al
// abrirla, monday carga la app, la app lee ese parámetro y va a esa oportunidad (ver
// oportunidadDelLink y App.jsx). Quien no tenga acceso a la app queda afuera igual.
//
// Fuera de monday (dev local, o la app abierta suelta) el SDK no contesta: el link es la
// propia URL de la app con la ruta de la oportunidad.
import mondaySdk from 'monday-sdk-js'

const monday = mondaySdk()
const PARAMETRO = 'oportunidad'

// Se pide una sola vez, al cargar la app: así, al hacer clic en "Copiar link", el link ya
// está y el portapapeles se escribe en el mismo clic (el navegador lo exige).
let ubicacion = null
const ubicacionPromesa = Promise.race([
  monday.get('location').then((r) => r?.data ?? null),
  new Promise((resolver) => setTimeout(() => resolver(null), 3000)),
])
  .catch(() => null)
  .then((u) => {
    ubicacion = u
    return u
  })

function armarLink(id, u) {
  if (u?.href) {
    const url = new URL(u.href)
    url.searchParams.set(PARAMETRO, String(id))
    return url.toString()
  }
  return `${window.location.origin}${window.location.pathname}#/oportunidades/${id}`
}

// El link, sin esperar (para usar en el clic). Si todavía no se sabe la ubicación de
// monday, sale el link directo a la app.
export function linkDeOportunidad(id) {
  return armarLink(id, ubicacion)
}

// El id de la oportunidad que vino en el link (?oportunidad=…), o null.
export async function oportunidadDelLink() {
  const u = await ubicacionPromesa
  const search = u?.search ?? window.location.search
  const id = new URLSearchParams(search).get(PARAMETRO)
  return id && /^\d+$/.test(id) ? id : null
}

// Copia al portapapeles. Adentro de un iframe de otro dominio el navegador puede negar
// navigator.clipboard: se prueba el camino viejo (execCommand) y, si tampoco, false.
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // sigue con el plan B
  }
  try {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
