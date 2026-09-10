// Vercel Serverless Function — mismo rol que el proxy `/api/monday` de vite.config.js
// (agregar el Authorization del lado del servidor para que MONDAY_API_KEY nunca llegue
// al navegador), pero para el build de producción/preview en Vercel, donde el
// middleware del dev server de Vite no existe.
import { protegerEndpoint } from './_auth/guard.js'
import { PERMISOS, puede } from './_auth/permisos.js'
import { cuerpoEsEscritura } from './_auth/graphql.js'
import { NoAutorizado } from './_auth/errors.js'

async function handler(req, res, { usuario }) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // El control que hace real el rol "Invitado" (solo lectura).
  //
  // Este endpoint es uno solo para TODO: las queries que traen oportunidades y las
  // mutations que crean ítems, cambian columnas y cierran ventas. Sin mirar qué trae el
  // documento GraphQL, "solo lectura" sería únicamente esconder botones en la interfaz — y
  // esconder un botón no impide un POST hecho a mano contra esta misma URL.
  //
  // El chequeo va antes de reenviarle nada a monday: si no puede escribir, la mutation ni
  // sale del servidor.
  if (usuario && cuerpoEsEscritura(req.body) && !puede(usuario, PERMISOS.ESCRIBIR)) {
    throw new NoAutorizado('sin_permiso_de_escritura', { rol: usuario.rol })
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

// Protegido: es el endpoint que devuelve los datos de los tableros y no puede quedar
// abierto. Sin este envoltorio, cualquiera que descubra la URL puede pegarle directo sin
// pasar por la interfaz, y bloquear la pantalla no sirve de nada.
//
// El permiso de LEER se exige acá; el de ESCRIBIR, arriba, solo cuando el documento trae
// una mutation. Con AUTH_ENFORCE=off se comporta exactamente como antes (ver env.js).
export default protegerEndpoint(handler, { metodos: ['POST'], requierePermiso: PERMISOS.VER })
