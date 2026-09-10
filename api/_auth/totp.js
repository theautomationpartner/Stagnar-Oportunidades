// TOTP (RFC 6238) — la capa 3 del documento de investigación.
//
// El servidor y la app del celular comparten un secreto. Los dos calculan, con ese
// secreto más la hora actual, un código de 6 dígitos que cambia cada 30 segundos. No hay
// comunicación con Google ni con nadie: es un estándar abierto, así que el usuario elige
// entre Google Authenticator, Microsoft Authenticator, Authy o 1Password indistintamente.
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { config } from './env.js'

const PASO_SEGUNDOS = 30

// window: 1 acepta el código del período anterior y el del siguiente, además del actual.
// No es laxitud: los relojes de los celulares se desfasan, y sin esa tolerancia los
// usuarios con el reloj unos segundos corrido no podrían entrar nunca y nadie entendería
// por qué. El costo es que hay 3 códigos válidos a la vez en vez de 1, y eso lo compensa
// el límite de intentos (ver rateLimit.js) — sin límite de intentos, la ventana sería un
// problema; con él, no.
authenticator.options = { window: 1, step: PASO_SEGUNDOS }

export function generarSecreto() {
  return authenticator.generateSecret()
}

// El texto que se convierte en QR. El primer argumento es lo que el usuario va a ver
// como nombre de la cuenta en su app del celular, así que va el email: si tiene varias
// cuentas cargadas, es lo único que le permite distinguirlas.
export function uriParaQr(email, secreto) {
  return authenticator.keyuri(email, config.emisorTotp, secreto)
}

export async function qrComoDataUrl(uri) {
  return QRCode.toDataURL(uri, { width: 240, margin: 1 })
}

// Verifica un código y, si es válido, devuelve el período TOTP EXACTO al que corresponde.
//
// Ese período es la parte que importa y es donde el código del documento de investigación
// se queda corto. Ahí el anti-reutilización compara contra el período del reloj actual:
//
//     const periodoActual = Math.floor(Date.now() / 30000)
//     if (registro.ultimo_periodo && periodoActual <= registro.ultimo_periodo) ...
//
// Con window: 1 eso deja un hueco. Si alguien intercepta el código del período N (el
// usuario lo tipeó, quedó en un historial, se vio por encima del hombro) y lo reenvía
// durante el período N+1, el código sigue siendo válido por la tolerancia, pero
// periodoActual vale N+1, que es mayor que el ultimo_periodo N guardado. Pasa el chequeo
// y el código se reutiliza.
//
// checkDelta devuelve en qué período cayó realmente el código (-1, 0 o +1 respecto del
// actual). Sumando ese delta se obtiene el período que el código representa de verdad, y
// comparando ESE contra ultimo_periodo el reenvío se detecta.
export function verificarCodigo(secreto, codigo) {
  const limpio = String(codigo ?? '').replace(/\D/g, '')
  if (limpio.length !== 6) return { valido: false, periodo: null }

  let delta
  try {
    delta = authenticator.checkDelta(limpio, secreto)
  } catch {
    // otplib tira si el secreto está corrupto (por ejemplo, si el descifrado devolvió
    // basura). Es un fallo de verificación, no un 500.
    return { valido: false, periodo: null }
  }
  if (delta === null || delta === undefined) return { valido: false, periodo: null }

  const periodoActual = Math.floor(Date.now() / 1000 / PASO_SEGUNDOS)
  return { valido: true, periodo: periodoActual + delta }
}

export { PASO_SEGUNDOS }
