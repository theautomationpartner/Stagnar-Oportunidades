// Cliente de autenticación del navegador: dónde se guardan los tokens, cómo se mandan y
// cómo se llama a /api/auth/*.
//
// Es la contracara de api/_auth/transport.js. Ahí se explica por qué hay dos canales; acá
// se implementa el lado del cliente:
//
//   - credentials: 'include' en cada fetch, para que la cookie Partitioned viaje si el
//     navegador la aceptó. Es lo único que hace falta para el canal bueno (HttpOnly).
//   - Además, el token se guarda en localStorage y se manda por header. Es el canal que
//     sigue funcionando en Safari y en cualquier navegador que descarte las cookies de
//     terceros dentro del iframe de monday.
//
// El localStorage del iframe está separado por origen, así que lo que guarda esta app no
// lo ve monday ni ninguna otra app embebida. Aun así: acá van los tokens de sesión y de
// dispositivo, y NADA más relacionado con seguridad. Las preferencias de UI que la app ya
// guarda (bancos, tipos de tarjeta) siguen donde están y no se mezclan con esto.

const CLAVE_SESION = 'stg_session_token'
const CLAVE_DISPOSITIVO = 'stg_device_token'

// Evento que dispara fetchProtegido.js cuando un pedido de datos vuelve 401/403, y que
// escucha AuthContext.jsx para devolver al usuario a la pantalla de ingreso. Vive acá y no
// en AuthContext para que fetchProtegido no tenga que importar el contexto de React —
// eso cerraría un ciclo de imports entre el cliente HTTP y el árbol de componentes.
export const EVENTO_SESION_CAIDA = 'stg:sesion-caida'

// localStorage puede tirar: modo privado de Safari, políticas de empresa, o un iframe con
// el almacenamiento de terceros bloqueado. Ninguno de esos casos puede romper la app — el
// efecto tiene que ser, como mucho, que vuelva a pedir el código de 6 dígitos.
function leer(clave) {
  try {
    return window.localStorage.getItem(clave)
  } catch {
    return null
  }
}

function escribir(clave, valor) {
  try {
    if (valor) window.localStorage.setItem(clave, valor)
    else window.localStorage.removeItem(clave)
  } catch {
    /* sin localStorage la sesión dura lo que dure la pestaña; es degradación, no falla */
  }
}

export const tokens = {
  sesion: () => leer(CLAVE_SESION),
  dispositivo: () => leer(CLAVE_DISPOSITIVO),
  guardarSesion: (t) => escribir(CLAVE_SESION, t),
  guardarDispositivo: (t) => escribir(CLAVE_DISPOSITIVO, t),
  limpiarSesion: () => escribir(CLAVE_SESION, null),
  limpiarTodo: () => {
    escribir(CLAVE_SESION, null)
    escribir(CLAVE_DISPOSITIVO, null)
  },
}

// Los headers que hay que agregarle a CUALQUIER pedido al backend, no solo a los de
// /api/auth. Los exporta para que mondayApi.js los use en su fetch (ver callMondayApi).
export function headersDeAuth(extra = {}) {
  // Marca de origen propio: sin este header el backend rechaza el pedido. Es la defensa
  // anti-CSRF — un sitio ajeno no puede ponerlo (ver esPedidoDeLaApp en el backend).
  const headers = { 'X-App-Request': '1', ...extra }
  const sesion = tokens.sesion()
  const dispositivo = tokens.dispositivo()
  if (sesion) headers['X-Session-Token'] = sesion
  if (dispositivo) headers['X-Device-Token'] = dispositivo
  return headers
}

export class ErrorDeAuth extends Error {
  constructor(codigo, mensaje, status) {
    super(mensaje || codigo)
    this.name = 'ErrorDeAuth'
    this.codigo = codigo
    this.status = status
  }
}

