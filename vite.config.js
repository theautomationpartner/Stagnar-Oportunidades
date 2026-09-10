import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Autenticación en el dev server.
//
// En Vercel, /api/auth/* lo sirven las funciones de api/auth/ y el guardián envuelve a
// cada endpoint. Acá no existe nada de eso: los /api/* de local son middlewares de este
// archivo. Sin este plugin, desarrollar sería desarrollar contra una app sin seguridad, y
// los errores de autenticación se descubrirían recién en el deploy — que es exactamente el
// tipo de bug más caro de encontrar.
//
// Hace dos cosas:
//   1. Sirve /api/auth/* cargando los MISMOS archivos que usa Vercel, con un adaptador
//      mínimo de res (status/json/send) porque el dev server de Vite entrega el res crudo
//      de Node y Vercel lo entrega enriquecido.
//   2. Aplica el guardián al resto de /api/* antes de que lleguen los proxies de abajo.
//
// Todo esto se saltea entero si la autenticación está apagada, y la carga de los módulos es
// dinámica a propósito: mientras AUTH_ENFORCE no esté encendido, `npm run dev` sigue
// funcionando sin instalar ninguna de las dependencias nuevas.
function authDevPlugin(env) {
  return {
    name: 'auth-dev',
    configureServer(server) {
      // Vercel expone las variables del proyecto en process.env; loadEnv solo las lee del
      // .env y las devuelve. Los handlers de api/ leen process.env, así que acá se copian
      // para que en local se comporten igual. No pisa lo que ya venga del sistema.
      for (const [clave, valor] of Object.entries(env)) {
        if (process.env[clave] === undefined) {
          process.env[clave] = valor
        } else if (process.env[clave] !== valor) {
          // Trampa clásica: al editar el .env, Vite reinicia su servidor pero NO el proceso
          // de Node, y process.env ya tiene el valor viejo. Como acá no se pisa lo que ya
          // está (para no romper las variables del sistema), el cambio parece no tener
          // efecto y uno termina buscando el error en el lugar equivocado. Avisarlo cuesta
          // cinco líneas y ahorra media hora.
          server.config.logger.warn(
            '  [auth-dev] ' + clave + ' cambió en .env pero el proceso sigue con el valor anterior.\n' +
              '             Reiniciá el dev server a mano (Ctrl+C y npm run dev) para que lo tome.'
          )
        }
      }

      const modo = () =>
        process.env.AUTH_ENFORCE?.trim().toLowerCase() ?? (process.env.DATABASE_URL ? 'on' : 'off')

      // Le da al res crudo de Node la forma que esperan los handlers escritos para Vercel.
      function adaptar(res) {
        res.status = (codigo) => {
          res.statusCode = codigo
          return res
        }
        res.json = (objeto) => {
          if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(objeto))
          return res
        }
        res.send = (datos) => {
          res.end(datos)
          return res
        }
        return res
      }

      // ── Ingreso de desarrollo ────────────────────────────────────────────────────────
      //
      // monday.get('sessionToken') solo contesta dentro del iframe de monday. En
      // localhost:5173 abierto suelto no hay token, así que sin esto no habría forma de
      // ejercitar el login, el 2FA ni los permisos sin desplegar.
      //
      // Este endpoint firma un sessionToken con el MISMO secreto de la app. No es una
      // puerta trasera: quien tiene ese secreto ya podía firmar tokens: es literalmente lo
      // que hace monday. Solo evita tener que abrir el iframe para obtener uno.
      //
      // Dos garantías independientes de que NUNCA existe en producción:
      //   1. Vive en configureServer, que solo corre en el dev server de Vite. En Vercel
      //      este archivo ni se ejecuta: ahí los endpoints son los de api/.
      //   2. Exige AUTH_DEV_LOGIN=on explícito. Sin esa variable no se registra.
      //
      // Lo que este atajo NO prueba, y hay que probar aparte (ver PUESTA-EN-MARCHA.md):
      // el comportamiento de las cookies dentro del iframe de terceros, que es justamente
      // el punto donde Safari se porta distinto.

      // El account_id de la cuenta de monday: se resuelve una vez y se recuerda acá.
      let cuentaDeMonday = null

      if (process.env.AUTH_DEV_LOGIN === 'on') {
        console.warn(
          '\n  [auth-dev] AUTH_DEV_LOGIN=on — /api/dev/session-token firma tokens de monday.\n' +
            '             Es solo para desarrollo local. No existe en Vercel.\n'
        )

        server.middlewares.use('/api/dev/session-token', async (req, res) => {
          const secreto = process.env.MONDAY_SIGNING_SECRET || process.env.MONDAY_CLIENT_SECRET
          if (!secreto) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Falta MONDAY_SIGNING_SECRET o MONDAY_CLIENT_SECRET' }))
            return
          }

          const url = new URL(req.url, 'http://localhost')
          const userId = Number(url.searchParams.get('userId') || process.env.AUTH_DEV_USER_ID)

          // El account_id NO puede faltar: el guardián rechaza como incompleto un token sin
          // cuenta (ver mondaySession.js), que es lo correcto — un token real de monday
          // siempre la trae. Si no está configurada, se resuelve una vez contra la API y se
          // recuerda, así el token de prueba es igual de completo que el de verdad.
          let accountId = Number(url.searchParams.get('accountId') || process.env.AUTH_DEV_ACCOUNT_ID)
          if (!accountId) {
            if (!cuentaDeMonday) {
              try {
                const r = await fetch('https://api.monday.com/v2', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: process.env.MONDAY_API_KEY,
                    'API-Version': '2024-10',
                  },
                  body: JSON.stringify({ query: 'query { me { account { id } } }' }),
                })
                cuentaDeMonday = Number((await r.json())?.data?.me?.account?.id) || null
              } catch {
                cuentaDeMonday = null
              }
            }
            accountId = cuentaDeMonday
          }

          if (!accountId) {
            res.statusCode = 500
            res.end(
              JSON.stringify({
                error: 'No se pudo resolver el account_id. Poné AUTH_DEV_ACCOUNT_ID en .env.',
              })
            )
            return
          }

          if (!userId) {
            res.statusCode = 400
            res.end(
              JSON.stringify({
                error: 'Falta userId. Pasalo por query (?userId=102989607) o poné AUTH_DEV_USER_ID en .env',
              })
            )
            return
          }

          const { createHmac } = await import('node:crypto')
          const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
          const ahora = Math.floor(Date.now() / 1000)
          // Misma forma que el token real de monday (ver api/_auth/mondaySession.js).
          const cabecera = b64({ alg: 'HS256', typ: 'JWT' })
          const cuerpo = b64({
            dat: {
              user_id: userId,
              account_id: accountId || 0,
              slug: 'dev-local',
              app_id: Number(process.env.MONDAY_APP_ID) || undefined,
              is_admin: false,
              is_view_only: false,
              is_guest: false,
            },
            iat: ahora,
            exp: ahora + 30 * 60,
          })
          const firma = createHmac('sha256', secreto).update(cabecera + '.' + cuerpo).digest('base64url')

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ token: cabecera + '.' + cuerpo + '.' + firma }))
        })
      }

      server.middlewares.use('/api/auth', async (req, res, next) => {
        // El middleware recibe la url ya sin el prefijo /api/auth.
        const ruta = (req.url || '/').split('?')[0].replace(/\/+$/, '')
        // Nada de subir por el árbol de directorios desde una url.
        if (ruta.includes('..')) return next()

        const archivo = path.join(process.cwd(), 'api', 'auth', ruta + '.js')
        if (!existsSync(archivo)) return next()

        try {
          // ssrLoadModule y NO import() dinámico.
          //
          // Con import(), Node cachea los módulos ESM por URL y no hay forma de invalidarlos:
          // editar api/_auth/db.js dejaba al dev server ejecutando la versión anterior, con
          // errores tipo "db.loQueSea is not a function" que no se corresponden con el código
          // que uno tiene en pantalla. Ni siquiera alcanza con server.restart(): reinicia el
          // servidor de Vite pero no el proceso de Node, así que el caché sobrevive.
          //
          // ssrLoadModule carga el archivo por el grafo de módulos de Vite, que sí invalida
          // el archivo y a quienes lo importan cuando cambia. Es el mecanismo pensado para
          // correr código de servidor dentro del dev server.
          const modulo = await server.ssrLoadModule('/api/auth' + ruta + '.js')
          await modulo.default(req, adaptar(res))
        } catch (err) {
          console.error('[auth-dev]', ruta, err)
          adaptar(res).status(500).json({ error: 'ERROR_INTERNO', detalle: String(err) })
        }
      })

      server.middlewares.use('/api', async (req, res, next) => {
        // /api/auth/* ya se resolvió arriba; el resto son los proxies de datos.
        if ((req.url || '').startsWith('/auth')) return next()

        // NO tocar api/_auth/*. No son endpoints: son los módulos de la librería.
        //
        // Uno de ellos, permisos.js, lo importa también el frontend (a propósito, para que
        // los nombres de permiso no existan por duplicado). En producción eso queda
        // empaquetado dentro del bundle y no se pide nunca. Pero en el dev server, Vite lo
        // sirve como módulo por su ruta real —/api/_auth/permisos.js— y sin esta excepción
        // el guardián lo rechaza con 401: el módulo no carga, React no monta, y la pantalla
        // queda en blanco sin ningún error visible del lado del servidor.
        //
        // Saltearlos es además lo que hace Vercel: las rutas que empiezan con "_" no se
        // rutean como funciones, así que en producción /api/_auth/... tampoco es un endpoint.
        if ((req.url || '').startsWith('/_auth')) return next()

        // Red de seguridad por si mañana el frontend importa otro módulo de api/: un pedido
        // GET a un archivo fuente es una carga de módulo del dev server, no una llamada a la
        // API. Ningún endpoint real termina en .js.
        if (req.method === 'GET' && /\.(js|mjs|jsx|ts|tsx)$/.test((req.url || '').split('?')[0])) {
          return next()
        }

        if (modo() === 'off') return next()

        try {
          // Por el grafo de Vite, igual que los endpoints: así un cambio en api/_auth/ se
          // toma sin reiniciar (ver el comentario de arriba sobre el caché de módulos).
          const { autenticar } = await server.ssrLoadModule('/api/_auth/guard.js')
          // Se cuelga del req para que los proxies de abajo puedan mirar el rol. El de
          // /api/monday lo necesita: es el único que tiene que distinguir una query de una
          // mutation, y no puede hacerlo acá porque leer el cuerpo consumiría el stream
          // antes de que el proxy lo reenvíe.
          req.__auth = await autenticar(req)
          next()
        } catch (err) {
          if (modo() === 'shadow') {
            console.warn('[auth-dev] en modo shadow habría bloqueado', req.url, '-', err.message)
            return next()
          }
          adaptar(res)
            .status(err.status ?? 401)
            .json({ error: err.codigo ?? 'NO_AUTORIZADO' })
        }
      })
    },
  }
}

