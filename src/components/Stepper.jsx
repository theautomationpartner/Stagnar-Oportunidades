import { MdCheck } from 'react-icons/md'
import { Button } from '@vibe/core'
import './Stepper.css'

// Se probó migrar esto a MultiStepIndicator (@vibe/core), pero ese componente
// solo modela un eje de estado por paso (pending/active/fulfilled) — acá
// necesitamos DOS ejes independientes: el progreso real de la oportunidad
// (status) y cuál paso estás mirando ahora mismo (activeKey), que no
// necesariamente coinciden (podés volver a mirar "Cotizar" después de haber
// confirmado todo). El componente nativo no tiene forma de resaltar "estás
// viendo esto" por separado del estado de progreso, así que el círculo/línea
// siguen siendo propios — lo que sí se migró es el elemento clickeable en sí
// (Button en vez de un <button> a mano), para mantener el foco/hover/estados
// consistentes con el resto de la app.
//
// steps: [{ key, label, status, clickable }] con status: 'done' | 'active' | 'pending'
export default function Stepper({ steps, activeKey, onSelect }) {
  return (
    <div className="stepper">
      {steps.map((step, index) => {
        const isViewing = step.key === activeKey
        const circle = (
          <span
            className={
              isViewing
                ? `stepper__circle stepper__circle--${step.status} stepper__circle--viewing`
                : `stepper__circle stepper__circle--${step.status}`
            }
          >
            {step.status === 'done' ? <MdCheck /> : index + 1}
          </span>
        )
        const label = (
          <span
            className={
              isViewing
                ? `stepper__label stepper__label--${step.status} stepper__label--viewing`
                : `stepper__label stepper__label--${step.status}`
            }
          >
            {step.label}
          </span>
        )

        return (
          <div className="stepper__item" key={step.key}>
            {step.clickable ? (
              <Button
                kind="tertiary"
                className={isViewing ? 'stepper__step stepper__step--viewing' : 'stepper__step'}
                onClick={() => onSelect(step.key)}
              >
                {circle}
                {label}
              </Button>
            ) : (
              <div className="stepper__step">
                {circle}
                {label}
              </div>
            )}
            {index < steps.length - 1 && (
              <span
                className={step.status === 'done' ? 'stepper__line stepper__line--done' : 'stepper__line'}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
