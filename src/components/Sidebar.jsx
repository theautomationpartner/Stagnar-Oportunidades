import { useEffect, useState } from 'react'
import { MdPersonAddAlt, MdMenu, MdMenuOpen, MdLogout } from 'react-icons/md'
import stagnariLogo from '../assets/stagnari-logo.png'
import stagnariLogoSimple from '../assets/stagnari-logo-simple.png'
import { initialsOf } from '../services/personaFields'
import { useMondayUser } from '../context/AppContext'
import { useAuth } from '../auth/AuthContext'
import './Sidebar.css'

// A pedido: barra lateral desplegable — colapsada (default, angosta, mismo look de
// siempre) muestra solo el ícono circular de la marca (stagnari-logo-simple.png, recorte
// del isotipo del logo completo); expandida muestra el isologo entero (stagnari-logo.png)
// + el nombre de cada sección al lado de su ícono. Sigue teniendo su propio estado local
// (el toggle a mano sigue andando en cualquier pantalla), pero ese estado ahora arranca
// — y se resetea — según `defaultExpanded`, que App.jsx manda en true solo en la
// pantalla principal (landing) y en false en el resto: A pedido, la barra abre sola
// nada más al entrar a la principal, no en cualquier otra pantalla.

export default function Sidebar({ active = true, onNavigateOportunidades, defaultExpanded = false, user: userProp }) {
  // `user` puede venir por prop (compatibilidad) o del contexto global (ver AppContext).
  const ctxUser = useMondayUser()
  const user = userProp ?? ctxUser
  const [expanded, setExpanded] = useState(defaultExpanded)

  // Sesión propia de la app (ver src/auth). `deshabilitada` es true cuando el backend corre
  // con AUTH_ENFORCE=off: ahí no hay sesión que cerrar y el botón no tiene sentido.
  const { usuario, deshabilitada, salir } = useAuth()
  const [saliendo, setSaliendo] = useState(false)
  const puedeSalir = !deshabilitada && Boolean(usuario)

  // En un asiento de monday compartido, el nombre de monday es el del asiento ("The
  // Automation Partner") y no el de la persona que eligió el perfil. Ahí hay que mostrar el
  // del perfil, o cuatro personas verían el mismo nombre y ninguna sabría con cuál entró.
  const nombreSesion = usuario?.asientoCompartido ? usuario.nombre : (user?.name ?? usuario?.nombre)

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
      {nombreSesion && (
        <div className="sidebar__footer">
          <span className="sidebar__avatar" title={nombreSesion}>
            {user?.photo ? (
              <img className="sidebar__avatar-img" src={user.photo} alt="" />
            ) : (
              initialsOf(nombreSesion)
            )}
          </span>
          {expanded && (
            <span className="sidebar__user-name" title={usuario?.email ?? nombreSesion}>
              {nombreSesion}
            </span>
          )}
        </div>
      )}

      {/* La puerta de salida, en su propia línea debajo del usuario.
          Cerrar sesión olvida además este dispositivo confiable — si no, al salir la app
          volvería a entrar sola por el "no preguntar por 24 horas" y el botón parecería no
          hacer nada. */}
      {puedeSalir && (
        <button
          type="button"
          className="sidebar__salir"
          disabled={saliendo}
          title={'Cerrar sesión' + (usuario?.email ? ' (' + usuario.email + ')' : '')}
          aria-label="Cerrar sesión"
          onClick={async () => {
            setSaliendo(true)
            try {
              await salir()
            } finally {
              setSaliendo(false)
            }
          }}
        >
          <MdLogout />
          {expanded && <span className="sidebar__salir-label">{saliendo ? 'Saliendo…' : 'Cerrar sesión'}</span>}
        </button>
      )}
    </aside>
  )
}
