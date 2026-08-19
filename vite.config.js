import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