// Proxies GraphQL requests to the monday.com API from the Vite dev server,
// so the API key stays server-side and never reaches the browser bundle.
function mondayApiProxy(env) {
  return {
    name: 'monday-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/monday', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          try {
            // Mismo control que api/monday.js en Vercel: una mutation exige permiso de
            // escritura. Tiene que estar también acá o desarrollar sería desarrollar contra
            // una app donde el rol "Invitado" (solo lectura) puede escribir igual, y la
            // diferencia se descubriría recién en producción.
            const usuario = req.__auth?.usuario
            if (usuario) {
              const [{ cuerpoEsEscritura }, { PERMISOS, puede }] = await Promise.all([
                import('./api/_auth/graphql.js'),
                import('./api/_auth/permisos.js'),
              ])
              let parseado = null
              try {
                parseado = JSON.parse(body)
              } catch {
                /* cuerpo no-JSON: lo rechaza monday, no nosotros */
              }
              if (parseado && cuerpoEsEscritura(parseado) && !puede(usuario, PERMISOS.ESCRIBIR)) {
                res.statusCode = 401
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'NO_AUTORIZADO' }))
                return
              }
            }

            const mondayRes = await fetch('https://api.monday.com/v2', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: env.MONDAY_API_KEY,
              },
              body,
            })
            const data = await mondayRes.text()
            res.statusCode = mondayRes.status
            res.setHeader('Content-Type', 'application/json')
            res.end(data)
          } catch (err) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      })
    },
  }
}

