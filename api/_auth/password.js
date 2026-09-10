// Hash de contraseñas — proveedor de identidad "contraseña" (2.1 del documento: acceso a
// la app fuera del entorno de monday).
//
// Está apagado por defecto (AUTH_PASSWORD_LOGIN). Mientras la app viva dentro del iframe
// de monday, la identidad la da el sessionToken firmado y no hay ninguna contraseña que
// robar, adivinar o rotar: encender esto antes de que exista un acceso directo real
// agrega superficie de ataque sin agregar ninguna función.
//
// Algoritmo: Argon2id. Es la recomendación actual de OWASP para contraseñas nuevas,
// porque además del costo de CPU tiene costo de MEMORIA, y eso es lo que le saca la
// ventaja al atacante con GPUs — una GPU tiene miles de núcleos pero no miles de veces
// más memoria. bcrypt sigue siendo aceptable y queda anotado abajo como salida de
// emergencia, pero si se puede elegir hoy, se elige Argon2id.

import { config } from './env.js'
import { ErrorDeFlujo } from './errors.js'

// Parámetros. OWASP sugiere para Argon2id un mínimo de 19 MiB de memoria, 2 iteraciones y
// paralelismo 1. Se usa eso: subirlos es tentador, pero en una función serverless de
// Vercel la memoria y el tiempo de CPU se facturan, y un hash de 200 ms en un endpoint de
// login es también un vector de saturación contra uno mismo. 19 MiB / 2 iteraciones da
// del orden de 50 ms, que es el punto de equilibrio.
const PARAMETROS = { memoryCost: 19456, timeCost: 2, parallelism: 1 }

// Importación dinámica por la misma razón que en rateLimit.js: si el proveedor de
// contraseña está apagado, el proyecto no tiene por qué haber instalado el paquete, y un
// import estático rompería el build de toda la app por una función que nadie usa.
async function argon2() {
  try {
    return await import('@node-rs/argon2')
  } catch {
    throw new Error(
      'AUTH_PASSWORD_LOGIN está encendido pero falta el paquete @node-rs/argon2 (npm i @node-rs/argon2)'
    )
  }
}

// Reglas de contraseña, siguiendo NIST SP 800-63B: largo mínimo generoso y NADA de
// exigir mayúscula, número y símbolo. Esas reglas de composición están explícitamente
// desaconsejadas: no agregan entropía real y empujan a la gente a "Password1!" y a
// anotarla en un papel. Lo que sí sirve es el largo y no reutilizar.
const LARGO_MINIMO = 12
const LARGO_MAXIMO = 128 // tope para que nadie mande 10 MB y haga trabajar al hasher

export function validarFortaleza(contrasena) {
  const texto = String(contrasena ?? '')
  if (texto.length < LARGO_MINIMO) {
    throw new ErrorDeFlujo('CONTRASENA_DEBIL', 'La contraseña necesita al menos ' + LARGO_MINIMO + ' caracteres.')
  }
  if (texto.length > LARGO_MAXIMO) {
    throw new ErrorDeFlujo('CONTRASENA_DEBIL', 'La contraseña no puede superar los ' + LARGO_MAXIMO + ' caracteres.')
  }
  return texto
}

export async function hashear(contrasena) {
  const a2 = await argon2()
  return a2.hash(validarFortaleza(contrasena), PARAMETROS)
}

export async function verificar(hash, contrasena) {
  if (!hash) return false
  const a2 = await argon2()
  try {
    return await a2.verify(hash, String(contrasena ?? ''))
  } catch {
    // Un hash con formato inválido en la base no es un 500: es una credencial que no
    // valida.
    return false
  }
}

// Hash de descarte, para el caso de que el email no exista.
//
// Sin esto, un login contra un email inexistente contesta al instante y uno contra un
// email real tarda los ~50 ms del Argon2. Esa diferencia es medible desde afuera y
// alcanza para enumerar quién tiene cuenta — que es justamente lo que la respuesta
// genérica de errors.js trata de evitar. Verificar contra un hash falso iguala el tiempo.
const HASH_DE_DESCARTE =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZXg$JmMOJVR8YKJ0nrJ3Jt2u0dMxK1yQ1S3mFqJ2bZ1kQ2A'

export async function gastarTiempoComoSiExistiera(contrasena) {
  if (!config.passwordLogin) return
  await verificar(HASH_DE_DESCARTE, contrasena)
}
