// POST /api/auth/mfa/verify — el ingreso de todos los días: el código de 6 dígitos.
//
// Es el endpoint más atacado de toda la aplicación y por eso es el que más protecciones
// acumula. Sin límite de intentos, seis dígitos son un millón de combinaciones que un
// script prueba en horas; con window: 1 hay además tres códigos válidos a la vez, lo que
// divide ese millón por tres. El límite de 5 intentos cada 15 minutos es lo que convierte
// esa cuenta en inalcanzable: al ritmo permitido, dar con un código llevaría años.

import { modoAuth, validarConfig } from '../../_auth/env.js'
import { responderError, ErrorDeFlujo } from '../../_auth/errors.js'
import { descifrar } from '../../_auth/crypto.js'
import { contextoPreAuth, finalizarIngreso, leerJson } from '../../_auth/mfaFlow.js'
import { obtenerIp } from '../../_auth/transport.js'
import * as totp from '../../_auth/totp.js'
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

    // El límite se consume ANTES de verificar, no después de fallar. La diferencia es
    // real: contando solo los fallos, quien acierta no consume cupo, y eso permite
    // intercalar aciertos para no agotarlo nunca. Se cuenta el intento, y se limpia al
    // acertar (más abajo) para que un usuario legítimo que se equivocó no quede penado.
    const clave = 'mfa:' + usuario.id
    await rateLimit.consumir(clave, rateLimit.LIMITES.mfaVerificacion)
    await rateLimit.consumir('ip:' + obtenerIp(req), rateLimit.LIMITES.porIp, { fallarCerrado: false })

    const registro = await db.obtenerMfa(usuario.id)
    if (!registro?.confirmado_en) {
      throw new ErrorDeFlujo('SIN_ENROLAMIENTO', 'Todavía no configuraste el segundo factor.', 409)
    }

    const { valido, periodo } = totp.verificarCodigo(descifrar(registro.secreto_cifrado), codigo)
    if (!valido) {
      await audit.registrar(req, audit.ACCIONES.MFA_FALLIDO, {
        usuarioId: usuario.id,
        email: usuario.email,
        mondayUserId: payload.mid ?? null,
      })
      throw new ErrorDeFlujo('CODIGO_INCORRECTO', 'El código no coincide. Revisá que sea el actual.')
    }

    // Anti-reutilización: un código sirve UNA sola vez. El período consumido lo decide la
    // base con un UPDATE condicional, no un if en JavaScript — así dos pedidos simultáneos
    // con el mismo código no pasan los dos (ver db.consumirPeriodoTotp).
    if (!(await db.consumirPeriodoTotp(usuario.id, periodo))) {
      await audit.registrar(req, audit.ACCIONES.MFA_REUTILIZADO, {
        usuarioId: usuario.id,
        email: usuario.email,
        detalle: { periodo },
      })
      throw new ErrorDeFlujo('CODIGO_YA_USADO', 'Ese código ya se usó. Esperá al siguiente.')
    }

    await rateLimit.limpiar(clave)
    await audit.registrar(req, audit.ACCIONES.MFA_OK, { usuarioId: usuario.id, email: usuario.email })

    const cuerpo = await finalizarIngreso(req, res, usuario, payload, {
      recordarDispositivo: Boolean(recordarDispositivo),
      via: 'totp',
    })
    return res.status(200).json(cuerpo)
  } catch (err) {
    return responderError(res, err)
  }
}
