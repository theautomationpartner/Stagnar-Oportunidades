// Envío a Make.com: el navegador postea a /api/make-webhook y el servidor lo reenvía a
// la URL real del webhook (ver api/make-webhook.js). La URL vive solo del lado del
// servidor (MAKE_WHATSAPP_WEBHOOK_URL): antes se leía acá como VITE_MAKE_WEBHOOK_URL y,
// por el prefijo VITE_, Vite la metía entera en el bundle — cualquiera que abriera el
// código del navegador podía pegarle al webhook sin pasar por la app. Si falta, el
// servidor responde un error que se muestra como cualquier rechazo del envío.
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
import { fetchProtegido } from '../auth/fetchProtegido'
import { coberturaGroupOf } from './coberturaGroups'

// Se decodifica a mano, y NO con fetch(dataUrl) como antes: en producción el CSP
// (ver vercel.json) limita connect-src a 'self' y monday.com, y para el navegador un
// fetch() a una URL "data:" es una conexión más — la bloqueaba, el envío moría con
// "Failed to fetch" ANTES de postear y a Make no le llegaba nada. En local no se veía
// porque el dev server no manda esas cabeceras. Decodificar acá no depende del CSP ni
// pasa por la capa de red.
function dataUrlToBlob(dataUrl) {
  const [encabezado, base64] = String(dataUrl).split(',')
  const tipo = /:(.*?);/.exec(encabezado)?.[1] ?? 'image/png'
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

// "__" (doble guion bajo) como separador porque compañía/cobertura pueden traer
// guiones simples y espacios (p. ej. "GLOBAL - anual") — con un separador de un solo
// carácter sería ambiguo partirlo del lado de Make. El "tipo" (GLOBAL/TRIPLE) es el
// mismo flag que usan las solapas del paso "Comparar y enviar" (coberturaGroupOf) — si
// una cobertura no cae en ninguna familia, se manda "SIN-FAMILIA" en vez de un segmento
// vacío (un "____" ambiguo al hacer split() del lado de Make).
// La extensión por defecto es .jpg porque renderQuoteImageDataUrl ahora genera JPEG (ver
// el comentario ahí: en PNG el envío de varias propuestas se acercaba al límite de 4,5 MB
// de Vercel). Si el escenario de Make filtrara por extensión, es acá donde hay que mirar.
function buildFilename(raw, opportunity, ext = 'jpg') {
  const cobertura = raw.cobertura || raw.name
  const tipo = coberturaGroupOf(raw.cobertura) ?? 'SIN-FAMILIA'
  return `${raw.compania}__${cobertura}__${tipo}__${opportunity.oppNumber}.${ext}`
}

// ---------------------------------------------------------------------------
// Envío por tandas
//
// /api/make-webhook es una función serverless de Vercel y Vercel rechaza con 413
// cualquier cuerpo de más de 4,5 MB, en el borde, antes de que corra el handler. Con el
// pasaje a JPEG una tanda de 10 propuestas ronda 1 MB, así que esto casi nunca se va a
// disparar — pero si alguien selecciona muchas, en vez de un 413 sin explicación el
// envío se parte en varios POST.
//
// Las tandas van SECUENCIALES, no en paralelo: así el cliente las recibe en orden y, si
// el escenario rechaza el envío por una razón de negocio (ver leerErrorDeMake), se corta
// antes de mandar el resto.
//
// IMPORTANTE para el lado de Make: cada tanda es una EJECUCIÓN distinta del escenario, y
// el escenario manda un saludo y escribe en monday una vez por ejecución. Por eso viajan
// `parte` y `totalPartes`: el saludo y las escrituras tienen que quedar condicionados a
// `parte = 1`, o el cliente recibe el saludo repetido.
// ---------------------------------------------------------------------------
const LIMITE_VERCEL_BYTES = 4.5 * 1024 * 1024
// Margen para los campos de texto (phone, opportunityId, formato...), los boundaries del
// multipart y los headers de cada parte.
const PRESUPUESTO_TANDA = LIMITE_VERCEL_BYTES - 256 * 1024
// Lo que ocupa el envoltorio de cada archivo dentro del multipart (boundary,
// Content-Disposition con el nombre, Content-Type, saltos de línea).
const OVERHEAD_POR_ARCHIVO = 256

// Agrupa las cotizaciones en tandas que entren en el presupuesto. Cada cotización viaja
// entera en una sola tanda (su imagen y su texto juntos): si se separaran, del lado de
// Make la iteración de `images` y la de `texts` dejarían de corresponderse.
function repartirEnTandas(adjuntos) {
  const tandas = []
  let actual = []
  let pesoActual = 0
  for (const adjunto of adjuntos) {
    // Una cotización que sola no entra igual se manda: que el proxy la rechace con un
    // error es mejor que descartarla en silencio. Con JPEG a 900 px es inalcanzable.
    if (actual.length && pesoActual + adjunto.peso > PRESUPUESTO_TANDA) {
      tandas.push(actual)
      actual = []
      pesoActual = 0
    }
    actual.push(adjunto)
    pesoActual += adjunto.peso
  }
  if (actual.length) tandas.push(actual)
  return tandas
}

// LOG-17: qué se le manda al cliente. "imagen" es lo de siempre; "texto" manda la misma
// cotización escrita (ver whatsappText.js) y "ambos", las dos cosas.
export const FORMATOS_ENVIO = ['imagen', 'texto', 'ambos']

export async function sendQuotesToWhatsApp({ phone, opportunity, images, formato = 'imagen', telefonoEnvio, onTanda }) {
  const mandaImagen = formato === 'imagen' || formato === 'ambos'
  const mandaTexto = formato === 'texto' || formato === 'ambos'

  // Los archivos de cada cotización, ya convertidos a Blob y con su peso medido, para
  // poder repartirlos en tandas antes de mandar nada.
  const adjuntos = images
    .map(({ raw, imageDataUrl, texto }) => {
      const archivos = []
      if (mandaImagen && imageDataUrl) {
        archivos.push({ campo: 'images', blob: dataUrlToBlob(imageDataUrl), nombre: buildFilename(raw, opportunity) })
      }
      // El texto viaja como archivo .txt bajo el campo "texts" — mismo esquema que las
      // imágenes (un solo campo repetido, con compañía/cobertura/familia codificadas en el
      // "name") para que del lado de Make se itere igual, con el mismo split(), y no haya
      // que correlacionar dos arrays sueltos por índice. Ver el comentario grande de arriba.
      if (mandaTexto && texto) {
        archivos.push({
          campo: 'texts',
          blob: new Blob([texto], { type: 'text/plain' }),
          nombre: buildFilename(raw, opportunity, 'txt'),
        })
      }
      const peso = archivos.reduce((t, a) => t + a.blob.size + a.nombre.length + OVERHEAD_POR_ARCHIVO, 0)
      return { archivos, peso }
    })
    .filter((a) => a.archivos.length)

  const tandas = repartirEnTandas(adjuntos)
  let enviadas = 0
  for (const [indice, tanda] of tandas.entries()) {
    onTanda?.({ parte: indice + 1, totalPartes: tandas.length })
    try {
      await postearTanda({ phone, opportunity, formato, telefonoEnvio, tanda, parte: indice + 1, totalPartes: tandas.length })
    } catch (err) {
      // Si se cortó después de haber mandado algo, el cliente ya recibió esa parte: hay
      // que decirlo, porque reintentar a ciegas le manda repetido lo que ya le llegó.
      if (enviadas > 0) {
        throw new Error(
          `Se enviaron ${enviadas} de ${adjuntos.length} cotizaciones y el envío se cortó. ${err.message}`
        )
      }
      throw err
    }
    enviadas += tanda.length
  }
}

async function postearTanda({ phone, opportunity, formato, telefonoEnvio, tanda, parte, totalPartes }) {
  const formData = new FormData()
  formData.append('phone', phone)
  formData.append('opportunityId', opportunity.id)
  formData.append('oppNumber', opportunity.oppNumber)
  formData.append('clienteNombre', opportunity.clienteNombre)
  // Para el lado de Make: cada tanda es una ejecución nueva del escenario, así que el
  // saludo al cliente y las escrituras en monday tienen que condicionarse a `parte = 1`.
  // En el caso normal (una sola tanda) viajan como 1 y 1, y el filtro se cumple siempre.
  formData.append('parte', String(parte))
  formData.append('totalPartes', String(totalPartes))
  // A pedido: el número de origen elegido en WhatsAppSendModal (ver
  // fetchTelefonosEnvioHabilitados), para que el escenario de Make pueda usarlo para
  // decidir por cuál línea/dispositivo mandar. Solo viaja si hay uno resuelto — el
  // escenario de Make hoy no lo necesita para nada (sigue mandando por su única línea
  // configurada), así que su ausencia no debería romper nada del lado de Make.
  if (telefonoEnvio) formData.append('telefonoEnvio', telefonoEnvio)
  // LOG-17: el escenario de Make lee esto para decidir qué mandar. Igual solo viajan los
  // campos que correspondan al formato elegido, así que un escenario que itere lo que
  // llega ya se comporta bien sin mirarlo.
  formData.append('formato', formato)

  // Los archivos de esta tanda, ya armados y medidos por sendQuotesToWhatsApp. El orden
  // importa: así el cliente recibe las cotizaciones como estaban en pantalla.
  for (const { archivos } of tanda) {
    for (const { campo, blob, nombre } of archivos) {
      formData.append(campo, blob, nombre)
    }
  }

  // Ojo: no seteamos Content-Type a mano — el navegador arma el boundary de
  // multipart/form-data solo. Si se fuerza el header manualmente, el body queda mal
  // formado y Make no puede parsear los archivos.
  //
  // El POST va a nuestro propio proxy (/api/make-webhook, ver vite.config.js /
  // api/make-webhook.js), NO directo a Make — un Custom Webhook de Make normalmente no
  // responde con headers CORS, así que un fetch directo desde el navegador terminaba
  // recibiendo el WhatsApp igual (Make sí procesaba el POST) pero tirando "Failed to
  // fetch" del lado del cliente antes de poder confirmar el envío, y por eso nunca se
  // marcaba "Incluir Propuesta" en monday.
  const response = await fetchProtegido('/api/make-webhook', {
    method: 'POST',
    body: formData,
  })

  // El escenario puede rechazar el envío por una razón de negocio y contestarla en el
  // cuerpo, con un 200 igual: {"error":"La persona asignada no tiene el celular
  // permitido..."}. Sin mirar el cuerpo eso pasaba por envío exitoso — la oportunidad
  // quedaba marcada como enviada y nadie se enteraba de que el WhatsApp nunca salió.
  const cuerpo = await response.text()
  const errorDeMake = leerErrorDeMake(cuerpo)
  if (errorDeMake) throw new Error(errorDeMake)

  if (!response.ok) {
    // Sin error entendible en el cuerpo queda el código, y el cuerpo crudo si lo hay:
    // "Make.com respondió 500" a secas no le sirve a nadie para saber qué pasó.
    const detalle = cuerpo.trim().slice(0, 300)
    throw new Error(`Make.com respondió ${response.status}${detalle ? `: ${detalle}` : ''}`)
  }
}

// Devuelve el mensaje de error que mandó el escenario, o null si la respuesta no es uno.
// Solo se mira la clave "error": un cuerpo con otra forma (el "Accepted" de siempre, un
// JSON de datos) no es un rechazo y no tiene que frenar nada.
export function leerErrorDeMake(cuerpo) {
  const texto = (cuerpo ?? '').trim()
  if (!texto.startsWith('{')) return null
  try {
    const { error } = JSON.parse(texto)
    return typeof error === 'string' && error.trim() ? error.trim() : null
  } catch {
    // Cuerpo que empieza con "{" pero no es JSON válido: no es un rechazo del escenario.
    return null
  }
}
