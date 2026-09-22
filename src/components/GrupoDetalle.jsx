import { useCallback, useEffect, useMemo, useState } from 'react'
import { MdArrowBack, MdClear, MdGroups } from 'react-icons/md'
import { Button, Dropdown, TextField } from '@vibe/core'
import AlertModal from './AlertModal'
import LoadingScreen from './LoadingScreen'
import {
  fetchGruposEconomicos,
  fetchClientesGestion,
  agregarClienteAGrupo,
  quitarClienteDeGrupo,
  setRolEnGrupo,
  deleteItem,
  ROLES_GRUPO,
  ROL_GRUPO_DEFAULT,
} from '../services/mondayApi'
import Avatar from './Avatar'
import { initialsOf } from '../services/personaFields'
import { normalizarParaMatch } from '../services/format'
import './GruposSection.css'

// Color por rol (los mismos tonos del tablero: Titular naranja, Miembro verde, Empresa
// vinculada azul) — la fila de cada miembro se distingue de un vistazo por su borde y
// su insignia, sin tener que leer el selector.
const CLASE_POR_ROL = {
  'Titular / Controlante': 'titular',
  Miembro: 'miembro',
  'Empresa vinculada': 'empresa',
}
const claseRol = (rol) => CLASE_POR_ROL[rol] ?? 'sinrol'

// Administración de UN grupo económico (a pedido: la lista de grupos queda afuera, ver
// GruposSection, y todo lo demás se maneja acá adentro): miembros con su rol editable,
// quitar miembros, y agregar clientes buscando con botón (sin live search). Mismas
// reglas que la ficha del cliente: agregar = subitem "miembro" (Cliente + Rol) +
// conexión en el cliente; quitar = borrar ese subitem + limpiar la conexión; un cliente
// pertenece a un grupo a la vez (solo se ofrecen los que no tienen grupo).

