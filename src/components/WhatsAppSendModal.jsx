import { useEffect, useState } from 'react'
import { MdSend, MdCheckCircle, MdArrowForward, MdImage, MdNotes, MdLibraryAddCheck } from 'react-icons/md'
import { Modal, ModalHeader, ModalContent, ModalFooter, AttentionBox, TextField, Dropdown } from '@vibe/core'
import { sendQuotesToWhatsApp, getMakeWebhookUrl } from '../services/makeWebhook'
import { fetchTelefonosEnvioHabilitados } from '../services/mondayApi'
import { splitTelefono } from '../services/personaFields'
import GradientSpinner from './GradientSpinner'
import ErrorDetailBox from './ErrorDetailBox'
import ProgressBar from './ProgressBar'
import { coberturaParaMostrar } from '../services/coberturaGroups'
import './PillTabs.css'
import './WhatsAppSendModal.css'

// A pedido, estética tipo mockup: 1.8s alcanza para que se alcance a leer "¡Propuesta
// enviada con éxito!" antes de cerrarse sola — el paso activo ya cambió a "Confirmar"
// apenas se mandó (ver handleWhatsAppSent en OpportunityDetail.jsx), así que cerrar
// este modal es lo único que falta para que se vea esa pantalla de atrás.
const AUTO_CLOSE_DELAY_MS = 1800

