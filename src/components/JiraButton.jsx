import { Button } from '@vibe/core'
import { SiJira } from 'react-icons/si'
import './JiraButton.css'

// Botón con el azul y el logo de Jira, para que se reconozca de un vistazo que la acción
// pasa en Jira y no en monday. Lo usa el paso Emitir con la oportunidad concretada: sin
// incidencia, "Cargar en Jira"; con incidencia, "Ver en Jira" (abre otra pestaña).
// El estado deshabilitado tiene su propio color por lo mismo que .emitir-step__revisar-dif:
// la opacity genérica de @vibe/core deja el azul lavado e ilegible.
export default function JiraButton({ children, onClick, disabled = false }) {
  return (
    <Button kind="primary" className="jira-button" onClick={onClick} disabled={disabled}>
      <SiJira className="jira-button__logo" aria-hidden="true" /> {children}
    </Button>
  )
}
