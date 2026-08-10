import { useState } from 'react'
import { MdSend, MdCheckCircle, MdWarningAmber } from 'react-icons/md'
import { Modal, ModalHeader, ModalContent, ModalFooter, AttentionBox, Loader, TextField } from '@vibe/core'
import { sendQuotesToWhatsApp, getMakeWebhookUrl } from '../services/makeWebhook'
import './WhatsAppSendModal.css'

// A pedido: en vez de un mensaje de éxito genérico que se cierra solo a los 2
// segundos (sin saber si Make.com terminó de verdad), el modal se queda abierto
// después de mandar el POST y muestra el estado en vivo de Estado Envío
// (color_mm4wr1t4, ver OpportunityDetail.jsx: sendPolling/envioErrorDetail) —
// "Enviando" mientras Make procesa, "Enviado"/"Error" apenas llega a un estado
// terminal. El usuario puede cerrar en cualquier momento (el polling de fondo
// sigue funcionando aunque se cierre).
export default function WhatsAppSendModal({
  opportunity,
  images,
  onClose,
  onSent,
  sendPolling,
  envioErrorDetail,
}) {
  const [phone, setPhone] = useState(opportunity.telefono || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const webhookConfigured = Boolean(getMakeWebhookUrl())

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      await sendQuotesToWhatsApp({ phone, opportunity, images })
      await onSent?.(images)
      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal id="whatsapp-send-modal" show onClose={onClose} size="medium">
      <ModalHeader title="Enviar por WhatsApp" className="wa-modal__header" />
      <ModalContent className="wa-modal__content">
        {!webhookConfigured && (
          <AttentionBox type="warning">
            Falta configurar <code>VITE_MAKE_WEBHOOK_URL</code> en <code>app/.env</code> con la URL
            del webhook de Make.com. Podés previsualizar las imágenes, pero todavía no se puede
            enviar.
          </AttentionBox>
        )}

        {submitted ? (
          <div className="wa-modal__status">
            {sendPolling ? (
              <AttentionBox type="warning" icon={false}>
                <Loader size={14} className="wa-modal__status-spinner" />
                Enviando por WhatsApp... esperando la confirmación de Make.
              </AttentionBox>
            ) : opportunity.estadoEnvio === 'Error' ? (
              <>
                <AttentionBox type="negative">
                  <MdWarningAmber /> Hubo un error al enviar por WhatsApp.
                </AttentionBox>
                {envioErrorDetail && (
                  <div className="wa-modal__error-detail">
                    <strong>Detalle del error (último update en la oportunidad):</strong>
                    <pre>{envioErrorDetail}</pre>
                  </div>
                )}
              </>
            ) : (
              <AttentionBox type="positive">
                <MdCheckCircle /> Cotización enviada correctamente. En breve le llega por
                WhatsApp.
              </AttentionBox>
            )}
          </div>
        ) : (
          <>
            {/* TextField nativo de @vibe/core en vez de <label>+<input> a mano. */}
            <TextField
              wrapperClassName="wa-modal__field"
              title="Número de teléfono"
              placeholder="Ej: 099 123 456"
              value={phone}
              onChange={(value) => setPhone(value)}
            />

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

      {submitted ? (
        <ModalFooter primaryButton={{ text: 'Cerrar', onClick: onClose }} />
      ) : (
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
