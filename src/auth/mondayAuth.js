import mondaySdk from 'monday-sdk-js'

// Obtención del sessionToken que monday le da a la app cada vez que la carga. Es el
// primer paso de toda la implementación y hoy no existe en el bundle: el fetch de
// mondayApi.js manda Authorization vacío, o sea que el backend no tiene forma de saber
// quién pregunta.
//
// monday.get('sessionToken') habla por postMessage con la ventana padre (monday.com).
// Fuera de ese iframe —dev local en localhost:5173, o un Preview de Vercel abierto
// suelto— NUNCA llega respuesta: la promesa se queda colgada para siempre, no rechaza.
// Por eso todo acá corre con timeout, igual que fetchCurrentMondayUser en mondayApi.js.
// Sin el timeout, la app se quedaría con la pantalla de carga eterna al desarrollar.

const monday = mondaySdk()

const TIMEOUT_MS = 5000
// El token trae su propio exp. Se renueva un minuto antes de que venza, para que nunca
// se mande uno que acaba de expirar en el viaje.
const MARGEN_MS = 60_000

let cache = null

function conTimeout(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), ms)),
  ])
}

// Lee el exp del token sin verificar la firma. Está bien acá y solo acá: es el propio
// navegador mirando su propio token para saber cuándo pedir otro. La verificación de
// verdad la hace el backend, que es el único que tiene el secreto. Un token adulterado
// acá no engaña a nadie más que a esta caché.
function vencimientoDe(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp ? payload.exp * 1000 : Date.now() + 5 * 60_000
  } catch {
    return Date.now() + 5 * 60_000
  }
}

// Devuelve el token, o null si la app no está corriendo dentro de monday. null no es un
// error: es la respuesta legítima al desarrollar en local, y quien llama decide qué hacer
// con eso (ver AuthContext.jsx).
export async function obtenerSessionToken() {
  if (cache && Date.now() < cache.vence - MARGEN_MS) return cache.token

  // Si no estamos embebidos, ni se pregunta. El sessionToken llega por postMessage desde la
  // ventana padre, así que sin padre la promesa no se resuelve nunca y lo único que se logra
  // es esperar los 5 segundos del timeout antes de seguir. Vale tanto en local como en un
  // Preview de Vercel abierto suelto: en los dos casos la respuesta correcta es "no hay
  // token", y averiguarlo es instantáneo.
  if (pareceEstarDentroDeMonday()) {
    try {
      const res = await conTimeout(monday.get('sessionToken'), TIMEOUT_MS)
      const token = res?.data
      if (typeof token === 'string' && token) {
        cache = { token, vence: vencimientoDe(token) }
        return token
      }
    } catch {
      /* el SDK no contestó a tiempo; sigue abajo */
    }
  }

  return tokenDeDesarrollo()
}

// Ingreso de desarrollo: le pide al dev server de Vite un sessionToken firmado con el
// secreto de la app, para poder ejercitar todo el flujo (lista blanca, perfiles, 2FA,
// permisos) sin tener que abrir la app dentro de monday.
//
// Dos garantías independientes de que esto NO existe en un build de producción:
//   1. import.meta.env.DEV es una constante que Vite reemplaza por `false` al compilar, así
//      que este bloque entero se elimina del bundle. No queda ni el fetch.
//   2. Aunque quedara, el endpoint solo lo sirve el dev server de Vite y solo con
//      AUTH_DEV_LOGIN=on. En Vercel no existe.
async function tokenDeDesarrollo() {
  if (!import.meta.env.DEV) return null
  if (import.meta.env.VITE_AUTH_DEV_LOGIN !== 'on') return null

  try {
    // El usuario a simular sale de la URL (?devUser=102989607) o de AUTH_DEV_USER_ID en el
    // .env. Por la query es lo cómodo para probar a una persona distinta sin reiniciar.
    const devUser = new URLSearchParams(window.location.search).get('devUser')
    const res = await fetch('/api/dev/session-token' + (devUser ? '?userId=' + devUser : ''))
    if (!res.ok) return null
    const { token } = await res.json()
    if (!token) return null
    console.warn('[auth-dev] entrando con un sessionToken de desarrollo, no con el de monday')
    cache = { token, vence: vencimientoDe(token) }
    return token
  } catch {
    return null
  }
}

// ¿Estamos dentro de un iframe? Es un indicio barato y sincrónico de si tiene sentido
// esperar un sessionToken, útil para no hacer esperar 5 segundos a quien abrió la URL
// suelta en una pestaña.
export function pareceEstarDentroDeMonday() {
  try {
    return window.self !== window.top
  } catch {
    // Si el navegador tira al comparar, es porque hay un origen distinto arriba: o sea,
    // sí estamos embebidos.
    return true
  }
}

export function olvidarSessionToken() {
  cache = null
}
