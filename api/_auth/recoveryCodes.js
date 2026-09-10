// Códigos de recuperación de un solo uso: los 10 códigos que se le entregan al usuario
// al terminar el enrolamiento, para el caso de que pierda el celular.
//
// Sin ellos, un teléfono roto un sábado significa una persona sin acceso hasta que
// alguien la resetee a mano, y esa gestión de emergencia termina siendo, en la práctica,
// el agujero por donde entra la ingeniería social ("hola, soy Valentina, perdí el
// celular, ¿me lo reseteás?"). Un código en papel se verifica solo.

import { randomBytes } from 'node:crypto'
import { hashConPepper } from './crypto.js'

// Alfabeto Crockford base32: sin I, L, O ni U. Las tres primeras porque se confunden con
// 1 y 0 al copiar de un papel; la U porque evita que salgan palabras desafortunadas por
// casualidad. Esto no es cosmético: un código que se transcribe mal es un código que el
// usuario cree perdido.
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LARGO = 12 // 12 caracteres sobre 32 símbolos = 60 bits de entropía por código
const CANTIDAD = 10

function generarUno() {
  // Muestreo con rechazo. 256 no es múltiplo de 32... en realidad sí lo es (256 = 8*32),
  // así que acá no hay sesgo de módulo; el rechazo queda igual como red de seguridad por
  // si mañana cambia el tamaño del alfabeto y nadie se acuerda de revisar esta cuenta.
  const limite = 256 - (256 % ALFABETO.length)
  let salida = ''
  while (salida.length < LARGO) {
    for (const byte of randomBytes(LARGO)) {
      if (byte >= limite) continue
      salida += ALFABETO[byte % ALFABETO.length]
      if (salida.length === LARGO) break
    }
  }
  // Se muestra en grupos de 4 para que se pueda copiar de un papel sin perder la cuenta.
  return salida.match(/.{1,4}/g).join('-')
}

// Devuelve los códigos en claro (para mostrárselos al usuario UNA sola vez) y sus hashes
// (lo único que se guarda). Que la función devuelva las dos cosas juntas es deliberado:
// obliga a quien la llame a ver que el claro no se persiste.
export function generarCodigos() {
  const claros = Array.from({ length: CANTIDAD }, generarUno)
  return { claros, hashes: claros.map((c) => hashConPepper(normalizar(c))) }
}

// Normalización antes de comparar. El usuario va a tipear el código de un papel: con
// minúsculas, sin guiones, o confundiendo O con 0 e I/L con 1. Traducir esas confusiones
// (que es exactamente para lo que Crockford dejó esas letras afuera del alfabeto) evita
// un rechazo que el usuario no podría entender ni corregir mirando su propio papel.
//
// La normalización se aplica también al generar el hash, no solo al verificar — si se
// aplicara de un solo lado, ningún código validaría jamás.
export function normalizar(codigo) {
  return String(codigo ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[ILO]/g, (c) => (c === 'O' ? '0' : '1'))
}

export function hashear(codigo) {
  return hashConPepper(normalizar(codigo))
}

export { CANTIDAD }
