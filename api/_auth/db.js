// Acceso a datos. Todas las consultas SQL de la autenticación viven acá y en ningún
// otro archivo: un endpoint que arma su propio SQL es un endpoint que mañana se olvida
// de filtrar por estado.
//
// Driver: @neondatabase/serverless. Habla por HTTP en vez de por el protocolo binario de
// Postgres, que es exactamente lo que hace falta en Vercel — una función serverless vive
// milisegundos y muere, así que abrir y cerrar conexiones TCP a Postgres en cada
// invocación agota el pool de la base en cuanto hay concurrencia. Sirve igual contra
// Supabase o cualquier Postgres si se usa su pooler; la única condición es HTTP.
import { neon } from '@neondatabase/serverless'
import { config } from './env.js'

let _sql = null

// Perezoso a propósito: importar este módulo no debe explotar por falta de DATABASE_URL
// (los endpoints en modo apagado lo importan igual). Explota recién cuando alguien
// consulta de verdad.
function sql(...args) {
  if (!_sql) {
    if (!config.databaseUrl) throw new Error('DATABASE_URL no está configurada')
    _sql = neon(config.databaseUrl)
  }
  return _sql(...args)
}

const ahora = () => new Date()

// --- usuarios / lista blanca -------------------------------------------------

// El perfil es la fila del tablero, así que se busca por monday_item_id.
export async function buscarUsuarioPorItemId(mondayItemId) {
  const filas = await sql`
    SELECT * FROM usuarios_autorizados WHERE monday_item_id = ${mondayItemId} LIMIT 1
  `
  return filas[0] ?? null
}

// Todos los perfiles locales de un asiento de monday. Se usa para el atajo del dispositivo
// confiable: saber si el navegador que llega ya pasó el 2FA de alguno de estos perfiles.
export async function buscarUsuariosPorMondayId(mondayUserId) {
  return sql`
    SELECT * FROM usuarios_autorizados WHERE monday_user_id = ${mondayUserId} ORDER BY monday_item_id
  `
}

// El email se compara siempre en minúsculas. Puede haber varias filas con el mismo correo
// (los perfiles de un asiento compartido resuelven todos al mismo), así que se ordena por
// monday_item_id para que la elección sea estable. Solo lo usa el proveedor "contraseña",
// que está apagado.
export async function buscarUsuarioPorEmail(email) {
  const filas = await sql`
    SELECT * FROM usuarios_autorizados
     WHERE lower(email) = lower(${email})
     ORDER BY monday_item_id
     LIMIT 1
  `
  return filas[0] ?? null
}

export async function buscarUsuarioPorId(id) {
  const filas = await sql`SELECT * FROM usuarios_autorizados WHERE id = ${id} LIMIT 1`
  return filas[0] ?? null
}

// La vinculación del user_id de monday a la fila que el administrador cargó por email.
// Pasa una sola vez por persona, en su primer ingreso.
export async function vincularMondayUserId(usuarioId, mondayUserId, mondayAccountId) {
  await sql`
    UPDATE usuarios_autorizados
       SET monday_user_id = ${mondayUserId},
           monday_account_id = ${mondayAccountId},
           actualizado_en = ${ahora()}
     WHERE id = ${usuarioId}
  `
}

export async function marcarUltimoAcceso(usuarioId) {
  await sql`UPDATE usuarios_autorizados SET ultimo_acceso = ${ahora()} WHERE id = ${usuarioId}`
}

// --- copia del tablero de la lista blanca ---------------------------------------

export async function leerListaBlancaCache() {
  const filas = await sql`SELECT entradas, actualizado_en FROM lista_blanca_cache WHERE id = 1`
  return filas[0] ?? null
}

export async function guardarListaBlancaCache(entradas) {
  await sql`
    INSERT INTO lista_blanca_cache (id, entradas, actualizado_en)
    VALUES (1, ${JSON.stringify(entradas)}, now())
    ON CONFLICT (id) DO UPDATE
      SET entradas = EXCLUDED.entradas, actualizado_en = EXCLUDED.actualizado_en
  `
}

