// Auditoría. Todo intento, exitoso o fallido, deja una fila con fecha, email e IP — es lo
// que permite detectar a alguien tanteando, y lo que responde "¿quién entró y cuándo?" el
// día que alguien lo pregunte en serio.
//
// La propiedad que define este archivo: auditar NUNCA puede romper una autenticación. Si
// la base de auditoría está caída, el usuario legítimo tiene que poder entrar igual y el
// ilegítimo tiene que seguir quedando afuera. Por eso todo va envuelto en try/catch y el
// fallo se degrada a un console.error — que en Vercel queda en los logs de la función, o
// sea que la traza no se pierde del todo.

import * as db from './db.js'
import { obtenerIp, obtenerUserAgent } from './transport.js'

export const ACCIONES = {
  INGRESO_OK: 'ingreso_ok',
  NO_AUTORIZADO: 'no_autorizado',
  MFA_REQUERIDO: 'mfa_requerido',
  MFA_OK: 'mfa_ok',
  MFA_FALLIDO: 'mfa_fallido',
  MFA_ENROLADO: 'mfa_enrolado',
  MFA_SETUP_FALLIDO: 'mfa_setup_fallido',
  MFA_REUTILIZADO: 'mfa_codigo_reutilizado',
  RECUPERACION_OK: 'recuperacion_ok',
  RECUPERACION_FALLIDA: 'recuperacion_fallida',
  LOGIN_FALLIDO: 'login_fallido',
  LOGOUT: 'logout',
  DISPOSITIVO_CONFIADO: 'dispositivo_confiado',
  RATE_LIMIT: 'rate_limit',
  BLOQUEADO_SHADOW: 'bloqueado_en_modo_shadow',
}

export async function registrar(req, accion, datos = {}) {
  try {
    await db.auditar({
      accion,
      ip: obtenerIp(req),
      userAgent: obtenerUserAgent(req),
      usuarioId: datos.usuarioId ?? null,
      email: datos.email ?? null,
      mondayUserId: datos.mondayUserId ?? null,
      detalle: datos.detalle ?? null,
    })
  } catch (err) {
    console.error('[auth] no se pudo auditar "' + accion + '":', err.message)
  }
}
