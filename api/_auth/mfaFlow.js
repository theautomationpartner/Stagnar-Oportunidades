// Las dos piezas que comparten todos los endpoints del flujo de segundo factor, para que
// verify.js y recovery.js no tengan cada uno su propia versión de "cómo se emite la
// sesión definitiva" — dos versiones de eso terminan divergiendo, y la que se olvida de
// un chequeo es la que alguien va a encontrar.

import { NoAutorizado, ErrorDeFlujo } from './errors.js'
import { verificarPreAuth, emitirPreAuth, emitirSesion, sesionEsPosteriorA } from './tokens.js'
import {
  leerTokenFlujo,
  leerTokenDispositivo,
  escribirSesion,
  escribirDispositivo,
  obtenerIp,
  obtenerUserAgent,
} from './transport.js'
import { generarTokenOpaco, hashConPepper } from './crypto.js'
import { config } from './env.js'
import * as whitelist from './whitelist.js'
import * as db from './db.js'
import * as audit from './audit.js'

// Contexto de un endpoint que corre a mitad del login: la identidad ya está verificada
// (por monday o por contraseña) pero el segundo factor todavía no. La lista blanca se
// revalida igual que en cualquier otro pedido — que alguien esté a mitad del login no lo
// exime de haber sido dado de baja hace un minuto.
export async function contextoPreAuth(req) {
  const payload = await verificarPreAuth(leerTokenFlujo(req))
  const usuario = await whitelist.revalidar(Number(payload.sub))
  if (!sesionEsPosteriorA(payload, usuario.sesiones_validas_desde)) {
    throw new NoAutorizado('sesion_invalidada')
  }
  return { payload, usuario }
}

// Cierra el ingreso: emite la sesión completa y, si se pidió, deja el dispositivo
// confiable por 24 horas (AUTH_DEVICE_TTL_DIAS).
//
// El token de dispositivo es opaco y aleatorio, no un JWT. La diferencia importa
// aunque dure un día: de un JWT no se puede echar atrás la confianza sin esperar a que
// venza, mientras que de este basta con borrar la fila. En la base va solo su HMAC, así
// que un volcado de la tabla no le sirve a nadie para presentarse como ese dispositivo.
export async function finalizarIngreso(req, res, usuario, payload, { recordarDispositivo, via }) {
  const token = await emitirSesion(usuario, {
    origen: payload.src ?? 'monday',
    mondayUserId: payload.mid ?? null,
    mondayAccountId: payload.acc ?? null,
  })
  escribirSesion(res, token)

  let deviceToken = null
  if (recordarDispositivo) {
    deviceToken = generarTokenOpaco(32)
    await db.guardarDispositivoConfiable({
      usuarioId: usuario.id,
      hashToken: hashConPepper(deviceToken),
      expiraEn: new Date(Date.now() + config.deviceTtlDias * 86400_000),
      userAgent: obtenerUserAgent(req),
      ip: obtenerIp(req),
    })
    escribirDispositivo(res, deviceToken)
    await audit.registrar(req, audit.ACCIONES.DISPOSITIVO_CONFIADO, {
      usuarioId: usuario.id,
      email: usuario.email,
    })
  }

  await db.marcarUltimoAcceso(usuario.id)
  await audit.registrar(req, audit.ACCIONES.INGRESO_OK, {
    usuarioId: usuario.id,
    email: usuario.email,
    mondayUserId: payload.mid ?? null,
    detalle: { via },
  })

  // El token va también en el cuerpo, no solo en la cookie: es la mitad del doble
  // transporte de transport.js, la que sigue funcionando cuando el navegador descartó la
  // cookie por ser de terceros dentro del iframe de monday.
  return {
    ok: true,
    sessionToken: token,
    deviceToken,
    usuario: perfilPublico(usuario),
  }
}

