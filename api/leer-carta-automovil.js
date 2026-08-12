// Vercel Serverless Function — mismo rol que el proxy `/api/leer-carta-automovil` de
// vite.config.js: reenvía el multipart/form-data del navegador hacia la URL real del
// escenario de Make.com que lee la Carta Automóvil, del lado del servidor. La URL real
// vive en MAKE_CARTA_AUTOMOVIL_WEBHOOK_URL (sin prefijo VITE_ a propósito: no debe
// llegar nunca al bundle del cliente). bodyParser:false porque necesitamos los bytes
// crudos del multipart, no un req.body parseado.
export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const targetUrl = process.env.MAKE_CARTA_AUTOMOVIL_WEBHOOK_URL
  if (!targetUrl) {
    res.status(500).json({ error: 'MAKE_CARTA_AUTOMOVIL_WEBHOOK_URL no está configurada' })
    return
  }

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks)

    const makeRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': req.headers['content-type'] },
      body,
    })
    const data = await makeRes.text()
    res.status(makeRes.status)
    res.send(data)
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
}
