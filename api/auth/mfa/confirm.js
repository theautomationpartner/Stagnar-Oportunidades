// POST /api/auth/mfa/confirm — enrolamiento, segundo paso: el usuario tipea el primer
// código y con eso demuestra que el QR quedó guardado en su celular.
//
// Recién acá el secreto pasa a confirmado, y recién acá se generan los 10 códigos de
// recuperación. Se muestran UNA sola vez: la base guarda su HMAC, no el código, así que
// ni nosotros podemos volver a mostrarlos. Eso es a propósito y hay que decírselo al
// usuario en la misma pantalla, porque es su única oportunidad de anotarlos.

import { modoAuth, validarConfig } from '../../_auth/env.js'
import { responderError, ErrorDeFlujo } from '../../_auth/errors.js'
import { descifrar } from '../../_auth/crypto.js'
import { contextoPreAuth, finalizarIngreso, leerJson } from '../../_auth/mfaFlow.js'
import * as totp from '../../_auth/totp.js'
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
    const { codigo, recordarDispositivo } = await leerJson(req)

    const clave = 'mfa-setup:' + usuario.id
    await rateLimit.consumir(clave, rateLimit.LIMITES.mfaEnrolamiento)

    const registro = await db.obtenerMfa(usuario.id)
    if (!registro) {
      throw new ErrorDeFlujo('SIN_ENROLAMIENTO', 'No hay un enrolamiento en curso. Volvé a empezar.', 409)
    }
    if (registro.confirmado_en) {
      throw new ErrorDeFlujo('MFA_YA_CONFIGURADO', 'El segundo factor ya está configurado.', 409)
    }

    const { valido, periodo } = totp.verificarCodigo(descifrar(registro.secreto_cifrado), codigo)
    if (!valido) {
      await audit.registrar(req, audit.ACCIONES.MFA_SETUP_FALLIDO, {
        usuarioId: usuario.id,
        email: usuario.email,
      })
      throw new ErrorDeFlujo('CODIGO_INCORRECTO', 'El código no coincide. Revisá que sea el actual.')
    }

    // El período del código que acaba de usarse queda consumido ya en la confirmación:
    // si no, ese mismo código serviría una segunda vez en /verify durante los 30 segundos
    // siguientes.
    const confirmado = await db.confirmarMfa(usuario.id, periodo)
    if (!confirmado) {
      throw new ErrorDeFlujo('MFA_YA_CONFIGURADO', 'El segundo factor ya está configurado.', 409)
    }

    const { claros, hashes } = recoveryCodes.generarCodigos()
    await db.reemplazarCodigosRecuperacion(usuario.id, hashes)
    await rateLimit.limpiar(clave)

    await audit.registrar(req, audit.ACCIONES.MFA_ENROLADO, {
      usuarioId: usuario.id,
      email: usuario.email,
      mondayUserId: payload.mid ?? null,
    })

    // Terminar de enrolarse ES haber pasado el segundo factor, así que el ingreso se cierra
    // acá mismo. Pedirle el código otra vez a alguien que lo acaba de tipear correctamente
    // no agrega seguridad y solo se lee como que algo falló.
    const cuerpo = await finalizarIngreso(req, res, usuario, payload, {
      recordarDispositivo: Boolean(recordarDispositivo),
      via: 'enrolamiento',
    })

    return res.status(200).json({
      ...cuerpo,
      // Única vez que estos códigos existen en texto plano fuera del papel del usuario.
      codigosRecuperacion: claros,
    })
  } catch (err) {
    return responderError(res, err)
  }
}