// Lo único del usuario que puede cruzar hacia el navegador. Que exista esta función y no
// se devuelva la fila entera es lo que evita que el día que se agregue una columna
// sensible a usuarios_autorizados (un hash, una nota interna) se filtre sola por acá.
//
// `permisos` viaja al frontend para que la interfaz pueda esconder lo que la persona no
// puede hacer. Eso es comodidad, no seguridad: la interfaz esconde, el backend impide. Cada
// endpoint revalida el permiso por su cuenta (ver guard.js), porque una lista de permisos
// que llega al navegador es una lista que el navegador puede editar.
export function perfilPublico(usuario) {
  return {
    email: usuario.email,
    // El nombre de la fila del tablero. En un asiento compartido es lo único que distingue
    // a una persona de otra, así que la interfaz lo necesita para poder mostrar con qué
    // perfil se está trabajando.
    nombre: usuario.nombre ?? null,
    // El id de monday de quien entró. La interfaz lo necesita para asignarle las
    // oportunidades que crea (columna people "Asignado"): antes lo sacaba de
    // monday.get('context'), que solo responde dentro del iframe de monday y, en un asiento
    // compartido, devuelve la cuenta y no la persona. Acá el dato ya está verificado — es
    // el mismo con el que se la dejó entrar. No es sensible: es su propio id.
    mondayUserId: usuario.monday_user_id != null ? String(usuario.monday_user_id) : null,
    rol: usuario.rol,
    teams: usuario.teams ?? [],
    permisos: usuario.permisos ?? [],
    asientoCompartido: Boolean(usuario.asientoCompartido),
  }
}

// El cuerpo JSON de los endpoints que reciben POST. En Vercel llega parseado en req.body,
// pero en el dev server de Vite no, así que sin esto el login andaría en producción y no
// en local (o al revés, que es peor).
export async function leerJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body)
    } catch {
      throw new ErrorDeFlujo('JSON_INVALIDO', 'El cuerpo del pedido no es JSON válido.')
    }
  }
  const trozos = []
  for await (const trozo of req) trozos.push(trozo)
  if (!trozos.length) return {}
  try {
    return JSON.parse(Buffer.concat(trozos).toString('utf8'))
  } catch {
    throw new ErrorDeFlujo('JSON_INVALIDO', 'El cuerpo del pedido no es JSON válido.')
  }
}

// ¿Este navegador ya pasó el 2FA en las últimas 24 horas? Se usa al ingresar, para decidir
// si hay que pedir el código o no.
export async function dispositivoEsConfiable(req, usuarioId) {
  const token = leerTokenDispositivo(req)
  if (!token) return false
  return db.dispositivoConfiableVigente(usuarioId, hashConPepper(token))
}

// ¿A qué perfil corresponde el dispositivo confiable de este navegador? Devuelve el
// usuario_id local, o null. Se usa en el asiento compartido para saltear el selector: si
// este navegador ya pasó el segundo factor de "Martin Tap" y sigue vigente, se entra
// directo con ese perfil en vez de volver a preguntar en cada ingreso.
export async function perfilDelDispositivo(req) {
  const token = leerTokenDispositivo(req)
  if (!token) return null
  return db.perfilDeDispositivo(hashConPepper(token))
}

// La rama común del final del ingreso, una vez que ya se sabe con qué perfil se entra.
// La comparten /api/auth/session (cuando hay un solo perfil) y /api/auth/perfil (cuando se
// eligió uno). Que viva en un solo lugar es lo que evita que una de las dos rutas se olvide
// de exigir el segundo factor.
export async function continuarSegunMfa(req, res, usuario, { mondayUserId, mondayAccountId, origen }) {
  const payload = {
    sub: String(usuario.id),
    src: origen,
    mid: mondayUserId ?? null,
    acc: mondayAccountId ?? null,
  }

  const mfa = await db.obtenerMfa(usuario.id)

  // Todavía no configuró el segundo factor de ESTE perfil (o lo empezó y no lo terminó,
  // que para el caso es lo mismo: sin confirmar no protege nada).
  if (!mfa?.confirmado_en) {
    return {
      estado: 'MFA_ENROLAMIENTO_REQUERIDO',
      preAuthToken: await emitirPreAuth(usuario, { origen, mondayUserId, mondayAccountId }),
      perfil: { nombre: usuario.nombre, rol: usuario.rol },
      // Lo que va a ver en Google Authenticator. En un asiento compartido lleva el nombre
      // del perfil adelante, porque el correo es el mismo para los cuatro.
      etiquetaTotp: usuario.etiquetaTotp,
    }
  }

  // "No preguntar por 24 horas": el dispositivo se confía DESPUÉS de haber pasado el 2FA una
  // vez, y la confianza se revoca borrando la fila o cerrando sesión en todos lados.
  if (await dispositivoEsConfiable(req, usuario.id)) {
    return {
      estado: 'OK',
      ...(await finalizarIngreso(req, res, usuario, payload, {
        recordarDispositivo: false,
        via: 'dispositivo_confiable',
      })),
    }
  }

  return {
    estado: 'MFA_REQUERIDO',
    preAuthToken: await emitirPreAuth(usuario, { origen, mondayUserId, mondayAccountId }),
    usuario: perfilPublico(usuario),
    perfil: { nombre: usuario.nombre, rol: usuario.rol },
  }
}
