import './ProgressBar.css'

// Barra de progreso reusada por los modales de "automatización en curso"
// (CotizandoModal, WhatsAppSendModal) — antes cada uno definía el mismo track/fill
// con su propia clase (ver auditoría de estilo).
export default function ProgressBar({ percent = 0, className }) {
  return (
    <div className={['progress-bar__track', className].filter(Boolean).join(' ')}>
      <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
    </div>
  )
}
