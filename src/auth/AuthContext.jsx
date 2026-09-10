import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { obtenerSessionToken, pareceEstarDentroDeMonday, olvidarSessionToken } from './mondayAuth'
import * as api from './authClient'
// Se importa el módulo del backend, no una copia. permisos.js no depende de Node ni de
// ningún paquete, así que Vite lo empaqueta sin problema — y así los nombres de permiso
// son literalmente los mismos de los dos lados. Una copia en src/ sería una copia que
// dentro de tres meses dice "emitir" de un lado y "emision" del otro, y el bug resultante
// sería un botón visible que devuelve 401.
import { PERMISOS, puede as tienePermiso } from '../../api/_auth/permisos.js'

// La máquina de estados del ingreso. Todo el frontend de autenticación se reduce a esto:
//
//   cargando       -> pidiéndole el token a monday y canjeándolo en el backend
//   listo          -> hay sesión completa; la app se muestra
//   enrolar        -> primera vez: hay que escanear el QR
//   codigo         -> hay que tipear los 6 dígitos
//   login          -> proveedor contraseña (solo si está encendido y no hay monday)
//   sin_acceso     -> la lista blanca dijo que no, o la app se abrió fuera de monday
//   error          -> algo se rompió de verdad (backend caído), distinto de "no tenés acceso"
//
// Que "no tenés acceso" y "algo se rompió" sean estados distintos importa para el usuario:
// el primero se resuelve hablando con el administrador y el segundo reintentando. Mezclarlos
// produce a alguien reintentando quince veces una pantalla que nunca va a cambiar.

const AuthContext = createContext(null)

export const ESTADOS = {
  CARGANDO: 'cargando',
  LISTO: 'listo',
  // Asiento de monday compartido: hay que elegir con qué perfil entrar antes del 2FA.
  ELEGIR_PERFIL: 'elegir_perfil',
  ENROLAR: 'enrolar',
  CODIGO: 'codigo',
  LOGIN: 'login',
  SIN_ACCESO: 'sin_acceso',
  ERROR: 'error',
}

// Se define en authClient.js (ver el comentario allá sobre el ciclo de imports) y se
// reexporta acá porque es donde tiene sentido buscarlo: es lo que hace que una sesión
// vencida a mitad de la jornada, o un acceso revocado hace un minuto, devuelvan al usuario
// a la pantalla de ingreso en vez de dejarlo mirando una tabla vacía.
export const EVENTO_SESION_CAIDA = api.EVENTO_SESION_CAIDA

const PASSWORD_LOGIN_HABILITADO = import.meta.env.VITE_AUTH_PASSWORD_LOGIN === 'on'

