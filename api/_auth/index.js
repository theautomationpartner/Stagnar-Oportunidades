// Punto de entrada único de la librería de autenticación.
//
// Esta carpeta está escrita para salir de acá tal cual: el documento de investigación
// propone extraer guardián, lista blanca, TOTP y auditoría a un paquete compartido
// (@bdb/monday-auth) para que las tres apps del grupo lo importen en una línea, y para que
// una corrección de seguridad se haga en un lugar en vez de en tres copias que en seis
// meses van a haber divergido.
//
// Lo único que hay que hacer el día que se extraiga: mover api/_auth/ a su propio
// repositorio, agregarle un package.json con "exports", y cambiar en cada app los
// import './_auth/...' por import '@bdb/monday-auth'. Por eso ningún archivo de acá
// adentro importa nada de la app: la dependencia va en un solo sentido.

export { config, modoAuth, validarConfig } from './env.js'
export {
  NoAutorizado,
  MfaRequerido,
  DemasiadosIntentos,
  ErrorDeFlujo,
  responderError,
  MENSAJE_GENERICO,
} from './errors.js'
export { protegerEndpoint, autenticar } from './guard.js'
export { verificarSessionToken, obtenerEmailDeMonday } from './mondaySession.js'
export { perfilesDisponibles, activarPerfil, resolverDesdeEmail, revalidar } from './whitelist.js'
export { PERMISOS, ROLES, ROL_BASE, permisosDe, puede, rolDesdeEtiqueta } from './permisos.js'
export { obtenerEntradas, perfilesDe, elegirPerfil, diagnosticar } from './boardWhitelist.js'
export { analizar as analizarGraphQL, cuerpoEsEscritura } from './graphql.js'
export { emitirSesion, emitirPreAuth, verificarSesion, verificarPreAuth } from './tokens.js'
export * as db from './db.js'
export * as audit from './audit.js'
export * as rateLimit from './rateLimit.js'
export * as totp from './totp.js'
export * as recoveryCodes from './recoveryCodes.js'
export * as password from './password.js'
export * as transport from './transport.js'