// --- espejo del tablero -----------------------------------------------------------

// Sincroniza la fila local con lo que dice el tablero, y devuelve la fila local.
//
// El tablero decide quién entra; esta tabla solo existe para poder colgar de ella el
// enrolamiento de 2FA, los dispositivos y la auditoría con una clave estable.
//
// El conflicto se resuelve por monday_item_id —la FILA del tablero— y no por
// monday_user_id. Es lo que permite que los cuatro perfiles del asiento compartido tengan
// cada uno su propio enrolamiento. Tampoco por email: hay filas cuyo email y cuyo ID
// Usuario se contradicen, y hacer el upsert por email haría que una persona cambiara de
// fila local (y perdiera su 2FA) el día que alguien corrigiera ese correo.
//
// El precio de usar el id del ítem: si alguien borra la fila en monday y la vuelve a
// crear, es un perfil nuevo y esa persona tiene que enrolar el 2FA otra vez. Es el
// comportamiento correcto —una fila nueva es una autorización nueva— pero conviene saberlo
// antes de "limpiar" el tablero borrando y recreando ítems.
export async function sincronizarDesdeTablero({
  mondayUserId,
  mondayAccountId,
  mondayItemId,
  email,
  rol,
  team,
}) {
  const filas = await sql`
    INSERT INTO usuarios_autorizados
      (email, monday_user_id, monday_account_id, monday_item_id, rol, estado, team)
    VALUES (lower(${email}), ${mondayUserId}, ${mondayAccountId}, ${mondayItemId},
            ${rol}, 'activo', ${team})
    ON CONFLICT (monday_item_id) DO UPDATE
      SET email = EXCLUDED.email,
          monday_user_id = EXCLUDED.monday_user_id,
          monday_account_id = COALESCE(EXCLUDED.monday_account_id, usuarios_autorizados.monday_account_id),
          rol = EXCLUDED.rol,
          estado = 'activo',
          team = EXCLUDED.team,
          actualizado_en = now()
    RETURNING *
  `
  return filas[0]
}

// ¿Cuáles de estos perfiles ya tienen el segundo factor configurado? Una sola consulta
// para toda la lista: el selector la usa para poder decir "primera vez" en los perfiles sin
// enrolar, en vez de que la persona lo descubra recién al elegir.
export async function estadoMfaPorItemIds(itemIds) {
  if (!itemIds?.length) return new Map()
  const filas = await sql`
    SELECT u.monday_item_id, u.id AS usuario_id, (m.confirmado_en IS NOT NULL) AS mfa_configurado
      FROM usuarios_autorizados u
      LEFT JOIN mfa_usuarios m ON m.usuario_id = u.id
     WHERE u.monday_item_id = ANY(${itemIds.map(Number)})
  `
  return new Map(
    filas.map((f) => [
      String(f.monday_item_id),
      { usuarioId: f.usuario_id, mfaConfigurado: Boolean(f.mfa_configurado) },
    ])
  )
}

// --- diagnóstico ------------------------------------------------------------------

export async function listarUsuarios() {
  return sql`
    SELECT u.id, u.email, u.monday_user_id, u.monday_item_id, u.rol, u.estado, u.team,
           u.creado_en, u.ultimo_acceso,
           (m.confirmado_en IS NOT NULL) AS mfa_configurado
      FROM usuarios_autorizados u
      LEFT JOIN mfa_usuarios m ON m.usuario_id = u.id
     ORDER BY lower(u.email)
  `
}

// Para el caso real: "perdí el celular y me quedé sin códigos de recuperación". Borra el
// enrolamiento para que la persona vuelva a escanear un QR nuevo en su próximo ingreso.
export async function resetearMfa(id) {
  await borrarMfa(id)
  await olvidarTodosLosDispositivos(id)
  await invalidarSesiones(id)
}

// --- caché de emails de monday ----------------------------------------------

