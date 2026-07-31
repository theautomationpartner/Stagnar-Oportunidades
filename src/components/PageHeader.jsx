import { MdAdd } from 'react-icons/md'
import { Button } from '@vibe/core'
import './PageHeader.css'

export default function PageHeader({ onCreateNew }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header__title">Cotizaciones</h1>
        <p className="page-header__subtitle">
          Seleccioná una oportunidad para ver y comparar posibles cotizaciones.
        </p>
      </div>
      {onCreateNew && (
        <Button kind="primary" onClick={onCreateNew}>
          <MdAdd /> Nueva oportunidad
        </Button>
      )}
    </div>
  )
}
