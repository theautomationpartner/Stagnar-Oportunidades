// Escenarios de Make que la app dispara directo, en vez de esperar a que monday los
// llame por una automatización de cambio de columna. Lo comparten la función de Vercel
// (api/disparar-escenario.js) y el proxy del dev server (vite.config.js), así la lista
// de escenarios permitidos y la forma del pedido son una sola.
//
// Los tres leen únicamente {{event.pulseId}} del disparo, porque nacieron como webhooks
// de monday: se les manda esa misma forma para no tener que tocar los escenarios. Las
// URLs van sin prefijo VITE_ a propósito: solo las conoce el servidor.
//
// El Cotizador de WINK Responder no está: lo dispara Apify al terminar el robot, no la
// app. El final de la cotización se sigue viendo por polling.
export const ESCENARIOS = {
  cotizar: 'MAKE_COTIZAR_WEBHOOK_URL',
  'validar-poliza': 'MAKE_VALIDAR_POLIZA_WEBHOOK_URL',
  'crear-poliza': 'MAKE_CREAR_POLIZA_WEBHOOK_URL',
}

// Devuelve { status, body } para reenviarle tal cual al navegador. Un escenario o un
// itemId que no están en la lista se rechazan acá: sin eso, el endpoint serviría para
// pegarle a cualquier escenario con cualquier id.
export async function dispararEscenario({ escenario, itemId }, env) {
  const variable = ESCENARIOS[escenario]
  if (!variable) return { status: 400, body: JSON.stringify({ error: `Escenario desconocido: ${escenario}` }) }
  if (!/^\d+$/.test(String(itemId ?? ''))) {
    return { status: 400, body: JSON.stringify({ error: 'itemId inválido' }) }
  }
  const targetUrl = env[variable]
  if (!targetUrl) return { status: 500, body: JSON.stringify({ error: `${variable} no está configurada` }) }

  try {
    const makeRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: { pulseId: Number(itemId) } }),
    })
    return { status: makeRes.status, body: await makeRes.text() }
  } catch (err) {
    return { status: 502, body: JSON.stringify({ error: String(err) }) }
  }
}
