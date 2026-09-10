// Cómo viajan los tokens entre el navegador y el servidor.
//
// Este archivo es la resolución de un choque real entre dos requisitos correctos:
//
//   - La buena práctica general dice cookie HttpOnly + Secure + SameSite. Es lo que
//     protege el token de un XSS: JavaScript no puede leer una cookie HttpOnly, así que
//     un script inyectado no se la puede llevar.
//
//   - El documento de investigación dice que dentro del iframe de monday las cookies se
//     rompen (SeguidadApp.md, "el detalle que se suele pasar por alto"). Y tiene razón:
//     la app corre en un dominio distinto al de la página que la contiene, así que sus
//     cookies son de terceros. Safari las bloquea de plano y Chrome las aísla. Una
//     sesión guardada solo en cookie funciona en el Chrome del desarrollador y falla en
//     el Safari de un usuario, de forma intermitente e imposible de diagnosticar.
//
// La salida no es elegir: es mandar el token por los dos canales y aceptar cualquiera de
// los dos al leer.
//
//   1. Se intenta la cookie con SameSite=None; Secure; HttpOnly; Partitioned. Ese último
//      atributo (CHIPS) es el mecanismo pensado justamente para iframes: le da a la
//      cookie un contenedor propio por sitio incrustante, así el navegador la acepta sin
//      considerarla rastreo entre sitios. Donde funciona, el token queda fuera del
//      alcance de JavaScript, que es lo que se quería.
//
//   2. El token se devuelve además en el cuerpo JSON, y el frontend lo guarda en
//      localStorage y lo manda en un header. Donde la cookie no llegó, esto sigue
//      funcionando.
//
// El costo hay que decirlo claro y no esconderlo: en el camino 2 el token SÍ es legible
// por JavaScript, así que un XSS lo puede robar. No hay forma de evitarlo dentro de un
// iframe de terceros en Safari — la alternativa sería que la app no funcione. Lo que sí
// se hace es cerrarle la puerta al XSS por otro lado: la CSP estricta de vercel.json, y
// el botón de cerrar sesión, que corta el token y olvida el dispositivo confiable.

import { config } from './env.js'

export const COOKIE_SESION = '__Host_stg_sesion'
export const COOKIE_DISPOSITIVO = 'stg_dispositivo'
export const HEADER_SESION = 'x-session-token'
export const HEADER_DISPOSITIVO = 'x-device-token'
// Canal propio para los tokens a medio camino (preauth y selección de perfil), separado del
// de la sesión. Ver leerTokenFlujo abajo: la separación no es cosmética, arregla un bug.
export const HEADER_FLUJO = 'x-auth-flow-token'

// Header anti-CSRF. Su valor no importa: importa que EXISTA.
export const HEADER_ORIGEN_PROPIO = 'x-app-request'

// ¿Este pedido lo originó nuestra propia interfaz?
//
// Hace falta porque la cookie de sesión es SameSite=None — obligatorio para que exista
// dentro del iframe de monday — y eso significa que viaja también en pedidos que origina
// CUALQUIER otro sitio. Sin este control, una página maliciosa podía hacer que el navegador
// de alguien logueado subiera archivos a monday o disparara envíos de WhatsApp: le alcanzaba
// con un <form> apuntando a nuestros endpoints, porque el navegador adjunta la cookie sola.
// Está verificado: esos pedidos pasaban el guardián.
//
// Por qué un header cualquiera alcanza: un formulario o una imagen de otro sitio solo puede
// generar "pedidos simples", y esos NO pueden llevar headers propios. Cualquier intento de
// agregar uno obliga al navegador a hacer antes una consulta de permiso (preflight) que
// nuestro servidor no responde, así que el pedido nunca sale. Nuestra interfaz lo manda
// siempre (ver headersDeAuth en el frontend), así que para ella es transparente.
export function esPedidoDeLaApp(req) {
  return Boolean(req.headers?.[HEADER_ORIGEN_PROPIO])
}

function parsearCookies(req) {
  // Vercel ya parsea las cookies en req.cookies, pero el dev server de Vite no: en local
  // hay que parsear el header a mano o la sesión no se leería nunca al desarrollar.
  if (req.cookies && typeof req.cookies === 'object') return req.cookies
  const crudo = req.headers?.cookie
  if (!crudo) return {}
  return Object.fromEntries(
    crudo.split(';').map((par) => {
      const i = par.indexOf('=')
      if (i < 0) return [par.trim(), '']
      return [par.slice(0, i).trim(), decodeURIComponent(par.slice(i + 1).trim())]
    })
  )
}

