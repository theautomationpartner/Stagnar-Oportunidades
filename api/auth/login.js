// POST /api/auth/login — proveedor de identidad "contraseña" (2.1 del documento: acceso a
// la app fuera del entorno nativo de monday).
//
// Apagado por defecto (AUTH_PASSWORD_LOGIN=on para encenderlo). Mientras la app viva
// dentro del iframe de monday NO hay que encenderlo: la identidad ya la da el sessionToken
// firmado, y una contraseña más es una contraseña más que robar, adivinar y rotar. El
// código existe para el día que haya un acceso directo real, no para usarse en paralelo.
//
// Contesta exactamente lo mismo que /api/auth/session (OK / MFA_REQUERIDO /
// MFA_ENROLAMIENTO_REQUERIDO), a propósito: el frontend tiene un solo camino después del
// login, sin importar por dónde entró la persona.

import { config, modoAuth, validarConfig } from '../_auth/env.js'
import { responderError, NoAutorizado, ErrorDeFlujo } from '../_auth/errors.js'
import { resolverDesdeEmail } from '../_auth/whitelist.js'
import { obtenerIp } from '../_auth/transport.js'
import { continuarSegunMfa, leerJson } from '../_auth/mfaFlow.js'
import * as password from '../_auth/password.js'
import * as audit from '../_auth/audit.js'
import * as rateLimit from '../_auth/rateLimit.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'METODO_NO_PERMITIDO' })
  }
  if (modoAuth() === 'off' || !config.passwordLogin) {
    return res.status(404).json({ error: 'NO_DISPONIBLE' })
  }

  try {
    validarConfig({ requiereMonday: false })
    const { email, contrasena } = await leerJson(req)
    if (!email || !contrasena) {
      throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Falta el email o la contraseña.')
    }
    const emailNormalizado = String(email).toLowerCase().trim()

    // Dos límites, y los dos hacen falta. El de IP frena a quien prueba muchos emails
    // distintos desde un lugar; el de email frena a quien prueba muchas contraseñas
    // contra una persona concreta desde IPs rotativas.
    await rateLimit.consumir('ip:' + obtenerIp(req), rateLimit.LIMITES.porIp, { fallarCerrado: false })
    await rateLimit.consumir('login:' + emailNormalizado, rateLimit.LIMITES.login)

    let usuario = null
    try {
      usuario = await resolverDesdeEmail(emailNormalizado)
    } catch (err) {
      if (!(err instanceof NoAutorizado)) throw err
    }

    // Si el email no existe (o está revocado), igual se gasta el tiempo de un Argon2. Sin
    // eso, la respuesta instantánea contra un email inexistente frente a los ~50 ms de uno
    // real deja enumerar quién tiene cuenta midiendo tiempos — y la respuesta genérica no
    // serviría de nada.
    const valida = usuario?.password_hash
      ? await password.verificar(usuario.password_hash, contrasena)
      : (await password.gastarTiempoComoSiExistiera(contrasena), false)

    if (!usuario || !valida) {
      await audit.registrar(req, audit.ACCIONES.LOGIN_FALLIDO, {
        usuarioId: usuario?.id ?? null,
        email: emailNormalizado,
        detalle: { motivo: usuario ? 'contrasena_incorrecta' : 'email_desconocido' },
      })
      // Mismo error para las dos causas. Decir cuál fue es regalarle al atacante la mitad
      // del trabajo.
      throw new NoAutorizado('credenciales_invalidas')
    }

    await rateLimit.limpiar('login:' + emailNormalizado)

    // Misma rama final que el camino de monday: un solo lugar que decida si falta enrolar,
    // si falta el código o si el dispositivo ya es confiable.
    return res.status(200).json(
      await continuarSegunMfa(req, res, usuario, {
        mondayUserId: usuario.monday_user_id ?? null,
        mondayAccountId: usuario.monday_account_id ?? null,
        origen: 'password',
      })
    )
  } catch (err) {
    return responderError(res, err)
  }
}
