import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MdChevronLeft, MdChevronRight, MdClose, MdDownload, MdInsertDriveFile } from 'react-icons/md'
import { fetchAssetAsFile } from '../services/mondayApi'
import PdfCanvas from './PdfCanvas'
import './VisorArchivos.css'

// A pedido: ver los archivos de un comentario sin salir de la app y descargarlos.
// - Fotos: en grande. La URL de monday (S3) ya está permitida en la CSP (img-src).
// - PDF: con pdf.js (PdfCanvas), igual que en Pólizas — adentro de monday la app corre en
//   un iframe con sandbox y Chrome/Brave bloquean su propio visor de PDF ahí.
// - Otros: no se pueden previsualizar; queda el botón Descargar.
// Las flechas (o ← →) pasan entre los archivos del comentario; Escape cierra.
//
// Se descarga pasando por /api/monday-asset (fetchAssetAsFile): bajarlo directo de S3
// choca con CORS y con el nombre (S3 no respeta el atributo download de otro dominio).

const IMAGENES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
export const tipoDeArchivo = (a) => (IMAGENES.includes(a.extension) ? 'imagen' : a.extension === 'pdf' ? 'pdf' : 'otro')

function descargarBlob(file, nombre) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = nombre || file.name || 'archivo'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function VisorArchivos({ archivos, indiceInicial = 0, onClose }) {
  const [indice, setIndice] = useState(indiceInicial)
  const [pdf, setPdf] = useState({ id: null, archivo: null, error: null })
  const [descargando, setDescargando] = useState(false)
  const [errorDescarga, setErrorDescarga] = useState(null)
  const cerrarRef = useRef(null)
  // Lo ya bajado se reusa: pasar de un archivo a otro y volver, o descargar el PDF que
  // se está mirando, no lo vuelve a pedir.
  const bajadosRef = useRef(new Map())

  const actual = archivos[indice]
  const tipo = actual ? tipoDeArchivo(actual) : null
  const hayVarios = archivos.length > 1

  const bajar = async (a) => {
    if (bajadosRef.current.has(a.id)) return bajadosRef.current.get(a.id)
    const file = await fetchAssetAsFile(a.id, a.nombre)
    if (!file) throw new Error('monday no devolvió el archivo')
    bajadosRef.current.set(a.id, file)
    return file
  }

  const mover = (paso) => setIndice((i) => (i + paso + archivos.length) % archivos.length)

  useEffect(() => {
    cerrarRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'ArrowRight' && hayVarios) mover(1)
      else if (e.key === 'ArrowLeft' && hayVarios) mover(-1)
    }
    // En captura: si no, el Modal de abajo también se cierra con el Escape.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayVarios])

  useEffect(() => {
    setErrorDescarga(null)
    if (tipo !== 'pdf') return undefined
    let vivo = true
    setPdf({ id: actual.id, archivo: null, error: null })
    bajar(actual)
      .then((file) => vivo && setPdf({ id: actual.id, archivo: file, error: null }))
      .catch((err) => vivo && setPdf({ id: actual.id, archivo: null, error: err.message }))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual?.id])

  const descargar = async () => {
    setDescargando(true)
    setErrorDescarga(null)
    try {
      descargarBlob(await bajar(actual), actual.nombre)
    } catch (err) {
      setErrorDescarga(`No se pudo descargar (${err.message}).`)
    } finally {
      setDescargando(false)
    }
  }

  if (!actual) return null

  return createPortal(
    <div className="visor" role="dialog" aria-modal="true" aria-label={`Archivo: ${actual.nombre}`} onClick={onClose}>
      <div className="visor__barra" onClick={(e) => e.stopPropagation()}>
        <span className="visor__nombre" title={actual.nombre}>
          {actual.nombre}
        </span>
        {hayVarios && (
          <span className="visor__contador">
            {indice + 1} / {archivos.length}
          </span>
        )}
        <button type="button" className="visor__boton" onClick={descargar} disabled={descargando}>
          <MdDownload aria-hidden="true" /> {descargando ? 'Descargando...' : 'Descargar'}
        </button>
        <button type="button" ref={cerrarRef} className="visor__boton visor__boton--icono" onClick={onClose} aria-label="Cerrar">
          <MdClose aria-hidden="true" />
        </button>
      </div>
      {errorDescarga && (
        <p className="visor__error" role="alert" onClick={(e) => e.stopPropagation()}>
          {errorDescarga}
        </p>
      )}

      <div className="visor__contenido" onClick={(e) => e.stopPropagation()}>
        {tipo === 'imagen' && <img className="visor__imagen" src={actual.url} alt={actual.nombre} />}
        {tipo === 'pdf' && (
          <div className="visor__pdf">
            {pdf.error ? (
              <p className="visor__mensaje">No se pudo abrir el PDF ({pdf.error}). Probá descargarlo.</p>
            ) : pdf.archivo && pdf.id === actual.id ? (
              <PdfCanvas archivo={pdf.archivo} titulo={actual.nombre} />
            ) : (
              <p className="visor__mensaje">Trayendo el PDF...</p>
            )}
          </div>
        )}
        {tipo === 'otro' && (
          <div className="visor__otro">
            <MdInsertDriveFile aria-hidden="true" />
            <p>Este tipo de archivo no se puede ver acá.</p>
            <button type="button" className="visor__boton" onClick={descargar} disabled={descargando}>
              <MdDownload aria-hidden="true" /> Descargar
            </button>
          </div>
        )}
      </div>

      {hayVarios && (
        <>
          <button
            type="button"
            className="visor__flecha visor__flecha--izq"
            aria-label="Archivo anterior"
            onClick={(e) => {
              e.stopPropagation()
              mover(-1)
            }}
          >
            <MdChevronLeft />
          </button>
          <button
            type="button"
            className="visor__flecha visor__flecha--der"
            aria-label="Archivo siguiente"
            onClick={(e) => {
              e.stopPropagation()
              mover(1)
            }}
          >
            <MdChevronRight />
          </button>
        </>
      )}
    </div>,
    document.body
  )
}
