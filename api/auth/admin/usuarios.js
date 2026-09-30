// /api/auth/admin/usuarios — administración de la lista blanca y reset de segundo factor.
// Requiere el permiso usuarios.administrar, o sea Rol = Admin en el tablero.
//
//   GET                                                   el tablero en vivo, los usuarios de
//                                                         monday y quién está en cada team
//   POST { accion: 'estado', itemId, estado }             activar / desactivar una fila
//   POST { accion: 'teams', itemId, admin, ventas, etiquetas? }
//                                                         Admin_App y/o Ventas_App, y las otras
//                                                         etiquetas de la columna Team
//   POST { accion: 'alta', mondayUserId, nombre, admin, ventas }
//                                                         fila para un usuario de monday
//   POST { accion: 'invitar', email, nombre, tipo, admin, ventas }
//                                                         lo invita a monday y le crea la fila
//   POST { accion: 'asignadas', mondayUserId }            sus oportunidades asignadas (solo lee)
//   POST { accion: 'monday-desactivar', mondayUserId, destino, reasignarA }
//                                                         le saca el acceso a TODO monday; antes
//                                                         pasa sus oportunidades a reasignarA
//                                                         (destino 'reasignar') o las deja sin
//                                                         asignar (destino 'vaciar')
//   POST { accion: 'monday-activar', mondayUserId }       se lo devuelve
//   POST { accion: 'sincronizar-teams' }                  los teams de monday según la lista
//   POST { id, accion: 'resetear-mfa' }                   para quien perdió el celular
//
// A pedido, nadie entra a los tableros: esto es lo que los reemplaza. Todo se escribe EN
// el tablero de la lista blanca (ver listaBlancaEscritura.js: los teams van en la columna
// Team por nombre y el Rol se deriva de ellos), se relee en el acto (refrescarAhora) para que rija
// desde el pedido siguiente, y se sincronizan los teams de monday de esa persona.
//
// Lo que sí queda acá es lo que el tablero no puede resolver: el enrolamiento de 2FA vive
// en la base (el secreto va cifrado), así que resetearlo es una operación de la app.

import { protegerEndpoint } from '../../_auth/guard.js'
import { ErrorDeFlujo } from '../../_auth/errors.js'
import { leerJson } from '../../_auth/mfaFlow.js'
import { PERMISOS, ROLES, rolDesdeEtiqueta } from '../../_auth/permisos.js'
import { diagnosticar, refrescarAhora } from '../../_auth/boardWhitelist.js'
import {
  activarEnMonday,
  desactivarEnMonday,
  idDelDuenoDeLaClave,
  cambiarEstado,
  cambiarTeams,
  crearFila,
  etiquetasDeTeam,
  esEtiquetaDeTeamApp,
  invitarAMonday,
  miembrosDeTeams,
  rolDeTeams,
  usuariosDeLaCuenta,
  sincronizarTeams,
  teamsDeFila,
} from '../../_auth/listaBlancaEscritura.js'
import { config } from '../../_auth/env.js'
import { oportunidadesAsignadasA, reasignarOportunidades } from '../../_auth/asignaciones.js'
import * as db from '../../_auth/db.js'
import * as audit from '../../_auth/audit.js'