// LOG-17: opciones del selector de formato. 'imagen' es el default — es lo que se venía
// mandando siempre.
const FORMATOS = [
  { key: 'imagen', label: 'Imagen', icon: MdImage },
  { key: 'texto', label: 'Texto', icon: MdNotes },
  { key: 'ambos', label: 'Ambos', icon: MdLibraryAddCheck },
]

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
  onSendStart,
  onSendFailed,
  onSent,
  sendPolling,
  envioErrorDetail,
}) {
  // MON-14: se manda al CONTACTO. Se propone su número vigente (tablero Contactos) y,
  // solo si la oportunidad no tiene contacto vinculado (las anteriores a MON-14), la copia
  // que quedó en la propia oportunidad. Editable igual, como siempre.
  const [phone, setPhone] = useState(opportunity.contactoTelefono || opportunity.telefono || '')
  const [formato, setFormato] = useState('imagen')
  const mandaImagen = formato === 'imagen' || formato === 'ambos'
  const mandaTexto = formato === 'texto' || formato === 'ambos'
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const webhookConfigured = Boolean(getMakeWebhookUrl())

  // A pedido: mostrar ANTES de mandar con qué línea (o líneas) de WhatsApp se puede enviar
  // y de quién es cada celular (ver fetchTelefonosEnvioHabilitados) — no depende de quién
  // está usando la app, sino de qué celulares están marcados "Habilitado" en la lista
  // blanca. Hoy hay uno solo habilitado, así que se muestra fijo; si en algún momento hay
  // más de uno, se deja elegir con un Dropdown en vez de listarlos todos sin poder actuar.
  // Se resuelve una sola vez al abrir el modal; si ninguna fila está habilitada, no se
  // muestra nada — no es un dato obligatorio para poder enviar. Lo elegido acá viaja al
  // webhook como "telefonoEnvio" (ver handleSubmit y makeWebhook.js) para que el
  // escenario de Make pueda usarlo si en algún momento necesita elegir línea/dispositivo.
  const [telefonosEnvio, setTelefonosEnvio] = useState([]) // [{ telefono, titular }]
  const [telefonoEnvioIndex, setTelefonoEnvioIndex] = useState(0)
  useEffect(() => {
    let cancelado = false
    fetchTelefonosEnvioHabilitados().then((lista) => {
      if (!cancelado) setTelefonosEnvio(lista)
    })
    return () => {
      cancelado = true
    }
  }, [])
  const formatearTelefonoEnvio = (raw) => Object.values(splitTelefono(raw, 'UY')).filter(Boolean).join(' ')
  const telefonoEnvioOpciones = telefonosEnvio.map((op, i) => ({
    value: String(i),
    label: formatearTelefonoEnvio(op.telefono) + (op.titular ? ` (${op.titular})` : ''),
  }))
  const telefonoEnvioSeleccionado = telefonosEnvio[telefonoEnvioIndex] ?? null
  const telefonoEnvioFormateado = telefonoEnvioSeleccionado?.telefono
    ? formatearTelefonoEnvio(telefonoEnvioSeleccionado.telefono)
    : null
  // A pedido: la animación de "Enviando" tiene que reflejar el estado REAL de la
  // columna Estado Envío (sendPolling, ver el polling en OpportunityDetail.jsx), no
  // solo si este envío puntual se hizo desde ESTA instancia del modal — si se cierra el
  // modal mientras un envío sigue en curso y se vuelve a abrir (o a apretar "Enviar
  // seleccionadas"), `submitted` arranca en false de nuevo pero sendPolling sigue en
  // true, y sin esto se volvía a mostrar el formulario de teléfono en vez del estado
  // real en curso.
  const showStatus = submitted || sendPolling
  // El estado terminal se lee de la columna, no de "ya no estamos poleando". Antes el
  // éxito era "no polea y no dice Error", y el polling se apaga también cuando se corta
  // por fallos de red (POLL_MAX_FAILS en OpportunityDetail.jsx): ahí el modal cantaba
  // "¡Enviada con éxito!" y se cerraba solo con el envío todavía en curso, que es
  // justo lo que no hay que decirle a alguien que le está mandando algo a un cliente.
  const sendFailed = showStatus && !sendPolling && opportunity.estadoEnvio === 'Error'
  const sendSucceeded = showStatus && !sendPolling && opportunity.estadoEnvio === 'Enviado'
  // Todo lo demás sigue siendo "en curso": mientras Make procesa, y también si nos
  // quedamos sin saber. Que la pantalla de "Enviando" se quede es la lectura honesta —
  // el envío puede terminar igual, y el aviso de que el seguimiento se cortó ya aparece
  // detrás (pollStalled, con "Reintentar").
  const sendInProgress = showStatus && !sendFailed && !sendSucceeded

  const handleSend = async () => {
    setSending(true)
    setError(null)
    // El orden importa: el escenario de Make responde recién cuando terminó de mandar el
    // WhatsApp, así que todo lo que se hacía "después del POST" llegaba tarde. La pantalla
    // de avance y el estado "Enviando" van ANTES de llamarlo (ver
    // handleWhatsAppSendStart): si no, el avance aparecía cuando ya estaba enviado y el
    // "Enviando" pisaba el "Enviado" que Make acababa de dejar.
    let estadoAnterior
    let enviado = false
    try {
      estadoAnterior = await onSendStart?.()
      setSubmitted(true)
      await sendQuotesToWhatsApp({ phone, opportunity, images, formato, telefonoEnvio: telefonoEnvioSeleccionado?.telefono })
      enviado = true
      await onSent?.(images)
    } catch (err) {
      // Si el POST llegó a salir, el WhatsApp puede haberse mandado igual: lo que falló es
      // lo de después (marcar "Incluir Propuesta"). Volver atrás el estado ahí sería
      // borrar un envío real, así que solo se desanda cuando el envío nunca arrancó.
      if (enviado) {
        console.warn('El envío salió, pero falló un paso posterior', err)
      } else {
        setError(err.message)
        setSubmitted(false)
        await onSendFailed?.(estadoAnterior)
      }
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
            {sendInProgress && (
              <div className="wa-modal__sending">
                <GradientSpinner size={48} />
                <h2 className="wa-modal__sending-title">Enviando propuesta por WhatsApp...</h2>
                <p className="wa-modal__sending-subtitle">
                  Procesando imagen y conectando con el destinatario (+{phone})
                </p>
                <ProgressBar percent={90} />
              </div>
            )}

            {sendFailed && (
              <>
                <AttentionBox type="negative">Hubo un error al enviar por WhatsApp.</AttentionBox>
                <ErrorDetailBox detail={envioErrorDetail} className="wa-modal__error-detail-spacing" />
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
            {/* Un renglón rojo al pie se lee como una validación del formulario, y esto no
                lo es: el envío se intentó y no salió. Va con el mismo cartel que cualquier
                otro fallo de envío, y adentro el motivo tal cual lo devolvió el escenario
                de Make (p. ej. "La persona asignada no tiene el celular permitido..."),
                que es lo que dice qué hay que corregir. El formulario queda abajo para
                reintentar sin volver a empezar. */}
            {error && (
              <AttentionBox type="negative" title="No se pudo enviar" className="wa-modal__error">
                {error}
              </AttentionBox>
            )}

            {/* A pedido: el input achicado y el aviso de origen al lado, no arriba —
                ocupaban demasiado alto para un dato secundario. */}
            <div className="wa-modal__telefono-row">
              {/* TextField nativo de @vibe/core en vez de <label>+<input> a mano. */}
              <TextField
                wrapperClassName="wa-modal__field wa-modal__field--telefono"
                title="Número de teléfono"
                placeholder="Ej: 099 123 456"
                value={phone}
                onChange={(value) => setPhone(value)}
              />
              {telefonosEnvio.length === 1 && telefonoEnvioFormateado && (
                <p className="wa-modal__telefono-envio">
                  Se va a enviar desde <strong>{telefonoEnvioFormateado}</strong>
                  {telefonoEnvioSeleccionado.titular && <> (celular de {telefonoEnvioSeleccionado.titular})</>}
                </p>
              )}
              {/* Más de un celular habilitado a la vez: en vez de listarlos todos sin
                  poder elegir, un Dropdown para decidir cuál mostrar como origen. */}
              {telefonosEnvio.length > 1 && (
                <div className="wa-modal__telefono-envio-selector">
                  <span className="wa-modal__telefono-envio-label">Enviar desde</span>
                  <Dropdown
                    size="small"
                    className="wa-modal__telefono-envio-dropdown"
                    options={telefonoEnvioOpciones}
                    value={telefonoEnvioOpciones[telefonoEnvioIndex] ?? null}
                    clearable={false}
                    searchable={false}
                    onChange={(opcion) => setTelefonoEnvioIndex(Number(opcion?.value ?? 0))}
                  />
                </div>
              )}
            </div>

            {/* LOG-17: la misma cotización se puede mandar como imagen, como texto (para
                que el cliente la reenvíe o copie un dato) o las dos cosas. Control
                segmentado a mano, mismo criterio que las solapas del paso anterior
                (ver .pill-tabs). */}
            <div className="wa-modal__formato">
              <span className="wa-modal__formato-label">Formato del envío</span>
              <div className="pill-tabs" role="tablist">
                {FORMATOS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={formato === f.key}
                    className={formato === f.key ? 'pill-tabs__tab pill-tabs__tab--active' : 'pill-tabs__tab'}
                    onClick={() => setFormato(f.key)}
                  >
                    <f.icon /> {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="wa-modal__preview-label">
              Previsualización ({images.length}{' '}
              {images.length === 1 ? 'cotización' : 'cotizaciones'})
            </div>
            {mandaImagen && (
              <div className="wa-modal__preview-grid">
                {images.map(({ raw, imageDataUrl }) => (
                  <div className="wa-modal__preview-item" key={raw.id}>
                    <img src={imageDataUrl} alt={`${raw.compania} ${coberturaParaMostrar(raw)}`} />
                    <span>
                      {raw.compania} · {coberturaParaMostrar(raw)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {mandaTexto && (
              <div className="wa-modal__preview-texts">
                {images.map(({ raw, texto }) => (
                  <div className="wa-modal__preview-text" key={raw.id}>
                    <span className="wa-modal__preview-text-title">
                      {raw.compania} · {coberturaParaMostrar(raw)}
                    </span>
                    <pre>{texto || 'Esta cotización no tiene fórmula de precio: no se puede armar el texto.'}</pre>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </ModalContent>

      {/* A pedido, estética tipo mockup: sin botones mientras se envía o tras el éxito
          (se cierra sola) — "Cerrar" solo hace falta si hay que abortar a mano, en el
          caso de error. */}
      {/* También con el envío en curso: si el seguimiento se cortó, sin esto no quedaba
          más salida que la X del modal. */}
      {(sendFailed || sendInProgress) && (
        <ModalFooter primaryButton={{ text: 'Cerrar', onClick: onClose }} />
      )}
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
