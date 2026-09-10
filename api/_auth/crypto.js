// Cifrado y hashing de los secretos que la app guarda en su propia base.
//
// Dos primitivas distintas para dos problemas distintos, y la diferencia importa:
//
//   cifrar/descifrar (AES-256-GCM) — para el secreto TOTP. Es reversible porque el
//   servidor NECESITA el secreto en claro cada vez que valida un código de 6 dígitos.
//   Se cifra igual para que un volcado de la base (un backup extraviado, un acceso de
//   solo lectura mal dado) no alcance para generar los códigos de nadie: hace falta
//   también ENCRYPTION_KEY, que vive en las variables de entorno y no en la base.
//
//   hashConPepper (HMAC-SHA256) — para códigos de recuperación y tokens de dispositivo.
//   Es irreversible: el servidor nunca necesita recuperarlos, solo comparar. No se usa
//   argon2/bcrypt acá a propósito, porque estos valores los genera el servidor con 8-32
//   bytes aleatorios: no hay diccionario que probar contra ellos, y un hash lento en un
//   endpoint que se llama en cada pedido sería un costo de CPU regalado. El pepper
//   (derivado de ENCRYPTION_KEY) es lo que impide que alguien con la base pueda hashear
//   candidatos por su cuenta y buscarlos en la tabla.
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
  hkdfSync,
} from 'node:crypto'
import { config } from './env.js'

const ALGORITMO = 'aes-256-gcm'
const VERSION = 'v1' // prefijo del formato, para poder rotar de algoritmo sin migrar todo a ciegas

function claveMaestra() {
  if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey)) {
    throw new Error('ENCRYPTION_KEY debe ser 64 caracteres hexadecimales (32 bytes)')
  }
  return Buffer.from(config.encryptionKey, 'hex')
}

// Dos claves derivadas de la misma maestra, una por uso. Reutilizar el mismo material de
// clave para cifrar y para el HMAC es de esos atajos que no rompen nada visible pero
// debilitan ambos usos; derivar con HKDF cuesta una línea.
function derivar(etiqueta) {
  return Buffer.from(hkdfSync('sha256', claveMaestra(), Buffer.alloc(0), etiqueta, 32))
}

export function cifrar(textoPlano) {
  const iv = randomBytes(12) // 96 bits, el tamaño que recomienda el estándar para GCM
  const cipher = createCipheriv(ALGORITMO, derivar('totp-secret'), iv)
  const ct = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.')
}

export function descifrar(empaquetado) {
  const [version, ivB64, tagB64, ctB64] = String(empaquetado).split('.')
  if (version !== VERSION) throw new Error('Formato de cifrado desconocido: ' + version)
  const decipher = createDecipheriv(ALGORITMO, derivar('totp-secret'), Buffer.from(ivB64, 'base64url'))
  // Con GCM esto no es opcional: sin el tag, el descifrado no verifica integridad y
  // alguien con acceso de escritura a la base podría alterar el secreto sin que se note.
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8')
}

export function hashConPepper(valor) {
  return createHmac('sha256', derivar('token-pepper')).update(String(valor)).digest('base64url')
}

// Comparación en tiempo constante. Para los hashes de la base no cambia nada (se comparan
// dentro de Postgres), pero sí para cualquier comparación de secretos que se haga en
// JavaScript: === corta en el primer byte distinto y el tiempo que tarda filtra información.
export function igualSeguro(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// Token opaco para "confiar en este dispositivo": 32 bytes de aleatoriedad real. No es un
// JWT ni lleva información adentro a propósito — lo único que puede hacer quien lo tenga
// es presentarlo, y la base decide si sigue vivo. Un JWT de 30 días no se podría revocar.
export function generarTokenOpaco(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}
