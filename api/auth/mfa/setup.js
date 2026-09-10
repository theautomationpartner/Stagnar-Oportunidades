// POST /api/auth/mfa/setup — enrolamiento, primer paso: devuelve el QR.
//
// El punto que hace que esto funcione en serverless, y que el pedido señala bien: entre
// que se muestra el QR y que el usuario tipea el primer código pasan segundos o minutos, y
// en el medio la función que generó el secreto ya murió. No hay memoria donde dejarlo. Por
// eso el secreto se guarda en la base ANTES de confirmarlo, en estado pendiente
// (confirmado_en NULL).
//
// Y por eso mismo el estado pendiente tiene que ser un estado real y no un detalle: un
// secreto guardado como válido antes de que el usuario demuestre que lo escaneó deja a la
// persona encerrada afuera de su cuenta si cerró la pestaña sin terminar — el servidor
// esperaría códigos de un secreto que el celular nunca llegó a guardar.

import { modoAuth, validarConfig, config } from '../../_auth/env.js'
import { responderError, ErrorDeFlujo } from '../../_auth/errors.js'
import { cifrar, descifrar } from '../../_auth/crypto.js'
import { contextoPreAuth, leerJson } from '../../_auth/mfaFlow.js'
import * as totp from '../../_auth/totp.js'
import * as db from '../../_auth/db.js'
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
    const { usuario } = await contextoPreAuth(req)

    await rateLimit.consumir('mfa-setup:' + usuario.id, rateLimit.LIMITES.mfaEnrolamiento)

    // Si ya lo tiene configurado y confirmado, este endpoint no puede hacer nada: generar
    // un secreto nuevo acá sería la forma más simple de anular el 2FA de alguien con solo
    // tener su sesión a medio autenticar. Resetear el 2FA de una persona es una operación
    // de administrador (ver el panel de administración), no algo que se autoservicie.
    const actual = await db.obtenerMfa(usuario.id)
    if (actual?.confirmado_en) {
      throw new ErrorDeFlujo(
        'MFA_YA_CONFIGURADO',
        'El segundo factor ya está configurado. Si perdiste el celular, usá un código de recuperación o pedile a un administrador que lo reinicie.',
        409
      )
    }

    // "Quiero un QR nuevo": descarta el enrolamiento a medio hacer. Es para quien lo escaneó
    // en el teléfono equivocado — sin esto quedaría atado a un secreto que no tiene.
    const { reiniciar } = await leerJson(req).catch(() => ({}))
    if (reiniciar) await db.borrarPendiente(usuario.id)

    // Idempotente a propósito: si ya hay un secreto pendiente se devuelve ESE, no uno nuevo.
    //
    // Es lo que hace que el enrolamiento funcione. Este endpoint se llama más de una vez de
    // rutina —React en modo estricto ejecuta los efectos dos veces en desarrollo, y recargar
    // la página rehace el pedido—, y si cada llamada generara un secreto distinto, el usuario
    // terminaría escaneando un QR mientras el servidor espera el código de otro. El síntoma
    // es "escaneé y el código no funciona", sin ningún error visible en el medio.
    const fila = await db.asegurarSecretoPendiente(usuario.id, cifrar(totp.generarSecreto()))
    if (!fila) throw new ErrorDeFlujo('SIN_ENROLAMIENTO', 'No se pudo iniciar el enrolamiento.', 500)
    if (fila.confirmado_en) {
      // Alguien confirmó entre el chequeo de arriba y esta escritura.
      throw new ErrorDeFlujo('MFA_YA_CONFIGURADO', 'El segundo factor ya está configurado.', 409)
    }

    // Se devuelve lo que quedó GUARDADO, no lo que se propuso: difieren cuando ya había un
    // pendiente, y el que vale siempre es el de la base.
    const secreto = descifrar(fila.secreto_cifrado)

    // La etiqueta lleva el nombre del perfil adelante cuando el asiento de monday está
    // compartido: los cuatro perfiles de TAP resuelven al mismo correo, así que con el
    // correo solo la persona vería cuatro entradas idénticas en Google Authenticator y no
    // sabría cuál es la suya (ver etiquetaTotp en whitelist.js).
    const uri = totp.uriParaQr(usuario.etiquetaTotp ?? usuario.email, secreto)

    return res.status(200).json({
      qr: await totp.qrComoDataUrl(uri),
      // El secreto en texto, para quien no puede escanear (celular sin cámara, o la app
      // del escritorio). Es el mismo secreto: se muestra una vez y no se vuelve a mostrar.
      secretoManual: secreto,
      emisor: config.emisorTotp,
      cuenta: usuario.etiquetaTotp ?? usuario.email,
      perfil: { nombre: usuario.nombre, rol: usuario.rol },
    })
  } catch (err) {
    return responderError(res, err)
  }
}