async function pedir(ruta, { metodo = 'POST', cuerpo, token } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-App-Request': '1' }
  // Los tokens del flujo de ingreso (preauth y selección de perfil) van por un header
  // PROPIO, distinto del de la sesión.
  //
  // Compartían header, y eso rompía: como el servidor lee la sesión primero de la cookie,
  // una cookie de sesión todavía viva tapaba al token del flujo, el endpoint lo rechazaba
  // por audiencia, y el frontend leía ese 401 como "venció" y reiniciaba el ingreso — que
  // volvía a fallar igual. Bucle infinito eligiendo perfil.
  if (token) headers['X-Auth-Flow-Token'] = token
  else Object.assign(headers, headersDeAuth())

  const res = await fetch(ruta, {
    method: metodo,
    headers,
    // Sin esto la cookie Partitioned no viaja y el canal HttpOnly no serviría de nada.
    credentials: 'include',
    body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo ?? {}),
  })

  let datos = {}
  try {
    datos = await res.json()
  } catch {
    /* 204, o una respuesta de error sin cuerpo */
  }

  if (!res.ok) throw new ErrorDeAuth(datos.error ?? 'ERROR', datos.mensaje, res.status)
  return datos
}

// Guarda lo que devolvió un ingreso exitoso. El servidor manda los tokens en el cuerpo
// además de en las cookies; si las cookies funcionaron, esto es redundante y no molesta.
function guardarIngreso(datos) {
  if (datos.sessionToken) tokens.guardarSesion(datos.sessionToken)
  if (datos.deviceToken) tokens.guardarDispositivo(datos.deviceToken)
  return datos
}

// --- proveedor "monday" -------------------------------------------------------

// No pasa por `pedir` porque es el único caso donde el token va en Authorization y no en
// X-Session-Token: ese es justamente el header que el fetch original de la app ya tenía
// declarado y vacío (ver mondayApi.js), y es donde monday espera que vaya su token.
export async function abrirSesionMonday(sessionTokenDeMonday) {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + sessionTokenDeMonday,
      ...headersDeAuth(),
    },
    credentials: 'include',
    body: '{}',
  })
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new ErrorDeAuth(datos.error ?? 'ERROR', datos.mensaje, res.status)
  return guardarIngreso(datos)
}

// --- selección de perfil (asiento de monday compartido) -------------------------

// El seleccionToken viaja por el mismo header que la sesión, pero tiene audiencia propia
// del lado del servidor: no sirve para pedir datos ni para los endpoints de MFA.
export async function elegirPerfil(seleccionToken, itemId) {
  return guardarIngreso(await pedir('/api/auth/perfil', { token: seleccionToken, cuerpo: { itemId } }))
}

// --- proveedor "contraseña" ----------------------------------------------------

export async function abrirSesionConContrasena(email, contrasena) {
  return guardarIngreso(await pedir('/api/auth/login', { cuerpo: { email, contrasena } }))
}

// --- segundo factor -------------------------------------------------------------

// `reiniciar` descarta el enrolamiento a medio hacer y devuelve un QR nuevo. Sin eso el
// endpoint es idempotente: devuelve siempre el mismo secreto pendiente, que es justamente
// lo que evita que recargar la página invalide el QR que la persona ya escaneó.
export function pedirQr(preAuthToken, { reiniciar = false } = {}) {
  return pedir('/api/auth/mfa/setup', { token: preAuthToken, cuerpo: { reiniciar } })
}

export async function confirmarEnrolamiento(preAuthToken, codigo, recordarDispositivo) {
  return guardarIngreso(
    await pedir('/api/auth/mfa/confirm', {
      token: preAuthToken,
      cuerpo: { codigo, recordarDispositivo },
    })
  )
}

export async function verificarCodigo(preAuthToken, codigo, recordarDispositivo) {
  return guardarIngreso(
    await pedir('/api/auth/mfa/verify', {
      token: preAuthToken,
      cuerpo: { codigo, recordarDispositivo },
    })
  )
}

export async function usarCodigoDeRecuperacion(preAuthToken, codigo) {
  return guardarIngreso(
    await pedir('/api/auth/mfa/recovery', { token: preAuthToken, cuerpo: { codigo } })
  )
}

// --- sesión ------------------------------------------------------------------------

export function quienSoy() {
  return pedir('/api/auth/me', { metodo: 'GET' })
}

export async function cerrarSesion({ todas = false } = {}) {
  try {
    await pedir('/api/auth/logout', { cuerpo: { todas } })
  } finally {
    // Pase lo que pase del lado del servidor, del lado del navegador la sesión se va. Un
    // logout que falla y deja los tokens puestos es la peor variante posible.
    if (todas) tokens.limpiarTodo()
    else tokens.limpiarSesion()
  }
}
