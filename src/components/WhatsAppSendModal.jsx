import { useState } from 'react'
import { MdSend, MdCheckCircle } from 'react-icons/md'
import { Modal, ModalHeader, ModalContent, ModalFooter, AttentionBox } from '@vibe/core'
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
    <Modal id="whatsapp-send-modal" show onClose={onClose} size="medium">
      <ModalHeader title="Enviar por WhatsApp" />
      <ModalContent>
        {!webhookConfigured && (
          <AttentionBox type="warning">
            Falta configurar <code>VITE_MAKE_WEBHOOK_URL</code> en <code>app/.env</code> con la URL
            del webhook de Make.com. Podés previsualizar las imágenes, pero todavía no se puede
            enviar.
          </AttentionBox>
        )}

        {sent ? (
          <AttentionBox type="positive">
            <MdCheckCircle /> Enviado a Make.com correctamente.
          </AttentionBox>
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
          </>
        )}
      </ModalContent>

      {!sent && (
        <ModalFooter
          primaryButton={{
            text: sending ? 'Enviando...' : 'Enviar',
            onClick: handleSend,
            disabled: sending || !phone || !webhookConfigured,
            leftIcon: MdSend,
          }}
          secondaryButton={{ text: 'Cancelar', onClick: onClose }}
        />
      )}
    </Modal>
  )
}
