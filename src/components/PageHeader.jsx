import { MdAdd } from 'react-icons/md'
import { Button } from '@vibe/core'
import './PageHeader.css'

// A pedido: la barra lateral (Sidebar.jsx) reemplazó al TopBar horizontal en esta
// vista (mismo patrón que landing/create/detalle) — "Nueva oportunidad" (antes en el
// nav de arriba) se muda acá, al lado del título. Sin avatar acá: el Sidebar ya tiene
// el suyo propio abajo del todo, no hace falta duplicarlo. "Inicio" se sacó de acá (A
// pedido) — ahora vive solo en el Sidebar, quedaba duplicado.
export default function PageHeader({ onCreateNew }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header__title">Oportunidades</h1>
        <p className="page-header__subtitle">
          Seleccioná una oportunidad para consultar sus detalles y gestionar las cotizaciones asociadas.
        </p>
      </div>
      <div className="page-header__actions">
        {onCreateNew && (
          <Button kind="primary" onClick={onCreateNew}>
            <MdAdd /> Nueva oportunidad
          </Button>
        )}
      </div>
    </div>
  )
}
