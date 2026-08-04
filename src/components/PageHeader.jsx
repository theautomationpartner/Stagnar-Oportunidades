import { MdAdd, MdHome } from 'react-icons/md'
import { IconButton } from '@vibe/core'
import './PageHeader.css'

// Reemplaza al botón "Nueva oportunidad" (con texto) por 2 botones chicos de ícono —
// mismo par de acciones de navegación que en el header de CrearOportunidadForm.jsx (ir
// a crear / ir al inicio), para que la navegación entre las 3 pantallas (inicio, buscar,
// crear) sea simétrica desde cualquiera de las otras dos.
export default function PageHeader({ onCreateNew, onHome }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header__title">Cotizaciones</h1>
        <p className="page-header__subtitle">
          Seleccioná una oportunidad para ver y comparar posibles cotizaciones.
        </p>
      </div>
      <div className="page-header__actions">
        {onCreateNew && (
          <IconButton icon={MdAdd} kind="primary" aria-label="Nueva oportunidad" onClick={onCreateNew} />
        )}
        {onHome && <IconButton icon={MdHome} kind="secondary" aria-label="Ir al inicio" onClick={onHome} />}
      </div>
    </div>
  )
}
