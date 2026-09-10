// Vercel Serverless Function — equivalente en producción/preview al proxy
// `/api/monday-file` de vite.config.js: reenvía el multipart/form-data tal cual llega
// del navegador (variables[file] + query) contra el endpoint especial /v2/file de
// monday, agregando el Authorization del lado del servidor. bodyParser:false porque
// necesitamos los bytes crudos del multipart, no un req.body parseado.
import { protegerEndpoint } from './_auth/guard.js'
import { PERMISOS } from './_auth/permisos.js'

export const config = {
  api: { bodyParser: false },
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks)

    const mondayRes = await fetch('https://api.monday.com/v2/file', {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'],
        Authorization: process.env.MONDAY_API_KEY,
      },
      body,
    })
    const data = await mondayRes.text()
    res.status(mondayRes.status)
    res.setHeader('Content-Type', 'application/json')
    res.send(data)
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
}

// Protegido: la subida de archivos a una columna file no puede quedar abierto.
// Sin este envoltorio, cualquiera que descubra la URL puede pegarle directo sin pasar
// por la interfaz, y bloquear la pantalla no sirve de nada. Con AUTH_ENFORCE=off se
// comporta exactamente como antes (ver api/_auth/env.js).
export default protegerEndpoint(handler, { metodos: ['POST'], requierePermiso: PERMISOS.SUBIR_ARCHIVOS })