export default protegerEndpoint(
  async (req, res, { usuario }) => {
    if (req.method === 'GET') {
      // El tablero en vivo, no la copia en caché (que puede tener hasta un minuto): quien
      // administra la lista tiene que ver lo que hay AHORA — si borró una fila en monday,
      // no puede seguir apareciendo. De paso se actualiza la caché para todos.
      const entradas = await refrescarAhora()

      return res.status(200).json({
        tablero: {
          boardId: config.listaBlancaBoardId,
          url: 'https://view.monday.com/boards/' + config.listaBlancaBoardId,
          columnas: config.columnas,
          ttlSegundos: config.listaBlancaTtlSegundos,
          // Contra qué "ID app" se está filtrando. Sin esto, un diagnóstico que dice "esta
          // persona no entra" no permite distinguir si le falta el Estado o si le falta
          // esta app en la columna.
          appId: config.appId,
        },
        // Cada fila, con la lectura ya interpretada: qué rol y qué permisos daría, y si
        // puede identificar a alguien. Es lo que responde "¿por qué Fulano no entra?".
        filas: entradas.map((e) => {
          const rol = rolDesdeEtiqueta(e.rolEtiqueta)
          const tieneEstaApp = e.apps.includes(String(config.appId))
          const entra = e.estado === 'activo' && tieneEstaApp && Boolean(e.mondayUserId || e.email)
          return {
            itemId: e.itemId,
            nombre: e.nombre,
            mondayUserId: e.mondayUserId,
            email: e.email,
            estado: e.estado,
            rol,
            teams: e.teams,
            // Admin_App / Ventas_App según la lista (lo que se tilda en la app).
            teamsApp: teamsDeFila(e),
            // Las demás etiquetas de la columna Team (sin Admin_App / Ventas_App).
            otrasEtiquetas: e.teams.filter((t) => !esEtiquetaDeTeamApp(t)),
            apps: e.apps,
            tieneEstaApp,
            entra,
            permisos: entra ? ROLES[rol] : [],
          }
        }),
        problemas: diagnosticar(entradas),
        // El espejo local: quién llegó a enrolarse y cuándo entró por última vez. Sirve
        // para ver quién todavía no configuró el 2FA.
        espejo: await db.listarUsuarios().catch(() => []),
        // Para el apartado de administración: a quién se puede dar de alta, quién está HOY
        // en cada team de monday (para marcar a quien quedó desalineado) y cuál es la fila
        // de quien está mirando (no se puede desactivar ni sacarse Admin_App a sí mismo).
        usuariosCuenta: await usuariosDeLaCuenta(),
        miembrosTeams: await miembrosDeTeams().catch(() => null),
        // Las otras etiquetas de la columna Team (Administracion, Vehiculos…), para ofrecerlas
        // en "+ Agregar".
        etiquetasTeam: await etiquetasDeTeam().catch(() => []),
        miFila: usuario?.mondayItemId ?? null,
        // Usuarios de monday que no se pueden desactivar desde acá: el dueño de la clave de
        // la API (sin él la app no habla con monday) y el de quien está mirando.
        mondayProtegidos: [await idDelDuenoDeLaClave().catch(() => null), usuario?.monday_user_id ?? null]
          .filter(Boolean)
          .map(String),
      })
    }

    const cuerpo = await leerJson(req)

    if (cuerpo.accion === 'asignadas') {
      const mondayUserId = String(cuerpo.mondayUserId ?? '')
      if (!/^\d+$/.test(mondayUserId)) throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Falta el usuario de monday.')
      const items = await oportunidadesAsignadasA(mondayUserId)
      return res.status(200).json({ total: items.length, items: items.map((i) => ({ id: i.id, nombre: i.nombre })) })
    }

    if (cuerpo.accion === 'monday-desactivar' || cuerpo.accion === 'monday-activar') {
      return res.status(200).json(await usuarioDeMonday(req, cuerpo, usuario))
    }

    if (['estado', 'teams', 'alta', 'invitar', 'sincronizar-teams'].includes(cuerpo.accion)) {
      return res.status(200).json(await administrarLista(req, cuerpo, usuario))
    }

    if (cuerpo.accion !== 'resetear-mfa') {
      throw new ErrorDeFlujo('ACCION_DESCONOCIDA', 'Acción desconocida: ' + String(cuerpo.accion))
    }

    const id = Number(cuerpo.id)
    if (!id) throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Falta el id del usuario (el del espejo, no el de monday).')

    // Un admin que se resetea a sí mismo no rompe nada (vuelve a escanear un QR), pero
    // conviene que sea deliberado y no un clic en la fila equivocada.
    if (id === usuario.id && !cuerpo.confirmarPropio) {
      throw new ErrorDeFlujo(
        'CONFIRMAR_PROPIO',
        'Estás por resetear tu propio segundo factor. Reenviá con confirmarPropio: true si es lo que querés.'
      )
    }

    // Resetear borra el enrolamiento, los códigos de recuperación, los dispositivos
    // confiables y las sesiones vivas. Las cuatro cosas: dejar los dispositivos confiables
    // permitiría seguir entrando sin 2FA a quien justamente lo perdió, que es lo contrario
    // de lo que se busca.
    await db.resetearMfa(id)

    await audit.registrar(req, 'admin_reset_mfa', {
      usuarioId: usuario.id,
      email: usuario.email,
      detalle: { objetivo: id },
    })

    return res.status(200).json({
      ok: true,
      mensaje: 'Listo. La próxima vez que entre, se le va a pedir que escanee un QR nuevo.',
    })
  },
  { metodos: ['GET', 'POST'], requierePermiso: PERMISOS.ADMINISTRAR_USUARIOS }
)

