// Escrituras sobre el tablero "Usuario Habilitados - Lista Blanca" desde el apartado de
// administración de la app (ver api/auth/admin/usuarios.js), y la sincronización de los
// teams de monday Admin_App / Ventas_App.
//
// La idea, a pedido: nadie entra a los tableros, todo se maneja desde la app. El tablero
// sigue siendo donde queda guardado (la app escribe EN él, no en su base), pero lo edita
// la app.
//
// Qué se guarda y dónde:
//   - Team (dropdown_mm72rsy7): los teams de monday a los que pertenece la persona — uno,
//     los dos o ninguno —, por NOMBRE ("Admin_App", "Ventas_App"), a pedido, para que se
//     lean en el tablero. Es lo que se elige en la app. Las otras etiquetas de la columna
//     se conservan tal cual.
//   - Rol (color_mm72cf90): se DERIVA de los teams y se escribe junto con ellos, porque es
//     lo que lee el login para dar permisos (ver permisos.js). Admin_App → Admin (que ya
//     incluye todo lo de un vendedor); solo Ventas_App → Vendedor; ninguno → Invitado.
//   - Además, la persona se suma o se saca de esos teams en monday (sincronizarTeams).

import { config } from './env.js'
import { rolDesdeEtiqueta } from './permisos.js'

// Etiquetas reales de las columnas Rol y Estado Usuario del tablero.
export const ETIQUETA_ROL = { admin: 'Admin', usuario: 'Vendedor', invitado: 'Invitado' }
export const ETIQUETA_ESTADO = { activo: 'Activo', inactivo: 'Inactivo' }

export const NOMBRE_TEAM = { admin: 'Admin_App', ventas: 'Ventas_App' }
const idTeam = (clave) => String(config.teams[clave])
// Cómo figura cada team en la columna Team: por nombre. También se reconoce el ID, por si
// alguna fila quedó guardada así (fue el formato de una versión anterior de este apartado).
const figuraComo = (clave) => [NOMBRE_TEAM[clave], idTeam(clave)]
const esNuestra = (etiqueta) => [...figuraComo('admin'), ...figuraComo('ventas')].includes(String(etiqueta))
export { esNuestra as esEtiquetaDeTeamApp }

// `version`: la API de monday. Casi todo va en 2024-10; las consultas de usuarios que
// necesitan ver las invitaciones PENDIENTES van en 2026-07 (ver usuariosDeLaCuenta).
async function gql(query, variables, version = '2024-10') {
  if (!config.mondayApiKey) throw new Error('MONDAY_API_KEY no está configurada')
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: config.mondayApiKey, 'API-Version': version },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error('La API de monday devolvió ' + res.status)
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(' · '))
  return json.data
}

// create_labels_if_missing: la primera vez que se guarda el ID de un team, esa etiqueta
// todavía no existe en el dropdown Team.
async function cambiarColumnas(itemId, columnas) {
  await gql(
    `mutation ($boardId: ID!, $itemId: ID!, $valores: JSON!) {
       change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $valores, create_labels_if_missing: true) { id }
     }`,
    { boardId: config.listaBlancaBoardId, itemId: String(itemId), valores: JSON.stringify(columnas) }
  )
}

// ---- Teams de una fila ---------------------------------------------------------------

// A qué teams pertenece una fila según la columna Team. Una fila que todavía no tiene
// ningún team guardado (las cargadas antes de este apartado) se lee desde su Rol, así
// nadie queda afuera de golpe: Admin → Admin_App, Vendedor → Ventas_App.
export function teamsDeFila(fila) {
  const tiene = (clave) => fila.teams.some((t) => figuraComo(clave).includes(String(t)))
  const admin = tiene('admin')
  const ventas = tiene('ventas')
  if (admin || ventas) return { admin, ventas }
  const rol = rolDesdeEtiqueta(fila.rolEtiqueta)
  return { admin: rol === 'admin', ventas: rol === 'usuario' }
}

export function rolDeTeams({ admin, ventas }) {
  return admin ? 'admin' : ventas ? 'usuario' : 'invitado'
}