export default function GrupoDetalle({ grupoId, onBack, onOpenCliente }) {
  const [grupos, setGrupos] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState('')
  const [confirmar, setConfirmar] = useState(null)

  // Buscar con botón (a pedido, sin live search) — la búsqueda es local (los clientes ya
  // están en memoria) pero el gesto es el mismo que en el resto de la app.
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState(null)
  const [rolElegido, setRolElegido] = useState(ROL_GRUPO_DEFAULT)

  const recargar = useCallback(async () => {
    const [grs, clis] = await Promise.all([fetchGruposEconomicos(), fetchClientesGestion()])
    setGrupos(grs)
    setClientes(clis)
  }, [])

  useEffect(() => {
    let vivo = true
    recargar()
      .catch((err) => vivo && setError(err.message))
      .finally(() => vivo && setLoading(false))
    return () => {
      vivo = false
    }
  }, [recargar])

  const accion = async (clave, fn) => {
    setOcupado(clave)
    setError(null)
    try {
      await fn()
      await recargar()
    } catch (err) {
      setError(err.message)
      await recargar().catch(() => {})
    } finally {
      setOcupado('')
    }
  }

  const grupo = grupos.find((g) => g.id === String(grupoId)) ?? null
  const clientesSinGrupo = useMemo(() => clientes.filter((c) => !c.grupo), [clientes])
  // La ficha completa de cada miembro (CI/RUT, tipo) — los clientes ya están cargados
  // para el alta, así que la tarjeta del integrante los muestra sin pedir nada extra.
  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])

  const buscar = () => {
    // Sin distinguir tildes (normalizarParaMatch): "logistica" encuentra "Logística".
    const q = normalizarParaMatch(busqueda)
    if (q.length < 2) return
    setResultados(
      clientesSinGrupo.filter((c) =>
        [c.name, c.ci, c.rut, c.razonSocial].filter(Boolean).some((v) => normalizarParaMatch(v).includes(q))
      )
    )
  }

  const quitarMiembro = (miembro) =>
    setConfirmar({
      titulo: `¿Quitar a ${miembro.clienteNombre} de ${grupo.name}?`,
      descripcion: 'Se borra el miembro dentro del grupo y se desvincula el cliente. El cliente no se toca.',
      textoOk: 'Quitar del grupo',
      onOk: () =>
        accion(`quitar-${miembro.subitemId}`, () =>
          miembro.clienteId
            ? quitarClienteDeGrupo({ clienteId: miembro.clienteId, subitemIds: [miembro.subitemId] })
            : // Miembro huérfano (subitem sin cliente vinculado): no hay conexión que
              // limpiar del lado del cliente, alcanza con borrar el subitem.
              deleteItem(miembro.subitemId)
        ),
    })

  if (loading) {
    return <LoadingScreen title="Abriendo el grupo" message="Estamos trayendo sus miembros desde monday." />
  }

  if (!grupo) {
    return (
      <div className="grupo-det">
        <Button kind="tertiary" size="small" onClick={onBack}>
          <MdArrowBack /> Grupos económicos
        </Button>
        <p className="grupos__error" role="alert">
          {error || 'No se encontró el grupo.'}
        </p>
      </div>
    )
  }

  return (
    <div className="grupo-det">
      <Button kind="tertiary" size="small" className="grupo-det__volver" onClick={onBack}>
        <MdArrowBack /> Grupos económicos
      </Button>

      <header className="grupo-det__cabecera">
        <span className="grupo-det__icono">
          <MdGroups aria-hidden="true" />
        </span>
        <div>
          <h1>
            {grupo.name}
            {grupo.alias && <span className="grupos__alias"> ({grupo.alias})</span>}
          </h1>
          <p>
            {grupo.miembros.length} miembro{grupo.miembros.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {error && (
        <p className="grupos__error" role="alert">
          {error}
        </p>
      )}

      {/* A pedido: dos columnas para aprovechar el ancho — los miembros a la izquierda
          y el alta de clientes como sección propia a la derecha. */}
      <div className="grupo-det__grid">
        <section className="grupos__card">
          <h2>Miembros</h2>
          {grupo.miembros.length === 0 && (
            <p className="grupos__vacio">Sin miembros todavía — agregá el primero desde la derecha.</p>
          )}
          <ul className="grupos__miembros">
            {grupo.miembros.map((m) => {
              const cli = m.clienteId ? clientePorId.get(m.clienteId) : null
              const meta = cli
                ? [
                    cli.tipo === 'Empresa'
                      ? cli.rut && `RUT: ${cli.rut}`
                      : cli.ci && `CI: ${cli.ci}`,
                    cli.tipo,
                    cli.empresa && `Trabaja en ${cli.empresa.name}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : ''
              return (
                <li key={m.subitemId} className={`grupos__miembro grupos__miembro--${claseRol(m.rol)}`}>
                  <Avatar label={initialsOf(m.clienteNombre)} />
                  <div className="grupos__miembro-nombre">
                    <div className="grupos__miembro-cabecera">
                      {m.clienteId ? (
                        <button
                          type="button"
                          className="grupos__link grupos__link--principal"
                          onClick={() => onOpenCliente?.(m.clienteId)}
                        >
                          {m.clienteNombre}
                        </button>
                      ) : (
                        <span className="grupos__miembro-titulo">{m.clienteNombre}</span>
                      )}
                      <span className={`grupos__rol-chip grupos__rol-chip--${claseRol(m.rol)}`}>
                        {m.rol || 'Sin rol'}
                      </span>
                    </div>
                    {meta && <span className="grupos__miembro-meta">{meta}</span>}
                    {!m.clienteId && <span className="grupos__aviso-suave">Sin cliente vinculado</span>}
                  </div>
                  <div className="grupos__miembro-acciones">
                    <Dropdown
                      size="small"
                      className="grupos__rol"
                      clearable={false}
                      searchable={false}
                      options={ROLES_GRUPO.map((r) => ({ value: r, label: r }))}
                      value={m.rol ? { value: m.rol, label: m.rol } : null}
                      placeholder="Sin rol"
                      disabled={ocupado === `rol-${m.subitemId}`}
                      onChange={(op) => {
                        if (op && op.value !== m.rol)
                          accion(`rol-${m.subitemId}`, () => setRolEnGrupo(m.subitemId, op.value))
                      }}
                    />
                    <Button
                      kind="tertiary"
                      size="small"
                      disabled={ocupado === `quitar-${m.subitemId}`}
                      onClick={() => quitarMiembro(m)}
                    >
                      <MdClear /> Quitar
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="grupos__card">
          <h2>Agregar un cliente</h2>
          <p className="grupos__hint">
            Buscalo por nombre, CI o RUT — solo se ofrecen clientes que todavía no están en ningún grupo.
          </p>
          <div className="grupos__agregar grupos__agregar--seccion">
            <div className="grupos__buscar">
              <TextField
                size="small"
                placeholder={clientesSinGrupo.length ? 'Nombre, CI o RUT' : 'No quedan clientes sin grupo'}
                value={busqueda}
                disabled={!clientesSinGrupo.length}
                onChange={(v) => {
                  setBusqueda(v)
                  setResultados(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && buscar()}
              />
              <Button kind="secondary" size="small" disabled={busqueda.trim().length < 2} onClick={buscar}>
                Buscar
              </Button>
            </div>
            <label className="grupos__rol-label">
              <span>Rol con el que entra</span>
              <Dropdown
                size="small"
                className="grupos__rol"
                clearable={false}
                searchable={false}
                options={ROLES_GRUPO.map((r) => ({ value: r, label: r }))}
                value={{ value: rolElegido, label: rolElegido }}
                onChange={(op) => {
                  if (op) setRolElegido(op.value)
                }}
              />
            </label>
            {resultados !== null && resultados.length === 0 && (
              <p className="grupos__vacio">Sin resultados entre los clientes sin grupo.</p>
            )}
            {(resultados ?? []).length > 0 && (
              <ul className="grupos__resultados">
                {resultados.map((c) => (
                  <li key={c.id} className="grupos__miembro grupos__miembro--sinrol">
                    <div className="grupos__miembro-nombre">
                      <span className="grupos__miembro-titulo">{c.name}</span>
                      <span className="grupos__resultado-meta">
                        {[c.ci && `CI: ${c.ci}`, c.rut && `RUT: ${c.rut}`, c.tipo].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <Button
                      kind="secondary"
                      size="small"
                      disabled={ocupado === 'agregar'}
                      loading={ocupado === 'agregar'}
                      onClick={() =>
                        accion('agregar', async () => {
                          await agregarClienteAGrupo({
                            clienteId: c.id,
                            clienteNombre: c.name,
                            grupoId: grupo.id,
                            rol: rolElegido,
                          })
                          setBusqueda('')
                          setResultados(null)
                          setRolElegido(ROL_GRUPO_DEFAULT)
                        })
                      }
                    >
                      Agregar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {confirmar && (
        <AlertModal
          id="grupo-det-confirmar"
          type="warning"
          title={confirmar.titulo}
          description={confirmar.descripcion}
          primaryButton={{
            text: confirmar.textoOk,
            danger: true,
            onClick: () => {
              const { onOk } = confirmar
              setConfirmar(null)
              onOk()
            },
          }}
          secondaryButton={{ text: 'Cancelar', onClick: () => setConfirmar(null) }}
          onClose={() => setConfirmar(null)}
        />
      )}
    </div>
  )
}