export async function leerEmailCacheado(mondayUserId, maxEdadHoras = 24) {
  const filas = await sql`
    SELECT email, nombre, habilitado FROM monday_usuarios_cache
     WHERE monday_user_id = ${mondayUserId}
       AND actualizado_en > now() - make_interval(hours => ${maxEdadHoras})
     LIMIT 1
  `
  return filas[0] ?? null
}

export async function guardarEmailCacheado(mondayUserId, { email, nombre, habilitado }) {
  await sql`
    INSERT INTO monday_usuarios_cache (monday_user_id, email, nombre, habilitado, actualizado_en)
    VALUES (${mondayUserId}, ${email}, ${nombre ?? null}, ${habilitado ?? true}, ${ahora()})
    ON CONFLICT (monday_user_id) DO UPDATE
      SET email = EXCLUDED.email,
          nombre = EXCLUDED.nombre,
          habilitado = EXCLUDED.habilitado,
          actualizado_en = EXCLUDED.actualizado_en
  `
}

// --- MFA ---------------------------------------------------------------------

export async function obtenerMfa(usuarioId) {
  const filas = await sql`SELECT * FROM mfa_usuarios WHERE usuario_id = ${usuarioId} LIMIT 1`
  return filas[0] ?? null
}

// Guarda el secreto TOTP SIN confirmar. Es la pieza que el pedido llama "estado
// pendiente": en una función serverless no hay memoria entre la pantalla del QR y el
// primer código que escribe el usuario, así que el secreto tiene que estar persistido en
// el medio. Y tiene que estar sin confirmar, porque un secreto guardado como válido
// antes de que el usuario demuestre que lo escaneó deja a la persona afuera de su propia
// cuenta si cerró la pestaña sin terminar.
//
// Deja UN secreto pendiente y devuelve el que quedó vigente — que puede ser el que se
// acaba de proponer o uno que ya estaba.
//
// La idempotencia acá no es un lujo, es lo que hace que el enrolamiento funcione. Si cada
// llamada generara un secreto nuevo, dos llamadas casi simultáneas dejarían al usuario
// mirando el QR de una y al servidor esperando el código de la otra, y el código "no
// andaría" sin ninguna explicación visible. Y eso pasa de rutina: React en modo estricto
// ejecuta los efectos dos veces en desarrollo, y recargar la página también rehace el pedido.
//
// DO NOTHING + SELECT (en vez de DO UPDATE) es lo que lo garantiza incluso con dos pedidos
// en paralelo: gane quien gane el INSERT, las dos llamadas leen después la MISMA fila y
// devuelven el mismo secreto.
//
// Un secreto ya confirmado nunca se pisa: se devuelve la fila tal cual y quien llama decide
// (setup.js responde 409). Es lo que impide que alguien con una sesión a medio autenticar
// resetee el 2FA ya configurado de otra persona.
export async function asegurarSecretoPendiente(usuarioId, secretoCifradoPropuesto) {
  await sql`
    INSERT INTO mfa_usuarios (usuario_id, secreto_cifrado, confirmado_en)
    VALUES (${usuarioId}, ${secretoCifradoPropuesto}, NULL)
    ON CONFLICT (usuario_id) DO NOTHING
  `
  const filas = await sql`SELECT * FROM mfa_usuarios WHERE usuario_id = ${usuarioId} LIMIT 1`
  return filas[0] ?? null
}

// Descarta un enrolamiento a medio hacer, para poder empezar de nuevo con un QR distinto —
// el caso de quien lo escaneó en el teléfono equivocado. Solo toca lo NO confirmado.
export async function borrarPendiente(usuarioId) {
  const filas = await sql`
    DELETE FROM mfa_usuarios WHERE usuario_id = ${usuarioId} AND confirmado_en IS NULL
    RETURNING usuario_id
  `
  return filas.length > 0
}

