// Envío a Make.com: se llama directo desde el navegador (a diferencia de la API de
// monday, un webhook de Make está pensado para recibir POSTs de cualquier origen, no
// hace falta ocultarlo detrás del proxy del server). La URL se configura en
// app/.env como VITE_MAKE_WEBHOOK_URL (prefijo VITE_ para que Vite la exponga al
// bundle del cliente). Ver /logica-monday-vibe.md.
//
// Se manda como multipart/form-data (archivos binarios reales), NO como base64 dentro
// de un JSON — así el Custom Webhook de Make ya entrega cada imagen como un binario
// listo para usar (sin toBinary()/replace() ni adivinar el "codepage" del lado de Make).
//
// Todas las imágenes seleccionadas van en **un solo POST** (un solo campo "images"
// repetido — SIN corchetes en el nombre: con "images[]" el nombre de la propiedad
// queda con corchetes literales y las fórmulas de Make que la referencian (incluso
// escapadas con backticks) no la resuelven bien en módulos como "Set variables").
// Make representa varios archivos bajo el mismo nombre de campo con una estructura
// anidada: 1.images.files es el array real con todos — el primero de la lista aparece
// TAMBIÉN suelto en 1.images como atajo, así que el Iterator del lado de Make tiene
// que apuntar a "1.images.files", no a "1.images".
//
// Compañía, cobertura y tipo (familia GLOBAL/TRIPLE, ver coberturaGroups.js) NO van
// como campos aparte: multipart no permite meter campos custom adentro del objeto de
// un archivo, y mandarlos como arrays de texto en paralelo corre el riesgo de
// desalinearse con "images" (igual que pasó con los archivos repetidos). En cambio, van
// codificados en el propio "name" del archivo (p. ej.
// "BSE__GLOBAL - anual__GLOBAL__OPP-9094.png") — así quedan garantizados al mismo nivel
// que esa imagen puntual (name es hermano de data/mime en cada item de images.files),
// sin depender de correlacionar dos arrays por índice. Del lado de Make se sacan con un
// split() sobre "name" dentro de la misma iteración.
// Ver /logica-monday-vibe.md.
import { coberturaGroupOf } from './coberturaGroups'

export function getMakeWebhookUrl() {
  return import.meta.env.VITE_MAKE_WEBHOOK_URL || ''
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl)
  return response.blob()
}

// "__" (doble guion bajo) como separador porque compañía/cobertura pueden traer
// guiones simples y espacios (p. ej. "GLOBAL - anual") — con un separador de un solo
// carácter sería ambiguo partirlo del lado de Make. El "tipo" (GLOBAL/TRIPLE) es el
// mismo flag que usan las solapas del paso "Comparar y enviar" (coberturaGroupOf) — si
// una cobertura no cae en ninguna familia, se manda "SIN-FAMILIA" en vez de un segmento
// vacío (un "____" ambiguo al hacer split() del lado de Make).
function buildFilename(raw, opportunity) {
  const cobertura = raw.cobertura || raw.name
  const tipo = coberturaGroupOf(raw.cobertura) ?? 'SIN-FAMILIA'
  return `${raw.compania}__${cobertura}__${tipo}__${opportunity.oppNumber}.png`
}

export async function sendQuotesToWhatsApp({ phone, opportunity, images }) {
  const url = getMakeWebhookUrl()
  if (!url) {
    throw new Error(
      'Falta configurar VITE_MAKE_WEBHOOK_URL en app/.env con la URL del webhook de Make.com'
    )
  }

  const formData = new FormData()
  formData.append('phone', phone)
  formData.append('opportunityId', opportunity.id)
  formData.append('oppNumber', opportunity.oppNumber)
  formData.append('clienteNombre', opportunity.clienteNombre)

  for (const { raw, imageDataUrl } of images) {
    const blob = await dataUrlToBlob(imageDataUrl)
    formData.append('images', blob, buildFilename(raw, opportunity))
  }

  // Ojo: no seteamos Content-Type a mano — el navegador arma el boundary de
  // multipart/form-data solo. Si se fuerza el header manualmente, el body queda mal
  // formado y Make no puede parsear los archivos.
  //
  // El POST va a nuestro propio proxy (/api/make-webhook, ver vite.config.js /
  // api/make-webhook.js), NO directo a `url` — un Custom Webhook de Make normalmente no
  // responde con headers CORS, así que un fetch directo desde el navegador terminaba
  // recibiendo el WhatsApp igual (Make sí procesaba el POST) pero tirando "Failed to
  // fetch" del lado del cliente antes de poder confirmar el envío, y por eso nunca se
  // marcaba "Incluir Propuesta" en monday.
  const response = await fetch('/api/make-webhook', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Make.com respondió ${response.status}`)
  }
}
