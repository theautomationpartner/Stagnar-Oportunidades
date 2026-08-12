import { MdCheckCircle } from 'react-icons/md'
import { Modal, ModalContent, Loader } from '@vibe/core'
import GradientSpinner from './GradientSpinner'
import './GuardandoOportunidadModal.css'

// A pedido: popup con el avance paso a paso de "Guardar" en CrearOportunidadForm.jsx —
// mismo lenguaje visual que CotizandoModal (GradientSpinner + lista de ítems con
// check verde cuando terminan), pero acá los pasos son fijos (no un progreso que se
// infiere de subitems creados) — `steps` es la lista completa (ver
// buildGuardarSteps en CrearOportunidadForm.jsx, varía según haya vehículo/archivos
// para guardar) y `currentStepKey` cuál está corriendo ahora mismo; todos los
// anteriores en la lista ya terminaron. No es cerrable — "Guardar" es una operación
// atómica de punta a punta (ver handleGuardar), no tiene sentido dejar navegar a mitad
// de camino.
export default function GuardandoOportunidadModal({ show, steps, currentStepKey }) {
  if (!show) return null

  const currentIndex = steps.findIndex((s) => s.key === currentStepKey)

  return (
    <Modal id="guardando-oportunidad-modal" show onClose={() => {}} size="small">
      <ModalContent className="guardando-modal__content">
        <GradientSpinner size={48} />
        <h2 className="guardando-modal__title">Creando oportunidad...</h2>
        <p className="guardando-modal__subtitle">Esto puede tardar unos segundos, no cierres esta ventana.</p>

        <div className="guardando-modal__list">
          {steps.map((step, index) => {
            const isDone = currentIndex === -1 || index < currentIndex
            const isActive = index === currentIndex
            return (
              <div className="guardando-modal__item" key={step.key}>
                <span
                  className={
                    isDone
                      ? 'guardando-modal__item-status guardando-modal__item-status--done'
                      : 'guardando-modal__item-status'
                  }
                >
                  {isDone ? <MdCheckCircle /> : isActive ? <Loader size={14} /> : null}
                </span>
                <span className="guardando-modal__item-label">{step.label}</span>
              </div>
            )
          })}
        </div>
      </ModalContent>
    </Modal>
  )
}
