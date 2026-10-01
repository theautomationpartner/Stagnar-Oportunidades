// Prepara un archivo antes de mandarlo al servidor: achica las fotos y, si aun así no
// entra, corta con un mensaje que se entienda.
//
// El problema: todo lo que sube la app pasa por una función serverless de Vercel
// (/api/monday-file, /api/leer-carta-automovil, /api/leer-cedula) y Vercel rechaza
// cualquier request cuyo cuerpo pase los 4,5 MB. El rechazo pasa EN EL BORDE, antes de
// que corra una línea del handler, así que la respuesta no es un JSON de monday y el
// error salía como "No se pudo hablar con monday (HTTP 413)" — que no le dice nada a
// nadie. Una foto de una Carta de Automóvil sacada con el celular pasa los 4,5 MB sin
// esfuerzo.
//
// No se notaba en desarrollo: ahí /api/monday-file es un middleware de Vite
// (mondayFileProxy en vite.config.js) y no tiene límite de tamaño.

// El tope real de Vercel.
export const LIMITE_SUBIDA_BYTES = 4.5 * 1024 * 1024

// El archivo no viaja solo: va adentro de un multipart junto con la query de GraphQL,
// los boundaries y los headers de cada parte. Se reserva un margen para que un archivo de
// 4,49 MB no termine igual en 413 por culpa del envoltorio.
const MARGEN_MULTIPART = 128 * 1024
const LIMITE_EFECTIVO = LIMITE_SUBIDA_BYTES - MARGEN_MULTIPART

// Lado largo al que se achican las fotos. El escenario de Make que lee la Carta Automóvil
// manda las imágenes directo a Claude (ver la rama "es JPG" del blueprint) y la API de
// Anthropic ya redimensiona sola cualquier imagen a ~1568 px de lado largo antes de
// leerla. 2000 px deja margen por encima de eso (el archivo también queda guardado en
// monday como respaldo y conviene que se pueda ampliar un poco) sin acercarse ni de lejos
// al límite de tamaño.
const MAX_LADO = 2000

// Por debajo de esto no se toca nada: no tiene sentido re-encodear —y perder calidad— un
// archivo que ya entra cómodo.
const UMBRAL_COMPRIMIR = 1.5 * 1024 * 1024

// 0.85 es el punto donde el JPEG deja de verse distinto a simple vista pero el archivo ya
// pesa una fracción. Más abajo empiezan a aparecer artefactos en los bordes de las letras,
// que es justo lo que tiene que leer la IA.
const CALIDAD_JPEG = 0.85

export function esImagen(file) {
  return typeof file?.type === 'string' && file.type.startsWith('image/')
}

function enMegas(bytes) {
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',')
}

// Decodifica respetando la orientación EXIF. Sin esto, una foto sacada con el celular en
// vertical se dibuja acostada en el canvas (el celular no rota los píxeles, deja una
// marca que dice cómo mostrarlos) — y una Carta de Automóvil de costado es más difícil de
// leer, tanto para una persona como para la IA.
async function decodificar(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Safari viejo no soporta la opción: se reintenta sin ella antes de caer al <img>.
      try {
        return await createImageBitmap(file)
      } catch {
        // sigue abajo
      }
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}

// Mismo nombre pero terminado en .jpg. Importa de verdad: el escenario de Make rutea por
// la EXTENSIÓN del nombre (endswith .jpg/.jpeg/.png), y Make le declara a la API de Claude
// un media_type derivado de ahí. Un archivo llamado "foto.png" con bytes JPEG adentro hace
// que Anthropic rechace la llamada por no coincidir el tipo declarado con el contenido.
function nombreJpg(nombre) {
  return `${(nombre || 'archivo').replace(/\.[^.]+$/, '')}.jpg`
}

async function comprimirImagen(file) {
  const bitmap = await decodificar(file)
  const { width, height } = bitmap
  if (!width || !height) throw new Error('Imagen sin dimensiones')

  const escala = Math.min(1, MAX_LADO / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * escala)
  canvas.height = Math.round(height * escala)
  const ctx = canvas.getContext('2d')
  // El JPEG no tiene transparencia: sin esto, lo que era transparente en un PNG queda
  // negro. Fondo blanco, que es lo que uno espera de un documento escaneado.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG))
  if (!blob) throw new Error('No se pudo convertir la imagen')
  return new File([blob], nombreJpg(file.name), { type: 'image/jpeg', lastModified: Date.now() })
}

// Punto único por el que pasan todas las subidas (ver uploadFileToColumn,
// leerCartaAutomovil y leerCedula en mondayApi.js).
//
// - Imagen grande: se achica y se devuelve como .jpg.
// - Imagen chica, PDF, o cualquier otra cosa: se devuelve tal cual.
// - Si después de todo eso sigue sin entrar: se tira un error que dice cuánto pesa y qué
//   hacer, en vez de dejar que Vercel conteste un 413 pelado.
//
// Si la compresión falla por lo que sea (un HEIC de iPhone que el navegador no sabe
// decodificar, un canvas que no se pudo crear) se sigue con el archivo original: que no se
// haya podido achicar no es razón para impedir una subida que quizás entraba igual.
export async function prepararArchivoParaSubir(file) {
  if (!file) return file

  let listo = file
  if (esImagen(file) && file.size > UMBRAL_COMPRIMIR) {
    try {
      const comprimido = await comprimirImagen(file)
      // Solo se usa si de verdad sirvió. Una imagen ya optimizada puede salir MÁS pesada
      // después de re-encodearla, y en ese caso el original es mejor.
      if (comprimido.size < file.size) listo = comprimido
    } catch (err) {
      console.warn('No se pudo comprimir la imagen, se sube como está', err)
    }
  }

  if (listo.size > LIMITE_EFECTIVO) {
    throw new Error(
      `El archivo pesa ${enMegas(listo.size)} MB y el máximo que se puede subir es ${enMegas(LIMITE_SUBIDA_BYTES)} MB. ` +
        (esImagen(listo)
          ? 'Probá sacar la foto con menos resolución.'
          : 'Si es un PDF escaneado, exportalo con menos calidad o sacale una foto.')
    )
  }
  return listo
}