// La subida de archivos a una columna "file" de monday es una mutation especial:
// a diferencia del resto de la API (JSON puro sobre /v2), requiere multipart/form-data
// contra el endpoint dedicado /v2/file (ver mondayApi.js#uploadFileToColumn). Este
// proxy reenvía el multipart tal cual llega del navegador, agregando el Authorization
// del lado del servidor igual que el resto de los proxies de esta app.
function mondayFileProxy(env) {
  return {
    name: 'monday-file-proxy',
    configureServer(server) {
      server.middlewares.use('/api/monday-file', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const mondayRes = await fetch('https://api.monday.com/v2/file', {
              method: 'POST',
              headers: {
                'Content-Type': req.headers['content-type'],
                Authorization: env.MONDAY_API_KEY,
              },
              body: Buffer.concat(chunks),
            })
            const data = await mondayRes.text()
            res.statusCode = mondayRes.status
            res.setHeader('Content-Type', 'application/json')
            res.end(data)
          } catch (err) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      })
    },
  }
}

// makeWebhook.js posteaba directo del navegador a la URL de Make.com — a diferencia
// de monday, un Custom Webhook de Make normalmente NO responde con headers CORS
// (Access-Control-Allow-Origin) salvo que se arme un módulo de respuesta a mano. Make
// igual recibe el POST y manda el WhatsApp, pero el navegador bloquea la LECTURA de la
// respuesta y el fetch() del cliente termina tirando "Failed to fetch" — eso hacía que
// sendQuotesToWhatsApp tirara antes de llegar a onSent, y por eso nunca se marcaba
// "Incluir Propuesta" en monday aunque el WhatsApp sí hubiera salido. Mismo patrón que
// mondayFileProxy: reenviamos el multipart tal cual del lado del servidor (mismo
// origen para el navegador, sin problema de CORS) hacia la URL real de Make.
function makeWebhookProxy(env) {
  return {
    name: 'make-webhook-proxy',
    configureServer(server) {
      server.middlewares.use('/api/make-webhook', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const targetUrl = env.VITE_MAKE_WEBHOOK_URL
        if (!targetUrl) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'VITE_MAKE_WEBHOOK_URL no está configurada' }))
          return
        }

        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const makeRes = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': req.headers['content-type'] },
              body: Buffer.concat(chunks),
            })
            const data = await makeRes.text()
            res.statusCode = makeRes.status
            res.end(data)
          } catch (err) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      })
    },
  }
}

