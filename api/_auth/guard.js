// El guardián: la única puerta por la que pasan todos los endpoints con datos.
//
// El documento de investigación es tajante sobre esto y conviene repetirlo acá, donde se
// implementa: bloquear la pantalla no sirve de nada si el endpoint que devuelve los datos
// sigue abierto. Hoy cualquiera que descubra la URL puede hacer un POST a /api/monday con
// la query GraphQL que se le ocurra, sin abrir la interfaz. Envolver TODOS los endpoints
// con esto es lo que cierra ese agujero — uno solo sin envolver lo deja abierto entero.
//
// Uso, en cualquier función de api/:
//
//   import { protegerEndpoint } from './_auth/guard.js'
//   export default protegerEndpoint(async (req, res, { usuario, sesion }) => { ... })

import { modoAuth, config, validarConfig } from './env.js'
import { NoAutorizado, MfaRequerido, responderError } from './errors.js'
import { verificarSesion, sesionEsPosteriorA } from './tokens.js'
import { leerTokenSesion, esPedidoDeLaApp } from './transport.js'
import * as whitelist from './whitelist.js'
import * as audit from './audit.js'
import * as rateLimit from './rateLimit.js'
import { puede } from './permisos.js'

// Cabeceras que conviene mandar desde la propia función además de las de vercel.json: si
// alguien despliega este código en otro lado, o si vercel.json se toca por error, las
// respuestas de la API siguen sin poder ser interpretadas de más ni cacheadas por el medio.
function cabecerasDeRespuesta(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // Ninguna respuesta autenticada puede quedar en una caché intermedia: son datos de una
  // persona concreta.
  res.setHeader('Cache-Control', 'no-store, private')
  res.setHeader('Vary', 'Authorization, Cookie, X-Session-Token')
}

// Resuelve la identidad de un pedido ya autenticado. Devuelve { sesion, usuario } o tira.
//
// El chequeo anti-CSRF vive ACÁ y no en protegerEndpoint a propósito: el proxy del dev
// server llama a autenticar() directo, sin pasar por protegerEndpoint, así que un control
// puesto allá arriba se aplicaría en Vercel y no en local. Esa divergencia es peor que no
// tener el control: hace que las pruebas locales digan que algo está protegido cuando en
// realidad no se ejercitó nunca. Con el chequeo acá, los dos caminos se comportan igual.
export async function autenticar(req) {
  // La cookie de sesión es SameSite=None —obligatorio dentro del iframe de monday— así que
  // viaja también en pedidos originados por cualquier otro sitio. Sin esto, una página
  // ajena podía usar la sesión de alguien logueado para escribir en monday o disparar
  // envíos: le alcanzaba con un <form>, porque el navegador adjunta la cookie sola.
  if (!esPedidoDeLaApp(req)) {
    throw new NoAutorizado('pedido_de_otro_origen', { url: req.url, metodo: req.method })
  }

  const token = leerTokenSesion(req)
  const sesion = await verificarSesion(token)

  // La regla de oro: la lista se consulta en CADA pedido, no solo al iniciar sesión. Esto
  // es una consulta por índice primario; es el precio de que una revocación tenga efecto
  // en el acto en vez de dentro de 24 horas.
  const usuario = await whitelist.revalidar(Number(sesion.sub))

  // Revocación sin estado: un token firmado y no vencido igual muere si el usuario cerró
  // todas sus sesiones o cambió la contraseña después de que se emitió.
  if (!sesionEsPosteriorA(sesion, usuario.sesiones_validas_desde)) {
    throw new NoAutorizado('sesion_invalidada')
  }

  // Cinturón y tiradores: la audiencia del token ya garantiza que un preauth no llegue
  // acá, y el claim lo vuelve a decir. Son dos mecanismos distintos fallando a la vez lo
  // que haría falta para que un usuario sin 2FA pase.
  if (sesion.mfa !== true) throw new MfaRequerido('MFA_REQUERIDO')

  return { sesion, usuario }
}

// `requierePermiso` acepta una constante de permisos.js. Es la forma de proteger una
// funcionalidad concreta y no solo "estar adentro": el permiso se evalúa contra lo que dice
// el tablero AHORA, no contra lo que decía cuando la persona inició sesión.
//
// La comprobación tiene que estar acá, en el endpoint, y no solo en la interfaz. Esconder
// un botón evita el clic distraído; no evita el POST hecho a mano.
export function protegerEndpoint(handler, opciones = {}) {
  const { metodos = null, requierePermiso = null, limite = null } = opciones

  return async function endpointProtegido(req, res) {
    cabecerasDeRespuesta(res)

    if (metodos && !metodos.includes(req.method)) {
      res.setHeader('Allow', metodos.join(', '))
      return res.status(405).json({ error: 'METODO_NO_PERMITIDO' })
    }

    const modo = modoAuth()

    // Modo apagado: la app se comporta exactamente como antes de instalar todo esto. Es
    // el estado en el que queda el repositorio hasta que existan la base y las variables
    // de entorno, para que agregar estos archivos no rompa un despliegue.
    if (modo === 'off') return handler(req, res, { usuario: null, sesion: null, modo })

    try {
      validarConfig()
      const { sesion, usuario } = await autenticar(req)

      if (requierePermiso && !puede(usuario, requierePermiso)) {
        throw new NoAutorizado('sin_permiso', { permiso: requierePermiso, rol: usuario.rol })
      }

      if (limite) {
        await rateLimit.consumir('ep:' + usuario.id + ':' + (req.url ?? ''), limite, {
          fallarCerrado: false,
        })
      }

      return await handler(req, res, { usuario, sesion, modo })
    } catch (err) {
      // Modo sombra: se evalúa todo igual y se registra qué habría pasado, pero se deja
      // pasar. Es el paso que permite desplegar esto un martes, mirar la auditoría unos
      // días y descubrir a las tres personas que faltaban en la lista blanca ANTES de que
      // se queden afuera un lunes a la mañana.
      if (modo === 'shadow') {
        await audit.registrar(req, audit.ACCIONES.BLOQUEADO_SHADOW, {
          detalle: { motivo: err.motivo ?? err.codigo ?? err.message, url: req.url },
        })
        return handler(req, res, { usuario: null, sesion: null, modo })
      }

      if (err instanceof NoAutorizado) {
        await audit.registrar(req, audit.ACCIONES.NO_AUTORIZADO, {
          detalle: { motivo: err.motivo, url: req.url, ...(err.detalle ?? {}) },
        })
      }
      return responderError(res, err)
    }
  }
}

// Los endpoints del propio flujo de MFA NO pueden usar protegerEndpoint: corren con la
// sesión a medio autenticar, y protegerEndpoint exige justamente el 2FA que esos endpoints
// están por resolver. Usan contextoPreAuth de mfaFlow.js.
