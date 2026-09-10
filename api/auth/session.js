// POST /api/auth/session — proveedor de identidad "monday". Es la puerta de entrada normal
// de la app: el frontend le manda el sessionToken que le dio monday y recibe una de cuatro
// respuestas.
//
//   { estado: 'OK' }                          ya está: sesión completa emitida.
//   { estado: 'MFA_REQUERIDO' }               es quien dice ser, falta el código.
//   { estado: 'MFA_ENROLAMIENTO_REQUERIDO' }  primera vez: hay que escanear el QR.
//   { estado: 'ELEGIR_PERFIL' }               el asiento de monday está compartido.
//
// La cuarta existe porque un asiento de monday puede corresponder a varias personas: el
// 95773286 lo usan cuatro de The Automation Partner, cada una con su fila en el tablero y
// su propio Rol. En ese caso se devuelve la lista y se pregunta.
//
// Las tres últimas vienen con un token de vida corta que NO es una sesión: no sirve para
// pedir un solo dato. El de selección solo habilita /api/auth/perfil; el preAuthToken solo
// habilita /api/auth/mfa/*.

import { modoAuth, validarConfig } from '../_auth/env.js'
import { responderError, NoAutorizado } from '../_auth/errors.js'
import { verificarSessionToken } from '../_auth/mondaySession.js'
import { perfilesDisponibles, activarPerfil } from '../_auth/whitelist.js'
import { emitirSeleccion } from '../_auth/tokens.js'
import { leerTokenMonday, obtenerIp } from '../_auth/transport.js'
import { continuarSegunMfa, perfilDelDispositivo } from '../_auth/mfaFlow.js'
import { rolDesdeEtiqueta } from '../_auth/permisos.js'
import * as db from '../_auth/db.js'
import * as audit from '../_auth/audit.js'
import * as rateLimit from '../_auth/rateLimit.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'METODO_NO_PERMITIDO' })
  }

  // Con la autenticación apagada, este endpoint contesta que sí a todo. Así el frontend
  // puede llamarlo siempre, sin ramas por entorno, y la app funciona igual que hoy mientras
  // la infraestructura no esté lista.
  if (modoAuth() === 'off') {
    return res.status(200).json({ estado: 'OK', authDeshabilitado: true, usuario: null })
  }

  try {
    validarConfig()

    // Techo por IP sobre todo /api/auth/*. No reemplaza a los límites finos por usuario:
    // existe para que nadie pueda esquivarlos rotando la clave de límite.
    await rateLimit.consumir('ip:' + obtenerIp(req), rateLimit.LIMITES.porIp, { fallarCerrado: false })

    const sesionMonday = await verificarSessionToken(leerTokenMonday(req))
    const { perfiles, compartido } = await perfilesDisponibles(sesionMonday)

    const contexto = {
      mondayUserId: sesionMonday.userId,
      mondayAccountId: sesionMonday.accountId,
      origen: 'monday',
    }

    // Un solo perfil: el camino de siempre, sin preguntar nada.
    if (!compartido) {
      const usuario = await activarPerfil(sesionMonday, perfiles[0].itemId)
      const cuerpo = await continuarSegunMfa(req, res, usuario, contexto)
      // Higiene sin cron: una de cada cincuenta veces se barren las filas vencidas. En un
      // proyecto de este tamaño no justifica un Cron Job de Vercel aparte.
      if (Math.random() < 0.02) await db.limpiarVencidos().catch(() => {})
      return res.status(200).json(cuerpo)
    }

    // Asiento compartido. Antes de preguntar: si este navegador ya pasó el segundo factor
    // de uno de estos perfiles y sigue vigente, se entra directo con ese. Sin este atajo,
    // las cuatro personas de TAP tendrían que elegir perfil todos los días aunque hayan
    // marcado "no preguntar por 30 días", que es justamente lo que ese check promete evitar.
    const usuarioIdDelDispositivo = await perfilDelDispositivo(req)
    if (usuarioIdDelDispositivo) {
      const local = await db.buscarUsuarioPorId(usuarioIdDelDispositivo)
      const sigueOfrecido =
        local &&
        Number(local.monday_user_id) === sesionMonday.userId &&
        perfiles.some((p) => p.itemId === String(local.monday_item_id))

      if (sigueOfrecido) {
        const usuario = await activarPerfil(sesionMonday, local.monday_item_id)
        return res.status(200).json(await continuarSegunMfa(req, res, usuario, contexto))
      }
    }

    // Hay que preguntar. Se informa cuáles perfiles ya tienen 2FA configurado, para que la
    // persona sepa cuál es el suyo sin tener que probar.
    const estadoMfa = await db.estadoMfaPorItemIds(perfiles.map((p) => p.itemId))

    await audit.registrar(req, 'seleccion_de_perfil', {
      mondayUserId: sesionMonday.userId,
      detalle: { perfiles: perfiles.map((p) => p.itemId) },
    })

    return res.status(200).json({
      estado: 'ELEGIR_PERFIL',
      seleccionToken: await emitirSeleccion({
        mondayUserId: sesionMonday.userId,
        mondayAccountId: sesionMonday.accountId,
      }),
      perfiles: perfiles.map((p) => ({
        itemId: p.itemId,
        nombre: p.nombre,
        rol: rolDesdeEtiqueta(p.rolEtiqueta),
        teams: p.teams,
        // Un perfil sin 2FA todavía está sin reclamar: el primero que lo elija enrola su
        // teléfono. Mostrarlo evita que alguien elija por error el perfil de otro.
        yaConfigurado: estadoMfa.get(p.itemId)?.mfaConfigurado ?? false,
      })),
    })
  } catch (err) {
    if (err instanceof NoAutorizado) {
      await audit.registrar(req, audit.ACCIONES.NO_AUTORIZADO, {
        detalle: { motivo: err.motivo, endpoint: 'session', ...(err.detalle ?? {}) },
      })
    }
    return responderError(res, err)
  }
}
