import { MdCheckCircle } from 'react-icons/md'
import { Modal, ModalContent } from '@vibe/core'
import { EXPECTED_QUOTE_COUNT_BY_COMPANIA, accentForCompania } from '../services/companyColors'
import GradientSpinner from './GradientSpinner'
import ProgressBar from './ProgressBar'
import './CotizandoModal.css'

// A pedido: el código corto de la compañía (BSE/SANCOR/PORTO/SURA), sin "Seguros" —
// mismo criterio que el resto de la app (ej. .quote-card__company en QuoteCard.jsx).
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
  // A pedido: 3 fases en vez de 2 — la automatización de monday no expone un estado
  // propio para cada una (Estado Cotización solo tiene "Cotizar"/"Cotizando"/"Cotizado
  // (Subitems)"/"Error", ver color_mm51n7aa), así que se infieren del progreso real de
  // subitems (`progress`, ya filtrado del lado de OpportunityDetail para no contar lo
  // viejo en un recotizar, ver oldSubitemIdsRef):
  // 1. "Eliminando..." — solo en un recotizar, mientras sigue en cero (borra TODAS las
  //    cotizaciones anteriores antes de arrancar de nuevo).
  // 2. "Cotizando..." — sigue en cero pero no es un recotizar (o ya terminó de borrar):
  //    todavía está consultando precios, ningún subitem devuelto todavía.
  // 3. "Creando los subitems..." — ya empezaron a aparecer subitems (>0): está
  //    escribiendo los resultados de vuelta en el tablero.
  const subtitle = allDone
    ? '¡Cotizaciones obtenidas con éxito!'
    : recotizando && totalDone === 0
      ? 'Eliminando cotizaciones anteriores...'
      : totalDone === 0
        ? 'Cotizando con las aseguradoras...'
        : 'Creando los subitems...'

  return (
    <Modal id="cotizando-modal" show={show} onClose={onClose} size="small">
      <ModalContent className="cotizando-modal__content">
        <GradientSpinner size={48} />
        <h2 className="cotizando-modal__title">{recotizando ? 'Recotizando' : 'Cotizando'} en aseguradoras...</h2>
        <p className="cotizando-modal__subtitle">{subtitle}</p>

        <ProgressBar percent={percent} className="cotizando-modal__progress-spacing" />

        <div className="cotizando-modal__list">
          {COMPANIAS.map((compania) => {
            const expected = EXPECTED_QUOTE_COUNT_BY_COMPANIA[compania]
            const done = Math.min(progress[compania] ?? 0, expected)
            const isDone = done >= expected
            return (
              <div className="cotizando-modal__item" key={compania}>
                <span className="cotizando-modal__item-name" style={{ color: accentForCompania(compania) }}>
                  {compania}
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