// Lee la Carta Automóvil con IA (ver mondayApi.js#leerCartaAutomovil) — mismo motivo
// que makeWebhookProxy (CORS de un Custom Webhook de Make pegado directo desde el
// navegador) más ocultar la URL real: a diferencia de VITE_MAKE_WEBHOOK_URL, esta
// variable NO lleva prefijo VITE_ a propósito, así que nunca se embebe en el bundle del
// cliente — el navegador solo conoce /api/leer-carta-automovil, nunca la URL de Make.
function leerCartaAutomovilProxy(env) {
  return {
    name: 'leer-carta-automovil-proxy',
    configureServer(server) {
      server.middlewares.use('/api/leer-carta-automovil', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const targetUrl = env.MAKE_CARTA_AUTOMOVIL_WEBHOOK_URL
        if (!targetUrl) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'MAKE_CARTA_AUTOMOVIL_WEBHOOK_URL no está configurada' }))
          return
        }

        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const makeRes = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': req.headers['content-type'] },
              body: Buffer.concat(chunks),
            })
            const data = await makeRes.text()
            res.statusCode = makeRes.status
            res.end(data)
          } catch (err) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      })
    },
  }
}

// Lee la Cédula de Identidad con IA al crear un Lead desde cero (ver
// mondayApi.js#leerCedula) — mismo patrón que leerCartaAutomovilProxy de acá arriba:
// CORS de un Custom Webhook de Make pegado directo desde el navegador, más ocultar la
// URL real (MAKE_LEER_CEDULA_WEBHOOK_URL, sin prefijo VITE_ a propósito).
function leerCedulaProxy(env) {
  return {
    name: 'leer-cedula-proxy',
    configureServer(server) {
      server.middlewares.use('/api/leer-cedula', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const targetUrl = env.MAKE_LEER_CEDULA_WEBHOOK_URL
        if (!targetUrl) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'MAKE_LEER_CEDULA_WEBHOOK_URL no está configurada' }))
          return
        }

        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', async () => {
          try {
            const makeRes = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': req.headers['content-type'] },
              body: Buffer.concat(chunks),
            })
            const data = await makeRes.text()
            res.statusCode = makeRes.status
            res.end(data)
          } catch (err) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      })
    },
  }
}