// ¿Cuántas filas darían acceso como Admin a esta app?
function adminsActivos(entradas) {
  return entradas.filter((e) => e.estado === 'activo' && e.apps.includes(String(config.appId)) && teamsDeFila(e).admin).length
}

const seleccionDe = (cuerpo) => ({ admin: cuerpo.admin === true, ventas: cuerpo.ventas === true })

// Las otras etiquetas de Team que manda la app, solo si son de la columna (no se crean
// etiquetas nuevas desde acá). undefined = no se tocan.
async function otrasEtiquetasDe(cuerpo) {
  if (!Array.isArray(cuerpo.etiquetas)) return undefined
  const validas = new Set(await etiquetasDeTeam())
  const elegidas = [...new Set(cuerpo.etiquetas.map((e) => String(e).trim()))]
  const invalida = elegidas.find((e) => !validas.has(e))
  if (invalida) throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'La etiqueta «' + invalida + '» no existe en la columna Team.')
  return elegidas
}
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function administrarLista(req, cuerpo, usuario) {
  // Se valida contra el tablero en vivo (ver el GET): un alta de alguien que se acaba de
  // borrar en monday no tiene que chocar con una copia vieja.
  const entradas = await refrescarAhora()

  if (cuerpo.accion === 'sincronizar-teams') {
    const ids = entradas.map((e) => e.mondayUserId).filter(Boolean)
    const teams = await sincronizarTeams(entradas, ids)
    await audit.registrar(req, 'admin_lista_sincronizar_teams', {
      usuarioId: usuario?.id ?? null,
      email: usuario?.email ?? null,
      detalle: teams,
    })
    return { ok: true, teams }
  }

  let afectado // mondayUserId cuyos teams hay que revisar después
  let detalle
  let aviso = null
  let asignadasResueltas = null

  if (cuerpo.accion === 'alta' || cuerpo.accion === 'invitar') {
    const seleccion = seleccionDe(cuerpo)
    let mondayUserId
    let email
    let nombre = String(cuerpo.nombre ?? '').trim()

    if (cuerpo.accion === 'alta') {
      mondayUserId = String(cuerpo.mondayUserId ?? '')
      if (!/^\d+$/.test(mondayUserId)) throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Elegí a qué usuario de monday dar de alta.')
      const cuenta = (await usuariosDeLaCuenta()).find((u) => u.id === mondayUserId)
      if (!cuenta || !cuenta.habilitado) {
        throw new ErrorDeFlujo('NO_EXISTE', 'Ese usuario no está (o no está habilitado) en la cuenta de monday.')
      }
      email = cuenta.email
      nombre = nombre || cuenta.nombre
    } else {
      email = String(cuerpo.email ?? '').trim().toLowerCase()
      if (!EMAIL_VALIDO.test(email)) throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Revisá el email.')
      if (!nombre) throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Falta el nombre.')
      const tipo = cuerpo.tipo === 'MEMBER' ? 'MEMBER' : 'GUEST'
      const cuenta = (await usuariosDeLaCuenta()).find((u) => u.email?.toLowerCase() === email)
      if (cuenta) {
        mondayUserId = cuenta.id
        aviso = 'Ese email ya era usuario de monday: no se lo invitó de nuevo.'
      } else {
        const invitado = await invitarAMonday(email, tipo)
        mondayUserId = invitado.id
        aviso = invitado.yaExistia
          ? 'Ese email ya era usuario de monday: no se lo invitó de nuevo.'
          : 'Se le mandó la invitación a monday. Va a poder entrar a la app cuando la acepte.'
      }
    }

    if (entradas.some((e) => e.mondayUserId === mondayUserId)) {
      throw new ErrorDeFlujo('YA_ESTA', 'Esa persona ya tiene una fila en la lista: cambiale los teams o el estado desde ahí.')
    }
    const itemId = await crearFila({ nombre, mondayUserId, email, seleccion, otras: (await otrasEtiquetasDe(cuerpo)) ?? [] })
    afectado = mondayUserId
    detalle = { itemId, mondayUserId, email, ...seleccion, invitada: cuerpo.accion === 'invitar' }
  } else {
    const fila = entradas.find((e) => e.itemId === String(cuerpo.itemId))
    if (!fila) throw new ErrorDeFlujo('NO_EXISTE', 'Esa fila ya no está en la lista. Recargá la pantalla.')
    const esMiFila = usuario?.mondayItemId != null && String(usuario.mondayItemId) === fila.itemId
    const eraAdmin = teamsDeFila(fila).admin && fila.estado === 'activo'

    if (cuerpo.accion === 'estado') {
      const estado = cuerpo.estado
      if (estado !== 'activo' && estado !== 'inactivo') throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Estado inválido.')
      if (estado === 'inactivo' && esMiFila) {
        throw new ErrorDeFlujo('PROPIO', 'No podés desactivarte a vos mismo: pedíselo a otro Admin.')
      }
      if (estado === 'inactivo' && eraAdmin && adminsActivos(entradas) <= 1) {
        throw new ErrorDeFlujo('ULTIMO_ADMIN', 'Es el único Admin activo: la lista quedaría sin nadie que la administre.')
      }
      // A pedido, también al quitarle el acceso a la app: sus oportunidades se pasan a otra
      // persona o quedan sin asignar, antes de sacarlo.
      if (estado === 'inactivo' && fila.mondayUserId) {
        asignadasResueltas = await resolverAsignadas(cuerpo, fila.mondayUserId, 'se le quitó el acceso')
      }
      await cambiarEstado(fila, estado)
      detalle = { itemId: fila.itemId, estado, asignadas: asignadasResueltas }
    } else {
      const seleccion = seleccionDe(cuerpo)
      if (!seleccion.admin && esMiFila) {
        throw new ErrorDeFlujo('PROPIO', 'No podés sacarte de Admin_App a vos mismo: pedíselo a otro Admin.')
      }
      if (!seleccion.admin && eraAdmin && adminsActivos(entradas) <= 1) {
        throw new ErrorDeFlujo('ULTIMO_ADMIN', 'Es el único Admin activo: la lista quedaría sin nadie que la administre.')
      }
      const otras = await otrasEtiquetasDe(cuerpo)
      await cambiarTeams(fila, seleccion, otras)
      detalle = { itemId: fila.itemId, ...seleccion, etiquetas: otras, rol: rolDeTeams(seleccion) }
    }
    afectado = fila.mondayUserId
  }

  // El tablero ya cambió: se relee para que rija desde el próximo pedido y para calcular
  // los teams con la lista nueva. Si los teams fallan, el cambio en la lista igual quedó
  // hecho (es lo que decide el acceso): se avisa y se puede reintentar con "Sincronizar".
  const nuevas = await refrescarAhora()
  let teams = { cambios: [], fallidos: [] }
  let errorTeams = null
  try {
    if (afectado) teams = await sincronizarTeams(nuevas, [afectado])
  } catch (err) {
    errorTeams = err.message
  }

  await audit.registrar(req, 'admin_lista_' + cuerpo.accion, {
    usuarioId: usuario?.id ?? null,
    email: usuario?.email ?? null,
    detalle: { ...detalle, teams, errorTeams },
  })

  return { ok: true, teams, errorTeams, aviso, asignadas: asignadasResueltas }
}

