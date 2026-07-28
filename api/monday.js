// Vercel Serverless Function — mismo rol que el proxy `/api/monday` de vite.config.js
// (agregar el Authorization del lado del servidor para que MONDAY_API_KEY nunca llegue
// al navegador), pero para el build de producción/preview en Vercel, donde el
// middleware del dev server de Vite no existe.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const mondayRes = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.MONDAY_API_KEY,
      },
      body: JSON.stringify(req.body),
    })
    const data = await mondayRes.text()
    res.status(mondayRes.status)
    res.setHeader('Content-Type', 'application/json')
    res.send(data)
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
}
