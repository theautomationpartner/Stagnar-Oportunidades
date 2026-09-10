// Routing Middleware de Vercel — corre en el Edge, antes que cualquier función.
//
// Va en la raíz del proyecto, al mismo nivel que package.json. No hace falta Next.js:
// Vercel soporta este archivo para cualquier framework, con un export default que recibe
// y devuelve los objetos estándar Request y Response. Esta app es Vite + React, así que
// esta es la forma que corresponde.
//
// QUÉ PROTEGE Y QUÉ NO — conviene tenerlo claro para no confiar de más:
//
//   Sí frena: que alguien copie el link de la app y lo abra suelto en el navegador. Ve un
//   403 en vez de la interfaz.
//
//   NO frena: un curl directo contra /api/*. El header Referer lo escribe el cliente, así
//   que se falsifica con un -H y listo. Lo único que frena eso es el sessionToken firmado
//   (ver api/_auth/mondaySession.js), y por eso /api está EXCLUIDO del matcher: hacerle
//   creer a alguien que el middleware protege la API es peor que no tener middleware,
//   porque invita a relajar el guardián que sí protege.
//
// Este archivo es entonces una capa de comodidad y de higiene, no la defensa. La defensa
// es el guardián. El orden de importancia que fija el documento de investigación es
// exactamente ese: sessionToken -> lista blanca -> 2FA -> CSP -> middleware -> firewall.

export const config = {
  // Solo el documento HTML. NO se tocan /assets (los pedidos de assets llevan el Referer
  // de la propia app de Vercel, no el de monday, así que este filtro los mataría a todos)
  // ni /api (ver arriba). El patrón .*\..* deja pasar cualquier cosa con extensión.
  matcher: ['/((?!api|assets|favicon.ico|.*\\..*).*)'],
}

const ORIGENES_PERMITIDOS = ['.monday.com', '.monday.app']

const PAGINA_403 = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acceso restringido</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:3rem;text-align:center;color:#323338">
  <h1 style="font-size:1.5rem;margin-bottom:.5rem">Acceso restringido</h1>
  <p style="color:#676879">Esta aplicación solo puede usarse desde monday.com.</p>
</body></html>`

export default function middleware(request) {
  // Salida de emergencia para poder abrir un Preview de Vercel directo y probarlo sin
  // monday. Se pone en las variables de entorno del Preview, nunca en las de Producción.
  if (process.env.AUTH_MIDDLEWARE_REFERER === 'off') return undefined

  const referer = request.headers.get('referer') ?? ''

  let esDeMonday = false
  try {
    // Se compara el hostname parseado y por sufijo de dominio, NO con
    // referer.includes('monday.com'). La diferencia no es estilística: con includes,
    // alguien que registre monday.com.sitio-falso.net pasaría el filtro, y también lo
    // haría cualquier URL que llevara ese texto en el path o en la query.
    const host = new URL(referer).hostname
    esDeMonday = ORIGENES_PERMITIDOS.some((d) => host === d.slice(1) || host.endsWith(d))
  } catch {
    esDeMonday = false // referer vacío o inválido
  }

  if (!esDeMonday) {
    return new Response(PAGINA_403, {
      status: 403,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Que no quede cacheada: si el navegador guarda el 403, el usuario legítimo que
        // vuelve a entrar desde monday lo sigue viendo y nadie entiende por qué.
        'cache-control': 'no-store',
      },
    })
  }

  // Continuar al siguiente handler.
  return undefined
}
