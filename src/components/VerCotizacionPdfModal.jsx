// A pedido: en los pasos 1 y 2 de la oportunidad, una vez cotizada, se puede ver el PDF
// de la cotización (columna "Cotizacion", file_mm54css0). Cada recotización suma uno: se
// muestra el MÁS NUEVO (ver fetchUltimoArchivoDeColumna). El archivo se baja por el proxy
// del servidor y se dibuja con pdf.js (ver PdfCanvas): en un <iframe>, adentro de monday,
// Chrome y Brave lo bloquean. "Abrir en otra pestaña" sí usa el visor del navegador.
// Solo lectura.
import { useEffect, useState } from 'react'
import { Modal, ModalContent, ModalFooter } from '@vibe/core'
import { MdOpenInNew } from 'react-icons/md'
import { fetchAssetAsFile, fetchUltimoArchivoDeColumna } from '../services/mondayApi'
import PdfCanvas from './PdfCanvas'
import './CrearOportunidadForm.css'
import './VerCotizacionPdfModal.css'

const COTIZACION_PDF_COLUMN_ID = 'file_mm54css0'

export default function VerCotizacionPdfModal({ opportunityId, onClose }) {
  const [archivo, setArchivo] = useState(null)
  const [url, setUrl] = useState(null)
  const [blob, setBlob] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    let creada = null
    fetchUltimoArchivoDeColumna(opportunityId, COTIZACION_PDF_COLUMN_ID)
      .then(async (ultimo) => {
        if (!ultimo) throw new Error('Esta oportunidad todavía no tiene el PDF de la cotización.')
        if (vivo) setArchivo(ultimo)
        const f = await fetchAssetAsFile(ultimo.assetId, ultimo.name)
        if (!f) throw new Error('monday no devolvió el archivo')
        if (!vivo) return
        // Sin "application/pdf" el navegador lo descargaría en vez de mostrarlo.
        const pdf = f.type === 'application/pdf' ? f : new Blob([f], { type: 'application/pdf' })
        creada = URL.createObjectURL(pdf)
        setBlob(pdf)
        setUrl(creada)
      })
      .catch((err) => vivo && setError(err.message))
    return () => {
      vivo = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [opportunityId])

  return (
    <Modal id="ver-cotizacion-pdf-modal" show onClose={onClose} size="large">
      <ModalContent className="crear-op__editar-contacto-content ver-cot-pdf">
        <div className="ver-cot-pdf__barra">
          <div>
            <h2 className="ver-cot-pdf__titulo">Cotización en PDF</h2>
            {archivo && (
              <span className="ver-cot-pdf__detalle">
                {archivo.name}
                {archivo.cantidad > 1 && ` · la más nueva de ${archivo.cantidad}`}
              </span>
            )}
          </div>
          {url && (
            <a className="ver-cot-pdf__abrir" href={url} target="_blank" rel="noreferrer">
              <MdOpenInNew aria-hidden="true" /> Abrir en otra pestaña
            </a>
          )}
        </div>
        <div className="ver-cot-pdf__marco">
          {error ? (
            <p className="ver-cot-pdf__mensaje ver-cot-pdf__mensaje--error">No se pudo traer el PDF: {error}</p>
          ) : !url ? (
            <p className="ver-cot-pdf__mensaje">Trayendo el PDF de la cotización...</p>
          ) : (
            <PdfCanvas archivo={blob} titulo={'PDF de la cotización: ' + (archivo?.name ?? '')} />
          )}
        </div>
      </ModalContent>
      <ModalFooter primaryButton={{ text: 'Cerrar', onClick: onClose }} />
    </Modal>
  )
}
