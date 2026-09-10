// La caché de la lista blanca.
//
// La lectura y las reglas viven en boardLectura.js; acá está solamente la capa que evita
// consultarle a monday en cada pedido. Están separados a propósito: boardLectura.js no
// importa la base de datos, así que el script de pre-vuelo puede correr las mismas reglas
// sin Postgres.
//
// Por qué hace falta cachear: la regla de oro del documento es que la lista se consulte en
// CADA pedido al backend. Consultar la API de monday literalmente en cada pedido gastaría
// la cuota y le sumaría cientos de milisegundos a cada click. La copia vive en Postgres
// —no en memoria, que en serverless se pierde entre invocaciones— y se refresca por TTL.

import { config } from './env.js'
import * as db from './db.js'
import { leerTableroSinCache } from './boardLectura.js'

export { leerTableroSinCache, perfilesDe, elegirPerfil, diagnosticar, interpretarFila } from './boardLectura.js'

// Memoria en el proceso, para que dos verificaciones dentro del mismo pedido no vayan dos
// veces a la base.
//
// Lleva vencimiento, y no es un detalle: sin él, esto era un bug grave. Una variable de
// módulo NO muere con el pedido — en serverless el módulo queda cargado mientras la
// instancia siga tibia, y en el dev server mientras no se reinicie. Con un simple
// `if (memoria) return memoria`, la primera consulta se quedaba en RAM para siempre: el TTL
// de Postgres no se volvía a mirar nunca y una revocación no surtía efecto en esa instancia,
// que es exactamente lo contrario de lo que promete "la lista se consulta en cada pedido".
//
// El vencimiento se alinea con el de la copia de Postgres, así las dos capas caducan juntas
// y el comportamiento no depende de qué instancia atienda el pedido.
let memoria = null // { entradas, hasta }

function recordar(entradas, hasta) {
  memoria = { entradas, hasta }
  return entradas
}

// Ante una caída de la API de monday se sigue usando la copia vieja, hasta este tope. Es
// una decisión con un costo que conviene dejar escrito: durante ese rato, alguien recién
// pasado a Inactivo conserva el acceso. La alternativa —fallar cerrado ante cualquier hipo
// de la API— dejaría al equipo entero sin poder trabajar por un problema ajeno. Pasado el
// tope, sí falla cerrado.
const TOPE_COPIA_VIEJA_MS = 60 * 60 * 1000

export async function obtenerEntradas() {
  const ttlMs = config.listaBlancaTtlSegundos * 1000
  if (memoria && Date.now() < memoria.hasta) return memoria.entradas

  const cacheada = await db.leerListaBlancaCache().catch(() => null)
  const traidaEn = cacheada ? new Date(cacheada.actualizado_en).getTime() : 0
  const edad = cacheada ? Date.now() - traidaEn : Infinity

  if (cacheada && edad < ttlMs) {
    // Vence cuando vence la copia de Postgres, no dentro de un TTL entero desde ahora: si
    // no, cada instancia extendería la vida del dato y la revocación tardaría más cuanto
    // más instancias hubiera.
    return recordar(cacheada.entradas, traidaEn + ttlMs)
  }

  try {
    const entradas = await leerTableroSinCache()
    await db.guardarListaBlancaCache(entradas).catch((err) => {
      // No poder cachear no es motivo para no dejar entrar a nadie.
      console.error('[auth] no se pudo cachear la lista blanca:', err.message)
    })
    return recordar(entradas, Date.now() + ttlMs)
  } catch (err) {
    if (cacheada && edad < TOPE_COPIA_VIEJA_MS) {
      console.error(
        '[auth] no se pudo leer el tablero, se usa la copia de hace ' + Math.round(edad / 1000) + 's:',
        err.message
      )
      // Se recuerda por poco tiempo: la API de monday puede volver en cualquier momento y no
      // hay que quedarse con la copia vieja más de lo necesario.
      return recordar(cacheada.entradas, Date.now() + ttlMs)
    }
    throw err
  }
}

// Invalida la memoria de la invocación. Lo usa el endpoint de diagnóstico, que quiere ver
// el tablero y no una copia.
export function olvidarMemoria() {
  memoria = null
}
