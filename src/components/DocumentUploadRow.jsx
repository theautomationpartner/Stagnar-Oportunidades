import { useRef, useState } from 'react'
import { MdCheckCircle, MdWarningAmber, MdUploadFile, MdDeleteOutline, MdClose } from 'react-icons/md'
import { Button, IconButton } from '@vibe/core'
import './DocumentUploadRow.css'

// El `text` de una columna "file" de monday no es el nombre del archivo — es la URL
// completa a `protected_static/.../<archivo>` una vez que se refetchea desde la API
// (inmediatamente después de subir, en cambio, mostramos `file.name` tal cual, sin
// refetch). Esto normaliza ambos casos a un nombre de archivo legible.
function displayFileName(value) {
  if (!value) return ''
  try {
    const { pathname } = new URL(value)
    return decodeURIComponent(pathname.split('/').pop() || value)
  } catch {
    return value
  }
}

// Fila reutilizable para verificar/subir/eliminar un documento en una columna "file" de
// monday — usada por Libreta de Conducir / Carta Automóvil (paso 3) y Póliza (paso 4):
// tilde si ya se cargó (con botón "Eliminar"), o zona de arrastrar-y-soltar + botón de
// subida si falta, con spinner mientras sube/elimina y tilde apenas confirma la mutation
// (`add_file_to_column` / `update_assets_on_item`), sin esperar a un refetch.
export default function DocumentUploadRow({
  label,
  fileName,
  uploading,
  deleting,
  error,
  onUpload,
  onDelete,
  compactDelete,
}) {
  const uploaded = Boolean(fileName)
  const busy = uploading || deleting
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onUpload(file)
  }

  const handleDragOver = (e) => {
    if (uploaded || busy) return
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (uploaded || busy) return
    const file = e.dataTransfer.files?.[0]
    if (file) onUpload(file)
  }

  const rowClassName = [
    'doc-upload-row',
    uploaded ? 'doc-upload-row--ok' : 'doc-upload-row--missing',
    dragOver && 'doc-upload-row--drag-over',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={rowClassName}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="doc-upload-row__info">
        {busy ? (
          <span className="doc-upload-row__spinner" aria-hidden="true" />
        ) : uploaded ? (
          <MdCheckCircle />
        ) : (
          <MdWarningAmber />
        )}
        <span className="doc-upload-row__label">{label}</span>
        {(uploading || deleting || uploaded) && (
          <span className="doc-upload-row__value">
            {uploading ? 'Subiendo...' : deleting ? 'Eliminando...' : displayFileName(fileName)}
          </span>
        )}
      </div>
      {/* El input real queda oculto — el Button nativo dispara el selector de
          archivos del sistema operativo haciendo click en él por ref, en vez
          de depender de un <label> envolviendo un <input hidden> (patrón viejo,
          incompatible con Button como componente). */}
      <input ref={fileInputRef} type="file" onChange={handleFileChange} hidden />
      {!uploaded && !busy && (
        <Button kind="secondary" className="doc-upload-row__btn" onClick={() => fileInputRef.current?.click()}>
          <MdUploadFile /> Subir archivo
        </Button>
      )}
      {uploaded &&
        !busy &&
        (compactDelete ? (
          <IconButton
            className="doc-upload-row__delete-icon-btn"
            icon={MdClose}
            onClick={onDelete}
            aria-label="Eliminar documento"
          />
        ) : (
          <Button
            kind="secondary"
            className="doc-upload-row__btn doc-upload-row__delete-btn"
            onClick={onDelete}
          >
            <MdDeleteOutline /> Eliminar
          </Button>
        ))}
      {error && <p className="doc-upload-row__error">Error: {error}</p>}
    </div>
  )
}