// El orden importa y es deliberado: primero la cookie. Si el navegador la aceptó, ese es
// el canal con HttpOnly, y preferirlo evita que un token robado por XSS y reinyectado
// por header le gane a la sesión legítima.
export function leerTokenSesion(req) {
  const cookies = parsearCookies(req)
  return cookies[COOKIE_SESION] || req.headers?.[HEADER_SESION] || null
}

export function leerTokenDispositivo(req) {
  const cookies = parsearCookies(req)
  return cookies[COOKIE_DISPOSITIVO] || req.headers?.[HEADER_DISPOSITIVO] || null
}

// Los tokens del flujo de ingreso (preauth y selección de perfil) se leen SOLO del header,
// nunca de la cookie. Y va en un header distinto del de la sesión.
//
// Esto arregla un bug concreto y bastante feo: leerTokenSesion prefiere la cookie, así que
// una cookie de sesión todavía viva TAPABA al token de selección que el cliente mandaba por
// header. El endpoint recibía un token con audiencia 'sesion' donde esperaba 'seleccion', lo
// rechazaba por claim inválido, el frontend interpretaba ese 401 como "el token venció" y
// reiniciaba el ingreso — que volvía a fallar igual. El resultado era un bucle: elegir
// perfil, error, volver a elegir perfil, sin forma de salir ni de entender por qué.
//
// La lección general: un token de vida corta y un token de sesión no pueden compartir la
// misma ranura de transporte. Se distinguen por audiencia al verificar, pero si el
// transporte los confunde, la verificación ya llega con el token equivocado en la mano.
export function leerTokenFlujo(req) {
  return req.headers?.[HEADER_FLUJO] || null
}

// El sessionToken de monday llega siempre por Authorization (es el header que ya está
// declarado, vacío, en el fetch actual de la app — ver mondayApi.js).
export function leerTokenMonday(req) {
  const auth = req.headers?.authorization
  if (!auth) return null
  return auth.replace(/^Bearer\s+/i, '').trim() || null
}

function armarCookie(nombre, valor, maxEdadSegundos, { particionada = true } = {}) {
  const partes = [
    nombre + '=' + encodeURIComponent(valor),
    'Path=/',
    'Max-Age=' + maxEdadSegundos,
    'HttpOnly',
    'Secure',
    // SameSite=None es obligatorio para que la cookie exista dentro del iframe de
    // monday; Partitioned es lo que la vuelve aceptable en los navegadores que ya
    // bloquean las cookies de terceros sin particionar.
    'SameSite=None',
  ]
  if (particionada) partes.push('Partitioned')
  return partes.join('; ')
}

function agregarCookie(res, cookie) {
  const previas = res.getHeader('Set-Cookie')
  const lista = previas ? (Array.isArray(previas) ? previas : [previas]) : []
  res.setHeader('Set-Cookie', [...lista, cookie])
}

export function escribirSesion(res, token) {
  agregarCookie(res, armarCookie(COOKIE_SESION, token, config.sessionTtlHoras * 3600))
}

export function escribirDispositivo(res, token) {
  agregarCookie(res, armarCookie(COOKIE_DISPOSITIVO, token, config.deviceTtlDias * 86400))
}

// Borrar una cookie exige repetir sus atributos. Se mandan las dos variantes —con y sin
// Partitioned— porque no todos los navegadores honran ese atributo al escribirla: si el
// navegador la guardó sin particionar, el borrado con Partitioned no la encuentra y la
// cookie sobrevive al "cerrar sesión". Una cookie de sesión que no se muere es exactamente
// lo que dejaba el ingreso trabado en bucle (ver leerTokenFlujo).
function borrarCookie(res, nombre) {
  agregarCookie(res, armarCookie(nombre, '', 0))
  agregarCookie(res, armarCookie(nombre, '', 0, { particionada: false }))
}

export function borrarSesion(res) {
  borrarCookie(res, COOKIE_SESION)
}

export function borrarDispositivo(res) {
  borrarCookie(res, COOKIE_DISPOSITIVO)
}

// x-forwarded-for puede traer una cadena de proxies; el cliente real es el primero. En
// Vercel viene además x-real-ip ya resuelto, que es más confiable porque lo escribe la
// plataforma y no se puede falsificar desde el cliente.
export function obtenerIp(req) {
  const real = req.headers?.['x-real-ip']
  if (real) return String(real)
  const reenviado = req.headers?.['x-forwarded-for']
  if (reenviado) return String(reenviado).split(',')[0].trim()
  return req.socket?.remoteAddress ?? null
}

export function obtenerUserAgent(req) {
  const ua = req.headers?.['user-agent']
  return ua ? String(ua).slice(0, 400) : null
}
