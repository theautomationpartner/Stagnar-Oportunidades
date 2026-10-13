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

const conLimite = (promesa, ms) =>
  Promise.race([promesa, new Promise((resolver) => setTimeout(() => resolver(null), ms))]).catch(() => null)

// La ubicación de la página de monday. Se pide al cargar la app y se guarda apenas llega
// (sin corte: al entrar de cero monday puede tardar en contestar mientras arma la vista).
// Así, al hacer clic en "Copiar link", el link ya está y el portapapeles se escribe en el
// mismo clic (el navegador lo exige).
let ubicacion = null
const ubicacionPromesa = conLimite(
  monday.get('location').then((r) => r?.data ?? null),
  15000
).then((u) => {
  if (u) ubicacion = u
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

// Busca ?oportunidad=<id> en un texto de URL: en los parámetros y también en el hash
// (según el tipo de vista, monday puede dejarlo en uno u otro).
function idEn(texto) {
  if (!texto) return null
  try {
    const url = new URL(texto, 'https://x.invalid')
    const id =
      url.searchParams.get(PARAMETRO) ||
      new URLSearchParams(url.hash.replace(/^#/, '').split('?')[1] || '').get(PARAMETRO)
    return id && /^\d+$/.test(id) ? id : null
  } catch {
    const m = String(texto).match(new RegExp(`[?&#]${PARAMETRO}=(\\d+)`))
    return m ? m[1] : null
  }
}

// El id de la oportunidad que vino en el link, o null. Se busca en la URL de la página de
// monday (SDK) y en la del propio iframe: monday puede pasarle los parámetros a la app en
// vez de dejarlos en su URL. Deja una línea en la consola con lo que encontró, para poder
// diagnosticar si en algún tipo de vista no llega.
export async function oportunidadDelLink() {
  // Si ya vino en la URL del propio iframe, no hace falta esperar a monday.
  const directo = idEn(window.location.href)
  if (directo) {
    console.info('[compartir] oportunidad en la URL de la app:', directo)
    return directo
  }
  const u = await ubicacionPromesa
  const candidatos = [u?.href, u?.search && '?' + String(u.search).replace(/^\?/, ''), window.location.href]
  const id = candidatos.map(idEn).find(Boolean) ?? null
  console.info('[compartir] ubicación de monday:', u?.href ?? '(sin respuesta)', '· iframe:', window.location.href, '· oportunidad:', id ?? '(ninguna)')
  return id
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
