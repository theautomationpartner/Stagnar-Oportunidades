import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MdCheck, MdUnfoldMore } from 'react-icons/md'
import { fetchMondayUsers } from '../services/mondayApi'
import { initialsOf } from '../services/personaFields'
import './AsignadoPicker.css'

// Selector de "Asignado" del alta (columna people deal_owner). A pedido, reemplaza al
// dropdown de solo-nombres del pie: un disparador con avatar + nombre —visible en todos
// los pasos del alta, no solo en el último— que abre un modal con todas las personas
// asignables en tarjetas (avatar y nombre), la elegida marcada y quien está creando
// señalada como "Vos".
//
// El default sigue siendo quien crea: eso lo decide CrearOportunidadForm (asignadoId =
// elegido ?? creadorId); este componente solo muestra y deja elegir. `value`/`onChange`
// trabajan con el id de monday (string), igual que AsignadoSelect, que sigue existiendo
// para el detalle.

function Avatar({ nombre, foto, chico = false }) {
  const clase = chico ? 'asignado-picker__avatar asignado-picker__avatar--chico' : 'asignado-picker__avatar'
  return foto ? (
    <img className={clase} src={foto} alt="" />
  ) : (
    <span className={clase + ' asignado-picker__avatar--iniciales'}>{initialsOf(nombre ?? '')}</span>
  )
}

// Sin tildes y en minúsculas, para que "gonzalez" encuentre a "González".
function normalizar(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export default function AsignadoPicker({ value, creadorId, onChange, disabled = false }) {
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(false)
  const [filtro, setFiltro] = useState('')
  const triggerRef = useRef(null)
  const buscarRef = useRef(null)
  const dialogRef = useRef(null)

  function cargar() {
    setCargando(true)
    setError(null)
    // fetchMondayUsers memoiza la promesa y la descarta si falló, así que reintentar
    // realmente vuelve a preguntar (ver mondayApi.js).
    fetchMondayUsers()
      .then(setUsuarios)
      .catch((err) => setError(err.message || 'No se pudo cargar la lista.'))
      .finally(() => setCargando(false))
  }

  useEffect(cargar, [])

  // Esc cierra, como en cualquier diálogo. Se cuelga solo mientras está abierto.
  useEffect(() => {
    if (!abierto) return
    const onKey = (e) => e.key === 'Escape' && cerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto])

  // El foco entra al buscador al abrir (o al diálogo si la lista es corta y no hay
  // buscador) y vuelve al disparador al cerrar, para que con teclado el modal no sea un
  // pozo.
  useEffect(() => {
    if (abierto) (buscarRef.current ?? dialogRef.current)?.focus()
  }, [abierto])

  function abrir() {
    setFiltro('')
    setAbierto(true)
  }

  function cerrar() {
    setAbierto(false)
    triggerRef.current?.focus()
  }

  function elegir(id) {
    onChange(id)
    cerrar()
  }

  const idElegido = value != null ? String(value) : null
  const seleccionado = usuarios.find((u) => u.id === idElegido) ?? null
  // Mientras la lista no llegó, un `value` ya puesto todavía no tiene nombre: el chip dice
  // "Cargando…" un instante y se completa solo (mismo compromiso que tenía el dropdown).
  const etiqueta = seleccionado?.name ?? (cargando ? 'Cargando…' : 'Sin asignar')

  const filtroNorm = normalizar(filtro)
  const visibles = filtroNorm ? usuarios.filter((u) => normalizar(u.name).includes(filtroNorm)) : usuarios

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="asignado-picker__trigger"
        onClick={abrir}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={'Asignado: ' + etiqueta + '. Cambiar'}
        title={etiqueta}
      >
        <Avatar chico nombre={seleccionado?.name} foto={seleccionado?.photo} />
        <span className="asignado-picker__trigger-nombre">{etiqueta}</span>
        <MdUnfoldMore className="asignado-picker__trigger-icono" aria-hidden="true" />
      </button>

      {abierto &&
        createPortal(
          // Clic en el fondo cierra; el diálogo corta la propagación para que clickearlo no.
          <div className="asignado-picker__overlay" onMouseDown={cerrar}>
            <div
              ref={dialogRef}
              tabIndex={-1}
              className="asignado-picker__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="asignado-picker-titulo"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h2 id="asignado-picker-titulo" className="asignado-picker__titulo">
                ¿Quién queda asignado?
              </h2>
              <p className="asignado-picker__sub">
                La oportunidad arranca asignada a quien la crea; podés pasársela a otra persona.
              </p>

              {usuarios.length > 7 && (
                <input
                  ref={buscarRef}
                  className="asignado-picker__buscar"
                  type="text"
                  placeholder="Buscar por nombre…"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  aria-label="Buscar persona"
                />
              )}

              {error ? (
                <div className="asignado-picker__error">
                  <p>{error}</p>
                  <button type="button" className="asignado-picker__reintentar" onClick={cargar}>
                    Reintentar
                  </button>
                </div>
              ) : (
                <ul className="asignado-picker__lista">
                  {cargando && <li className="asignado-picker__vacio">Cargando personas…</li>}
                  {!cargando && visibles.length === 0 && (
                    <li className="asignado-picker__vacio">Nadie coincide con la búsqueda.</li>
                  )}
                  {visibles.map((u) => {
                    const esElegido = u.id === idElegido
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          className={
                            esElegido
                              ? 'asignado-picker__persona asignado-picker__persona--elegida'
                              : 'asignado-picker__persona'
                          }
                          aria-pressed={esElegido}
                          onClick={() => elegir(u.id)}
                        >
                          <Avatar nombre={u.name} foto={u.photo} />
                          <span className="asignado-picker__persona-nombre">{u.name}</span>
                          {creadorId != null && u.id === String(creadorId) && (
                            <span className="asignado-picker__vos">Vos</span>
                          )}
                          {esElegido && <MdCheck className="asignado-picker__check" aria-hidden="true" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="asignado-picker__pie">
                <button type="button" className="asignado-picker__cancelar" onClick={cerrar}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
