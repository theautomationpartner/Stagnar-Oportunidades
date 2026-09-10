// Lectura y validación de la configuración. Un solo lugar que sepa qué variables
// existen, para que ningún endpoint tenga que acordarse de un process.env suelto.
//
// El prefijo "_" de la carpeta api/_auth/ no es cosmético: Vercel NO rutea archivos ni
// carpetas que empiecen con "_", así que nada de acá adentro queda expuesto como
// endpoint aunque tenga un export default. Solo se importa.

// Modo de aplicación. Es la perilla que decide si esto protege o solo observa:
//   'off'    — el guardián no hace nada (comportamiento actual de la app).
//   'shadow' — evalúa TODO y lo registra en auditoría, pero deja pasar igual. Sirve para
//              desplegar, mirar unos días quién habría quedado afuera y recién ahí
//              encender. Es el paso que evita dejar al cliente sin app un lunes.
//   'on'     — se aplica. Fallar significa 401/403.
//
// El default es deliberado y vale la pena entenderlo: si NO hay DATABASE_URL, el modo es
// 'off' (la app todavía no tiene dónde guardar nada, encenderla la rompería entera). Si
// SÍ hay DATABASE_URL, el default es 'on' — porque una base configurada significa que
// alguien ya hizo el trabajo de puesta en marcha, y a partir de ahí lo seguro es fallar
// cerrado. Nunca se queda a mitad de camino por olvidarse una variable.
export function modoAuth() {
  const explicito = process.env.AUTH_ENFORCE?.trim().toLowerCase()
  if (explicito === 'off' || explicito === 'shadow' || explicito === 'on') return explicito
  return process.env.DATABASE_URL ? 'on' : 'off'
}

