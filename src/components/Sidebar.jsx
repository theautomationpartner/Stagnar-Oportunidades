import { MdPersonAddAlt } from 'react-icons/md'
import './Sidebar.css'

// Barra lateral angosta, solo íconos (a pedido, estética tipo mockup) — mismo único
// ítem "Oportunidades" que ya tenía TopBar.jsx, el resto de las secciones (Dashboard,
// Clientes, Pólizas, etc.) todavía no existen en la app.
export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand" title="Stagnari Seguros">
        S
      </div>

      <nav className="sidebar__nav" aria-label="Secciones">
        <span className="sidebar__nav-item sidebar__nav-item--active" title="Oportunidades">
          <MdPersonAddAlt />
        </span>
      </nav>

      <span className="sidebar__avatar" title="María Clara · Productor">
        MC
      </span>
    </aside>
  )
}
