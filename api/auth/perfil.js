// POST /api/auth/perfil — elegir con qué perfil entrar, en un asiento de monday compartido.
//
// Contexto: el asiento 95773286 lo usan cuatro personas de The Automation Partner, cada una
// con su fila en el tablero y su propio Rol. monday las ve a las cuatro como el mismo
// usuario, así que el sessionToken no alcanza para distinguirlas. Este endpoint recibe el
// perfil elegido y sigue el ingreso desde ahí.
//
// LO QUE HACE QUE ESTO SEA UNA BARRERA Y NO UNA ETIQUETA: cada perfil tiene su propio
// enrolamiento de 2FA (la clave del espejo es la fila del tablero, no el usuario de monday).
// Elegir "Santi TAP / Admin" no da acceso: da la pantalla que pide el código de 6 dígitos
// de Santi. Sin eso, cualquiera con ese asiento podría elegir el perfil más privilegiado y
// los roles no separarían nada dentro del asiento.
//
// El límite honesto, que conviene tener escrito: un perfil que NUNCA fue enrolado está sin
// reclamar, y el primero que lo elija va a enrolar su propio teléfono. O sea que la barrera
// se levanta cuando cada persona reclama el suyo, no antes. Por eso el selector marca
// cuáles ya están configurados, y por eso cada enrolamiento queda en auditoría con fecha e
// IP: si alguien reclama un perfil que no le corresponde, queda registrado.

import { modoAuth, validarConfig } from '../_auth/env.js'
import { responderError, NoAutorizado, ErrorDeFlujo } from '../_auth/errors.js'
import { verificarSeleccion } from '../_auth/tokens.js'
import { activarPerfil } from '../_auth/whitelist.js'
import { leerTokenFlujo, obtenerIp } from '../_auth/transport.js'
import { continuarSegunMfa, leerJson } from '../_auth/mfaFlow.js'
import * as audit from '../_auth/audit.js'
import * as rateLimit from '../_auth/rateLimit.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'METODO_NO_PERMITIDO' })
  }
  if (modoAuth() === 'off') return res.status(404).json({ error: 'NO_DISPONIBLE' })

  try {
    validarConfig()
    await rateLimit.consumir('ip:' + obtenerIp(req), rateLimit.LIMITES.porIp, { fallarCerrado: false })

    // El token de selección llega por su propio header (X-Auth-Flow-Token), NO por el de la
    // sesión ni por cookie. La separación arregla un bug real: una cookie de sesión viva
    // tapaba al token de selección y el ingreso quedaba en bucle. Ver leerTokenFlujo.
    const seleccion = await verificarSeleccion(leerTokenFlujo(req))
    const { itemId } = await leerJson(req)
    if (!itemId) throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Falta el perfil elegido.')

    // activarPerfil vuelve a resolver la lista desde el tablero y verifica que el itemId
    // pedido sea uno de los ofrecidos a ESTE asiento. No se confía en lo que mandó el
    // cliente: sin ese control, alguien podría mandar el id de ítem de otra persona.
    const sesionMonday = { userId: seleccion.mid, accountId: seleccion.acc, isGuest: false }
    const usuario = await activarPerfil(sesionMonday, itemId)

    await audit.registrar(req, 'perfil_elegido', {
      usuarioId: usuario.id,
      email: usuario.email,
      mondayUserId: seleccion.mid,
      detalle: { itemId: String(itemId), nombre: usuario.nombre, rol: usuario.rol },
    })

    return res.status(200).json(
      await continuarSegunMfa(req, res, usuario, {
        mondayUserId: seleccion.mid,
        mondayAccountId: seleccion.acc,
        origen: 'monday',
      })
    )
  } catch (err) {
    if (err instanceof NoAutorizado) {
      await audit.registrar(req, audit.ACCIONES.NO_AUTORIZADO, {
        detalle: { motivo: err.motivo, endpoint: 'perfil', ...(err.detalle ?? {}) },
      })
    }
    return responderError(res, err)
  }
}
