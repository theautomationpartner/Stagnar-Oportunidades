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

// Puerto fijo (5173) para que el localhost del proyecto sea siempre el mismo
// entre sesiones — ver /app/README.md. strictPort corta en vez de saltar de puerto
// si 5173 ya está ocupado, así nunca queda una URL distinta "por las dudas".
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), mondayApiProxy(env), mondayFileProxy(env), makeWebhookProxy(env)],
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
