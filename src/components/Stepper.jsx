import { MdCheck } from 'react-icons/md'
import './Stepper.css'

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
              <button className="stepper__step stepper__step--clickable" type="button" onClick={() => onSelect(step.key)}>
                {circle}
                {label}
              </button>
            ) : (
              <div className="stepper__step">
                {circle}
                {label}
              </div>
            )}
            {index < steps.length - 1 && (
              <span
                className={
                  step.status === 'done' ? 'stepper__line stepper__line--done' : 'stepper__line'
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
