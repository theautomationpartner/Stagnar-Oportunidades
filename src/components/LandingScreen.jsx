import { useEffect, useRef, useState } from 'react'
import { Button } from '@vibe/core'
import { MdExpandMore, MdLogout, MdNoteAdd, MdSearch } from 'react-icons/md'
import stagnariLogo from '../assets/stagnari-logo.png'
import { fetchMe, fetchUsuariosHabilitados } from '../services/mondayApi'
import { initialsOf } from '../services/personaFields'
import { useMondayUser } from '../context/AppContext'
import { useAuth } from '../auth/AuthContext'
import './LandingScreen.css'

// Pantalla principal, calcada del "paso 0" de labatea-operaciones-de-compra (a pedido):
// dos preguntas y un Confirmar — QUÉ querés hacer y CON QUÉ USUARIO — en vez de las dos
// tarjetas de antes. La persona elegida no es decorativa: al crear una oportunidad entra
// como Asignado del alta (ver stg_asignado_prefill en CrearOportunidadForm).

const ACCIONES = [
  { key: 'consultar', label: 'Consultar oportunidades', desc: 'Buscar y continuar una existente', Icono: MdSearch },
  { key: 'crear', label: 'Crear una oportunidad', desc: 'Cotizar un riesgo nuevo', Icono: MdNoteAdd },
]

// La clave que CrearOportunidadForm lee (y borra) al montar para arrancar el Asignado
// con la persona elegida acá.
export const ASIGNADO_PREFILL_KEY = 'stg_asignado_prefill'

function AvatarPersona({ persona, chico = false }) {
  const clase = chico ? 'landing__avatar landing__avatar--chico' : 'landing__avatar'
  return persona?.photo ? (
    <img className={clase} src={persona.photo} alt="" />
  ) : (
    <span className={clase + ' landing__avatar--iniciales'}>{initialsOf(persona?.name ?? '')}</span>
  )
}

// Dropdown propio con el look "selbox" de labatea (etiqueta arriba, caja abajo) hecho
// con los tokens de esta app — el Dropdown de @vibe/core no deja meter avatar + texto
// en el valor cerrado sin pelearse con sus clases hasheadas.
function Selector({ etiqueta, valor, placeholder, abierto, onToggle, children }) {
  return (
    <div className="landing__selector">
      <span className="landing__selector-lbl" id={`landing-lbl-${etiqueta}`}>
        {etiqueta}
      </span>
      <button
        type="button"
        className={abierto ? 'landing__selbox landing__selbox--abierto' : 'landing__selbox'}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={onToggle}
      >
        {valor ?? <span className="landing__selbox-ph">{placeholder}</span>}
        <MdExpandMore className="landing__selbox-chevron" aria-hidden="true" />
      </button>
      {abierto && (
        <ul className="landing__lista" role="listbox" aria-labelledby={`landing-lbl-${etiqueta}`}>
          {children}
        </ul>
      )}
    </div>
  )
}