export async function confirmarMfa(usuarioId, periodo) {
  const filas = await sql`
    UPDATE mfa_usuarios
       SET confirmado_en = ${ahora()}, ultimo_periodo = ${periodo}
     WHERE usuario_id = ${usuarioId} AND confirmado_en IS NULL
    RETURNING usuario_id
  `
  return filas.length > 0
}

// Anti-reutilización de código TOTP. La condición "ultimo_periodo IS NULL OR <" dentro
// del propio UPDATE es lo que lo hace seguro con concurrencia: si llegan dos pedidos con
// el mismo código a la vez (dos pestañas, o alguien repitiendo un código que interceptó),
// Postgres serializa los dos UPDATE sobre la misma fila y el segundo afecta 0 filas.
// Chequear primero y escribir después, en dos pasos desde el código, dejaría pasar los dos.
export async function consumirPeriodoTotp(usuarioId, periodo) {
  const filas = await sql`
    UPDATE mfa_usuarios
       SET ultimo_periodo = ${periodo}
     WHERE usuario_id = ${usuarioId}
       AND confirmado_en IS NOT NULL
       AND (ultimo_periodo IS NULL OR ultimo_periodo < ${periodo})
    RETURNING usuario_id
  `
  return filas.length > 0
}

export async function borrarMfa(usuarioId) {
  await sql`DELETE FROM mfa_usuarios WHERE usuario_id = ${usuarioId}`
  await sql`DELETE FROM mfa_codigos_recuperacion WHERE usuario_id = ${usuarioId}`
}

// Borra SOLO el secreto TOTP y deja vivos los códigos de recuperación que queden.
//
// Es lo que hace falta al entrar con un código de recuperación: el motivo casi siempre es
// "perdí el teléfono", y entonces el secreto que vive en ese teléfono está en manos de otro
// y tiene que morir en el acto.
//
// Pero borrar también los códigos —como hace borrarMfa— dejaría a esa persona sin secreto
// Y sin códigos: si en ese momento no tiene con qué escanear un QR nuevo, queda afuera del
// todo. Los códigos restantes son justamente la red que le permite volver a entrar mientras
// consigue un dispositivo. Se reemplazan solos al confirmar el enrolamiento nuevo (ver
// reemplazarCodigosRecuperacion).
export async function borrarSecretoConservandoCodigos(usuarioId) {
  await sql`DELETE FROM mfa_usuarios WHERE usuario_id = ${usuarioId}`
}

// --- códigos de recuperación --------------------------------------------------

export async function reemplazarCodigosRecuperacion(usuarioId, hashes) {
  await sql`DELETE FROM mfa_codigos_recuperacion WHERE usuario_id = ${usuarioId}`
  for (const hash of hashes) {
    await sql`
      INSERT INTO mfa_codigos_recuperacion (usuario_id, hash_codigo) VALUES (${usuarioId}, ${hash})
    `
  }
}

// De un solo uso, garantizado por la base y no por el código: el UPDATE con WHERE
// usado_en IS NULL y RETURNING es atómico, así que si el mismo código se manda dos veces
// en paralelo, solo una de las dos llamadas se lleva la fila.
export async function consumirCodigoRecuperacion(usuarioId, hash) {
  const filas = await sql`
    UPDATE mfa_codigos_recuperacion
       SET usado_en = ${ahora()}
     WHERE usuario_id = ${usuarioId} AND hash_codigo = ${hash} AND usado_en IS NULL
    RETURNING id
  `
  return filas.length > 0
}

export async function contarCodigosRecuperacionSinUsar(usuarioId) {
  const filas = await sql`
    SELECT count(*)::int AS total FROM mfa_codigos_recuperacion
     WHERE usuario_id = ${usuarioId} AND usado_en IS NULL
  `
  return filas[0]?.total ?? 0
}

// --- dispositivos confiables ---------------------------------------------------

export async function guardarDispositivoConfiable({ usuarioId, hashToken, expiraEn, userAgent, ip }) {
  await sql`
    INSERT INTO dispositivos_confiables (usuario_id, hash_token, expira_en, user_agent, ip)
    VALUES (${usuarioId}, ${hashToken}, ${expiraEn}, ${userAgent ?? null}, ${ip ?? null})
  `
}

