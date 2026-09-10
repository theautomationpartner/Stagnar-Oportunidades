// La lista blanca: la capa 2 del documento de investigación.
//
// La fuente de verdad es el tablero de monday "Usuario Habilitados - Lista Blanca"
// (ver boardLectura.js). Este archivo traduce una sesión de monday en "esta persona entra,
// con este perfil, este rol y estos permisos", y sostiene la regla de oro del documento: la
// lista se consulta en CADA pedido al backend, no solo al iniciar sesión.
//
// "En el acto" es, en la práctica, dentro del minuto: consultar la API de monday en cada
// click no es viable por cuota ni por latencia, así que la copia del tablero vive en
// Postgres con un TTL corto (AUTH_LISTA_BLANCA_TTL). La comparación honesta no es contra
// cero segundos: es contra las 24 horas que tardaría en caducar la sesión si el rol y el
// estado viajaran dentro del JWT, que es lo que hace casi todo el mundo.
//
// PERFILES. Un asiento de monday puede estar compartido: el 95773286 lo usan cuatro
// personas de The Automation Partner, cada una con su fila en el tablero y su propio Rol.
// Cuando hay más de una fila activa, la app pregunta con cuál entrar, y cada perfil tiene
// su propio segundo factor — que es lo que hace que elegir "Santi TAP / Admin" no sea algo
// que pueda hacer cualquiera que tenga ese asiento.

import { config } from './env.js'
import { NoAutorizado } from './errors.js'
import * as db from './db.js'
import { obtenerEmailDeMonday } from './mondaySession.js'
import { obtenerEntradas, perfilesDe, elegirPerfil } from './boardWhitelist.js'
import { rolDesdeEtiqueta, permisosDe } from './permisos.js'

// Chequeos que no dependen del tablero y que valen para cualquier camino.
function verificarSesionMonday(sesion) {
  // Los invitados externos de una cuenta de monday nunca entran, aunque figuren en el
  // tablero: un invitado de monday es alguien de afuera de la organización. Ojo con no
  // confundirlo con el Rol "Invitado" del tablero, que es otra cosa: una persona de la
  // organización con permisos de solo lectura.
  if (sesion.isGuest) throw new NoAutorizado('es_invitado_de_monday')

  if (config.cuentasHabilitadas.length && !config.cuentasHabilitadas.includes(sesion.accountId)) {
    throw new NoAutorizado('cuenta_de_monday_no_habilitada', { accountId: sesion.accountId })
  }
}

// El email hace falta aunque el tablero no lo tenga cargado: es lo que el usuario ve como
// nombre de cuenta en Google Authenticator. Hoy 10 de las 11 filas no tienen email, así que
// se resuelve contra la API de monday (cacheado 24 h en la base, ver mondaySession.js).
async function resolverEmail(entrada, mondayUserId) {
  if (entrada?.email) return entrada.email
  if (mondayUserId == null) return null
  try {
    return (await obtenerEmailDeMonday(mondayUserId)).email
  } catch {
    return null
  }
}

// Lo que el usuario va a ver como nombre de cuenta en su app de autenticación.
//
// En un asiento compartido, los cuatro perfiles resuelven al MISMO correo de monday. Si el
// código se guardara solo con ese correo, la persona vería cuatro entradas idénticas en
// Google Authenticator y no podría saber cuál es la suya. Por eso, cuando el asiento está
// compartido, la etiqueta lleva adelante el nombre de la fila.
function etiquetaTotp({ compartido, nombre, email }) {
  return compartido ? nombre + ' · ' + email : email
}

// Arma el objeto de usuario que ve el resto de la aplicación. Junta la fila local (id
// estable, para las claves foráneas), la fila del tablero (rol, team) y los permisos.
function componer(local, entrada, { email, compartido }) {
  const rol = rolDesdeEtiqueta(entrada.rolEtiqueta)
  const teams = entrada.teams ?? []
  return {
    ...local,
    email,
    nombre: entrada.nombre,
    rol,
    teams,
    permisos: permisosDe({ rol, teams }),
    mondayItemId: entrada.itemId,
    asientoCompartido: Boolean(compartido),
    etiquetaTotp: etiquetaTotp({ compartido, nombre: entrada.nombre, email }),
  }
}

