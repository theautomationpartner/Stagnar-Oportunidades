import { headersDeAuth, EVENTO_SESION_CAIDA } from './authClient'

// El fetch que tiene que usar TODO pedido al backend, sin excepción.
//
// Hace tres cosas que ninguna llamada suelta debería tener que recordar:
//
//   1. Agrega los headers de sesión y dispositivo (el canal que funciona cuando la cookie
//      no sobrevive al iframe de monday).
//   2. Manda credentials: 'include', para que la cookie Partitioned viaje cuando sí
//      sobrevivió.
//   3. Convierte un 401/403 en un evento que devuelve al usuario a la pantalla de ingreso,
//      en vez de dejar que el error se pierda en un catch cualquiera y la persona se quede
//      mirando una tabla vacía sin saber que se le venció la sesión.
//
// El punto 3 es el que hace que la revocación en caliente se note: si un administrador da
// de baja a alguien, su siguiente pedido vuelve 401 y la app lo saca en el acto, que es
// justamente lo que promete la regla de revisar la lista blanca en cada pedido.

export class ErrorDeSesion extends Error {
  constructor(codigo, status) {
    super(codigo)
    this.name = 'ErrorDeSesion'
    this.codigo = codigo
    this.status = status
  }
}

export async function fetchProtegido(url, opciones = {}) {
  const respuesta = await fetch(url, {
    ...opciones,
    credentials: 'include',
    headers: headersDeAuth(opciones.headers ?? {}),
  })

  if (respuesta.status === 401 || respuesta.status === 403) {
    let codigo = 'NO_AUTORIZADO'
    try {
      codigo = (await respuesta.clone().json()).error ?? codigo
    } catch {
      /* respuesta de error sin cuerpo JSON */
    }
    window.dispatchEvent(new CustomEvent(EVENTO_SESION_CAIDA, { detail: { codigo } }))
    throw new ErrorDeSesion(codigo, respuesta.status)
  }

  return respuesta
}
