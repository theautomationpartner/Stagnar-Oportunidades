import { useEffect, useState } from 'react'
import { MdCheckCircle, MdDescription, MdClose } from 'react-icons/md'
import { AttentionBox, Button, IconButton, Modal, ModalContent } from '@vibe/core'
import { formatMoney } from '../services/format'
import { accentForCompania } from '../services/companyColors'
import DocumentUploadRow from './DocumentUploadRow'
import StatusBadge from './StatusBadge'
import GradientSpinner from './GradientSpinner'
import './EmitirStepPanel.css'

// Resumen final de todos los datos con los que se cerró la oportunidad: cliente, bien
// asegurado y la propuesta que quedó elegida en el paso 3 — última revisión antes de
// cargar la póliza. No repite el checklist "falta/no falta" del paso 3 (ya se validó
// ahí); acá se listan los valores tal cual quedaron.
const CLIENTE_FIELDS = [
  { key: 'clienteNombre', label: 'Cliente' },
  { key: 'ci', label: 'CI' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'fechaNacimiento', label: 'Fecha de nacimiento' },
  { key: 'departamento', label: 'Departamento' },
]

const BIEN_FIELDS = [
  { key: 'marca', label: 'Marca' },
  { key: 'modelo', label: 'Modelo' },
  { key: 'anio', label: 'Año' },
  { key: 'combustible', label: 'Combustible' },
  { key: 'uso', label: 'Uso' },
]

