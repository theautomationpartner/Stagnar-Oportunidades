import { useEffect, useRef, useState } from 'react'
import { MdCheckCircle, MdWarningAmber, MdAutorenew } from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import { formatMoney } from '../services/format'
import { accentForCompania } from '../services/companyColors'
import DocumentUploadRow from './DocumentUploadRow'
import './ConfirmarStepPanel.css'

// Subconjunto de COTIZAR_FIELDS que el paso 3 exige verificar antes de emitir: si falta
// alguno se marca con advertencia en vez de tilde, pero no bloquea la pantalla.
const CHECKLIST_FIELDS = [
  { key: 'ci', label: 'CI' },
  { key: 'modelo', label: 'Modelo' },
  { key: 'anio', label: 'Año' },
  { key: 'marca', label: 'Marca' },
  { key: 'combustible', label: 'Combustible' },
  { key: 'fechaNacimiento', label: 'Fecha de nacimiento' },
]

// Cuánto se muestran los guiones "cambiando" antes de asentar los datos de la nueva
// propuesta elegida (ver ChosenProposal más abajo).
const CHOSEN_TRANSITION_MS = 300

function QuoteChoiceCard({ entry, selected, onSelect, selecting }) {
  const { raw, quote } = entry
  const accent = accentForCompania(raw.compania)
  return (
    <div
      className={
        selected ? 'confirmar-step__card confirmar-step__card--selected' : 'confirmar-step__card'
      }
      style={{ borderLeftColor: accent }}
    >
      {raw.incluirPropuesta && (
        <span className="confirmar-step__card-wa" title="Ya se envió por WhatsApp">
          <FaWhatsapp />
        </span>
      )}
      <span className="confirmar-step__card-compania" style={{ color: accent }}>
        {raw.compania}
      </span>
      <span className="confirmar-step__card-cobertura">{raw.cobertura || raw.name}</span>
      <span className="confirmar-step__card-total">
        {quote.blocked ? 'Sin fórmula' : formatMoney(quote.total)}
      </span>
      <button
        type="button"
        className={
          selected
            ? 'btn btn--primary confirmar-step__card-btn'
            : 'btn btn--outline confirmar-step__card-btn'
        }
        onClick={onSelect}
        disabled={selecting}
      >
        {selecting ? (
          'Guardando...'
        ) : selected ? (
          <>
            <MdCheckCircle /> Elegida
          </>
        ) : (
          'Marcar como elegida'
        )}
      </button>
    </div>
  )
}

