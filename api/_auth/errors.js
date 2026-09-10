// Errores de autenticación y, sobre todo, cómo se contestan.
//
// La regla del documento de investigación que gobierna este archivo entero: cuando
// alguien no está autorizado, la respuesta debe ser siempre la misma, genérica. Nunca
// decir "ese email no existe" ni "tu cuenta fue revocada", porque eso le confirma
// información a quien está tanteando. Por eso cada error lleva DOS textos: `motivo`, que
// es detallado y va sólo a la auditoría, y el cuerpo HTTP, que es siempre el mismo.

const MENSAJE_GENERICO = 'No tenés acceso a esta aplicación. Contactá al administrador.'

export class NoAutorizado extends Error {
  // `motivo` nunca sale por la red. Existe para la fila de auditoría.
  constructor(motivo = 'no_autorizado', detalle = null) {
    super(motivo)
    this.name = 'NoAutorizado'
    this.status = 401
    this.codigo = 'NO_AUTORIZADO'
    this.motivo = motivo
    this.detalle = detalle
  }
}

// 403 y no 401 a propósito: el usuario ES quien dice ser y está en la lista, lo único
// que falta es el segundo factor. El frontend distingue los dos casos por el código y
// muestra la pantalla del QR o la del código de 6 dígitos según corresponda (ver
// AuthGate.jsx) — es la única diferencia que se le revela a alguien ya identificado.
export class MfaRequerido extends Error {
  constructor(codigo = 'MFA_REQUERIDO') {
    super(codigo)
    this.name = 'MfaRequerido'
    this.status = 403
    this.codigo = codigo // 'MFA_REQUERIDO' | 'MFA_ENROLAMIENTO_REQUERIDO'
  }
}

export class DemasiadosIntentos extends Error {
  constructor(reintentarEnSegundos = 900) {
    super('rate_limit')
    this.name = 'DemasiadosIntentos'
    this.status = 429
    this.codigo = 'DEMASIADOS_INTENTOS'
    this.reintentarEnSegundos = reintentarEnSegundos
  }
}

// Errores del propio flujo que SÍ pueden decir qué pasó, porque no revelan nada sobre
// quién existe en el sistema: el usuario ya está autenticado y está configurando su 2FA.
export class ErrorDeFlujo extends Error {
  constructor(codigo, mensaje, status = 400) {
    super(mensaje)
    this.name = 'ErrorDeFlujo'
    this.status = status
    this.codigo = codigo
  }
}

// Traduce cualquier excepción a una respuesta HTTP. Todo lo que no sea un error
// esperado sale como 500 sin cuerpo útil: un stack trace en la respuesta es un mapa del
// backend regalado a quien esté tanteando.
export function responderError(res, err) {
  if (err instanceof NoAutorizado) {
    return res.status(401).json({ error: err.codigo, mensaje: MENSAJE_GENERICO })
  }
  if (err instanceof MfaRequerido) {
    return res.status(403).json({ error: err.codigo })
  }
  if (err instanceof DemasiadosIntentos) {
    const minutos = Math.ceil(err.reintentarEnSegundos / 60)
    res.setHeader('Retry-After', String(err.reintentarEnSegundos))
    return res.status(429).json({
      error: err.codigo,
      mensaje: 'Demasiados intentos. Probá de nuevo en ' + minutos + ' minutos.',
    })
  }
  if (err instanceof ErrorDeFlujo) {
    return res.status(err.status).json({ error: err.codigo, mensaje: err.message })
  }
  console.error('[auth] error no controlado:', err)
  return res.status(500).json({ error: 'ERROR_INTERNO' })
}

export { MENSAJE_GENERICO }
