import { useEffect, useRef, useState } from 'react'
import { MdCheckCircle, MdChatBubbleOutline } from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import { Button } from '@vibe/core'
import { formatMoney, CUOTA_COUNTS, toPercentString } from '../services/format'
import { accentForCompania } from '../services/companyColors'
import FileUploadField from './FileUploadField'
import AlertModal from './AlertModal'
import { fetchFileColumnAsFile } from '../services/mondayApi'
import './PillTabs.css'
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

// A pedido, estética tipo mockup: mismo lenguaje visual que QuoteCard.jsx (paso
// "Comparar y enviar") — encabezado con compañía/cobertura + deducible a la izquierda y
// COSTO TOTAL a la derecha, tabla de cuotas, promo — pero sin los botones "Parámetros"/
// "Coberturas" (acá ya no se ajusta nada, solo se elige entre las cotizaciones ya
// hechas); el botón "Elegida"/"Marcar como elegida" ocupa ese lugar en el pie.
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
      <div className="confirmar-step__card-header">
        <div className="confirmar-step__card-header-main">
          <div className="confirmar-step__card-title-row">
            {/* A pedido, estética tipo mockup: el ícono de "ya se envió por WhatsApp" va
                inline, adelante de la compañía — antes era una insignia flotante en la
                esquina (position:absolute), acá no hace falta con el header ya en
                columna (ver confirmar-step__card-header-main). */}
            {raw.incluirPropuesta && (
              <span className="confirmar-step__card-wa" title="Ya se envió por WhatsApp">
                <FaWhatsapp />
              </span>
            )}
            <span className="confirmar-step__card-compania" style={{ color: accent }}>
              {raw.compania}
            </span>
            <span className="confirmar-step__card-cobertura">{raw.cobertura || raw.name}</span>
          </div>
          {!quote.blocked && (
            <span className="confirmar-step__card-deducible">Deduc.: {quote.deducibleDisplay}</span>
          )}
        </div>
        <div className="confirmar-step__card-total-block">
          <span className="confirmar-step__card-total-label">COSTO TOTAL</span>
          <span className="confirmar-step__card-total">
            {quote.blocked ? 'Sin fórmula' : formatMoney(quote.total)}
          </span>
        </div>
      </div>

      {!quote.blocked && (
        <div className="confirmar-step__card-cuotas">
          <table className="confirmar-step__card-cuotas-table">
            <thead>
              <tr>
                <th>Cuotas</th>
                <th>Valor cuota</th>
                <th>Recargo</th>
              </tr>
            </thead>
            <tbody>
              {CUOTA_COUNTS.map((n) => (
                <tr key={n}>
                  <td>{n}x</td>
                  <td>{formatMoney(quote.cuotas[n].valor)}</td>
                  <td>{toPercentString(raw[`recargo${n}`])}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {quote.promo && (
            <span className="confirmar-step__card-promo">
              ➜ {quote.promo.count} cuotas SIN RECARGO de {formatMoney(quote.promo.valor)}
            </span>
          )}
        </div>
      )}

      <Button
        kind={selected ? 'primary' : 'secondary'}
        className="confirmar-step__card-btn"
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
      </Button>
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
  // Ordenadas por compañía (a pedido, sin agrupar por renglón como antes — ver el
  // comentario grande sobre confirmar-step__grid más abajo): una grilla pareja, el color
  // del borde izquierdo (accentForCompania) ya identifica de qué compañía es cada una.
  const sortedEntries = [...entries].sort((a, b) => a.raw.compania.localeCompare(b.raw.compania))
  const sentEntries = sortedEntries.filter((e) => e.raw.incluirPropuesta)
  // A pedido, estética tipo mockup: solapa "Enviadas por WhatsApp"/"Todas las
  // cotizaciones" para no tener que scrollear entre TODAS las cotizadas (hasta 19, ver
  // EXPECTED_QUOTE_COUNT_BY_COMPANIA) cuando lo que casi siempre hace falta acá es elegir
  // entre las 1-2 que ya se le mandaron al cliente. Arranca en "Enviadas" si hay alguna
  // — si todavía no se mandó ninguna, no tiene sentido arrancar en una grilla vacía.
  const [filterTab, setFilterTab] = useState(() => (sentEntries.length > 0 ? 'sent' : 'all'))
  const visibleEntries = filterTab === 'sent' ? sentEntries : sortedEntries

  // El botón "Confirmar" verifica los datos del cliente (CHECKLIST_FIELDS, ya no se
  // muestran como checklist visual, a pedido) + documentación cargada + que haya una
  // "Propuesta elegida" marcada (sección "Propuestas") antes de dejar avanzar al paso 4
  // — si falta algo, se lista qué falta en vez de dejar pasar con datos a medias. A
  // pedido, estética tipo mockup: el aviso ahora es el popup compartido (AlertModal, ver
  // "Faltan datos requeridos"), no un texto suelto — se guarda el array de labels
  // (antes un string ya armado) para poder listarlos como viñetas.
  const handleConfirmClick = () => {
    const missingFields = CHECKLIST_FIELDS.filter((f) => !opportunity[f.key])
    const missingDocs = documentos.filter((d) => !d.fileName)
    const missingLabels = [...missingFields.map((f) => f.label), ...missingDocs.map((d) => d.label)]
    if (!elegida) missingLabels.push('Propuesta elegida')
    if (missingLabels.length > 0) {
      setValidationError(missingLabels)
      return
    }
    setValidationError(null)
    onConfirmar()
  }

  return (
    <div className="confirmar-step">
      <div className="confirmar-step__section">
        <h2 className="confirmar-step__title">Documentación</h2>
        <p className="confirmar-step__subtitle">
          Verificá que estén cargados los documentos del asegurado. Si falta alguno, se puede
          subir directo desde acá.
        </p>
        <div className="confirmar-step__docs">
          {documentos.map((doc) => (
            <FileUploadField
              key={doc.key}
              label={doc.label}
              required={false}
              fileName={doc.fileName}
              // A pedido: mismo campo de archivo (y misma previsualización con
              // lightbox) que el resto de la app — como este documento ya está subido
              // a monday de una sesión anterior (no un File en memoria), la
              // descarga real recién se pide al tocar "ver más grande", no antes.
              onFetchFile={() => fetchFileColumnAsFile(opportunity.id, doc.columnId)}
              uploading={Boolean(uploadingDoc[doc.columnId])}
              deleting={Boolean(deletingDoc[doc.columnId])}
              error={docUploadError[doc.columnId]}
              onUpload={(file) => onUploadDocument(doc.columnId, file)}
              onDelete={() => onDeleteDocument(doc.columnId)}
              showReplaceButton={false}
              compactDelete
            />
          ))}
        </div>
      </div>

      <div className="confirmar-step__section">
        <div className="confirmar-step__props-head">
          <div>
            <h2 className="confirmar-step__title">Propuestas</h2>
            <p className="confirmar-step__subtitle">
              Marcá cuál es la propuesta elegida por el cliente. El color identifica la compañía y
              el ícono de WhatsApp indica cuáles ya se enviaron.
            </p>
          </div>
          {/* Control segmentado a mano (no Tab/TabList de @vibe/core) — mismo criterio que
              .opp-detail__cobertura-tabs (paso "Comparar y enviar"): sus estilos internos
              vienen de clases hasheadas inyectadas en runtime, no hay hook confiable para
              un look propio. */}
          <div className="pill-tabs confirmar-step__filter-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={filterTab === 'sent'}
              className={
                filterTab === 'sent' ? 'pill-tabs__tab pill-tabs__tab--active' : 'pill-tabs__tab'
              }
              onClick={() => setFilterTab('sent')}
            >
              <MdChatBubbleOutline /> Enviadas por WhatsApp
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterTab === 'all'}
              className={
                filterTab === 'all' ? 'pill-tabs__tab pill-tabs__tab--active' : 'pill-tabs__tab'
              }
              onClick={() => setFilterTab('all')}
            >
              Todas las cotizaciones
            </button>
          </div>
        </div>
        {elegidaError && <p className="confirmar-step__error">Error: {elegidaError}</p>}
        {visibleEntries.length === 0 ? (
          <p className="confirmar-step__empty">
            {filterTab === 'sent'
              ? 'Todavía no se envió ninguna propuesta por WhatsApp.'
              : 'No hay cotizaciones cargadas.'}
          </p>
        ) : (
          <div className="confirmar-step__grid">
            {visibleEntries.map((e) => (
              <QuoteChoiceCard
                key={e.raw.id}
                entry={e}
                selected={e.raw.id === elegida?.raw.id}
                onSelect={() => onSetElegida(e.raw.id)}
                selecting={settingElegidaId === e.raw.id}
              />
            ))}
          </div>
        )}
      </div>

      <ChosenProposal elegida={elegida} />

      <div className="confirmar-step__section confirmar-step__confirm">
        <div>
          <h2 className="confirmar-step__title">Confirmar</h2>
          <p className="confirmar-step__subtitle">
            Verifica que los datos del cliente y la documentación estén completos, que haya una
            propuesta elegida, y pasa al paso 4 (Emitir).
          </p>
          {confirmError && <p className="confirmar-step__error">Error: {confirmError}</p>}
        </div>
        <Button
          kind="primary"
          className="confirmar-step__confirm-btn"
          onClick={handleConfirmClick}
          disabled={confirming}
        >
          <MdCheckCircle /> {confirming ? 'Confirmando...' : 'Confirmar'}
        </Button>
      </div>

      {validationError && (
        <AlertModal
          id="confirmar-faltan-datos-modal"
          type="warning"
          title="Faltan datos requeridos"
          description='No podés avanzar al siguiente paso porque hay información obligatoria que no ha sido completada.'
          detailsTitle="Campos pendientes:"
          detailsList={validationError}
          onClose={() => setValidationError(null)}
          primaryButton={{ text: 'Completar datos faltantes', onClick: () => setValidationError(null) }}
        />
      )}
    </div>
  )
}