export default function LandingScreen({ onCreateNew, onSearchExisting }) {
  const [accion, setAccion] = useState(null)
  const [personaId, setPersonaId] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [abierto, setAbierto] = useState(null) // null | 'accion' | 'persona'
  const raizRef = useRef(null)

  // A pedido, la lista sale del tablero de Usuarios Habilitados (la lista blanca del
  // sistema de autenticación) y solo con "Estado Usuario" = Activo — no de los miembros
  // de la cuenta de monday, que incluía gente que no opera la app.
  useEffect(() => {
    let cancelado = false
    fetchUsuariosHabilitados()
      .then((lista) => !cancelado && setUsuarios(lista))
      .catch(() => {}) // sin lista, el selector de persona queda en "Seleccionar…"
    return () => {
      cancelado = true
    }
  }, [])

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
  const puedeSalir = !deshabilitada && Boolean(usuarioSesion)

  // Como el comprador en labatea: arranca con quien está usando la app ya elegido — en
  // la enorme mayoría de los casos la oportunidad es de uno mismo, y elegirse a mano
  // sería un clic de más. En el asiento compartido varias filas tienen el mismo user_id
  // de monday: ahí desempata el nombre del perfil elegido al entrar.
  const yoId = usuarioSesion?.mondayUserId ?? (ctxUser?.id != null ? String(ctxUser.id) : null) ?? me?.id ?? null
  useEffect(() => {
    if (personaId || !usuarios.length) return
    const porPerfil = usuarioSesion?.nombre ? usuarios.find((u) => u.nombre === usuarioSesion.nombre) : null
    const porId = yoId ? usuarios.find((u) => u.mondayUserId === yoId) : null
    const porDefecto = porPerfil ?? porId
    if (porDefecto) setPersonaId(porDefecto.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarios, yoId, usuarioSesion?.nombre])

  // Clic afuera o Esc cierran la lista abierta.
  useEffect(() => {
    if (!abierto) return
    const cerrar = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return
      if (e.type === 'mousedown' && raizRef.current?.contains(e.target)) return
      setAbierto(null)
    }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', cerrar)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', cerrar)
    }
  }, [abierto])

  const accionElegida = ACCIONES.find((a) => a.key === accion)
  const persona = usuarios.find((u) => u.id === personaId)

  const confirmar = () => {
    if (accion === 'crear') {
      // La persona viaja al alta como Asignado inicial (ver CrearOportunidadForm). Lo que
      // viaja es su user_id de MONDAY (lo que la columna people necesita), no el id de la
      // fila de la lista blanca; una fila sin ID Usuario válido no puede prefijar nada.
      try {
        if (persona?.mondayUserId) sessionStorage.setItem(ASIGNADO_PREFILL_KEY, persona.mondayUserId)
      } catch {
        /* sin sessionStorage, el alta arranca con quien crea, como siempre */
      }
      onCreateNew()
    } else {
      onSearchExisting()
    }
  }

  return (
    <div className="landing">
      <div className="landing__panel" ref={raizRef}>
        <img className="landing__logo" src={stagnariLogo} alt="Stagnari Seguros" />

        {/* Quién está en el sistema (a pedido, acá desde que no hay barra lateral) — y la
            puerta de salida, que también vivía allá. Cerrar sesión olvida el dispositivo
            confiable, si no la app volvería a entrar sola por el "no preguntar por 24hs". */}
        {nombreSesion && (
          <div className="landing__sesion">
            <span className="landing__sesion-lbl">En el sistema:</span>
            <AvatarPersona chico persona={{ name: nombreSesion, photo: fotoSesion }} />
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

        <p className="landing__saludo">Elegí qué querés hacer y con qué usuario trabajar.</p>

        <div className="landing__selectores">
          <Selector
            etiqueta="¿Qué querés hacer?"
            placeholder="Seleccionar…"
            abierto={abierto === 'accion'}
            onToggle={() => setAbierto(abierto === 'accion' ? null : 'accion')}
            valor={
              accionElegida && (
                <span className="landing__selbox-val">
                  <accionElegida.Icono className="landing__selbox-icono" aria-hidden="true" />
                  {accionElegida.label}
                </span>
              )
            }
          >
            {ACCIONES.map((a) => (
              <li key={a.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={accion === a.key}
                  className={accion === a.key ? 'landing__opcion landing__opcion--elegida' : 'landing__opcion'}
                  onClick={() => {
                    setAccion(a.key)
                    setAbierto(null)
                  }}
                >
                  <a.Icono className="landing__opcion-icono" aria-hidden="true" />
                  <span className="landing__opcion-cuerpo">
                    <span className="landing__opcion-label">{a.label}</span>
                    <span className="landing__opcion-desc">{a.desc}</span>
                  </span>
                </button>
              </li>
            ))}
          </Selector>

          <Selector
            etiqueta="¿Con qué usuario?"
            placeholder={usuarios.length ? 'Seleccionar…' : 'Cargando usuarios…'}
            abierto={abierto === 'persona'}
            onToggle={() => setAbierto(abierto === 'persona' ? null : 'persona')}
            valor={
              persona && (
                <span className="landing__selbox-val">
                  <AvatarPersona chico persona={{ name: persona.nombre, photo: persona.photo }} />
                  {persona.nombre}
                </span>
              )
            }
          >
            {usuarios.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={personaId === u.id}
                  className={personaId === u.id ? 'landing__opcion landing__opcion--elegida' : 'landing__opcion'}
                  onClick={() => {
                    setPersonaId(u.id)
                    setAbierto(null)
                  }}
                >
                  <AvatarPersona persona={{ name: u.nombre, photo: u.photo }} />
                  <span className="landing__opcion-label">{u.nombre}</span>
                </button>
              </li>
            ))}
          </Selector>
        </div>

        <div className="landing__acciones">
          <Button kind="primary" disabled={!accion || !personaId} onClick={confirmar}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  )
}
