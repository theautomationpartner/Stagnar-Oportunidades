import { useRef } from 'react'
import { MdCheck } from 'react-icons/md'
import './Stepper.css'

// Stepper propio (no MultiStepIndicator de @vibe/core): acá hay DOS ejes independientes
// por paso — el progreso real de la oportunidad (`status`: done/active/pending) y cuál
// paso se está MIRANDO ahora (`activeKey`), que no siempre coinciden (se puede volver a
// mirar "Cotizar" con todo ya confirmado). El componente de la librería solo modela uno.
//
// Auditoría UX (rediseño visual + interacción, mismos títulos):
// - "Lo que estoy viendo" se marca con una barra indicadora bajo el label + anillo en el
//   círculo (antes: solo un subrayado del texto, fácil de perder). El progreso se sigue
//   leyendo por el color del círculo (verde tilde = hecho, azul = en curso, gris = falta).
// - Los conectores se pintan hasta el último paso completado (línea de progreso real).
// - Affordance clara: los pasos alcanzables tienen hover/cursor; los que todavía no se
//   pueden abrir se ven atenuados, con cursor "no permitido" y tooltip explicando por qué.
// - Teclado: flechas ←/→ (y Home/End) mueven el foco entre pasos clickeables; Enter/
//   Espacio abren. Lectores de pantalla: lista de pasos con "Paso N de M", estado y
//   aria-current en el que se está viendo.
// - Celular: los labels se ocultan salvo el del paso que se está viendo.
//
// steps: [{ key, label, subtitle?, status: 'done'|'active'|'pending', clickable }]
const STATUS_TEXT = { done: 'completado', active: 'en curso', pending: 'pendiente' }

export default function Stepper({ steps, activeKey, onSelect }) {
  const buttonsRef = useRef([])

  const focusStep = (fromIndex, dir) => {
    const total = steps.length
    for (let n = 1; n <= total; n++) {
      const i = dir === 'home' ? n - 1 : dir === 'end' ? total - n : (fromIndex + dir * n + total) % total
      const el = buttonsRef.current[i]
      if (el && steps[i].clickable) {
        el.focus()
        return
      }
    }
  }

  const handleKeyDown = (e, index) => {
    const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'home', End: 'end' }
    const dir = map[e.key]
    if (dir === undefined) return
    e.preventDefault()
    focusStep(index, dir)
  }

  return (
    <ol className="stepper" aria-label="Pasos">
      {steps.map((step, index) => {
        const isViewing = step.key === activeKey
        const isLast = index === steps.length - 1
        const itemClass = [
          'stepper__item',
          `stepper__item--${step.status}`,
          isViewing && 'stepper__item--viewing',
          step.clickable && 'stepper__item--clickable',
          !step.clickable && !isViewing && 'stepper__item--locked',
        ]
          .filter(Boolean)
          .join(' ')
        const a11yLabel = `Paso ${index + 1} de ${steps.length}: ${step.label} (${STATUS_TEXT[step.status]})`
        const lockedHint =
          !step.clickable && !isViewing && step.status === 'pending' ? 'Completá el paso anterior para continuar' : undefined

        const content = (
          <>
            <span className="stepper__circle" aria-hidden="true">
              {step.status === 'done' ? <MdCheck /> : index + 1}
            </span>
            <span className="stepper__label">{step.label}</span>
            <span className="stepper__indicator" aria-hidden="true" />
          </>
        )

        return (
          <li className={itemClass} key={step.key}>
            {step.clickable ? (
              <button
                type="button"
                ref={(el) => (buttonsRef.current[index] = el)}
                className="stepper__step"
                onClick={() => onSelect(step.key)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                aria-label={a11yLabel}
                aria-current={isViewing ? 'step' : undefined}
                title={step.subtitle || undefined}
              >
                {content}
              </button>
            ) : (
              <div
                className="stepper__step"
                aria-label={a11yLabel}
                aria-current={isViewing ? 'step' : undefined}
                aria-disabled={!isViewing || undefined}
                title={lockedHint || step.subtitle || undefined}
                tabIndex={isViewing ? 0 : -1}
                ref={(el) => (buttonsRef.current[index] = el)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              >
                {content}
              </div>
            )}
            {!isLast && (
              <span className={`stepper__line stepper__line--${step.status}`} aria-hidden="true">
                <span className="stepper__line-fill" />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