export function AuthProvider({ children }) {
  const [estado, setEstado] = useState(ESTADOS.CARGANDO)
  const [usuario, setUsuario] = useState(null)
  const [mensaje, setMensaje] = useState(null)
  const [preAuthToken, setPreAuthToken] = useState(null)
  // Asiento de monday compartido: { token, perfiles } mientras se elige con cuál entrar.
  const [seleccion, setSeleccion] = useState(null)
  // La fila del tablero con la que se está entrando ({ nombre, rol }). Solo importa cuando
  // el asiento está compartido: es lo único que distingue a una persona de otra.
  const [perfil, setPerfil] = useState(null)
  // Lo que va a aparecer en Google Authenticator al escanear el QR.
  const [etiquetaTotp, setEtiquetaTotp] = useState(null)
  // Cuando el backend corre con la autenticación apagada (AUTH_ENFORCE=off), la app se
  // comporta igual que antes de todo esto. Se guarda para no mostrar el botón de cerrar
  // sesión, que no tendría sentido.
  const [deshabilitada, setDeshabilitada] = useState(false)

  // Evita que dos montajes en StrictMode disparen dos ingresos en paralelo, que en el
  // peor caso consumen dos veces el cupo del rate limit por IP.
  const enCurso = useRef(false)
  // Referencia a `ingresar`, que se define más abajo. Existe para que seleccionarPerfil
  // pueda reiniciar el flujo sin que las dos funciones queden dependiendo una de la otra
  // en sus arrays de dependencias, que es como se arma un ciclo de recreaciones.
  const ingresarRef = useRef(null)

  const aplicarRespuesta = useCallback((datos) => {
    if (datos.authDeshabilitado) {
      setDeshabilitada(true)
      setUsuario(null)
      setEstado(ESTADOS.LISTO)
      return
    }
    if (datos.estado === 'ELEGIR_PERFIL') {
      setSeleccion({ token: datos.seleccionToken, perfiles: datos.perfiles })
      setEstado(ESTADOS.ELEGIR_PERFIL)
      return
    }
    if (datos.estado === 'MFA_ENROLAMIENTO_REQUERIDO') {
      setPreAuthToken(datos.preAuthToken)
      setPerfil(datos.perfil ?? null)
      setEtiquetaTotp(datos.etiquetaTotp ?? null)
      setEstado(ESTADOS.ENROLAR)
      return
    }
    if (datos.estado === 'MFA_REQUERIDO') {
      setPreAuthToken(datos.preAuthToken)
      setUsuario(datos.usuario ?? null)
      setPerfil(datos.perfil ?? null)
      setEstado(ESTADOS.CODIGO)
      return
    }
    // 'OK' o la respuesta de confirm/verify/recovery, que ya vienen con la sesión hecha.
    setUsuario(datos.usuario ?? null)
    setPreAuthToken(null)
    setSeleccion(null)
    setEstado(ESTADOS.LISTO)
  }, [])

  // Elegir un perfil no cierra el ingreso: devuelve la misma rama de siempre (enrolar el
  // 2FA de ese perfil, pedir su código, o entrar directo si el dispositivo ya era confiable
  // para él).
  const seleccionarPerfil = useCallback(
    async (itemId) => {
      setEstado(ESTADOS.CARGANDO)
      try {
        aplicarRespuesta(await api.elegirPerfil(seleccion.token, itemId))
      } catch (err) {
        if (err instanceof api.ErrorDeAuth && err.status === 401) {
          // El token de selección dura poco. Si venció mientras la persona decidía, se
          // vuelve al principio: pedir de nuevo el token de monday es transparente.
          ingresarRef.current?.()
          return
        }
        setMensaje(err.message || 'No pudimos abrir ese perfil.')
        setEstado(ESTADOS.ERROR)
      }
    },
    [seleccion, aplicarRespuesta]
  )

  const ingresar = useCallback(async () => {
    if (enCurso.current) return
    enCurso.current = true
    setEstado(ESTADOS.CARGANDO)
    setMensaje(null)

    try {
      const tokenMonday = await obtenerSessionToken()

      if (!tokenMonday) {
        // Sin token de monday: o la app se abrió fuera del iframe, o el SDK no contestó.
        if (PASSWORD_LOGIN_HABILITADO) {
          setEstado(ESTADOS.LOGIN)
          return
        }
        setMensaje(
          pareceEstarDentroDeMonday()
            ? 'No se pudo verificar tu sesión de monday. Recargá la página.'
            : 'Esta aplicación solo puede usarse desde monday.com.'
        )
        setEstado(ESTADOS.SIN_ACCESO)
        return
      }

      aplicarRespuesta(await api.abrirSesionMonday(tokenMonday))
    } catch (err) {
      if (err instanceof api.ErrorDeAuth && err.status === 401) {
        // El mensaje ya viene del backend y es genérico a propósito: nunca dice si el
        // email existe ni si fue revocado (ver api/_auth/errors.js).
        setMensaje(err.message)
        setEstado(ESTADOS.SIN_ACCESO)
        return
      }
      setMensaje('No pudimos verificar tu acceso. Probá de nuevo en un momento.')
      setEstado(ESTADOS.ERROR)
    } finally {
      enCurso.current = false
    }
  }, [aplicarRespuesta])

  // Se mantiene al día para que seleccionarPerfil pueda reiniciar el flujo (ver arriba).
  ingresarRef.current = ingresar

  useEffect(() => {
    ingresar()
  }, [ingresar])

  // Sesión caída a mitad de la jornada: se vuelve al principio del flujo. El token de
  // monday se olvida también, porque puede haber vencido y es el que hay que renovar.
  useEffect(() => {
    function alCaer() {
      api.tokens.limpiarSesion()
      olvidarSessionToken()
      ingresar()
    }
    window.addEventListener(EVENTO_SESION_CAIDA, alCaer)
    return () => window.removeEventListener(EVENTO_SESION_CAIDA, alCaer)
  }, [ingresar])

  const salir = useCallback(
    async ({ todas = false } = {}) => {
      await api.cerrarSesion({ todas })
      olvidarSessionToken()
      setUsuario(null)
      ingresar()
    },
    [ingresar]
  )

  // ¿Esta persona puede hacer tal cosa? Sirve para esconder de la interfaz lo que no va a
  // poder hacer — y NADA más que eso. La lista de permisos llega del servidor pero vive en
  // el navegador, así que se puede editar desde la consola: quien decide de verdad es el
  // endpoint, que revalida el permiso contra el tablero en cada pedido (ver guard.js).
  // Esconder un botón evita el clic distraído; no evita el POST hecho a mano.
  //
  // Con AUTH_ENFORCE=off no hay usuario y devuelve true para todo, para que la app se vea
  // completa mientras la seguridad todavía no está encendida.
  const puede = useCallback(
    (permiso) => (deshabilitada || !usuario ? true : tienePermiso(usuario, permiso)),
    [deshabilitada, usuario]
  )

  const valor = useMemo(
    () => ({
      estado,
      usuario,
      mensaje,
      preAuthToken,
      seleccion,
      perfil,
      etiquetaTotp,
      deshabilitada,
      passwordLoginHabilitado: PASSWORD_LOGIN_HABILITADO,
      puede,
      PERMISOS,
      aplicarRespuesta,
      seleccionarPerfil,
      reintentar: ingresar,
      salir,
    }),
    [
      estado,
      usuario,
      mensaje,
      preAuthToken,
      seleccion,
      perfil,
      etiquetaTotp,
      deshabilitada,
      puede,
      aplicarRespuesta,
      seleccionarPerfil,
      ingresar,
      salir,
    ]
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth tiene que usarse dentro de <AuthProvider>')
  return ctx
}

// Atajo para el caso más común, esconder un elemento:
//
//   const puedeEmitir = usePermiso(PERMISOS.EMITIR)
//   {puedeEmitir && <BotonEmitir />}
//
// Con el modelo de roles acordado (Admin solo se distingue por administrar usuarios), hoy
// el único permiso que realmente esconde algo es ADMINISTRAR_USUARIOS. Los demás existen
// para el día que haga falta separar más fino, sin tener que rehacer el mecanismo.
export function usePermiso(permiso) {
  return useAuth().puede(permiso)
}

export { PERMISOS }
