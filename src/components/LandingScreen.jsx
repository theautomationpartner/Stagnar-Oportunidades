import { useEffect, useState } from 'react'
import {
  MdAdminPanelSettings,
  MdAutorenew,
  MdChevronRight,
  MdDescription,
  MdLogout,
  MdNoteAdd,
  MdPeopleAlt,
  MdSearch,
} from 'react-icons/md'
import { Search } from '@vibe/core'
import stagnariLogo from '../assets/stagnari-logo.png'
import { normalizarParaMatch } from '../services/format'
import { fetchMe } from '../services/mondayApi'
import { initialsOf } from '../services/personaFields'
import { useMondayUser } from '../context/AppContext'
import { useAuth, usePuedeAdministrarUsuarios } from '../auth/AuthContext'
import './LandingScreen.css'

// Pantalla principal (reunión del 24/09): un botón por funcionalidad, sin desplegable ni
// Confirmar — lo que se usa todos los días queda a un clic. Antes eran dos preguntas
// (qué hacer y con qué usuario) y un Confirmar, calcadas del "paso 0" de labatea.
//
// El "con qué usuario" salió de acá a pedido: el Asignado se elige donde importa, al pie
// del alta (AsignadoPicker, que arranca con quien tiene la sesión) y adentro de la
// oportunidad.
//
// Renovaciones y Consultar pólizas todavía no existen: se ven en gris, como
// "Próximamente", para que la pantalla ya tenga su forma final.
//
// "Usuarios y accesos" solo aparece para Admin (ver usePuedeAdministrarUsuarios).
function acciones({ onCreateNew, onSearchExisting, onClientes, onUsuarios }) {
  return [
    { key: 'consultar', label: 'Consultar oportunidades', desc: 'Buscar y continuar una existente', Icono: MdSearch, onClick: onSearchExisting },
    { key: 'crear', label: 'Crear una oportunidad', desc: 'Cotizar un riesgo nuevo', Icono: MdNoteAdd, onClick: onCreateNew },
    { key: 'clientes', label: 'Gestionar clientes', desc: 'Contactos, relaciones y grupo económico', Icono: MdPeopleAlt, onClick: onClientes },
    { key: 'renovaciones', label: 'Renovaciones', desc: 'Seguimiento de las pólizas por vencer', Icono: MdAutorenew },
    { key: 'polizas', label: 'Consultar pólizas', desc: 'Buscar una póliza emitida', Icono: MdDescription },
    ...(onUsuarios
      ? [{ key: 'usuarios', label: 'Usuarios y accesos', desc: 'Altas, bajas y roles de la lista blanca', Icono: MdAdminPanelSettings, onClick: onUsuarios }]
      : []),
  ]
}

function AvatarPersona({ persona }) {
  return persona?.photo ? (
    <img className="landing__avatar landing__avatar--chico" src={persona.photo} alt="" />
  ) : (
    <span className="landing__avatar landing__avatar--chico landing__avatar--iniciales">
      {initialsOf(persona?.name ?? '')}
    </span>
  )
}

export default function LandingScreen({ onCreateNew, onSearchExisting, onClientes, onUsuarios }) {
  const puedeAdministrar = usePuedeAdministrarUsuarios()
  // Quién está en el sistema, en orden de certeza: la sesión de autenticación, el
  // contexto de monday (embebido), y de respaldo el dueño del token con el que la app
  // habla con monday — que es lo que hay en local/preview: The Automation Partner.
  const ctxUser = useMondayUser()
  const { usuario: usuarioSesion, deshabilitada, salir } = useAuth()
  const [me, setMe] = useState(null)
  useEffect(() => {
    let cancelado = false
    fetchMe()
      .then((m) => !cancelado && setMe(m))
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [])
  // En un asiento compartido el nombre de monday es el del asiento: ahí manda el del
  // perfil elegido (mismo criterio que tenía la barra lateral).
  const nombreSesion = usuarioSesion?.asientoCompartido
    ? usuarioSesion.nombre
    : (ctxUser?.name ?? usuarioSesion?.nombre ?? me?.name)
  const fotoSesion = ctxUser?.photo ?? me?.photo ?? null
  const [saliendo, setSaliendo] = useState(false)
  // A pedido: buscador de lo que se puede hacer, solo por el título del botón y el texto
  // que muestra (la descripción, o "Próximamente"). Sin distinguir acentos ni mayúsculas.
  const [busqueda, setBusqueda] = useState('')
  const buscado = normalizarParaMatch(busqueda)
  const visibles = acciones({ onCreateNew, onSearchExisting, onClientes, onUsuarios: puedeAdministrar ? onUsuarios : null })
    .map((a) => ({ ...a, texto: a.onClick ? a.desc : 'Próximamente' }))
    .filter((a) => !buscado || normalizarParaMatch(`${a.label} ${a.texto}`).includes(buscado))
  const puedeSalir = !deshabilitada && Boolean(usuarioSesion)

  return (
    <div className="landing">
      <div className="landing__panel">
        <img className="landing__logo" src={stagnariLogo} alt="Stagnari Seguros" />

        {/* Quién está en el sistema (a pedido, acá desde que no hay barra lateral) — y la
            puerta de salida, que también vivía allá. Cerrar sesión olvida el dispositivo
            confiable, si no la app volvería a entrar sola por el "no preguntar por 24hs". */}
        {nombreSesion && (
          <div className="landing__sesion">
            <span className="landing__sesion-lbl">En el sistema:</span>
            <AvatarPersona persona={{ name: nombreSesion, photo: fotoSesion }} />
            <span className="landing__sesion-nombre" title={usuarioSesion?.email ?? nombreSesion}>
              {nombreSesion}
            </span>
            {puedeSalir && (
              <button
                type="button"
                className="landing__salir"
                disabled={saliendo}
                title={'Cerrar sesión' + (usuarioSesion?.email ? ' (' + usuarioSesion.email + ')' : '')}
                onClick={async () => {
                  setSaliendo(true)
                  try {
                    await salir()
                  } finally {
                    setSaliendo(false)
                  }
                }}
              >
                <MdLogout aria-hidden="true" /> {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
              </button>
            )}
          </div>
        )}

        <h1 className="landing__titulo">¿Qué querés hacer?</h1>

        <Search
          className="landing__buscador"
          placeholder="Buscar qué hacer…"
          value={busqueda}
          onChange={setBusqueda}
          debounceRate={0}
          showClearIcon
        />

        {visibles.length === 0 && (
          <p className="landing__sin-resultados">No hay nada que coincida con «{busqueda.trim()}».</p>
        )}

        <div className="landing__botones">
          {visibles.map(({ key, label, texto, Icono, onClick }) => {
            const disponible = Boolean(onClick)
            return (
              <button
                key={key}
                type="button"
                className={disponible ? 'landing__boton' : 'landing__boton landing__boton--proximamente'}
                disabled={!disponible}
                onClick={onClick}
              >
                <span className="landing__boton-icono" aria-hidden="true">
                  <Icono />
                </span>
                <span className="landing__boton-cuerpo">
                  <span className="landing__boton-label">{label}</span>
                  <span className="landing__boton-desc">{texto}</span>
                </span>
                {disponible && <MdChevronRight className="landing__boton-flecha" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