export default function EmitirStepPanel({
  opportunity,
  groups,
  concretada,
  polizaFileName,
  uploading,
  deleting,
  error,
  onUploadPoliza,
  onDeletePoliza,
  estadoCreacion,
  estadoCreacionColor,
  polling,
  errorDetail,
  onConfirmarEmision,
  confirmandoEmision,
  confirmarEmisionError,
}) {
  const elegida = groups.flatMap((g) => g.entries).find((e) => e.raw.propuestaElegida)
  const accent = elegida ? accentForCompania(elegida.raw.compania) : null
  // A pedido, estética tipo mockup: mientras no esté "Creada" (la automatización de
  // creación de póliza, ver handleConfirmarEmision en OpportunityDetail.jsx, todavía
  // corriendo o sin arrancar) se muestra el botón "Concretar Oportunidad" + la cruz para
  // sacar el archivo si se subió el que no era; una vez "Creada" ya no hace sentido
  // ninguna de las 2 acciones, se deja solo la fila en verde como constancia.
  const polizaSubida = Boolean(polizaFileName)
  const polizaBusy = uploading || deleting
  const showConfirmarAction = polizaSubida && !polizaBusy && estadoCreacion !== 'Creada'

  // A pedido: cerrar el popup de "Creando póliza..." es solo visual, no corta el
  // polling de fondo — mismo criterio que CotizandoModal (ver su comentario). Se
  // resetea a "no cerrado" cada vez que arranca un polling nuevo (ej. reintentar tras
  // un Error), para que no quede escondido para siempre después del primer cierre.
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (polling) setDismissed(false)
  }, [polling])

  return (
    <div className="emitir-step">
      {concretada && (
        <AttentionBox type="positive">
          Póliza cargada — la oportunidad se marcó como <strong>Concretada</strong>.
        </AttentionBox>
      )}

      <div className="emitir-step__section">
        <h2 className="emitir-step__title">Resumen final</h2>
        <p className="emitir-step__subtitle">
          Última revisión de los datos antes de cargar la póliza.
        </p>

        {/* A pedido, estética tipo mockup: Cliente y Bien asegurado apilados, cada uno a
            todo el ancho (antes lado a lado en 2 columnas) — así los 5 campos de cada
            sección entran en un solo renglón en vez de amontonarse en la mitad del
            ancho disponible. */}
        <div className="emitir-step__subtitle-label">Cliente</div>
        <div className="emitir-step__grid">
          {CLIENTE_FIELDS.map((f) => (
            <div className="emitir-step__field" key={f.key}>
              <span>{f.label}</span>
              <strong>{opportunity[f.key] || '—'}</strong>
            </div>
          ))}
        </div>

        <div className="emitir-step__subtitle-label">Bien asegurado</div>
        <div className="emitir-step__grid">
          {BIEN_FIELDS.map((f) => (
            <div className="emitir-step__field" key={f.key}>
              <span>{f.label}</span>
              <strong>{opportunity[f.key] || '—'}</strong>
            </div>
          ))}
        </div>

        {elegida && !elegida.quote.blocked && (
          <>
            {/* A pedido, estética tipo mockup: la compañía/cobertura elegida como una
                sola insignia (antes: encabezado propio adentro de la tarjeta) al lado
                del título de la sección, y los montos en una tabla de verdad (antes:
                grilla de cajitas sueltas) con "Total final" resaltado en verde. */}
            <div className="emitir-step__subtitle-label emitir-step__chosen-label">
              Propuesta elegida:{' '}
              <span
                className="emitir-step__chosen-badge"
                style={{ color: accent, borderColor: accent }}
              >
                {elegida.raw.compania} {elegida.raw.cobertura || elegida.raw.name}
              </span>
            </div>
            <div className="emitir-step__chosen-table-wrap">
              <table className="emitir-step__chosen-table">
                <thead>
                  <tr>
                    <th>Deducible</th>
                    <th>3 cuotas</th>
                    <th>6 cuotas</th>
                    <th>8 cuotas</th>
                    <th>10 cuotas</th>
                    <th className="emitir-step__chosen-table-total">Total final</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{elegida.quote.deducibleDisplay}</td>
                    <td>{formatMoney(elegida.quote.cuotas[3].valor)}</td>
                    <td>{formatMoney(elegida.quote.cuotas[6].valor)}</td>
                    <td>{formatMoney(elegida.quote.cuotas[8].valor)}</td>
                    <td>{formatMoney(elegida.quote.cuotas[10].valor)}</td>
                    <td className="emitir-step__chosen-table-total">
                      {formatMoney(elegida.quote.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {!elegida && (
          <p className="emitir-step__empty">
            Todavía no se eligió una propuesta en el paso 3 — se puede cargar la póliza igual,
            pero conviene volver a "Confirmar" y elegir una antes de emitir.
          </p>
        )}
      </div>

      <div className="emitir-step__section">
        {/* A pedido, estética tipo mockup: el estado de creación va como insignia
            arriba a la derecha del título (antes: renglón propio "Estado de
            creación: ..." debajo del subtítulo). */}
        <div className="emitir-step__poliza-head">
          <div>
            <h2 className="emitir-step__title">Póliza</h2>
            <p className="emitir-step__subtitle">
              Subí el PDF (u otro archivo) de la póliza emitida por la compañía. Al cargarla, la
              oportunidad pasa automáticamente a "Concretada".
            </p>
          </div>
          {estadoCreacion && <StatusBadge label={estadoCreacion} color={estadoCreacionColor} />}
        </div>

        {!polizaSubida || polizaBusy ? (
          <DocumentUploadRow
            label="Póliza"
            fileName={polizaFileName}
            uploading={uploading}
            deleting={deleting}
            error={error}
            onUpload={onUploadPoliza}
            onDelete={onDeletePoliza}
            missingMessage="Póliza pendiente de adjuntar"
          />
        ) : (
          // A pedido, estética tipo mockup: fila verde con el archivo + "Cargado
          // correctamente" y el botón de acción AL LADO (antes: fila de
          // DocumentUploadRow separada del botón "Confirmar emisión de póliza",
          // que quedaba debajo). La cruz para sacar el archivo se mantiene (compacta,
          // a la izquierda del botón) — no estaba en el mockup, pero sin ella no hay
          // forma de corregir un archivo subido por error una vez "Creada" todavía no
          // llegó.
          <div className="emitir-step__poliza-ok">
            <div className="emitir-step__poliza-ok-info">
              <MdDescription />
              <div className="emitir-step__poliza-ok-text">
                <strong>{polizaFileName}</strong>
                <span>Cargado correctamente</span>
              </div>
            </div>
            {showConfirmarAction && (
              <div className="emitir-step__poliza-ok-actions">
                <IconButton
                  className="emitir-step__poliza-ok-delete"
                  icon={MdClose}
                  onClick={onDeletePoliza}
                  aria-label="Eliminar póliza"
                />
                <Button
                  kind="primary"
                  className="emitir-step__confirmar-btn"
                  onClick={onConfirmarEmision}
                  disabled={confirmandoEmision || polling}
                >
                  <MdCheckCircle />{' '}
                  {confirmandoEmision ? 'Confirmando...' : 'Concretar Oportunidad'}
                </Button>
              </div>
            )}
          </div>
        )}
        {confirmarEmisionError && <p className="emitir-step__error">Error: {confirmarEmisionError}</p>}
        {!polling && errorDetail && (
          <div className="emitir-step__error-detail">
            <strong>Detalle del error (último update en la oportunidad):</strong>
            <pre>{errorDetail}</pre>
          </div>
        )}
      </div>

      {/* A pedido: solo el círculo girando + un texto (sin barra de progreso ni
          subtítulo aparte) mientras corre la automatización de creación de póliza
          (color_mm5ejysv) — reemplaza el AttentionBox amarillo inline de antes. */}
      {polling && !dismissed && (
        <Modal id="poliza-creando-modal" show onClose={() => setDismissed(true)} size="small">
          <ModalContent className="emitir-step__creando-content">
            <GradientSpinner size={48} />
            <p className="emitir-step__creando-title">Leyendo la póliza y creándola...</p>
          </ModalContent>
        </Modal>
      )}
    </div>
  )
}
