import { useEffect, useRef, useState } from 'react'
import { MdExpandMore, MdHome, MdNoteAdd, MdSearch } from 'react-icons/md'
import stagnariLogoSimple from '../assets/stagnari-logo-simple.png'
import AlertModal from './AlertModal'
import { hayTrabajoEnCrear } from '../services/crearEnCurso'
import { clearPersistedSearch } from '../services/persistedSearch'
import './AccionBar.css'

// Barra de contexto arriba de cada sección (calcada del selector de operación de
// labatea-operaciones-de-compra, a pedido): el dropdown de "¿Qué querés hacer?" queda
// siempre a la vista para cambiar de tarea sin pasar por el inicio, y ANTES de cambiar
// un aviso aclara qué pasa con los datos:
//   - desde "Crear una oportunidad" se PIERDE lo ingresado (la oportunidad no se crea);
//   - adentro de una oportunidad no se pierde nada: cada cambio ya se guardó en monday
//     en el momento (las escrituras del detalle son inmediatas/optimistas).
// Desde la tabla se cambia directo, sin modal: no hay nada a medio hacer.

// "Inicio" (la casita) es una opción más del dropdown (a pedido) — accionActual nunca es
// 'inicio', así que jamás aparece como la tarea en curso en la caja cerrada.
const ACCIONES = [
  { key: 'inicio', label: 'Inicio', Icono: MdHome },
  { key: 'consultar', label: 'Consultar oportunidades', Icono: MdSearch },
  { key: 'crear', label: 'Crear una oportunidad', Icono: MdNoteAdd },
]

export default function AccionBar({ accionActual, enDetalle = false, onIrAInicio, onCambiar }) {
  const [abierto, setAbierto] = useState(false)
  // Acción elegida que espera confirmación en el modal (mismo patrón "pendiente" que el
  // selector de labatea): null = no hay modal.
  const [pendiente, setPendiente] = useState(null)
  const raizRef = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return
      if (e.type === 'mousedown' && raizRef.current?.contains(e.target)) return
      setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', cerrar)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', cerrar)
    }
  }, [abierto])

  const actual = ACCIONES.find((a) => a.key === accionActual)

  // Un destino puede ser una acción o 'inicio' (el logo — a pedido, la casita de las
  // pantallas se fue y volver al inicio ES el logo de la marca).
  const irA = (destino) => {
    // Salir de "Crear" por acá también descarta la búsqueda persistida — mismo cierre
    // que hace el propio formulario al salir (ver handleExit): sin esto, la selección
    // vieja se restauraba sola al volver a Crear dentro del TTL.
    if (accionActual === 'crear') clearPersistedSearch()
    if (destino === 'inicio') onIrAInicio()
    else onCambiar(destino)
  }

  // Con datos en juego se intercepta con el modal; sin nada que perder, directo. En
  // "Crear" manda el formulario (ver crearEnCurso.js): entrar y no tocar nada — ni un
  // paso ni un campo — sale sin cartel, a pedido.
  const protegido = (destino) => {
    if ((accionActual === 'crear' && hayTrabajoEnCrear()) || enDetalle) setPendiente(destino)
    else irA(destino)
  }

  const elegir = (accion) => {
    setAbierto(false)
    // La misma tarea en la misma pantalla: nada que hacer. (Desde el detalle sí vale
    // elegir "Consultar": es volver a la lista, y el aviso aplica igual.)
    if (accion === accionActual && !enDetalle) return
    protegido(accion)
  }

  const confirmarCambio = () => {
    const destino = pendiente
    setPendiente(null)
    irA(destino)
  }

  return (
    <div className="accion-bar" ref={raizRef}>
      <button type="button" className="accion-bar__logo-btn" title="Ir al inicio" onClick={() => protegido('inicio')}>
        <img className="accion-bar__logo" src={stagnariLogoSimple} alt="Inicio" />
      </button>

      <span className="accion-bar__lbl" id="accion-bar-lbl">
        ¿Qué querés hacer?
      </span>
      <div className="accion-bar__selector">
        <button
          type="button"
          className={abierto ? 'accion-bar__selbox accion-bar__selbox--abierto' : 'accion-bar__selbox'}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-labelledby="accion-bar-lbl"
          onClick={() => setAbierto((v) => !v)}
        >
          {actual && (
            <span className="accion-bar__selbox-val">
              <actual.Icono className="accion-bar__selbox-icono" aria-hidden="true" />
              {actual.label}
            </span>
          )}
          <MdExpandMore className="accion-bar__selbox-chevron" aria-hidden="true" />
        </button>
        {abierto && (
          <ul className="accion-bar__lista" role="listbox" aria-labelledby="accion-bar-lbl">
            {ACCIONES.map((a) => (
              <li key={a.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={a.key === accionActual}
                  className={
                    a.key === accionActual ? 'accion-bar__opcion accion-bar__opcion--elegida' : 'accion-bar__opcion'
                  }
                  onClick={() => elegir(a.key)}
                >
                  <a.Icono aria-hidden="true" /> {a.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendiente && accionActual === 'crear' && (
        <AlertModal
          id="accion-bar-salir-crear"
          type="warning"
          title="¿Salir de la creación?"
          description="Al cambiar de tarea se pierden todos los datos ingresados hasta ahora — la oportunidad no se va a crear."
          primaryButton={{ text: 'Salir y descartar', danger: true, onClick: confirmarCambio }}
          secondaryButton={{ text: 'Quedarme', onClick: () => setPendiente(null) }}
          onClose={() => setPendiente(null)}
        />
      )}

      {pendiente && accionActual !== 'crear' && (
        <AlertModal
          id="accion-bar-salir-detalle"
          type="info"
          title="¿Cambiar de tarea?"
          description="No se pierde nada: todos los cambios hechos en esta oportunidad ya quedaron guardados en monday."
          primaryButton={{ text: 'Continuar', onClick: confirmarCambio }}
          secondaryButton={{ text: 'Quedarme', onClick: () => setPendiente(null) }}
          onClose={() => setPendiente(null)}
        />
      )}
    </div>
  )
}
