// Lectura e interpretación del tablero de monday "Usuario Habilitados - Lista Blanca"
// (18409461390), sin caché y sin base de datos.
//
// Está separado de boardWhitelist.js —que es el que cachea— por una razón concreta: este
// archivo no importa nada más que la configuración, así que el script de pre-vuelo
// (npm run auth:lista) puede usar EXACTAMENTE las mismas reglas que aplica el backend sin
// necesitar Postgres. Un script de verificación que reimplementa las reglas por su cuenta
// no verifica nada: verifica su propia copia, que es justo la que puede haber divergido.

import { config } from './env.js'

const COLUMNAS = () => [
  config.columnas.mondayUserId,
  config.columnas.email,
  config.columnas.rol,
  config.columnas.team,
  config.columnas.estado,
  config.columnas.idApp,
]

const CONSULTA = `
  query ListaBlanca($boardId: ID!, $cols: [String!], $cursor: String) {
    boards(ids: [$boardId]) {
      items_page(limit: 500, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values(ids: $cols) { id text }
        }
      }
    }
  }
`

export async function leerTableroSinCache() {
  if (!config.mondayApiKey) throw new Error('MONDAY_API_KEY no está configurada')

  const items = []
  let cursor = null
  do {
    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.mondayApiKey,
        'API-Version': '2024-10',
      },
      body: JSON.stringify({
        query: CONSULTA,
        variables: { boardId: config.listaBlancaBoardId, cols: COLUMNAS(), cursor },
      }),
    })
    if (!res.ok) throw new Error('La API de monday devolvió ' + res.status + ' al leer la lista blanca')
    const json = await res.json()
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(' · '))

    const pagina = json.data?.boards?.[0]?.items_page
    if (!pagina) throw new Error('El tablero ' + config.listaBlancaBoardId + ' no existe o no es accesible')
    items.push(...pagina.items)
    cursor = pagina.cursor
  } while (cursor)

  return items.map(interpretarFila)
}

