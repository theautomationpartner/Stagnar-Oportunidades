import { useState } from 'react'
import { MdClose, MdSend, MdWarningAmber, MdCheckCircle } from 'react-icons/md'
import { sendQuotesToWhatsApp, getMakeWebhookUrl } from '../services/makeWebhook'
import './WhatsAppSendModal.css'

export default function WhatsAppSendModal({ opportunity, images, onClose, onSent }) {
  const [phone, setPhone] = useState(opportunity.telefono || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const webhookConfigured = Boolean(getMakeWebhookUrl())

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      await sendQuotesToWhatsApp({ phone, opportunity, images })
      setSent(true)
      await onSent?.(images)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="wa-modal__overlay" onClick={onClose}>
      <div className="wa-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wa-modal__head">
          <h2>Enviar por WhatsApp</h2>
          <button className="wa-modal__close" type="button" onClick={onClose} aria-label="Cerrar">
            <MdClose />
          </button>
        </div>

        {!webhookConfigured && (
          <div className="wa-modal__warning">
            <MdWarningAmber /> Falta configurar <code>VITE_MAKE_WEBHOOK_URL</code> en{' '}
            <code>app/.env</code> con la URL del webhook de Make.com. Podés previsualizar las
            imágenes, pero todavía no se puede enviar.
          </div>
        )}

        {sent ? (
          <div className="wa-modal__success">
            <MdCheckCircle /> Enviado a Make.com correctamente.
          </div>
        ) : (
          <>
            <label className="wa-modal__field">
              <span>Número de teléfono</span>
              <input
                type="text"
                placeholder="Ej: 099 123 456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>

            <div className="wa-modal__preview-label">
              Previsualización ({images.length} {images.length === 1 ? 'imagen' : 'imágenes'})
            </div>
            <div className="wa-modal__preview-grid">
              {images.map(({ raw, imageDataUrl }) => (
                <div className="wa-modal__preview-item" key={raw.id}>
                  <img src={imageDataUrl} alt={`${raw.compania} ${raw.cobertura}`} />
                  <span>
                    {raw.compania} · {raw.cobertura || raw.name}
                  </span>
                </div>
              ))}
            </div>

            {error && <p className="wa-modal__error">Error: {error}</p>}

            <div className="wa-modal__actions">
              <button className="btn btn--outline" type="button" onClick={onClose}>
                Cancelar
              </button>
              <button
                className="btn btn--whatsapp"
                type="button"
                onClick={handleSend}
                disabled={sending || !phone || !webhookConfigured}
              >
                <MdSend /> {sending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
