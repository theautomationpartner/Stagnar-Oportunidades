// Vercel Serverless Function — mismo rol que el proxy `/api/monday-asset` de
// vite.config.js: resuelve un assetId a su URL firmada de S3 (`assets{public_url}`,
// requiere el API key) y la descarga del lado del servidor, para que el navegador nunca
// le pegue directo a monday.com (la URL "protected_static" que trae `text` exige sesión
// logueada) ni a un bucket S3 ajeno. assetId se valida numérico antes de interpolarlo en
// la query — llega como query param, no como variable GraphQL.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const assetId = req.query.assetId
  if (!assetId || !/^\d+$/.test(assetId)) {
    res.status(400).json({ error: 'assetId inválido' })
    return
  }

  try {
    const gqlRes = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.MONDAY_API_KEY,
      },
      body: JSON.stringify({ query: `query { assets(ids: [${assetId}]) { public_url name } }` }),
    })
    const gqlData = await gqlRes.json()
    const asset = gqlData.data?.assets?.[0]
    if (!asset?.public_url) {
      res.status(404).json({ error: 'Asset no encontrado' })
      return
    }

    const fileRes = await fetch(asset.public_url)
    const buffer = Buffer.from(await fileRes.arrayBuffer())
    res.status(fileRes.status)
    res.setHeader('Content-Type', fileRes.headers.get('content-type') || 'application/octet-stream')
    res.send(buffer)
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
}