export function interpretarFila(item) {
  const v = Object.fromEntries(item.column_values.map((c) => [c.id, (c.text ?? '').trim()]))

  const idCrudo = v[config.columnas.mondayUserId] ?? ''
  const estadoCrudo = (v[config.columnas.estado] ?? '').toLowerCase()

  return {
    itemId: String(item.id),
    nombre: item.name ?? '',
    // Solo dígitos: la columna es de texto libre, así que puede tener cualquier cosa.
    mondayUserId: /^\d+$/.test(idCrudo) ? idCrudo : null,
    email: (v[config.columnas.email] ?? '').toLowerCase() || null,
    rolEtiqueta: v[config.columnas.rol] ?? '',
    // Un dropdown puede tener varios valores; monday los devuelve separados por coma.
    teams: (v[config.columnas.team] ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    // "ID app": a qué aplicaciones entra esta persona. Una fila puede listar varias, y cada
    // app se queda solo con las filas que incluyan la suya. Es lo que permite que una sola
    // lista blanca sirva para las tres apps del grupo sin que estar en una implique estar
    // en todas.
    apps: (v[config.columnas.idApp] ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    // Tres estados, no dos. La celda VACÍA no es lo mismo que "Activo" y no habilita:
    // este tablero se usa además para el Ejecutivo Virtual de WhatsApp, así que tiene
    // filas que son contactos y no usuarios de la app. Exigir un "Activo" explícito es lo
    // que evita que una fila cargada para otra cosa termine dando acceso a la aplicación.
    estado: estadoCrudo === 'activo' ? 'activo' : estadoCrudo === 'inactivo' ? 'inactivo' : 'sin_estado',
  }
}

// ¿Esta fila da acceso a ESTA aplicación?
//
// La celda vacía NO habilita, igual que el Estado. Es la dirección segura y además es
// coherente con lo que significa la columna: si "ID app" listara implícitamente todas las
// apps cuando está vacía, agregar una app nueva le daría acceso automático a todo el que
// tenga la celda sin completar, que es exactamente lo contrario de lo que se busca al
// separar por app.
function tieneAcceso(fila) {
  return fila.apps.includes(String(config.appId))
}

// Los PERFILES con los que puede entrar quien se presenta con un asiento de monday.
//
// Un asiento puede tener varias filas en el tablero: el 95773286 lo comparten cuatro
// personas de The Automation Partner, cada una con su fila, su Rol y su propio segundo
// factor. Cuando hay más de uno, la app pregunta con cuál entrar.
//
// Reglas, en este orden:
//
//   1. Una fila "Inactivo" bloquea el asiento entero, aunque haya otras en "Activo". Una
//      revocación explícita siempre gana, y gana ANTES de mirar la columna "ID app": dar de
//      baja a alguien tiene que sacarlo de todas las aplicaciones, no solo de esta.
//   2. Hace falta al menos una fila en "Activo". Vacío no alcanza (ver interpretarFila).
//   3. De las activas quedan las que incluyan a ESTA app en "ID app". Estar en la lista no
//      es lo mismo que tener acceso a esta aplicación, y la diferencia se distingue: si hay
//      filas activas pero ninguna nombra a esta app, el motivo es 'sin_acceso_a_esta_app' y
//      no 'no_esta_en_la_lista'. Ese detalle no cambia lo que ve el usuario —el mensaje es
//      siempre el mismo, genérico— pero sí lo que dice la auditoría, que es donde se
//      averigua por qué alguien no puede entrar.
//   4. Las filas que quedan son los perfiles ofrecidos, en orden estable por id de ítem.
//
// El Rol se lee de la fila ELEGIDA, no se promedia ni se degrada: con un 2FA por perfil,
// entrar como "Santi TAP / Admin" exige el segundo factor de Santi, así que el rol alto ya
// está protegido por algo que solo esa persona tiene.
export function perfilesDe(entradas, { mondayUserId, email }) {
  const idBuscado = mondayUserId != null ? String(mondayUserId) : null
  const emailBuscado = email ? String(email).toLowerCase() : null

  // El ID Usuario manda. El email es el respaldo para una fila cargada sin ID, y solo se
  // usa si el ID no encontró nada — así una fila cuyo email y cuyo ID se contradicen (hay
  // una hoy en el tablero) resuelve siempre igual, sin depender del orden de las filas.
  let filas = idBuscado ? entradas.filter((e) => e.mondayUserId === idBuscado) : []
  let via = 'id_usuario'
  if (!filas.length && emailBuscado) {
    filas = entradas.filter((e) => e.email === emailBuscado)
    via = 'email'
  }

  if (!filas.length) return { permitido: false, motivo: 'no_esta_en_la_lista', filas: [], perfiles: [] }

  const inactiva = filas.find((f) => f.estado === 'inactivo')
  if (inactiva) {
    return { permitido: false, motivo: 'usuario_inactivo', filas, perfiles: [], itemId: inactiva.itemId }
  }

  const activas = filas.filter((f) => f.estado === 'activo')
  if (!activas.length) return { permitido: false, motivo: 'sin_estado_activo', filas, perfiles: [] }

  const perfiles = activas
    .filter((f) => tieneAcceso(f))
    .sort((a, b) => Number(a.itemId) - Number(b.itemId))

  if (!perfiles.length) {
    return { permitido: false, motivo: 'sin_acceso_a_esta_app', filas, perfiles: [], appId: config.appId }
  }

  return { permitido: true, via, perfiles, filas, compartido: perfiles.length > 1 }
}

// Valida que un perfil elegido sea realmente uno de los que se le ofrecieron a ese asiento.
//
// Es el control que impide que alguien mande el id de ítem de OTRA persona en el pedido de
// selección y entre como ella. Nunca alcanza con confiar en lo que eligió el cliente: se
// vuelve a resolver la lista desde el tablero y se verifica que el elegido esté adentro.
export function elegirPerfil(entradas, { mondayUserId, email, itemId }) {
  const resultado = perfilesDe(entradas, { mondayUserId, email })
  if (!resultado.permitido) return resultado

  const elegido = resultado.perfiles.find((p) => p.itemId === String(itemId))
  if (!elegido) return { permitido: false, motivo: 'perfil_no_ofrecido', filas: resultado.filas, perfiles: [] }

  return { ...resultado, entrada: elegido, rolEtiqueta: elegido.rolEtiqueta }
}

// Revisa el tablero y devuelve los problemas que impedirían que alguien entre. Es lo que
// alimenta el diagnóstico de /api/auth/admin/usuarios y el script de pre-vuelo: sin esto,
// un "no me deja entrar" se investiga a ojo, fila por fila.
export function diagnosticar(entradas) {
  const problemas = []

  const porId = new Map()
  for (const e of entradas) {
    if (!e.mondayUserId) continue
    if (!porId.has(e.mondayUserId)) porId.set(e.mondayUserId, [])
    porId.get(e.mondayUserId).push(e)
  }

  // Varias filas con el mismo ID Usuario ya NO es un error: es un asiento de monday
  // compartido, y cada fila es un perfil con el que se puede entrar. Se informa igual,
  // porque conviene ver de un vistazo quiénes comparten asiento y qué rol tiene cada uno.
  for (const [id, filas] of porId) {
    if (filas.length < 2) continue
    const activas = filas.filter((f) => f.estado === 'activo')
    const inactivas = filas.filter((f) => f.estado === 'inactivo')

    if (inactivas.length) {
      problemas.push({
        gravedad: 'alta',
        tipo: 'asiento_bloqueado',
        mondayUserId: id,
        items: filas.map((f) => ({ itemId: f.itemId, nombre: f.nombre, estado: f.estado })),
        detalle:
          'Hay una fila en Inactivo en un asiento compartido. Inactivo bloquea el asiento ENTERO: ' +
          'los demás perfiles de ese ID Usuario tampoco van a poder entrar.',
      })
      continue
    }

    // Se cuentan los que realmente se van a ofrecer: activos Y con esta app.
    const ofrecidos = activas.filter(tieneAcceso)
    problemas.push({
      gravedad: 'info',
      tipo: 'asiento_compartido',
      mondayUserId: id,
      items: filas.map((f) => ({ itemId: f.itemId, nombre: f.nombre, estado: f.estado })),
      detalle:
        ofrecidos.length +
        ' perfil(es) para elegir al entrar a esta app. Una fila se ofrece solo si tiene ' +
        'Estado = Activo y "ID app" incluye ' +
        config.appId +
        '.',
    })
  }

  for (const e of entradas) {
    if (!e.mondayUserId && !e.email && e.estado === 'activo') {
      problemas.push({
        gravedad: 'alta',
        tipo: 'sin_forma_de_identificar',
        items: [{ itemId: e.itemId, nombre: e.nombre, estado: e.estado }],
        detalle: 'Está en Activo pero no tiene ni ID Usuario ni Correo electrónico: no puede entrar nunca.',
      })
    }
    if (e.estado === 'sin_estado' && (e.mondayUserId || e.email)) {
      problemas.push({
        gravedad: 'baja',
        tipo: 'sin_estado',
        items: [{ itemId: e.itemId, nombre: e.nombre, estado: e.estado }],
        detalle: 'Sin "Estado Usuario". Vacío no habilita: hay que ponerle Activo para que entre.',
      })
    }
    // Activo pero sin esta app: la persona está habilitada en el tablero y no puede entrar
    // acá. Es un estado legítimo cuando hay varias apps, pero es también la causa más
    // probable de un "a mí no me deja y a mi compañero sí", así que se informa.
    if (e.estado === 'activo' && (e.mondayUserId || e.email) && !tieneAcceso(e)) {
      problemas.push({
        gravedad: 'media',
        tipo: 'sin_esta_app',
        items: [{ itemId: e.itemId, nombre: e.nombre, estado: e.estado }],
        detalle:
          'Está Activo pero "ID app" no incluye ' +
          config.appId +
          (e.apps.length ? ' (tiene: ' + e.apps.join(', ') + ')' : ' (la celda está vacía)') +
          '. No va a poder entrar a esta aplicación.',
      })
    }
  }

  // El que más duele descubrir tarde: sin ningún Admin, nadie puede resetear el segundo
  // factor de una persona que perdió el celular.
  //
  // Se mide sobre los perfiles que realmente se van a poder elegir, no sobre las etiquetas
  // sueltas: una fila que dice Admin pero está sin Estado, o que cuelga de un asiento
  // bloqueado por otra fila en Inactivo, no habilita a nadie.
  const claves = new Set()
  for (const e of entradas) {
    if (e.mondayUserId) claves.add('id:' + e.mondayUserId)
    else if (e.email) claves.add('mail:' + e.email)
  }
  const hayAdmin = [...claves].some((clave) => {
    const corte = clave.indexOf(':')
    const [tipo, valor] = [clave.slice(0, corte), clave.slice(corte + 1)]
    const r = perfilesDe(entradas, tipo === 'id' ? { mondayUserId: valor } : { email: valor })
    return r.permitido && r.perfiles.some((p) => p.rolEtiqueta.trim().toLowerCase() === 'admin')
  })
  if (!hayAdmin) {
    problemas.push({
      gravedad: 'alta',
      tipo: 'sin_admin',
      items: [],
      detalle:
        'Ninguna fila activa tiene Rol = Admin. Nadie va a poder resetear el segundo factor de quien pierda el celular.',
    })
  }

  return problemas
}
