// Algunas compañías entregan la póliza como un ".pdf" que en realidad es el cuerpo crudo
// de un envío de formulario web: arranca con "------=_Part_…", unos encabezados
// (Content-Type: application/pdf, form-data; name="base64Content"), recién después el
// PDF, y al final otra vez el separador. Chrome lo abre igual —busca "%PDF" un poco más
// adelante—, así que a simple vista está bien, pero la IA del escenario de validación lo
// rechaza ("The PDF specified was not valid") y la validación quedaba colgada.
//
// Acá se le saca el sobre: desde "%PDF-" hasta justo antes del separador del final. Un
// PDF normal (que empieza con "%PDF-") pasa tal cual, sin tocar un byte: hay PDFs válidos
// con datos después del último "%%EOF", así que no se recorta por ahí.
const BUSCAR_INICIO_EN = 4096

export async function limpiarPdf(file) {
  if (!/\.pdf$/i.test(file?.name ?? '') && file?.type !== 'application/pdf') return file
  const bytes = new Uint8Array(await file.arrayBuffer())
  const texto = new TextDecoder('latin1').decode(bytes)
  const inicio = texto.indexOf('%PDF-')
  if (inicio < 0 || inicio > BUSCAR_INICIO_EN) {
    throw new Error(`«${file.name}» no es un PDF válido. Descargá la póliza de nuevo desde la compañía y volvé a subirla.`)
  }
  if (inicio === 0) return file

  // El separador es la primera línea del sobre ("------=_Part_…"); al final aparece otra
  // vez (con "--" de cierre), precedido por un salto de línea que tampoco es del PDF.
  let fin = bytes.length
  const separador = texto.slice(0, texto.indexOf('\n')).trim()
  if (separador.startsWith('--')) {
    const ultimo = texto.lastIndexOf(separador)
    if (ultimo > inicio) {
      fin = ultimo
      if (texto[fin - 1] === '\n') fin -= 1
      if (texto[fin - 1] === '\r') fin -= 1
    }
  }
  return new File([bytes.subarray(inicio, fin)], file.name, { type: 'application/pdf', lastModified: file.lastModified })
}
