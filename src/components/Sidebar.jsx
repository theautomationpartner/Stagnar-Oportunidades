import { useEffect, useState } from 'react'
import { MdPersonAddAlt, MdMenu, MdMenuOpen } from 'react-icons/md'
import stagnariLogo from '../assets/stagnari-logo.png'
import stagnariLogoSimple from '../assets/stagnari-logo-simple.png'
import './Sidebar.css'

// A pedido: barra lateral desplegable — colapsada (default, angosta, mismo look de
// siempre) muestra solo el ícono circular de la marca (stagnari-logo-simple.png, recorte
// del isotipo del logo completo); expandida muestra el isologo entero (stagnari-logo.png)
// + el nombre de cada sección al lado de su ícono. Sigue teniendo su propio estado local
// (el toggle a mano sigue andando en cualquier pantalla), pero ese estado ahora arranca
// — y se resetea — según `defaultExpanded`, que App.jsx manda en true solo en la
// pantalla principal (landing) y en false en el resto: A pedido, la barra abre sola
// nada más al entrar a la principal, no en cualquier otra pantalla.
// A pedido: iniciales a partir del nombre real (ej. "Santiago González" -> "SG") —
// primera letra del primer y del último "token", para no quedar con solo 1 letra en
// nombres compuestos ni con demasiadas en nombres con 3+ palabras.
function initialsOf(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export default function Sidebar({ active = true, onNavigateOportunidades, defaultExpanded = false, user }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded])

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
        <button
          type="button"
          className={active ? 'sidebar__nav-item sidebar__nav-item--active' : 'sidebar__nav-item'}
          title="Oportunidades"
          onClick={onNavigateOportunidades}
        >
          <MdPersonAddAlt />
          {expanded && <span className="sidebar__nav-label">Oportunidades</span>}
        </button>
      </nav>

      {/* A pedido: nombre + avatar reales de quien está mirando la app en monday (ver
          fetchCurrentMondayUser, App.jsx) — `user` llega null mientras carga o si no
          hay contexto de monday disponible (dev/preview standalone). A pedido: sin
          nombre no se muestra nada (ni placeholder ni iniciales genéricas), el pie de
          la barra directamente no se renderiza en ese caso. `title` para ver el
          nombre completo pasando el mouse, sin importar si está expandida o no —
          colapsada solo se ve el avatar. */}
      {user?.name && (
        <div className="sidebar__footer">
          <span className="sidebar__avatar" title={user.name}>
            {user.photo ? <img className="sidebar__avatar-img" src={user.photo} alt="" /> : initialsOf(user.name)}
          </span>
          {expanded && (
            <span className="sidebar__user-name" title={user.name}>
              {user.name}
            </span>
          )}
        </div>
      )}
    </aside>
  )
}
