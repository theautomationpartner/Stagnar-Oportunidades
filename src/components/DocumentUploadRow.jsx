import { useState } from 'react'
import { MdCheckCircle, MdWarningAmber, MdUploadFile, MdDeleteOutline } from 'react-icons/md'
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
}) {
  const uploaded = Boolean(fileName)
  const busy = uploading || deleting
  const [dragOver, setDragOver] = useState(false)

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
        <span className="doc-upload-row__value">
          {uploading
            ? 'Subiendo...'
            : deleting
              ? 'Eliminando...'
              : uploaded
                ? displayFileName(fileName)
                : 'Falta cargar — arrastrá el archivo acá o'}
        </span>
      </div>
      {!uploaded && !busy && (
        <label className="btn btn--outline doc-upload-row__btn">
          <MdUploadFile /> Subir archivo
          <input type="file" onChange={handleFileChange} hidden />
        </label>
      )}
      {uploaded && !busy && (
        <button
          type="button"
          className="btn btn--outline doc-upload-row__btn doc-upload-row__delete-btn"
          onClick={onDelete}
        >
          <MdDeleteOutline /> Eliminar
        </button>
      )}
      {error && <p className="doc-upload-row__error">Error: {error}</p>}
    </div>
  )
}
