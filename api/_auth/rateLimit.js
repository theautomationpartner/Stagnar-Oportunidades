// Límite de intentos. Sin esto, el segundo factor no existe: un código TOTP son seis
// dígitos, un millón de combinaciones, y con window: 1 hay tres válidos a la vez. Un
// script que pruebe sin freno acierta en horas. El límite es lo que convierte ese millón
// en un número inalcanzable, y por eso es tan parte del 2FA como el TOTP mismo.
//
// Dos implementaciones, en este orden:
//
//   1. Upstash Redis, si está configurado. Es lo correcto en serverless: el contador vive
//      fuera de la función (que no tiene memoria entre invocaciones) y contar no le
//      cuesta nada a la base de datos de la app.
//
//   2. Un contador en Postgres, si no lo está. Es más lento y ensucia una tabla, pero
//      existe para que el límite NUNCA quede apagado por falta de una variable de
//      entorno. Un rate limit que se desactiva solo cuando falta configuración es peor
//      que no tenerlo, porque nadie se entera.

import { config } from './env.js'
import { DemasiadosIntentos } from './errors.js'
import * as db from './db.js'

// Presets, para que ningún endpoint invente sus propios números sueltos.
export const LIMITES = {
  // El que pide explícitamente el documento: 5 intentos cada 15 minutos contra el
  // endpoint de verificación del código.
  mfaVerificacion: { maximo: 5, ventanaSegundos: 900 },
  // El enrolamiento es más laxo: acá el usuario está tipeando el primer código con el QR
  // en pantalla y es normal que se equivoque un par de veces.
  mfaEnrolamiento: { maximo: 10, ventanaSegundos: 900 },
  // Los códigos de recuperación tienen 60 bits, así que la fuerza bruta no es la
  // amenaza; el límite acá es contra el goteo automatizado.
  recuperacion: { maximo: 5, ventanaSegundos: 3600 },
  // Login por contraseña, por email.
  login: { maximo: 10, ventanaSegundos: 900 },
  // Un techo general por IP sobre todo /api/auth/*, para que nadie pueda barrer emails
  // rotando la clave de límite.
  porIp: { maximo: 60, ventanaSegundos: 900 },
}

let _redis = null
const _limitadores = new Map()

function hayUpstash() {
  return Boolean(config.upstashUrl && config.upstashToken)
}

// Importación dinámica: si el proyecto no instaló los paquetes de Upstash (porque eligió
// el camino de Postgres), importarlos arriba del archivo rompería el build entero.
async function limitadorUpstash(maximo, ventanaSegundos) {
  const clave = maximo + ':' + ventanaSegundos
  if (_limitadores.has(clave)) return _limitadores.get(clave)

  const [{ Ratelimit }, { Redis }] = await Promise.all([
    import('@upstash/ratelimit'),
    import('@upstash/redis'),
  ])
  if (!_redis) {
    _redis = new Redis({ url: config.upstashUrl, token: config.upstashToken })
  }
  const limitador = new Ratelimit({
    redis: _redis,
    // Ventana deslizante y no fija: con ventana fija, alguien puede gastar el cupo al
    // final de un bloque y otro cupo entero al principio del siguiente, duplicando de
    // hecho el límite justo en el borde.
    limiter: Ratelimit.slidingWindow(maximo, ventanaSegundos + ' s'),
    prefix: 'stg:rl',
    analytics: false,
  })
  _limitadores.set(clave, limitador)
  return limitador
}

// Consume un intento. Tira DemasiadosIntentos si se pasó del límite.
//
// `fallarCerrado` decide qué hacer si las DOS implementaciones fallan (Upstash caído y la
// base también). Por defecto bloquea, y para los endpoints de MFA tiene que quedar así:
// dejar pasar sin contar durante una caída de Redis es exactamente la ventana que un
// atacante estaría esperando. Para endpoints donde el límite es solo higiene, quien llame
// puede pedir lo contrario.
export async function consumir(clave, { maximo, ventanaSegundos }, { fallarCerrado = true } = {}) {
  if (hayUpstash()) {
    try {
      const limitador = await limitadorUpstash(maximo, ventanaSegundos)
      const { success, reset } = await limitador.limit(clave)
      if (!success) {
        const segundos = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
        throw new DemasiadosIntentos(segundos)
      }
      return
    } catch (err) {
      if (err instanceof DemasiadosIntentos) throw err
      console.error('[auth] Upstash no respondió, se cae al contador de Postgres:', err.message)
    }
  }

  try {
    const usados = await db.contarIntentos(clave, ventanaSegundos)
    if (usados >= maximo) throw new DemasiadosIntentos(ventanaSegundos)
    await db.registrarIntento(clave)
  } catch (err) {
    if (err instanceof DemasiadosIntentos) throw err
    console.error('[auth] el contador de Postgres falló:', err.message)
    if (fallarCerrado) throw new DemasiadosIntentos(60)
  }
}

// Se llama al acertar. Es la diferencia entre un límite y un castigo: sin esto, quien se
// equivoca cuatro veces y acierta a la quinta se queda con el cupo consumido durante los
// 15 minutos siguientes, y su próximo ingreso legítimo lo rebota.
export async function limpiar(clave) {
  try {
    if (hayUpstash()) {
      if (!_redis) {
        const { Redis } = await import('@upstash/redis')
        _redis = new Redis({ url: config.upstashUrl, token: config.upstashToken })
      }
      // El sliding window de Upstash guarda una clave por ventana; borrar el patrón
      // completo es lo que efectivamente reinicia el contador de este sujeto.
      const claves = await _redis.keys('stg:rl:' + clave + '*')
      if (claves.length) await _redis.del(...claves)
    }
    await db.limpiarIntentos(clave)
  } catch (err) {
    // Que no se pueda limpiar no es motivo para fallar un login que ya salió bien.
    console.error('[auth] no se pudo limpiar el contador de intentos:', err.message)
  }
}
