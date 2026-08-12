import { useEffect, useRef, useState } from 'react'
import { MdUploadFile, MdClose, MdCheckCircle, MdWarningAmber, MdZoomIn, MdDeleteOutline } from 'react-icons/md'
import { Button, IconButton, Loader } from '@vibe/core'
import './FileUploadField.css'

// El `text`/nombre de una columna "file" de monday no es el nombre del archivo cuando
// viene como URL completa (`protected_static/.../<archivo>`, pasa una vez que se
// refetchea desde la API) — normaliza a un nombre legible. Recién subido (mismo tick,
// sin refetch) ya viene como nombre de archivo simple, esto no le hace nada raro.
function displayFileName(value) {
  if (!value) return ''
  try {
    const { pathname } = new URL(value)
    return decodeURIComponent(pathname.split('/').pop() || value)
  } catch {
    return value
  }
}

// Campo de archivo ÚNICO para toda la app — antes había 2 implementaciones con estilo y
// comportamiento levemente distintos (FileField, adentro de CrearOportunidadForm.jsx; y
// DocumentUploadRow, para Libreta/Cédula/Carta/Póliza) — a pedido, ahora es el mismo
// componente en todos lados: mismos colores por estado (verde = cargado, naranja
// punteado = falta, azul = arrastrando encima), mismo botón, y la misma
// previsualización con lightbox en cualquiera de los 2 casos reales:
// - `file` (objeto File ya en memoria — recién elegido a mano, o autocompletado): la
//   preview está lista de una (createObjectURL).
// - `fileName` (ya subido a monday en una sesión anterior, todavía no se bajaron los
//   bytes): sin descargar nada hasta que el usuario toca "ver más grande" — recién ahí
//   se llama `onFetchFile` (fire bajo demanda, no en cada render) para bajar el archivo
//   real y armar el lightbox. Si no es una imagen (ej. un PDF), se abre en una pestaña
//   nueva en vez de un lightbox roto.
export default function FileUploadField({
  label,
  file,
  fileName,
  onFetchFile,
  required = true,
  fullWidth = false,
  highlighted = false,
  prominent = false,
  helperText,
  buttonLabel,
  uploading = false,
  deleting = false,
  error,
  missingMessage,
  onUpload,
  onDelete,
  // A pedido: casos reales distintos — Cédula Identidad (CrearOportunidadForm) permite
  // reemplazar el archivo directo ("Cambiar archivo") ADEMÁS de poder sacarlo del todo;
  // Libreta/Cédula/Carta/Póliza (antes DocumentUploadRow) no — hay que eliminar primero
  // y recién ahí se puede subir uno nuevo. `true` (default) mantiene el primer
  // comportamiento; los call sites del segundo caso lo pasan en `false`.
  showReplaceButton = true,
  compactDelete = false,
  // A pedido: CrearOportunidadForm necesita que este botón diga "Eliminar archivo y
  // reintentar" (deja explícito que sacar el archivo es el primer paso para volver a
  // intentar la lectura automática) — en vez de otro texto fijo a mano, se puede pisar
  // acá sin tocar el resto de los call sites (que se quedan con el "Eliminar" de
  // siempre).
  deleteLabel = 'Eliminar',
  extraActions,
  disabled = false,
}) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [fetchingPreview, setFetchingPreview] = useState(false)
  const [remoteFile, setRemoteFile] = useState(null)

  const busy = uploading || deleting
  const uploaded = Boolean(file || fileName)
  const displayName = file ? file.name : displayFileName(fileName)

  // Preview de un File en memoria (elegido a mano o ya bajado con onFetchFile) — un PDF
  // no se puede mostrar como thumbnail sin una librería aparte, ahí solo se ve el
  // nombre (o se abre en pestaña nueva, ver handleOpenPreview).
  const previewSource = file || remoteFile
  useEffect(() => {
    if (!previewSource || !previewSource.type?.startsWith('image/')) {
      setPreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(previewSource)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [previewSource])

  // Al cambiar de archivo (nuevo upload, se sacó, o cambió de qué oportunidad estamos
  // mostrando) se olvida cualquier descarga anterior — si no, "ver más grande" podría
  // mostrar el archivo de otra fila por un instante.
  useEffect(() => {
    setRemoteFile(null)
  }, [fileName])

  const handleFileChange = (e) => {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (picked) onUpload?.(picked)
  }

  const handleDragOver = (e) => {
    if (uploaded || busy || disabled) return
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (uploaded || busy || disabled) return
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) onUpload?.(dropped)
  }

  // preventDefault/stopPropagation en los 3 handlers de acá abajo: todo esto vive
  // DENTRO del <label> que abre el selector de archivos con cualquier click adentro —
  // sin esto, ver la preview (o cerrarla) también dispararía el selector de atrás.
  const handleOpenPreview = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (previewUrl) {
      setShowPreview(true)
      return
    }
    if (!onFetchFile || fetchingPreview) return
    setFetchingPreview(true)
    try {
      const fetched = await onFetchFile()
      if (fetched?.type?.startsWith('image/')) {
        setRemoteFile(fetched)
        setShowPreview(true)
      } else if (fetched) {
        window.open(URL.createObjectURL(fetched), '_blank', 'noopener')
      }
    } catch {
      // Silencioso — si falla la descarga, el usuario sigue viendo el nombre del
      // archivo como si nada, puede reintentar tocando de nuevo.
    } finally {
      setFetchingPreview(false)
    }
  }

  const closePreview = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setShowPreview(false)
  }

  // El fondo/borde reflejan si HAY archivo o no (uploaded), no si está ocupado en este
  // instante — subiendo uno nuevo se sigue viendo "falta" hasta que termina, eliminando
  // uno se sigue viendo "cargado" hasta que termina (mismo criterio que ya tenía
  // DocumentUploadRow). `busy` solo cambia el ícono/texto de adentro.
  const status = uploaded ? 'ok' : 'missing'
  const canPreview = uploaded && !busy && (previewUrl || onFetchFile)

  const boxClassName = [
    'file-field',
    prominent && 'file-field--prominent',
    `file-field--${status}`,
    dragOver && 'file-field--drag-over',
    highlighted && 'file-field--highlighted',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={fullWidth ? 'crear-op__field crear-op__field--full' : 'crear-op__field'}>
      {label && (
        <span>
          {label}
          {required ? ' *' : ''}
        </span>
      )}
      <div className={boxClassName} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <input
          ref={inputRef}
          type="file"
          className="file-field__input"
          onChange={handleFileChange}
          disabled={disabled || busy}
        />
        {prominent && !uploaded && helperText && <p className="file-field__helper">{helperText}</p>}

        <div className="file-field__info">
          {busy ? (
            <Loader size={16} className="file-field__spinner" />
          ) : canPreview ? (
            <button type="button" className="file-field__preview-btn" onClick={handleOpenPreview} aria-label="Ver imagen más grande">
              {previewUrl ? (
                <img className="file-field__preview" src={previewUrl} alt="" />
              ) : (
                <span className="file-field__preview file-field__preview--icon">
                  {fetchingPreview ? <Loader size={14} /> : <MdCheckCircle />}
                </span>
              )}
              <span className="file-field__preview-zoom">
                <MdZoomIn />
              </span>
            </button>
          ) : uploaded ? (
            <MdCheckCircle />
          ) : (
            <MdWarningAmber />
          )}
          {(uploading || deleting || uploaded || missingMessage) && (
            <span className="file-field__value">
              {uploading ? 'Subiendo...' : deleting ? 'Eliminando...' : uploaded ? displayName : missingMessage}
              {highlighted && <span className="file-field__autofill-tag"> · autocompletado</span>}
            </span>
          )}
        </div>

        {!uploaded && !busy && (
          <Button
            kind={prominent ? 'primary' : 'secondary'}
            className="file-field__btn"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            <MdUploadFile /> {buttonLabel || 'Subir archivo'}
          </Button>
        )}

        {uploaded && !busy && onUpload && showReplaceButton && (
          <Button kind="secondary" className="file-field__btn" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <MdUploadFile /> {buttonLabel || 'Cambiar archivo'}
          </Button>
        )}

        {uploaded &&
          !busy &&
          onDelete &&
          (compactDelete ? (
            <IconButton className="file-field__delete-icon-btn" icon={MdClose} onClick={onDelete} aria-label={`Eliminar ${label || 'archivo'}`} />
          ) : (
            <Button kind="secondary" className="file-field__btn file-field__delete-btn" onClick={onDelete}>
              <MdDeleteOutline /> {deleteLabel}
            </Button>
          ))}

        {extraActions}
      </div>

      {error && <p className="file-field__error">Error: {error}</p>}

      {showPreview && previewUrl && (
        <div className="file-field__lightbox" onClick={closePreview}>
          <button type="button" className="file-field__lightbox-close" onClick={closePreview} aria-label="Cerrar">
            <MdClose />
          </button>
          <img
            className="file-field__lightbox-img"
            src={previewUrl}
            alt=""
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          />
        </div>
      )}
    </label>
  )
}