// Al cambiar cuál es la propuesta elegida, en vez de saltar directo del detalle viejo al
// nuevo, mostramos un instante con guiones ("—") en el medio — a pedido, para que se note
// visualmente que los datos están cambiando y no que quedó pegado el valor anterior.
function ChosenProposal({ elegida }) {
  const elegidaId = elegida?.raw.id ?? null
  const [shown, setShown] = useState(elegida ?? null)
  const [transitioning, setTransitioning] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      setShown(elegida ?? null)
      return undefined
    }
    if (!elegidaId) {
      setTransitioning(false)
      setShown(null)
      return undefined
    }
    setTransitioning(true)
    const timer = setTimeout(() => {
      setShown(elegida ?? null)
      setTransitioning(false)
    }, CHOSEN_TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [elegidaId])

  if (!shown && !transitioning) return null
  if (shown?.quote.blocked && !transitioning) return null

  const dash = '—'
  const compania = transitioning ? dash : shown.raw.compania
  const cobertura = transitioning ? dash : shown.raw.cobertura || shown.raw.name
  const deducible = transitioning ? dash : shown.quote.deducibleDisplay
  const contado = transitioning ? dash : formatMoney(Number(shown.raw.contado) || 0)
  const cuota = (n) => (transitioning ? dash : formatMoney(shown.quote.cuotas[n].valor))
  const total = transitioning ? dash : formatMoney(shown.quote.total)

  return (
    <div className="confirmar-step__section">
      <h2 className="confirmar-step__title">Propuesta elegida</h2>
      <div
        className={
          transitioning ? 'confirmar-step__chosen confirmar-step__chosen--updating' : 'confirmar-step__chosen'
        }
      >
        <div className="confirmar-step__chosen-head">
          <span className="confirmar-step__chosen-compania">{compania}</span>
          <span className="confirmar-step__chosen-cobertura">{cobertura}</span>
        </div>
        <div className="confirmar-step__chosen-grid">
          <div>
            <span>Deducible</span>
            <strong>{deducible}</strong>
          </div>
          <div>
            <span>Contado</span>
            <strong>{contado}</strong>
          </div>
          <div>
            <span>3 cuotas</span>
            <strong>{cuota(3)}</strong>
          </div>
          <div>
            <span>6 cuotas</span>
            <strong>{cuota(6)}</strong>
          </div>
          <div>
            <span>8 cuotas</span>
            <strong>{cuota(8)}</strong>
          </div>
          <div>
            <span>10 cuotas</span>
            <strong>{cuota(10)}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{total}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ConfirmarStepPanel({
  opportunity,
  groups,
  onSetElegida,
  settingElegidaId,
  elegidaError,
  onRecotizar,
  documentos,
  uploadingDoc,
  deletingDoc,
  docUploadError,
  onUploadDocument,
  onDeleteDocument,
  confirming,
  confirmError,
  onConfirmar,
}) {
  const [validationError, setValidationError] = useState(null)
  const entries = groups.flatMap((g) => g.entries)
  const elegida = entries.find((e) => e.raw.propuestaElegida)
  // Ordenadas por compañía (sin título de grupo, a pedido): una fila por compañía, cada
  // una con sus propias cards — así se ven agrupadas de un vistazo sin ocupar espacio
  // extra en un encabezado.
  const sortedGroups = [...groups].sort((a, b) => a.compania.localeCompare(b.compania))

  // El botón "Confirmar" verifica los mismos requisitos que ya se muestran arriba
  // (checklist de datos del cliente + documentación cargada) más que haya una
  // "Propuesta elegida" marcada (sección "Propuestas") antes de dejar avanzar al paso 4
  // — si falta algo, se lista qué falta en vez de dejar pasar con datos a medias.
  const handleConfirmClick = () => {
    const missingFields = CHECKLIST_FIELDS.filter((f) => !opportunity[f.key])
    const missingDocs = documentos.filter((d) => !d.fileName)
    const missingLabels = [...missingFields.map((f) => f.label), ...missingDocs.map((d) => d.label)]
    if (!elegida) missingLabels.push('Propuesta elegida')
    if (missingLabels.length > 0) {
      setValidationError(`Completá antes de confirmar: ${missingLabels.join(', ')}.`)
      return
    }
    setValidationError(null)
    onConfirmar()
  }

  return (
    <div className="confirmar-step">
      <div className="confirmar-step__section">
        <div className="confirmar-step__section-head">
          <div>
            <h2 className="confirmar-step__title">Datos del cliente</h2>
            <p className="confirmar-step__subtitle">
              Verificá que estos datos estén completos antes de emitir la póliza.
            </p>
          </div>
          <button className="btn btn--outline" type="button" onClick={onRecotizar}>
            <MdAutorenew /> Recotizar
          </button>
        </div>
        <div className="confirmar-step__checklist">
          {CHECKLIST_FIELDS.map((f) => {
            const value = opportunity[f.key]
            const ok = Boolean(value)
            return (
              <div
                className={
                  ok
                    ? 'confirmar-step__check confirmar-step__check--ok'
                    : 'confirmar-step__check confirmar-step__check--missing'
                }
                key={f.key}
              >
                {ok ? <MdCheckCircle /> : <MdWarningAmber />}
                <span className="confirmar-step__check-label">{f.label}</span>
                <span className="confirmar-step__check-value">{value || 'Falta cargar'}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="confirmar-step__section">
        <h2 className="confirmar-step__title">Documentación</h2>
        <p className="confirmar-step__subtitle">
          Verificá que estén cargados los documentos del asegurado. Si falta alguno, se puede
          subir directo desde acá.
        </p>
        <div className="confirmar-step__docs">
          {documentos.map((doc) => (
            <DocumentUploadRow
              key={doc.key}
              label={doc.label}
              fileName={doc.fileName}
              uploading={Boolean(uploadingDoc[doc.columnId])}
              deleting={Boolean(deletingDoc[doc.columnId])}
              error={docUploadError[doc.columnId]}
              onUpload={(file) => onUploadDocument(doc.columnId, file)}
              onDelete={() => onDeleteDocument(doc.columnId)}
            />
          ))}
        </div>
      </div>

      <div className="confirmar-step__section">
        <h2 className="confirmar-step__title">Propuestas</h2>
        <p className="confirmar-step__subtitle">
          Marcá cuál es la propuesta elegida por el cliente. El color identifica la compañía y el
          ícono de WhatsApp indica cuáles ya se enviaron.
        </p>
        {elegidaError && <p className="confirmar-step__error">Error: {elegidaError}</p>}
        <div className="confirmar-step__companies">
          {sortedGroups.map((g) => (
            <div className="confirmar-step__company-row" key={g.compania}>
              {g.entries.map((e) => (
                <QuoteChoiceCard
                  key={e.raw.id}
                  entry={e}
                  selected={e.raw.id === elegida?.raw.id}
                  onSelect={() => onSetElegida(e.raw.id)}
                  selecting={settingElegidaId === e.raw.id}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <ChosenProposal elegida={elegida} />

      <div className="confirmar-step__section confirmar-step__confirm">
        <div>
          <h2 className="confirmar-step__title">Confirmar</h2>
          <p className="confirmar-step__subtitle">
            Verifica que los datos del cliente y la documentación estén completos, que haya una
            propuesta elegida, y pasa al paso 4 (Emitir).
          </p>
          {validationError && <p className="confirmar-step__error">{validationError}</p>}
          {confirmError && <p className="confirmar-step__error">Error: {confirmError}</p>}
        </div>
        <button
          className="btn btn--primary confirmar-step__confirm-btn"
          type="button"
          onClick={handleConfirmClick}
          disabled={confirming}
        >
          <MdCheckCircle /> {confirming ? 'Confirmando...' : 'Confirmar'}
        </button>
      </div>
    </div>
  )
}
