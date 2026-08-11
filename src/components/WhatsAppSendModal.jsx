import { useEffect, useState } from 'react'
import { MdSend, MdCheckCircle, MdArrowForward } from 'react-icons/md'
import { Modal, ModalHeader, ModalContent, ModalFooter, AttentionBox, TextField } from '@vibe/core'
import { sendQuotesToWhatsApp, getMakeWebhookUrl } from '../services/makeWebhook'
import GradientSpinner from './GradientSpinner'
import './WhatsAppSendModal.css'

// A pedido, estética tipo mockup: 1.8s alcanza para que se alcance a leer "¡Propuesta
// enviada con éxito!" antes de cerrarse sola — el paso activo ya cambió a "Confirmar"
// apenas se mandó (ver handleWhatsAppSent en OpportunityDetail.jsx), así que cerrar
// este modal es lo único que falta para que se vea esa pantalla de atrás.
const AUTO_CLOSE_DELAY_MS = 1800

// A pedido: en vez de un mensaje de éxito genérico que se cierra solo sin saber si
// Make.com terminó de verdad, el modal se queda abierto después de mandar el POST y
// muestra el estado en vivo de Estado Envío (color_mm4wr1t4, ver OpportunityDetail.jsx:
// sendPolling/envioErrorDetail) — "Enviando" mientras Make procesa, recién ahí "Enviado"
// (se cierra solo, ver AUTO_CLOSE_DELAY_MS más arriba) o "Error" (se queda abierto, el
// usuario cierra a mano) apenas llega a un estado terminal. El usuario puede cerrar en
// cualquier momento — el polling de fondo sigue funcionando aunque se cierre.
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
  // A pedido: la animación de "Enviando" tiene que reflejar el estado REAL de la
  // columna Estado Envío (sendPolling, ver el polling en OpportunityDetail.jsx), no
  // solo si este envío puntual se hizo desde ESTA instancia del modal — si se cierra el
  // modal mientras un envío sigue en curso y se vuelve a abrir (o a apretar "Enviar
  // seleccionadas"), `submitted` arranca en false de nuevo pero sendPolling sigue en
  // true, y sin esto se volvía a mostrar el formulario de teléfono en vez del estado
  // real en curso.
  const showStatus = submitted || sendPolling
  const sendFailed = showStatus && !sendPolling && opportunity.estadoEnvio === 'Error'
  const sendSucceeded = showStatus && !sendPolling && !sendFailed

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

  useEffect(() => {
    if (!sendSucceeded) return undefined
    const timer = setTimeout(onClose, AUTO_CLOSE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [sendSucceeded, onClose])

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

        {showStatus ? (
          <div className="wa-modal__status">
            {/* A pedido, estética tipo mockup: tarjeta con spinner degradé + barra de
                progreso mientras Make procesa el envío — reemplaza el AttentionBox
                amarillo genérico de antes. La barra no mide un progreso real (no hay
                forma de saber en qué paso puntual va Make) — un valor fijo alto alcanza
                para transmitir "ya casi", sin inventar precisión que no existe. */}
            {sendPolling && (
              <div className="wa-modal__sending">
                <GradientSpinner size={48} />
                <h2 className="wa-modal__sending-title">Enviando propuesta por WhatsApp...</h2>
                <p className="wa-modal__sending-subtitle">
                  Procesando imagen y conectando con el destinatario (+{phone})
                </p>
                <div className="wa-modal__sending-progress-track">
                  <div className="wa-modal__sending-progress-fill" />
                </div>
              </div>
            )}

            {sendFailed && (
              <>
                <AttentionBox type="negative">Hubo un error al enviar por WhatsApp.</AttentionBox>
                {envioErrorDetail && (
                  <div className="wa-modal__error-detail">
                    <strong>Detalle del error (último update en la oportunidad):</strong>
                    <pre>{envioErrorDetail}</pre>
                  </div>
                )}
              </>
            )}

            {/* A pedido, estética tipo mockup: check verde + "Redirigiendo a
                Confirmación..." — el paso activo ya cambió a "Confirmar" apenas se
                mandó (ver handleWhatsAppSent en OpportunityDetail.jsx), este modal se
                cierra solo (AUTO_CLOSE_DELAY_MS) para revelar esa pantalla de atrás. */}
            {sendSucceeded && (
              <div className="wa-modal__success">
                <span className="wa-modal__success-icon">
                  <MdCheckCircle />
                </span>
                <h2 className="wa-modal__success-title">¡Propuesta enviada con éxito!</h2>
                <p className="wa-modal__success-subtitle">
                  Se envió el resumen de cotización correctamente a {opportunity.clienteNombre}.
                </p>
                <span className="wa-modal__success-redirect">
                  Redirigiendo a Confirmación... <MdArrowForward />
                </span>
              </div>
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

      {/* A pedido, estética tipo mockup: sin botones mientras se envía o tras el éxito
          (se cierra sola) — "Cerrar" solo hace falta si hay que abortar a mano, en el
          caso de error. */}
      {sendFailed && <ModalFooter primaryButton={{ text: 'Cerrar', onClick: onClose }} />}
      {!showStatus && (
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
