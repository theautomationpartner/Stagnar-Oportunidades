// Disparo directo de los escenarios de Make que antes arrancaban solo por una
// automatización de monday (cambio de columna): Cotizar, Validar póliza y Crear póliza.
// La app sigue escribiendo la columna como siempre y además llama al escenario por
// nuestro proxy (/api/disparar-escenario, ver api/_make/escenarios.js), que le manda
// {"event":{"pulseId": itemId}}, la misma forma que mandaba monday.
//
// La ventaja es la respuesta: cada escenario tiene un Webhook Response que avisa cómo le
// fue. No reemplaza al polling: la lectura de la póliza con IA puede tardar más que lo que
// aguanta el proxy, y el final de la cotización lo escribe otro escenario (el que dispara
// Apify). Por eso quien llama sigue con su polling y usa esta respuesta solo para
// enterarse antes.
import { fetchProtegido } from '../auth/fetchProtegido'
import { leerErrorDeMake } from './makeWebhook'

// Devuelve:
//   { error }  el escenario (o el proxy) rechazó el pedido con un mensaje entendible;
//   { data }   respondió bien — data es su JSON, o null si no era JSON ("Accepted");
//   null       no hubo respuesta útil (corte de red, timeout del proxy): no se sabe nada,
//              hay que seguir esperando por polling.
export async function dispararEscenario(escenario, itemId) {
  let response
  let cuerpo
  try {
    response = await fetchProtegido('/api/disparar-escenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ escenario, itemId: String(itemId) }),
    })
    cuerpo = await response.text()
  } catch {
    return null
  }

  const error = leerErrorDeMake(cuerpo)
  if (error) return { error }
  if (!response.ok) return null

  try {
    return { data: JSON.parse(cuerpo) }
  } catch {
    return { data: null }
  }
}
