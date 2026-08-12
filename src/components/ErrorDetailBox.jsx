import './ErrorDetailBox.css'

// Caja de detalle de error reusada en Cotizar/Emitir/Confirmar/WhatsApp/Crear
// Oportunidad — antes era el mismo bloque (título + <pre>) copiado y pegado con una
// clase distinta por archivo (ver auditoría de estilo).
export default function ErrorDetailBox({
  detail,
  title = 'Detalle del error (último update en la oportunidad):',
  className,
}) {
  if (!detail) return null

  return (
    <div className={['error-detail-box', className].filter(Boolean).join(' ')}>
      <strong>{title}</strong>
      <pre>{detail}</pre>
    </div>
  )
}
