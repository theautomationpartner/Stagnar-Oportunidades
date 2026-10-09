// A pedido: los PDF (cotización y póliza) se dibujan con pdf.js en vez de mostrarse en un
// <iframe>. Adentro de monday la app corre en un iframe con `sandbox`, y Chromium (Chrome,
// Brave, Edge) no ejecuta su visor de PDF en un frame con sandbox: lo muestra como
// "bloqueado". pdf.js pinta cada página en un <canvas> de la propia app, así que funciona
// en cualquier navegador y no depende de la política de seguridad para frames.
//
// La librería se carga recién al abrir un PDF (import dinámico): no pesa en la carga
// inicial. El worker sale del propio bundle (mismo origen, lo permite script-src 'self').
import { useEffect, useRef, useState } from 'react'
import './PdfCanvas.css'

let pdfjsPromesa = null
function cargarPdfjs() {
  if (!pdfjsPromesa) {
    pdfjsPromesa = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
      ([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        return pdfjs
      }
    )
  }
  return pdfjsPromesa
}

// archivo: Blob/File del PDF. Devuelve el alto que necesita (scroll adentro del contenedor).
export default function PdfCanvas({ archivo, titulo }) {
  const contenedorRef = useRef(null)
  const [estado, setEstado] = useState('cargando') // 'cargando' | 'listo' | 'error'
  const [error, setError] = useState(null)
  const [paginas, setPaginas] = useState(0)

  useEffect(() => {
    if (!archivo) return undefined
    let vivo = true
    let documento = null
    setEstado('cargando')
    setError(null)
    const contenedor = contenedorRef.current
    contenedor.replaceChildren()
    ;(async () => {
      try {
        const pdfjs = await cargarPdfjs()
        const datos = new Uint8Array(await archivo.arrayBuffer())
        // isEvalSupported: false → nada de eval (la política de seguridad no lo permite).
        documento = await pdfjs.getDocument({ data: datos, isEvalSupported: false }).promise
        if (!vivo) return
        setPaginas(documento.numPages)
        const ancho = Math.max(320, contenedor.clientWidth - 24)
        const nitidez = window.devicePixelRatio || 1
        for (let n = 1; n <= documento.numPages; n++) {
          const pagina = await documento.getPage(n)
          if (!vivo) return
          const base = pagina.getViewport({ scale: 1 })
          const viewport = pagina.getViewport({ scale: (ancho / base.width) * nitidez })
          const canvas = document.createElement('canvas')
          canvas.className = 'pdf-canvas__pagina'
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = Math.floor(viewport.width / nitidez) + 'px'
          canvas.setAttribute('aria-label', `${titulo ?? 'PDF'} — página ${n} de ${documento.numPages}`)
          contenedor.appendChild(canvas)
          await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
          // La primera página ya se ve: no hace falta esperar a todas.
          if (n === 1 && vivo) setEstado('listo')
        }
      } catch (err) {
        if (vivo) {
          setError(err?.message || 'No se pudo leer el PDF')
          setEstado('error')
        }
      }
    })()
    return () => {
      vivo = false
      documento?.destroy()
    }
  }, [archivo, titulo])

  return (
    <div className="pdf-canvas" role="document" aria-label={titulo} aria-busy={estado === 'cargando'}>
      {estado === 'cargando' && <p className="pdf-canvas__mensaje">Dibujando el PDF…</p>}
      {estado === 'error' && <p className="pdf-canvas__mensaje pdf-canvas__mensaje--error">No se pudo mostrar el PDF: {error}</p>}
      <div ref={contenedorRef} className="pdf-canvas__paginas" />
      {estado === 'listo' && paginas > 1 && <p className="pdf-canvas__pie">{paginas} páginas</p>}
    </div>
  )
}