// Devuelve true y de paso deja registrado el uso, en una sola ida a la base. Que el
// filtro por expira_en viva en el SQL y no en JavaScript importa: un dispositivo vencido
// nunca llega a materializarse como "válido" en memoria.
export async function dispositivoConfiableVigente(usuarioId, hashToken) {
  if (!hashToken) return false
  const filas = await sql`
    UPDATE dispositivos_confiables
       SET ultimo_uso = ${ahora()}
     WHERE usuario_id = ${usuarioId} AND hash_token = ${hashToken} AND expira_en > now()
    RETURNING id
  `
  return filas.length > 0
}

// ¿De qué perfil es este dispositivo confiable? Se usa en el asiento compartido: si el
// navegador ya pasó el 2FA de uno de los perfiles y sigue vigente, se entra directo con
// ese en vez de volver a mostrar el selector. Devuelve el usuario_id o null.
export async function perfilDeDispositivo(hashToken) {
  if (!hashToken) return null
  const filas = await sql`
    SELECT usuario_id FROM dispositivos_confiables
     WHERE hash_token = ${hashToken} AND expira_en > now()
     LIMIT 1
  `
  return filas[0]?.usuario_id ?? null
}

export async function olvidarDispositivo(hashToken) {
  if (!hashToken) return
  await sql`DELETE FROM dispositivos_confiables WHERE hash_token = ${hashToken}`
}

export async function olvidarTodosLosDispositivos(usuarioId) {
  await sql`DELETE FROM dispositivos_confiables WHERE usuario_id = ${usuarioId}`
}

// Higiene: las filas vencidas no sirven para nada y la tabla crece sola. Se llama desde
// el ingreso con probabilidad baja (ver session.js), para no necesitar un cron aparte.
export async function limpiarVencidos() {
  await sql`DELETE FROM dispositivos_confiables WHERE expira_en < now() - INTERVAL '7 days'`
  await sql`DELETE FROM intentos_rate_limit WHERE creado_en < now() - INTERVAL '1 day'`
}

// --- revocación de sesiones sin estado -----------------------------------------

// Corta TODAS las sesiones vivas de una persona sin mantener una lista de JWTs emitidos:
// mueve la marca de agua, y tokens.js rechaza después cualquier token cuyo iat sea
// anterior. Es lo que hace que "cerrar sesión en todos lados" y el cambio de contraseña
// funcionen de verdad en un esquema sin estado.
export async function invalidarSesiones(usuarioId) {
  await sql`
    UPDATE usuarios_autorizados SET sesiones_validas_desde = ${ahora()} WHERE id = ${usuarioId}
  `
}

// --- rate limit de respaldo (cuando no hay Upstash) -----------------------------

export async function contarIntentos(clave, ventanaSegundos) {
  const filas = await sql`
    SELECT count(*)::int AS total FROM intentos_rate_limit
     WHERE clave = ${clave}
       AND creado_en > now() - make_interval(secs => ${ventanaSegundos})
  `
  return filas[0]?.total ?? 0
}

export async function registrarIntento(clave) {
  await sql`INSERT INTO intentos_rate_limit (clave) VALUES (${clave})`
}

export async function limpiarIntentos(clave) {
  await sql`DELETE FROM intentos_rate_limit WHERE clave = ${clave}`
}

// --- auditoría ------------------------------------------------------------------

export async function auditar({ usuarioId, email, mondayUserId, accion, ip, userAgent, detalle }) {
  await sql`
    INSERT INTO auditoria (usuario_id, email, monday_user_id, accion, ip, user_agent, detalle)
    VALUES (${usuarioId ?? null}, ${email ?? null}, ${mondayUserId ?? null}, ${accion},
            ${ip ?? null}, ${userAgent ?? null}, ${detalle ? JSON.stringify(detalle) : null})
  `
}

export { sql }