function columnasDeTeams(etiquetasActuales, seleccion) {
  const etiquetas = [
    ...etiquetasActuales.filter((t) => !esNuestra(t)),
    ...(seleccion.admin ? [NOMBRE_TEAM.admin] : []),
    ...(seleccion.ventas ? [NOMBRE_TEAM.ventas] : []),
  ]
  return {
    [config.columnas.team]: { labels: etiquetas },
    [config.columnas.rol]: { label: ETIQUETA_ROL[rolDeTeams(seleccion)] },
  }
}

// `otras`: las demás etiquetas de la columna Team (Administracion, Vehiculos…). Si no
// viene, se conservan las que ya tenía la fila.
export function cambiarTeams(fila, seleccion, otras) {
  return cambiarColumnas(fila.itemId, columnasDeTeams(otras ?? fila.teams, seleccion))
}

// Las etiquetas que tiene la columna Team en el tablero, sin Admin_App ni Ventas_App
// (esos se manejan aparte, ver teamsDeFila). A pedido, también se pueden poner y sacar desde
// la app; solo se guardan en la columna: no mueven a nadie de team ni cambian el Rol.
export async function etiquetasDeTeam() {
  const data = await gql(`query ($boardId: ID!, $col: String!) { boards(ids: [$boardId]) { columns(ids: [$col]) { settings_str } } }`, {
    boardId: config.listaBlancaBoardId,
    col: config.columnas.team,
  })
  const settings = JSON.parse(data.boards?.[0]?.columns?.[0]?.settings_str || '{}')
  const desactivadas = new Set((settings.deactivated_labels ?? []).map(String))
  return (settings.labels ?? [])
    .filter((l) => !desactivadas.has(String(l.id)))
    .map((l) => String(l.name).trim())
    .filter((n) => n && !esNuestra(n))
}

// Activar también le suma ESTA app a "ID app" (si no la tenía): activar desde acá es
// darle acceso a esta aplicación. Desactivar solo cambia el Estado — y ojo, Inactivo lo
// saca de todas las apps del grupo (ver boardLectura.js#perfilesDe, regla 1).
export function cambiarEstado(fila, estado) {
  const columnas = { [config.columnas.estado]: { label: ETIQUETA_ESTADO[estado] } }
  if (estado === 'activo' && !fila.apps.includes(String(config.appId))) {
    columnas[config.columnas.idApp] = { labels: [...fila.apps, String(config.appId)] }
  }
  return cambiarColumnas(fila.itemId, columnas)
}

// Reinvitar (a pedido): una fila cuya persona no está en la cuenta de monday (invitación
// cancelada o vencida, o cargada sin usuario) queda vinculada al usuario de la invitación
// nueva. El email solo se escribe si cambió (la fila no tenía, o se corrigió).
export function vincularUsuarioAFila(fila, { mondayUserId, email }) {
  const columnas = { [config.columnas.mondayUserId]: String(mondayUserId) }
  if (email && email !== fila.email) columnas[config.columnas.email] = { email, text: email }
  return cambiarColumnas(fila.itemId, columnas)
}

export async function crearFila({ nombre, mondayUserId, email, seleccion, otras = [] }) {
  const columnas = {
    [config.columnas.mondayUserId]: String(mondayUserId),
    [config.columnas.estado]: { label: ETIQUETA_ESTADO.activo },
    [config.columnas.idApp]: { labels: [String(config.appId)] },
    ...columnasDeTeams(otras, seleccion),
  }
  if (email) columnas[config.columnas.email] = { email, text: email }
  const data = await gql(
    `mutation ($boardId: ID!, $nombre: String!, $valores: JSON!) {
       create_item(board_id: $boardId, item_name: $nombre, column_values: $valores, create_labels_if_missing: true) { id }
     }`,
    { boardId: config.listaBlancaBoardId, nombre, valores: JSON.stringify(columnas) }
  )
  return data.create_item.id
}

// ---- Usuarios de la cuenta de monday -------------------------------------------------

