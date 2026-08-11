import { useState } from 'react'
import { MdPersonAddAlt, MdMenu, MdMenuOpen } from 'react-icons/md'
import stagnariLogo from '../assets/stagnari-logo.png'
import stagnariLogoSimple from '../assets/stagnari-logo-simple.png'
import './Sidebar.css'

// A pedido: barra lateral desplegable — colapsada (default, angosta, mismo look de
// siempre) muestra solo el ícono circular de la marca (stagnari-logo-simple.png, recorte
// del isotipo del logo completo); expandida muestra el isologo entero (stagnari-logo.png)
// + el nombre de cada sección al lado de su ícono. Estado local nada más (no hace falta
// levantarlo a App.jsx): vive adentro de un flex row (.app-shell, ver App.css), así que
// .app-shell__main (flex:1) se acomoda solo al ancho nuevo sin que nadie más tenga que
// enterarse.
export default function Sidebar() {
  const [expanded, setExpanded] = useState(false)

  return (
    <aside className={expanded ? 'sidebar sidebar--expanded' : 'sidebar'}>
      <div className="sidebar__top">
        <img
          className={expanded ? 'sidebar__brand-img sidebar__brand-img--full' : 'sidebar__brand-img'}
          src={expanded ? stagnariLogo : stagnariLogoSimple}
          alt="Stagnari Seguros"
        />
        <button
          type="button"
          className="sidebar__toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Contraer barra lateral' : 'Expandir barra lateral'}
          title={expanded ? 'Contraer' : 'Expandir'}
        >
          {expanded ? <MdMenuOpen /> : <MdMenu />}
        </button>
      </div>

      <nav className="sidebar__nav" aria-label="Secciones">
        <span className="sidebar__nav-item sidebar__nav-item--active" title="Oportunidades">
          <MdPersonAddAlt />
          {expanded && <span className="sidebar__nav-label">Oportunidades</span>}
        </span>
      </nav>

      <div className="sidebar__footer">
        <span className="sidebar__avatar" title="María Clara · Productor">
          MC
        </span>
        {expanded && <span className="sidebar__user-name">María Clara</span>}
      </div>
    </aside>
  )
}
