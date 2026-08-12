import { MdAdd, MdHome } from 'react-icons/md'
import { Button } from '@vibe/core'
import './PageHeader.css'

// A pedido: la barra lateral (Sidebar.jsx) reemplazó al TopBar horizontal en esta
// vista (mismo patrón que landing/create/detalle) — "Nueva oportunidad"/"Inicio" (antes
// en el nav de arriba) se mudan acá, al lado del título. Sin avatar acá: el Sidebar ya
// tiene el suyo propio abajo del todo, no hace falta duplicarlo.
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
          <Button kind="primary" onClick={onCreateNew}>
            <MdAdd /> Nueva oportunidad
          </Button>
        )}
        {onHome && (
          <Button kind="secondary" onClick={onHome}>
            <MdHome /> Inicio
          </Button>
        )}
      </div>
    </div>
  )
}