// Todos los usuarios de la cuenta de monday, para elegir a quién dar de alta. Van también
// los desactivados, marcados (habilitado: false): el buscador los muestra para que se
// entienda por qué no se pueden elegir.
//
// Se piden con la versión 2026-07 de la API (ver Usuarios_Teams.md): con `status` trae
// también las invitaciones PENDIENTES. En 2024-10 un recién invitado no aparecía hasta que
// aceptara, y su fila se veía "Sin usuario de monday" aunque ya tuviera su ID guardado.
// Los desactivados se piden aparte (status: INACTIVE, lo que en 2024-10 era non_active).
// De esa lista se descartan las invitaciones canceladas o vencidas ("Deleted on invitation
// cancelation"…): son pendientes que nunca fueron usuarios.
const CAMPOS_USUARIO = 'id name email enabled is_guest is_pending'
export async function usuariosDeLaCuenta() {
  const data = await gql(
    `{ activos: users(limit: 500, status: [ACTIVE, PENDING]) { ${CAMPOS_USUARIO} } inactivos: users(limit: 500, status: [INACTIVE]) { ${CAMPOS_USUARIO} } }`,
    {},
    '2026-07'
  )
  const inactivos = (data.inactivos ?? []).filter((u) => !u.is_pending)
  const porId = new Map([...(data.activos ?? []), ...inactivos].map((u) => [String(u.id), u]))
  return [...porId.values()]
    .map((u) => ({
      id: String(u.id),
      nombre: u.name,
      email: u.email || null,
      habilitado: Boolean(u.enabled),
      invitado: Boolean(u.is_guest),
      pendiente: Boolean(u.is_pending),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// ---- Activar / desactivar el usuario en la cuenta de monday ---------------------------
//
// Es distinto de Activo/Inactivo en la lista blanca: esto le saca (o le devuelve) el acceso
// a TODO monday, no solo a la app, y libera la licencia. Se puede deshacer con
// activate_users. Sus ítems, updates y asignaciones se conservan.

// El usuario dueño de la clave de la API: desactivarlo deja a la app entera sin monday.
export async function idDelDuenoDeLaClave() {
  const data = await gql(`{ me { id } }`)
  return String(data.me.id)
}

export async function desactivarEnMonday(userId) {
  const data = await gql(
    `mutation ($ids: [ID!]!) {
       deactivate_users(user_ids: $ids) { deactivated_users { id } errors { message code user_id } }
     }`,
    { ids: [String(userId)] }
  )
  const error = data.deactivate_users?.errors?.[0]
  if (error) throw new Error(error.message || 'monday no pudo desactivar al usuario')
}

export async function activarEnMonday(userId) {
  const data = await gql(
    `mutation ($ids: [ID!]!) {
       activate_users(user_ids: $ids) { activated_users { id } errors { message code user_id } }
     }`,
    { ids: [String(userId)] }
  )
  const error = data.activate_users?.errors?.[0]
  if (error) throw new Error(error.message || 'monday no pudo activar al usuario')
}

// Invita a alguien que todavía no está en la cuenta de monday (ver Usuarios_Teams.md). Sin
// usuario de monday no podría abrir la app, que corre adentro de monday. `tipo` es el
// user_role de monday: MEMBER (ocupa licencia) o GUEST.
//
// Después de invitar se busca el ID por email, igual que en la investigación: cubre al
// recién invitado (queda "pendiente" hasta que acepte) y al que ya existía.
export async function invitarAMonday(email, tipo) {
  const data = await gql(
    `mutation ($emails: [String!]!, $rol: UserRole) {
       invite_users(emails: $emails, product: work_management, user_role: $rol) {
         invited_users { id email }
         errors { message code email }
       }
     }`,
    { emails: [email], rol: tipo }
  )
  const invitado = data.invite_users?.invited_users?.[0]
  if (invitado?.id) return { id: String(invitado.id), yaExistia: false }

  // Si invite_users no devolvió el id (por ejemplo, el email ya estaba en la cuenta), se
  // busca por email incluyendo las invitaciones pendientes (API 2026-07, ver arriba).
  const buscado = await gql(
    `query ($emails: [String!]) { users(emails: $emails, status: [ACTIVE, PENDING]) { id email } }`,
    { emails: [email] },
    '2026-07'
  )
  const existente = buscado.users?.[0]
  if (existente?.id) return { id: String(existente.id), yaExistia: true }

  const error = data.invite_users?.errors?.[0]
  throw new Error(error?.message || 'monday no pudo invitar a ' + email)
}

// ---- Sincronización con los teams de monday -----------------------------------------

// En qué teams tiene que estar un usuario de monday según sus filas de la lista.
//
// Un asiento puede tener varias filas (perfiles), así que se mira el conjunto: está en un
// team si alguna de sus filas activas con esta app lo tiene. Una fila Inactivo bloquea el
// asiento entero para entrar, y por lo mismo lo saca de los dos teams.
export function teamsEsperados(entradas, mondayUserId) {
  const filas = entradas.filter((e) => e.mondayUserId === String(mondayUserId))
  if (filas.some((f) => f.estado === 'inactivo')) return { admin: false, ventas: false }
  const activas = filas.filter((f) => f.estado === 'activo' && f.apps.includes(String(config.appId))).map(teamsDeFila)
  return { admin: activas.some((t) => t.admin), ventas: activas.some((t) => t.ventas) }
}

// Quién está HOY en cada team de monday, leído en vivo.
export async function miembrosDeTeams() {
  const data = await gql(`query ($ids: [ID!]) { teams(ids: $ids) { id users { id } } }`, {
    ids: [idTeam('admin'), idTeam('ventas')],
  })
  const porId = Object.fromEntries((data.teams ?? []).map((t) => [String(t.id), t.users.map((u) => String(u.id))]))
  return { admin: porId[idTeam('admin')] ?? [], ventas: porId[idTeam('ventas')] ?? [] }
}

async function moverEnTeam(teamId, userIds, agregar) {
  if (!userIds.length) return []
  const mutacion = agregar ? 'add_users_to_team' : 'remove_users_from_team'
  const data = await gql(
    `mutation ($teamId: ID!, $userIds: [ID!]!) {
       ${mutacion}(team_id: $teamId, user_ids: $userIds) { successful_users { id } failed_users { id } }
     }`,
    { teamId, userIds }
  )
  return (data[mutacion]?.failed_users ?? []).map((u) => String(u.id))
}

// Deja los teams de estos usuarios como corresponde según `entradas` (la lista YA
// actualizada). Solo toca lo que difiere. Devuelve qué movió y qué no pudo mover (por
// ejemplo, monday no deja sacar de un team a quien es su dueño).
export async function sincronizarTeams(entradas, mondayUserIds) {
  const ids = [...new Set(mondayUserIds.filter(Boolean).map(String))]
  if (!ids.length) return { cambios: [], fallidos: [] }
  const hoy = await miembrosDeTeams()
  const actuales = { admin: new Set(hoy.admin), ventas: new Set(hoy.ventas) }

  const plan = { admin: { sumar: [], sacar: [] }, ventas: { sumar: [], sacar: [] } }
  for (const id of ids) {
    const esperado = teamsEsperados(entradas, id)
    for (const team of ['admin', 'ventas']) {
      const esta = actuales[team].has(id)
      if (esperado[team] && !esta) plan[team].sumar.push(id)
      if (!esperado[team] && esta) plan[team].sacar.push(id)
    }
  }

  const cambios = []
  const fallidos = []
  for (const team of ['admin', 'ventas']) {
    for (const [agregar, lista] of [[true, plan[team].sumar], [false, plan[team].sacar]]) {
      if (!lista.length) continue
      const fallaron = await moverEnTeam(idTeam(team), lista, agregar)
      for (const id of lista) {
        const registro = { mondayUserId: id, team: NOMBRE_TEAM[team], accion: agregar ? 'sumar' : 'sacar' }
        if (fallaron.includes(id)) fallidos.push(registro)
        else cambios.push(registro)
      }
    }
  }
  return { cambios, fallidos }
}
