import { MdCheckCircle } from 'react-icons/md'
import { Modal, ModalContent } from '@vibe/core'
import { EXPECTED_QUOTE_COUNT_BY_COMPANIA, accentForCompania } from '../services/companyColors'
import GradientSpinner from './GradientSpinner'
import './CotizandoModal.css'

// Nombres reales de cada compañía tal cual se muestran acá — no todas llevan "Seguros"
// (PORTO es "Seguro" singular, SURA no lleva sufijo).
const DISPLAY_NAME_BY_COMPANIA = {
  BSE: 'BSE Seguros',
  SANCOR: 'SANCOR Seguros',
  PORTO: 'PORTO Seguro',
  SURA: 'SURA',
}

const COMPANIAS = Object.keys(EXPECTED_QUOTE_COUNT_BY_COMPANIA)

// A pedido: popup con el avance en vivo de la cotización automática, compañía por
// compañía — a diferencia del AttentionBox genérico de antes (un solo texto "Cotizando
// con las compañías..."), acá se ve cuántas opciones ya se generaron de cada una
// mientras la automatización de monday sigue corriendo. La cantidad esperada por
// compañía es fija (EXPECTED_QUOTE_COUNT_BY_COMPANIA, confirmado a pedido — la
// automatización siempre genera la misma cantidad de subitems por compañía, sin
// importar el vehículo), `progress` es lo que ya se creó de verdad (ver el polling en
// OpportunityDetail.jsx). El cierre de este popup es solo visual — no corta el polling
// de fondo, mismo criterio que WhatsAppSendModal.
export default function CotizandoModal({ show, recotizando, progress, onClose }) {
  if (!show) return null

  const totalExpected = COMPANIAS.reduce((sum, c) => sum + EXPECTED_QUOTE_COUNT_BY_COMPANIA[c], 0)
  const totalDone = COMPANIAS.reduce(
    (sum, c) => sum + Math.min(progress[c] ?? 0, EXPECTED_QUOTE_COUNT_BY_COMPANIA[c]),
    0
  )
  const percent = totalExpected > 0 ? Math.round((totalDone / totalExpected) * 100) : 0
  const allDone = totalDone >= totalExpected
  // A pedido: en un recotizar, el primer paso de la automatización es borrar TODAS las
  // cotizaciones anteriores — mientras `progress` (ya filtrado del lado de
  // OpportunityDetail para no contar lo viejo, ver oldSubitemIdsRef) sigue en cero, se
  // avisa de esa fase en vez de dar a entender que ya se está cotizando de nuevo.
  const subtitle = allDone
    ? '¡Cotizaciones obtenidas con éxito!'
    : recotizando && totalDone === 0
      ? 'Eliminando cotizaciones anteriores...'
      : 'Esto puede tardar unos segundos...'

  return (
    <Modal id="cotizando-modal" show={show} onClose={onClose} size="small">
      <ModalContent className="cotizando-modal__content">
        <GradientSpinner size={48} />
        <h2 className="cotizando-modal__title">{recotizando ? 'Recotizando' : 'Cotizando'} en aseguradoras...</h2>
        <p className="cotizando-modal__subtitle">{subtitle}</p>

        <div className="cotizando-modal__progress-track">
          <div className="cotizando-modal__progress-fill" style={{ width: `${percent}%` }} />
        </div>

        <div className="cotizando-modal__list">
          {COMPANIAS.map((compania) => {
            const expected = EXPECTED_QUOTE_COUNT_BY_COMPANIA[compania]
            const done = Math.min(progress[compania] ?? 0, expected)
            const isDone = done >= expected
            return (
              <div className="cotizando-modal__item" key={compania}>
                <span className="cotizando-modal__item-name" style={{ color: accentForCompania(compania) }}>
                  {DISPLAY_NAME_BY_COMPANIA[compania]}
                </span>
                <span
                  className={
                    isDone
                      ? 'cotizando-modal__item-status cotizando-modal__item-status--done'
                      : 'cotizando-modal__item-status'
                  }
                >
                  {isDone && <MdCheckCircle />}
                  {isDone ? `Cotizado (${expected} opciones)` : `${done}/${expected} opciones`}
                </span>
              </div>
            )
          })}
        </div>
      </ModalContent>
    </Modal>
  )
}
