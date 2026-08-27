import { useEffect, useState } from 'react'
import { MdFolder } from 'react-icons/md'
import FileUploadField from './FileUploadField'
import {
  CLIENTES_BOARD_ID,
  CONTACTO_ARCHIVOS_COLUMN_ID,
  fetchFileColumnAssets,
  fetchAssetAsFile,
  uploadFileToColumn,
  removeFileFromColumn,
} from '../services/mondayApi'

// A pedido: documentos genéricos del Cliente (columna "Archivos" del tablero Clientes,
// varios por ítem). Dos modos:
// - `contactoId` presente (Cliente/Lead ya existente): lista lo que ya tiene en monday,
//   y subir/eliminar escribe DIRECTO en el ítem real (mismo criterio que "Editar
//   cliente", no espera al guardado de la Oportunidad).
// - sin `contactoId` (Lead nuevo, todavía no existe en monday): los archivos quedan en
//   memoria (`pendingFiles`/`onPendingChange`) y los sube CrearOportunidadForm al final
//   del guardado, recién con el id creado — mismo patrón que Cédula/Carta Automóvil.
// Un FileUploadField por archivo (misma fila mini que el resto de la app) + uno vacío
// al final para agregar el siguiente.
// `tipo`: 'cliente' | 'lead' — a pedido, el texto distingue qué es la persona: un Lead
// nuevo (o existente) no es un Cliente todavía, aunque el ítem viva en el tablero Clientes.
export default function ClienteArchivos({ contactoId, tipo = 'lead', pendingFiles = [], onPendingChange }) {
  const quien = tipo === 'cliente' ? 'del cliente' : 'del lead'
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingAssetId, setDeletingAssetId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!contactoId) {
      setFiles([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    fetchFileColumnAssets(contactoId, CONTACTO_ARCHIVOS_COLUMN_ID)
      .then((list) => {
        if (!cancelled) setFiles(list)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [contactoId])

  const handleUpload = async (file) => {
    setError(null)
    if (!contactoId) {
      onPendingChange?.([...pendingFiles, file])
      return
    }
    setUploading(true)
    try {
      await uploadFileToColumn(contactoId, CONTACTO_ARCHIVOS_COLUMN_ID, file)
      setFiles(await fetchFileColumnAssets(contactoId, CONTACTO_ARCHIVOS_COLUMN_ID))
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (asset) => {
    setError(null)
    setDeletingAssetId(asset.assetId)
    try {
      const keep = files.filter((f) => f.assetId !== asset.assetId)
      await removeFileFromColumn(contactoId, CONTACTO_ARCHIVOS_COLUMN_ID, CLIENTES_BOARD_ID, keep)
      setFiles(keep)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingAssetId(null)
    }
  }

  const handleDeletePending = (index) => {
    onPendingChange?.(pendingFiles.filter((_, i) => i !== index))
  }

  return (
    <div className="crear-op__section cliente-archivos">
      <div className="crear-op__section-title-row">
        <span className="crear-op__section-icon">
          <MdFolder />
        </span>
        <h3 className="crear-op__section-title">Documentos {quien}</h3>
      </div>
      <p className="crear-op__risk-subtitle">
        Archivos genéricos de la persona (comprobantes, contratos, etc.). Quedan en su ficha,
        no en esta oportunidad.
      </p>
      {error && <p className="crear-op__error">Error: {error}</p>}
      {loading && <p className="crear-op__risk-subtitle">Cargando documentos...</p>}
      {files.map((asset) => (
        <FileUploadField
          key={asset.assetId}
          label="Documento"
          required={false}
          fileName={asset.name}
          onFetchFile={() => fetchAssetAsFile(asset.assetId, asset.name)}
          deleting={deletingAssetId === asset.assetId}
          onDelete={() => handleDelete(asset)}
          showReplaceButton={false}
          compactDelete
        />
      ))}
      {pendingFiles.map((file, index) => (
        <FileUploadField
          key={`${file.name}-${index}`}
          label="Documento (se sube al guardar)"
          required={false}
          file={file}
          onDelete={() => handleDeletePending(index)}
          showReplaceButton={false}
          compactDelete
        />
      ))}
      <FileUploadField
        label="Agregar documento"
        required={false}
        uploading={uploading}
        missingMessage="Ningún documento cargado todavía"
        buttonLabel="Adjuntar documento"
        onUpload={handleUpload}
      />
    </div>
  )
}