export const config = {
  // --- monday ---
  // El documento de investigación advierte que hay confusión recurrente sobre con cuál
  // de los dos secretos firma monday el sessionToken (es la causa #1 de "invalid
  // signature") y recomienda probar ambos y dejar documentado cuál funcionó. Acá se
  // resuelve solo: mondaySession.js prueba los dos y avisa por log cuál validó, así la
  // respuesta queda escrita en el log del primer ingreso real en vez de en una tarde de
  // prueba y error.
  mondaySigningSecret: process.env.MONDAY_SIGNING_SECRET || '',
  mondayClientSecret: process.env.MONDAY_CLIENT_SECRET || '',
  mondayAppId: process.env.MONDAY_APP_ID ? Number(process.env.MONDAY_APP_ID) : null,
  mondayApiKey: process.env.MONDAY_API_KEY || '',
  // IDs de cuenta de monday habilitadas, separados por coma. Vacío = no se filtra por
  // cuenta (la lista blanca de emails sigue filtrando igual).
  cuentasHabilitadas: (process.env.CUENTAS_HABILITADAS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),

  // --- sesión propia ---
  sessionSecret: process.env.AUTH_SESSION_SECRET || '',
  // Cuánto dura la sesión antes de tener que volver a pasar el segundo factor. 24 h cubre
  // una jornada entera sin volver a pedir nada.
  //
  // Alargarla no relaja los controles que importan: la lista blanca y el rol se releen del
  // tablero en CADA pedido, así que pasar a alguien a Inactivo lo saca dentro del minuto sin
  // importar cuánto le quede al token. Lo que sí crece es la ventana de un token robado —
  // por eso está el botón de cerrar sesión, que además olvida el dispositivo confiable.
  sessionTtlHoras: Number(process.env.AUTH_SESSION_TTL_HORAS || 24),
  // La ventana corta de la sesión "a medio autenticar" (identidad verificada pero 2FA
  // todavía no): solo alcanza para llamar a los endpoints de MFA, y caduca rápido para
  // que nadie deje una pestaña abierta a mitad del login.
  preAuthTtlMinutos: Number(process.env.AUTH_PREAUTH_TTL_MINUTOS || 10),
  deviceTtlDias: Number(process.env.AUTH_DEVICE_TTL_DIAS || 30),

  // --- cifrado ---
  // 32 bytes en hexadecimal (64 caracteres). Generar con:
  //   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  // --- base ---
  databaseUrl: process.env.DATABASE_URL || '',

  // --- rate limit ---
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL || '',
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',

  // --- proveedor "contraseña" (2.1 del documento: acceso fuera de monday) ---
  // Apagado por defecto a propósito: mientras la app viva dentro del iframe de monday,
  // habilitar un login por contraseña solo agrega superficie de ataque sin agregar nada.
  // Se enciende el día que exista un acceso directo real.
  passwordLogin: process.env.AUTH_PASSWORD_LOGIN === 'on',
  // El registro autoservicio está apagado y conviene que siga así: la lista blanca es la
  // que define quién entra, y un registro abierto la contradice. Ver api/auth/registro.js.
  registroAbierto: process.env.AUTH_REGISTRO_ABIERTO === 'on',

  // Nombre que ve el usuario en Google Authenticator al escanear el QR.
  emisorTotp: process.env.AUTH_TOTP_EMISOR || 'Stagnari',

  // Cuál app es esta, para la columna "ID app" del tablero.
  //
  // 18424652719 es el board de tipo custom_object llamado "Oportunidades" — el objeto de
  // la Vibe App en monday. Ojo con no confundirlo con VITE_MONDAY_BOARD_ID (18420863013),
  // que es el tablero de DATOS de oportunidades: son dos cosas distintas con el mismo
  // nombre.
  //
  // Es lo que hace que una sola lista blanca sirva para varias apps: cada fila lista a qué
  // apps entra esa persona, y cada app filtra por la suya. Cuando se sume una app nueva,
  // se agrega su id como etiqueta en la columna y se marca a quien corresponda; en el
  // código de esa app, esta variable.
  appId: process.env.AUTH_APP_ID || '18424652719',

  // --- lista blanca en un tablero de monday ---
  // Tablero "Usuario Habilitados - Lista Blanca". Es la fuente de verdad de QUIÉN entra y
  // con qué rol: el cliente lo administra con la herramienta que ya usa, sin depender de
  // un despliegue ni de que un desarrollador esté disponible. La base de datos guarda
  // solo lo que el tablero no puede guardar (secretos TOTP, códigos de recuperación,
  // dispositivos confiables, auditoría) más un espejo de estas filas.
  //
  // Riesgo que hay que tener presente y mitigar fuera del código: quien pueda editar ese
  // tablero puede darse acceso a sí mismo. Tiene que ser un tablero privado, visible solo
  // para administradores.
  listaBlancaBoardId: process.env.AUTH_LISTA_BLANCA_BOARD_ID || '18409461390',
  columnas: {
    // "ID Usuario" — el user_id de monday. Es la clave PRIMARIA de la lista y no el email,
    // por dos razones: el sessionToken ya trae el user_id (así el ingreso no necesita
    // ninguna consulta extra a la API de monday), y hoy 10 de las 11 filas del tablero no
    // tienen email cargado, con lo cual una lista por email dejaría afuera a casi todos.
    mondayUserId: process.env.AUTH_COL_ID_USUARIO || 'text_mm6sdhy6',
    // "Correo electrónico" — respaldo para una fila cargada sin ID Usuario.
    email: process.env.AUTH_COL_EMAIL || 'email_mm6s3dc5',
    // "Rol" — etiquetas reales del tablero: "Admin" y "Resto del equipo".
    rol: process.env.AUTH_COL_ROL || 'color_mm72cf90',
    // "Team" — etiquetas: "Administracion", "Vehiculos". No restringe nada, ver permisos.js.
    team: process.env.AUTH_COL_TEAM || 'dropdown_mm72rsy7',
    // "Estado Usuario" — etiquetas reales: "Activo" e "Inactivo".
    estado: process.env.AUTH_COL_ESTADO || 'color_mm6sf2bt',
    // "ID app" — a qué apps entra esa persona. Multi-selección: una fila puede listar
    // varias, y cada app se queda con las filas que incluyan la suya.
    idApp: process.env.AUTH_COL_ID_APP || 'dropdown_mm72afcm',
  },

  // Cuánto vale la copia del tablero antes de volver a pedirlo.
  //
  // La regla del documento es que la lista se consulte en CADA pedido, para que una baja
  // tenga efecto en el acto. Consultar la API de monday en cada pedido no es viable
  // (cuota y latencia en cada click), así que "en el acto" se implementa como "dentro de
  // este minuto": la copia vive en Postgres, se comparte entre todas las invocaciones y se
  // refresca al vencer. La comparación honesta no es contra cero segundos, es contra las
  // 24 horas que tardaría en caducar un token si el estado viviera dentro del JWT.
  listaBlancaTtlSegundos: Number(process.env.AUTH_LISTA_BLANCA_TTL || 60),
}

// Se llama al arrancar cualquier endpoint protegido. Prefiere explotar con un mensaje
// claro antes que "funcionar" con seguridad a medias — una app que arranca sin
// ENCRYPTION_KEY guardaría los secretos TOTP de forma inútil y nadie se enteraría.
export function validarConfig({ requiereMonday = true } = {}) {
  const faltan = []
  if (!config.databaseUrl) faltan.push('DATABASE_URL')
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    faltan.push('AUTH_SESSION_SECRET (mínimo 32 caracteres)')
  }
  if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey)) {
    faltan.push('ENCRYPTION_KEY (64 caracteres hexadecimales = 32 bytes)')
  }
  if (requiereMonday && !config.mondaySigningSecret && !config.mondayClientSecret) {
    faltan.push('MONDAY_SIGNING_SECRET o MONDAY_CLIENT_SECRET')
  }
  if (faltan.length) {
    throw new Error('Configuración de autenticación incompleta. Falta: ' + faltan.join(', '))
  }
}
