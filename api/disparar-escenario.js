// Vercel Serverless Function — mismo rol que el proxy `/api/disparar-escenario` de
// vite.config.js: dispara un escenario de Make (Cotizar, Validar póliza, Crear póliza)
// del lado del servidor y le devuelve al navegador lo que contestó su Webhook Response.
// Qué escenarios hay y cómo se arma el pedido vive en api/_make/escenarios.js.
//
// La lectura de la póliza con IA puede tardar más que lo que Vercel deja correr la
// función (ver "functions" en vercel.json). Si corta, la app no pierde nada: sigue
// esperando el resultado por polling, igual que antes de llamar al webhook.
import { protegerEndpoint } from './_auth/guard.js'
import { PERMISOS } from './_auth/permisos.js'
import { dispararEscenario } from './_make/escenarios.js'

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { status, body } = await dispararEscenario(req.body ?? {}, process.env)
  res.status(status)
  res.setHeader('Content-Type', 'application/json')
  res.send(body)
}

// Protegido con el permiso de escritura: los tres escenarios escriben en monday (estado
// de la cotización, veredictos de la validación, la póliza creada), igual que las
// mutations que pasan por /api/monday.
export default protegerEndpoint(handler, { metodos: ['POST'], requierePermiso: PERMISOS.ESCRIBIR })