// Activar / desactivar el usuario en la cuenta de monday (no la fila de la lista blanca:
// eso es 'estado'). A pedido, son dos acciones distintas en la app.
async function usuarioDeMonday(req, cuerpo, usuario) {
  const mondayUserId = String(cuerpo.mondayUserId ?? '')
  if (!/^\d+$/.test(mondayUserId)) throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Falta el usuario de monday.')
  const desactivar = cuerpo.accion === 'monday-desactivar'
  let detalleAsignadas = null

  if (desactivar) {
    if (mondayUserId === (await idDelDuenoDeLaClave())) {
      throw new ErrorDeFlujo(
        'PROTEGIDO',
        'Ese usuario de monday es el dueño de la clave con la que la app habla con monday: desactivarlo deja a la app sin funcionar.'
      )
    }
    if (usuario?.monday_user_id != null && String(usuario.monday_user_id) === mondayUserId) {
      throw new ErrorDeFlujo('PROPIO', 'No podés desactivar tu propio usuario de monday.')
    }

    detalleAsignadas = await resolverAsignadas(cuerpo, mondayUserId, 'se lo desactivó en monday')

    await desactivarEnMonday(mondayUserId)
  } else {
    await activarEnMonday(mondayUserId)
  }

  await audit.registrar(req, desactivar ? 'admin_monday_desactivar' : 'admin_monday_activar', {
    usuarioId: usuario?.id ?? null,
    email: usuario?.email ?? null,
    detalle: { mondayUserId, asignadas: detalleAsignadas },
  })
  return { ok: true, asignadas: detalleAsignadas }
}