// Paso 1 del ingreso: con qué perfiles puede entrar quien se presenta con este asiento.
//
// Devuelve la lista sin decidir. Quien llama (api/auth/session.js) decide si entra directo
// —cuando hay uno solo, o cuando el dispositivo ya es confiable para uno de ellos— o si
// muestra el selector.
export async function perfilesDisponibles(sesion) {
  verificarSesionMonday(sesion)

  const entradas = await obtenerEntradas()
  let resultado = perfilesDe(entradas, { mondayUserId: sesion.userId })

  // Si no está por ID Usuario, se prueba por email — para una fila cargada solo con el
  // correo. Recién acá se paga la consulta a la API de monday, y solo en ese caso.
  if (!resultado.permitido && resultado.motivo === 'no_esta_en_la_lista') {
    const perfil = await obtenerEmailDeMonday(sesion.userId).catch(() => null)
    if (perfil?.email) {
      // Alguien desactivado en la propia monday no entra, aunque el tablero diga Activo:
      // es la baja que el cliente ya hizo en la herramienta que conoce.
      if (perfil.habilitado === false) throw new NoAutorizado('usuario_deshabilitado_en_monday')
      resultado = perfilesDe(entradas, { email: perfil.email })
    }
  }

  if (!resultado.permitido) {
    await db.auditar({
      mondayUserId: sesion.userId,
      accion: 'no_autorizado',
      detalle: {
        motivo: resultado.motivo,
        accountId: sesion.accountId,
        // Qué filas del tablero se miraron: convierte un "no me deja entrar" en algo que se
        // resuelve mirando el tablero, en vez de adivinando.
        filas: resultado.filas.map((f) => ({ itemId: f.itemId, nombre: f.nombre, estado: f.estado })),
      },
    })
    throw new NoAutorizado(resultado.motivo)
  }

  return resultado
}

// Paso 2: activar un perfil concreto. Sincroniza la fila local y devuelve el usuario.
//
// Vuelve a resolver la lista desde el tablero en vez de confiar en el itemId que mandó el
// cliente. Es el control que impide que alguien mande el id de ítem de otra persona y entre
// como ella: si el perfil no está entre los ofrecidos a ESE asiento, no pasa.
export async function activarPerfil(sesion, itemId) {
  verificarSesionMonday(sesion)

  const entradas = await obtenerEntradas()
  let resultado = elegirPerfil(entradas, { mondayUserId: sesion.userId, itemId })

  if (!resultado.permitido && resultado.motivo === 'no_esta_en_la_lista') {
    const perfil = await obtenerEmailDeMonday(sesion.userId).catch(() => null)
    if (perfil?.email) resultado = elegirPerfil(entradas, { email: perfil.email, itemId })
  }

  if (!resultado.permitido) {
    await db.auditar({
      mondayUserId: sesion.userId,
      accion: 'no_autorizado',
      detalle: { motivo: resultado.motivo, itemIdPedido: String(itemId) },
    })
    throw new NoAutorizado(resultado.motivo)
  }

  const email = await resolverEmail(resultado.entrada, sesion.userId)
  if (!email) throw new NoAutorizado('email_no_resuelto', { mondayUserId: sesion.userId })

  const local = await db.sincronizarDesdeTablero({
    mondayUserId: sesion.userId,
    mondayAccountId: sesion.accountId,
    mondayItemId: Number(resultado.entrada.itemId),
    email,
    rol: rolDesdeEtiqueta(resultado.entrada.rolEtiqueta),
    team: resultado.entrada.teams,
  })

  return componer(local, resultado.entrada, { email, compartido: resultado.compartido })
}

// Camino del proveedor "contraseña" (2.1 del documento: acceso fuera de monday). La
// verificación de la contraseña vive en password.js; acá solo se decide si el email tiene
// derecho a intentarlo, contra el mismo tablero.
export async function resolverDesdeEmail(email) {
  const normalizado = String(email).toLowerCase().trim()
  const entradas = await obtenerEntradas()
  const resultado = perfilesDe(entradas, { email: normalizado })
  if (!resultado.permitido) throw new NoAutorizado(resultado.motivo)

  const local = await db.buscarUsuarioPorEmail(normalizado)
  if (!local) throw new NoAutorizado('sin_fila_local')

  const entrada =
    resultado.perfiles.find((p) => p.itemId === String(local.monday_item_id)) ?? resultado.perfiles[0]
  return componer(local, entrada, { email: normalizado, compartido: resultado.compartido })
}

// La revalidación de cada pedido ya autenticado.
//
// Vuelve a mirar el tablero, no la fila local: si el rol o el estado se leyeran del espejo
// en la base, un cambio en monday no tendría efecto hasta la próxima vez que la persona
// iniciara sesión, y toda la promesa de "se revisa en cada pedido" sería decorativa.
//
// Revalida el PERFIL, no el asiento. Tres cosas tienen que seguir siendo ciertas: la fila
// sigue existiendo, sigue activa, y sigue perteneciendo al mismo asiento de monday. La
// tercera importa: si un administrador mueve el ID Usuario de esa fila a otra persona, las
// sesiones abiertas sobre ella tienen que morir.
export async function revalidar(usuarioId) {
  const local = await db.buscarUsuarioPorId(usuarioId)
  if (!local) throw new NoAutorizado('sin_fila_local')

  const entradas = await obtenerEntradas()
  const resultado = elegirPerfil(entradas, {
    mondayUserId: local.monday_user_id,
    email: local.email,
    itemId: String(local.monday_item_id),
  })
  if (!resultado.permitido) throw new NoAutorizado(resultado.motivo, { usuarioId })

  return componer(local, resultado.entrada, {
    email: local.email,
    compartido: resultado.compartido,
  })
}
