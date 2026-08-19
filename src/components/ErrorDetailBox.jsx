import './ErrorDetailBox.css'

// Caja de detalle de error reusada en Cotizar/Emitir/Confirmar/WhatsApp/Crear
// Oportunidad — antes era el mismo bloque (título + <pre>) copiado y pegado con una
// clase distinta por archivo (ver auditoría de estilo).
// A pedido: sin título por defecto — antes decía "Detalle del error (último update en
// la oportunidad):", una aclaración interna de dónde sale el texto que no le sirve a
// quien lo lee. `title` se puede seguir pasando puntualmente donde sí haga falta.
export default function ErrorDetailBox({ detail, title, className }) {
  if (!detail) return null

  return (
    <div className={['error-detail-box', className].filter(Boolean).join(' ')}>
      {title && <strong>{title}</strong>}
      <pre>{detail}</pre>
    </div>
  )
}