// Las oportunidades asignadas a quien se da de baja (de la app o de monday). A pedido, no
// quedan a nombre de alguien que ya no puede entrar: el pedido tiene que traer 'destino'
// ('reasignar' con reasignarA, o 'vaciar'). Se resuelven ANTES de la baja: si la
// reasignación falla, la baja no se hace.
async function resolverAsignadas(cuerpo, mondayUserId, queSeHace) {
  const asignadas = await oportunidadesAsignadasA(mondayUserId)
  if (!asignadas.length) return null
  const destino = cuerpo.destino
  if (destino !== 'reasignar' && destino !== 'vaciar') {
    throw new ErrorDeFlujo(
      'DECIDIR_ASIGNADAS',
      'Tiene ' + asignadas.length + ' oportunidades asignadas: elegí a quién pasárselas o si quedan sin asignar.'
    )
  }
  let reasignarA = null
  if (destino === 'reasignar') {
    reasignarA = String(cuerpo.reasignarA ?? '')
    const cuenta = (await usuariosDeLaCuenta()).find((u) => u.id === reasignarA)
    if (!cuenta || !cuenta.habilitado || reasignarA === String(mondayUserId)) {
      throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Elegí a una persona activa en monday para pasarle las oportunidades.')
    }
  }
  let hechas = 0
  try {
    hechas = await reasignarOportunidades(asignadas, mondayUserId, reasignarA)
  } catch (err) {
    throw new ErrorDeFlujo(
      'REASIGNACION_INCOMPLETA',
      'No se pudieron pasar todas sus oportunidades (' + err.message + '). No ' + queSeHace + ': volvé a intentarlo.',
      502
    )
  }
  return { total: asignadas.length, hechas, destino, reasignarA }
}
