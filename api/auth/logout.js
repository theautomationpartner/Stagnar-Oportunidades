// POST /api/auth/logout — cerrar sesión.
//
// Dos alcances distintos, y la diferencia importa cuando alguien pierde un dispositivo:
//
//   { }                        cierra esta sesión y olvida ESTE dispositivo.
//   { todas: true }            cierra todas las sesiones vivas de la persona en todos sus
//                              dispositivos, y borra todos los "confiar por 30 días".
//
// El segundo es el que hay que ofrecer en la interfaz con un texto claro tipo "cerrar
// sesión en todos los dispositivos": es la única acción que le sirve a alguien al que le
// robaron el celular. Funciona sin llevar una lista de JWTs emitidos, moviendo la marca de
// agua sesiones_validas_desde (ver db.invalidarSesiones y tokens.sesionEsPosteriorA).

import { modoAuth } from '../_auth/env.js'
import { responderError } from '../_auth/errors.js'
import { verificarSesion } from '../_auth/tokens.js'
import {
  leerTokenSesion,
  leerTokenDispositivo,
  borrarSesion,
  borrarDispositivo,
} from '../_auth/transport.js'
import { hashConPepper } from '../_auth/crypto.js'
import { leerJson } from '../_auth/mfaFlow.js'
import * as db from '../_auth/db.js'
import * as audit from '../_auth/audit.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'METODO_NO_PERMITIDO' })
  }
  if (modoAuth() === 'off') return res.status(200).json({ ok: true })

  // Cerrar sesión siempre "funciona", aunque el token ya estuviera vencido o fuera basura:
  // las cookies se borran igual. Un logout que devuelve 401 deja al usuario con la sesión
  // rota y sin forma de salir, que es el peor de los dos mundos.
  borrarSesion(res)
  borrarDispositivo(res)

  try {
    const { todas } = await leerJson(req).catch(() => ({}))
    const payload = await verificarSesion(leerTokenSesion(req))
    const usuarioId = Number(payload.sub)

    if (todas) {
      await db.invalidarSesiones(usuarioId)
      await db.olvidarTodosLosDispositivos(usuarioId)
    } else {
      const dispositivo = leerTokenDispositivo(req)
      if (dispositivo) await db.olvidarDispositivo(hashConPepper(dispositivo))
    }

    await audit.registrar(req, audit.ACCIONES.LOGOUT, {
      usuarioId,
      email: payload.ema ?? null,
      detalle: { alcance: todas ? 'todas_las_sesiones' : 'esta_sesion' },
    })
  } catch {
    // Sin sesión válida no hay nada que revocar del lado del servidor, y las cookies ya se
    // borraron arriba. No es un error que le importe a nadie.
  }

  return res.status(200).json({ ok: true })
}
