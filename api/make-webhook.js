// Vercel Serverless Function — mismo rol que el proxy `/api/make-webhook` de
// vite.config.js: reenvía el multipart/form-data del navegador hacia la URL real del
// webhook de Make.com del lado del servidor, para que el fetch del cliente sea same-
// origin y no dependa de que Make responda con headers CORS. bodyParser:false porque
// necesitamos los bytes crudos del multipart, no un req.body parseado.
export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const targetUrl = process.env.VITE_MAKE_WEBHOOK_URL
  if (!targetUrl) {
    res.status(500).json({ error: 'VITE_MAKE_WEBHOOK_URL no está configurada' })
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