// Descarga el archivo real de una columna "file" ya subida (a pedido: reusar la Cédula
// Identidad de una Oportunidad anterior al elegirla en el buscador, ver
// mondayApi.js#fetchFileColumnAsFile). El asset guarda el binario en S3, no en
// monday.com — la URL "protected_static" que trae `text` exige sesión de monday
// logueada (confirmado a mano, redirige a /users/sign_in), así que hace falta pedir una
// URL firmada vía `assets{public_url}` primero. Todo del lado del servidor: el API key
// nunca llega al navegador, y el navegador nunca le pega directo a un bucket S3 ajeno
// (mismo criterio que mondayFileProxy/makeWebhookProxy). assetId se valida numérico
// antes de interpolarlo en la query — llega como query param, no como variable GraphQL.
function mondayAssetProxy(env) {
  return {
    name: 'monday-asset-proxy',
    configureServer(server) {
      server.middlewares.use('/api/monday-asset', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const assetId = new URL(req.url, 'http://localhost').searchParams.get('assetId')
        if (!assetId || !/^\d+$/.test(assetId)) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'assetId inválido' }))
          return
        }

        try {
          const gqlRes = await fetch('https://api.monday.com/v2', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: env.MONDAY_API_KEY,
            },
            body: JSON.stringify({ query: `query { assets(ids: [${assetId}]) { public_url name } }` }),
          })
          const gqlData = await gqlRes.json()
          const asset = gqlData.data?.assets?.[0]
          if (!asset?.public_url) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'Asset no encontrado' }))
            return
          }

          const fileRes = await fetch(asset.public_url)
          const buffer = Buffer.from(await fileRes.arrayBuffer())
          res.statusCode = fileRes.status
          res.setHeader('Content-Type', fileRes.headers.get('content-type') || 'application/octet-stream')
          res.end(buffer)
        } catch (err) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

// Puerto fijo (5173) para que el localhost del proyecto sea siempre el mismo
// entre sesiones — ver /app/README.md. strictPort corta en vez de saltar de puerto
// si 5173 ya está ocupado, así nunca queda una URL distinta "por las dudas".
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      // Va ANTES que los proxies: su middleware tiene que correr primero para poder
      // rechazar un pedido sin sesión antes de que el proxy lo reenvíe a monday con la
      // API key del servidor.
      authDevPlugin(env),
      mondayApiProxy(env),
      mondayFileProxy(env),
      makeWebhookProxy(env),
      leerCartaAutomovilProxy(env),
      leerCedulaProxy(env),
      mondayAssetProxy(env),
    ],
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
