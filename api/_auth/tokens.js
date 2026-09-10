// La sesión propia de la app: un JWT firmado por nosotros, distinto del sessionToken que
// firma monday.
//
// Por qué existe una sesión propia si monday ya nos da un token firmado:
//
//   1. El token de monday dice "esta persona abrió la app dentro de monday". No dice
//      nada del segundo factor. El claim `mfa` de acá abajo es lo que hace que el 2FA se
//      pueda exigir sin ir a la base en cada pedido.
//   2. El token de monday dura poco y solo existe dentro del iframe. El proveedor
//      "contraseña" (acceso fuera de monday) no tiene ninguno.
//   3. Un solo formato de sesión para los dos proveedores significa un solo guardián.
//
// Librería: jose. Sirve tanto en el runtime Node de las funciones como en el Edge del
// middleware, no arrastra dependencias nativas y no tiene el historial de algoritmo
// confundible de jsonwebtoken. El documento de investigación usa jsonwebtoken; se cambia
// a jose justamente para que el middleware del Edge pueda verificar con el mismo código.
import { SignJWT, jwtVerify } from 'jose'
import { config } from './env.js'
import { NoAutorizado } from './errors.js'

// Fijar emisor y audiencia no es ceremonia: es lo que impide que un token emitido para
// otra cosa (otra app del mismo grupo, o el propio token de monday) se acepte acá por
// tener la misma firma. La verificación exige los dos.
const EMISOR = 'stagnari-auth'
const AUDIENCIA_SESION = 'sesion'
const AUDIENCIA_PREAUTH = 'preauth'
// Un tercer estado, para el asiento de monday compartido: la firma de monday ya se
// verificó, pero todavía no se eligió con qué perfil entrar. Sirve exclusivamente para
// llamar a /api/auth/perfil. Audiencia propia para que no pueda colarse ni como preauth ni
// como sesión: la verificación de audiencia lo rechaza antes de mirar ningún claim.
const AUDIENCIA_SELECCION = 'seleccion'

function claveFirma() {
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    throw new Error('AUTH_SESSION_SECRET no está configurada o es demasiado corta')
  }
  return new TextEncoder().encode(config.sessionSecret)
}

// Sesión completa: identidad verificada Y segundo factor superado. Es la única que sirve
// para pedir datos.
export async function emitirSesion(usuario, { origen, mondayUserId, mondayAccountId }) {
  // El token lleva el rol solo como dato informativo para los logs. NO se usa para
  // decidir: el guardián vuelve a leer el rol y los permisos del tablero en cada pedido
  // (ver whitelist.revalidar). Si la decisión saliera de acá, pasar a alguien a Inactivo o
  // sacarle el Admin no tendría efecto hasta que venciera su sesión, un día después.
  return new SignJWT({
    ema: usuario.email,
    rol: usuario.rol,
    mid: mondayUserId ?? usuario.monday_user_id ?? null,
    acc: mondayAccountId ?? usuario.monday_account_id ?? null,
    mfa: true,
    src: origen, // 'monday' | 'password'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(usuario.id))
    .setIssuer(EMISOR)
    .setAudience(AUDIENCIA_SESION)
    .setIssuedAt()
    .setExpirationTime(config.sessionTtlHoras + 'h')
    .sign(claveFirma())
}

// Sesión a medio hacer: sabemos quién es y está en la lista blanca, pero todavía no pasó
// el 2FA. Audiencia distinta a propósito — así un preauth nunca puede colarse como sesión
// completa por un `if` mal escrito en algún endpoint futuro: la verificación de audiencia
// lo rechaza antes de mirar ningún claim.
export async function emitirPreAuth(usuario, { origen, mondayUserId, mondayAccountId }) {
  return new SignJWT({
    ema: usuario.email,
    mid: mondayUserId ?? usuario.monday_user_id ?? null,
    acc: mondayAccountId ?? usuario.monday_account_id ?? null,
    mfa: false,
    src: origen,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(usuario.id))
    .setIssuer(EMISOR)
    .setAudience(AUDIENCIA_PREAUTH)
    .setIssuedAt()
    .setExpirationTime(config.preAuthTtlMinutos + 'm')
    .sign(claveFirma())
}

async function verificar(token, audiencia) {
  if (!token) throw new NoAutorizado('sin_token')
  try {
    const { payload } = await jwtVerify(token, claveFirma(), {
      issuer: EMISOR,
      audience: audiencia,
      // Lista blanca de algoritmos. Sin esto, un token con alg:"none" o firmado con un
      // algoritmo distinto podría llegar a evaluarse — es la familia de agujeros clásica
      // de JWT, y se cierra con una línea.
      algorithms: ['HS256'],
      clockTolerance: 5,
    })
    return payload
  } catch (err) {
    throw new NoAutorizado('token_invalido', { causa: err.code ?? err.message })
  }
}

export function verificarSesion(token) {
  return verificar(token, AUDIENCIA_SESION)
}

export function verificarPreAuth(token) {
  return verificar(token, AUDIENCIA_PREAUTH)
}

// Token de selección de perfil. No lleva `sub`: todavía no hay un perfil elegido, así que
// no hay ningún usuario local al que apuntar. Solo lleva el asiento de monday ya
// verificado, y /api/auth/perfil vuelve a resolver la lista de perfiles desde el tablero
// para comprobar que el elegido esté entre los ofrecidos.
export async function emitirSeleccion({ mondayUserId, mondayAccountId }) {
  return new SignJWT({ mid: mondayUserId, acc: mondayAccountId, src: 'monday' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(EMISOR)
    .setAudience(AUDIENCIA_SELECCION)
    .setIssuedAt()
    .setExpirationTime(config.preAuthTtlMinutos + 'm')
    .sign(claveFirma())
}

export function verificarSeleccion(token) {
  return verificar(token, AUDIENCIA_SELECCION)
}

// La otra mitad de la revocación sin estado (ver db.invalidarSesiones): un token emitido
// antes de que se moviera la marca de agua del usuario está muerto aunque su firma sea
// válida y no haya expirado. Sin esto, "cerrar todas las sesiones" y el cambio de
// contraseña serían botones decorativos hasta que venciera el último JWT.
export function sesionEsPosteriorA(payload, sesionesValidasDesde) {
  if (!sesionesValidasDesde) return true
  const emitidoEn = Number(payload.iat) * 1000
  // Un segundo de margen: iat viene truncado a segundos y sesiones_validas_desde tiene
  // milisegundos, así que un login legítimo inmediatamente posterior a la invalidación
  // se rechazaría a sí mismo por redondeo.
  return emitidoEn + 1000 >= new Date(sesionesValidasDesde).getTime()
}
