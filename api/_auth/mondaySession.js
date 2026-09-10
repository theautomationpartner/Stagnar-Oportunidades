// Verificación del sessionToken de monday. Es el equivalente del api/_guard.ts del
// documento de investigación, y es el archivo más importante de toda la implementación:
// es lo único que distingue un pedido que salió de la app corriendo dentro de monday, con
// un usuario real detrás, de un curl que alguien armó a mano contra la URL de Vercel.
//
// Qué trae el token (lo genera monday firmado con el secreto de la app, así que no se
// puede falsificar sin ese secreto):
//   { dat: { client_id, user_id, account_id, slug, app_id, app_version_id, install_id,
//            is_admin, is_view_only, is_guest }, exp, iat }
//
// Dos cosas que NO trae, y que condicionan todo lo demás:
//   1. No trae el email. Por eso la lista blanca resuelve email -> user_id la primera vez
//      contra la API de monday (ver whitelist.js).
//   2. No es un token de la API de monday: no sirve para consultar tableros. Solo sirve
//      para que nuestro backend confíe en quién pregunta.

import { jwtVerify } from 'jose'
import { config } from './env.js'
import { NoAutorizado } from './errors.js'
import * as db from './db.js'

// El documento advierte que la causa #1 de errores "invalid signature" es la confusión
// entre el Signing Secret y el Client Secret de la app, y recomienda probar los dos y
// dejar documentado cuál valida. En vez de dejar eso a una tarde de prueba y error, se
// prueban los dos acá y se deja escrito en el log cuál funcionó, la primera vez que un
// token real valida. No debilita nada: los dos secretos son nuestros, y un token que no
// valide con ninguno se rechaza igual.
let secretoQueValida = null

function candidatos() {
  const lista = []
  if (config.mondaySigningSecret) lista.push(['MONDAY_SIGNING_SECRET', config.mondaySigningSecret])
  if (config.mondayClientSecret) lista.push(['MONDAY_CLIENT_SECRET', config.mondayClientSecret])
  // Si ya sabemos cuál valida, ese va primero: en la práctica el otro no se prueba nunca
  // más mientras la instancia siga viva.
  if (secretoQueValida) lista.sort(([nombre]) => (nombre === secretoQueValida ? -1 : 1))
  return lista
}

export async function verificarSessionToken(token) {
  if (!token) throw new NoAutorizado('falta_session_token')

  const lista = candidatos()
  if (!lista.length) throw new Error('Ni MONDAY_SIGNING_SECRET ni MONDAY_CLIENT_SECRET están configurados')

  let payload = null
  let ultimoError = null
  for (const [nombre, secreto] of lista) {
    try {
      // jwtVerify comprueba la FIRMA y la expiración. Nunca decodificar sin verificar:
      // un JWT sin verificar es texto que escribió el cliente.
      const res = await jwtVerify(token, new TextEncoder().encode(secreto), {
        algorithms: ['HS256'],
        clockTolerance: 30,
      })
      payload = res.payload
      if (secretoQueValida !== nombre) {
        secretoQueValida = nombre
        console.log('[auth] el sessionToken de monday valida con ' + nombre)
      }
      break
    } catch (err) {
      ultimoError = err
    }
  }

  if (!payload) throw new NoAutorizado('session_token_invalido', { causa: ultimoError?.code })

  // Los tokens nuevos traen todo dentro de `dat`; se contempla el plano por si monday
  // cambia el envoltorio, para no depender de una forma exacta que no controlamos.
  const dat = payload.dat ?? payload
  if (!dat?.user_id || !dat?.account_id) throw new NoAutorizado('session_token_incompleto')

  // Que el token sea de NUESTRA app y no de otra. Sin esto, cualquier app de monday
  // firmada con su propio secreto quedaría fuera igual (la firma no coincidiría), pero
  // este chequeo cubre el caso de reusar el mismo secreto entre apps del mismo grupo.
  if (config.mondayAppId && Number(dat.app_id) !== config.mondayAppId) {
    throw new NoAutorizado('app_incorrecta', { app_id: dat.app_id })
  }

  return {
    userId: Number(dat.user_id),
    accountId: Number(dat.account_id),
    slug: String(dat.slug ?? ''),
    isAdmin: Boolean(dat.is_admin),
    isGuest: Boolean(dat.is_guest),
    isViewOnly: Boolean(dat.is_view_only),
  }
}

const CONSULTA_EMAIL = 'query ($ids: [ID!]) { users(ids: $ids) { id name email enabled } }'

// Resuelve el email de un usuario de monday, con caché en la base.
//
// La caché va en la base y no en memoria a propósito: cada invocación serverless arranca
// con la memoria vacía, así que una caché en memoria acertaría casi nunca y la app
// terminaría consultando la API de monday en cada ingreso, gastando cuota y sumando
// latencia al login.
//
// El user_id se interpola como variable GraphQL, no dentro del string de la query.
export async function obtenerEmailDeMonday(mondayUserId) {
  const cacheado = await db.leerEmailCacheado(mondayUserId, 24)
  if (cacheado) return cacheado

  if (!config.mondayApiKey) throw new Error('MONDAY_API_KEY no está configurada')

  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: config.mondayApiKey,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query: CONSULTA_EMAIL, variables: { ids: [String(mondayUserId)] } }),
  })

  if (!res.ok) throw new Error('La API de monday devolvió ' + res.status + ' al resolver el email')
  const json = await res.json()
  const usuario = json.data?.users?.[0]
  if (!usuario?.email) throw new NoAutorizado('email_no_resuelto', { mondayUserId })

  const fila = {
    email: String(usuario.email).toLowerCase(),
    nombre: usuario.name ?? null,
    habilitado: usuario.enabled !== false,
  }
  await db.guardarEmailCacheado(mondayUserId, fila)
  return fila
}
