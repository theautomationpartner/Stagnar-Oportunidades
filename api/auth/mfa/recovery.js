// POST /api/auth/mfa/recovery — entrar con un código de recuperación, para quien perdió
// el celular.
//
// Es la salida de emergencia, y como toda salida de emergencia es también la puerta que
// alguien va a intentar forzar. Tres cosas la sostienen:
//
//   1. El código se consume de forma atómica en la base (UPDATE ... WHERE usado_en IS NULL
//      ... RETURNING). Mandarlo dos veces en paralelo no lo usa dos veces.
//   2. Límite propio y más estricto que el del TOTP.
//   3. NO deja el dispositivo confiable. Quien entra por acá está, por definición, en una
//      situación anómala; darle además 30 días sin preguntar sería premiar el camino
//      excepcional. Lo que se hace es empujarlo a re-enrolar el segundo factor.

import { modoAuth, validarConfig } from '../../_auth/env.js'
import { responderError, ErrorDeFlujo } from '../../_auth/errors.js'
import { contextoPreAuth, finalizarIngreso, leerJson } from '../../_auth/mfaFlow.js'
import { obtenerIp } from '../../_auth/transport.js'
import * as recoveryCodes from '../../_auth/recoveryCodes.js'
import * as db from '../../_auth/db.js'
import * as audit from '../../_auth/audit.js'
import * as rateLimit from '../../_auth/rateLimit.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'METODO_NO_PERMITIDO' })
  }
  if (modoAuth() === 'off') return res.status(404).json({ error: 'NO_DISPONIBLE' })

  try {
    validarConfig({ requiereMonday: false })
    const { usuario, payload } = await contextoPreAuth(req)
    const { codigo } = await leerJson(req)

    const clave = 'recuperacion:' + usuario.id
    await rateLimit.consumir(clave, rateLimit.LIMITES.recuperacion)
    await rateLimit.consumir('ip:' + obtenerIp(req), rateLimit.LIMITES.porIp, { fallarCerrado: false })

    if (!codigo) throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Falta el código de recuperación.')

    const usado = await db.consumirCodigoRecuperacion(usuario.id, recoveryCodes.hashear(codigo))
    if (!usado) {
      await audit.registrar(req, audit.ACCIONES.RECUPERACION_FALLIDA, {
        usuarioId: usuario.id,
        email: usuario.email,
      })
      // Mismo mensaje para "no existe" y para "ya se usó": distinguirlos le confirmaría a
      // quien está probando cuáles códigos existieron alguna vez.
      throw new ErrorDeFlujo('CODIGO_INCORRECTO', 'Ese código de recuperación no es válido.')
    }

    await rateLimit.limpiar(clave)
    const restantes = await db.contarCodigosRecuperacionSinUsar(usuario.id)

    await audit.registrar(req, audit.ACCIONES.RECUPERACION_OK, {
      usuarioId: usuario.id,
      email: usuario.email,
      detalle: { restantes },
    })

    const cuerpo = await finalizarIngreso(req, res, usuario, payload, {
      recordarDispositivo: false,
      via: 'codigo_de_recuperacion',
    })

    return res.status(200).json({
      ...cuerpo,
      codigosRestantes: restantes,
      // El frontend usa esto para llevarlo directo a reconfigurar el 2FA: si perdió el
      // celular, seguir entrando con los 9 códigos que le quedan es postergar el problema
      // hasta que se le acaben.
      recomendarReenrolamiento: true,
    })
  } catch (err) {
    return responderError(res, err)
  }
}
