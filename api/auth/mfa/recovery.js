// POST /api/auth/mfa/recovery — entrar con un código de recuperación, para quien perdió
// el celular.
//
// Es la salida de emergencia, y como toda salida de emergencia es también la puerta que
// alguien va a intentar forzar. Cuatro cosas la sostienen:
//
//   1. El código se consume de forma atómica en la base (UPDATE ... WHERE usado_en IS NULL
//      ... RETURNING). Mandarlo dos veces en paralelo no lo usa dos veces.
//   2. Límite propio y más estricto que el del TOTP.
//   3. NO deja el dispositivo confiable, y además olvida todos los que hubiera. Quien entra
//      por acá está, por definición, en una situación anómala.
//   4. NO devuelve una sesión: desvincula el segundo factor y obliga a configurar uno nuevo
//      antes de poder usar la app. Ver más abajo el porqué.

import { modoAuth, validarConfig } from '../../_auth/env.js'
import { responderError, ErrorDeFlujo } from '../../_auth/errors.js'
import { contextoPreAuth, continuarSegunMfa, leerJson } from '../../_auth/mfaFlow.js'
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

    // Entrar con un código de recuperación NO devuelve una sesión. Desvincula el segundo
    // factor y obliga a configurar uno nuevo ahí mismo.
    //
    // El motivo es el caso que domina en la realidad: se usa un código porque se perdió el
    // teléfono, y entonces el secreto TOTP que vive en ese teléfono está en manos de otro.
    // Dejarlo válido sería dejar abierta justamente la puerta que la persona vino a cerrar.
    // Por eso se borra el secreto y se olvidan todos los dispositivos confiables.
    //
    // Los códigos que le quedan NO se tocan: son su red para volver a entrar mientras
    // consigue un dispositivo nuevo. Se reemplazan solos al confirmar el enrolamiento.
    await db.borrarSecretoConservandoCodigos(usuario.id)
    await db.olvidarTodosLosDispositivos(usuario.id)

    await audit.registrar(req, audit.ACCIONES.RECUPERACION_OK, {
      usuarioId: usuario.id,
      email: usuario.email,
      detalle: { restantes, accion: 'segundo_factor_desvinculado' },
    })

    // Con el secreto ya borrado, continuarSegunMfa devuelve la rama de enrolamiento: un
    // preAuthToken que solo sirve para escanear el QR nuevo. Se reusa esa función en vez de
    // armar la respuesta a mano para que el flujo siga siendo uno solo.
    const cuerpo = await continuarSegunMfa(req, res, usuario, {
      mondayUserId: payload.mid ?? null,
      mondayAccountId: payload.acc ?? null,
      origen: payload.src ?? 'monday',
    })

    return res.status(200).json({
      ...cuerpo,
      codigosRestantes: restantes,
      // Para que la pantalla pueda explicar por qué aparece un QR y no la app.
      porRecuperacion: true,
    })
  } catch (err) {
    return responderError(res, err)
  }
}
