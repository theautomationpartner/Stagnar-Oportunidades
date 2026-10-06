import { useRef, useState } from 'react'
import { MdClear, MdContactPhone, MdGroupAdd, MdGroups, MdPeopleAlt, MdSearch } from 'react-icons/md'
import { Button, EmptyState, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, TextField } from '@vibe/core'
import { buscarGruposEconomicos, createGrupoEconomico } from '../services/mondayApi'
// El estilo pill-tabs se importa por componente (no es global) — mismas solapas que
// General/Global/Triple en las cotizaciones.
import './PillTabs.css'
import './GruposSection.css'

// Lista de Grupos Económicos (a pedido: lista, no tarjetas con todo a la vista) — de acá
// se entra a cada grupo para administrarlo (miembros, roles, altas/bajas: ver
// GrupoDetalle). Lo único que se hace desde la lista es crear un grupo nuevo.
//
// A pedido: no se traen todos los grupos con sus miembros — la lista arranca vacía y se
// busca en monday por nombre o alias recién con "Buscar" o Enter.

// La última búsqueda, para que al volver de un grupo la lista siga como estaba.
const ultimaBusqueda = { termino: '', grupos: null }

const COLUMNS = [
  { id: 'grupo', title: 'Grupo', width: '34%' },
  { id: 'alias', title: 'Alias', width: '18%' },
  { id: 'miembros', title: 'Miembros', width: '48%' },
]

export default function GruposSection({ onOpenGrupo, onIrAClientes, onIrAContactos }) {
  // null = todavía no se buscó nada (la tabla invita a buscar).
  const [grupos, setGrupos] = useState(ultimaBusqueda.grupos)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState(ultimaBusqueda.termino)
  const [termino, setTermino] = useState(ultimaBusqueda.termino)
  const ultimaBusquedaRef = useRef(0)
  const [ocupado, setOcupado] = useState(false)
  const [creando, setCreando] = useState(false)
  const [nuevoGrupo, setNuevoGrupo] = useState({ nombre: '', alias: '' })

  const buscar = async (valor = busqueda) => {
    const q = valor.trim()
    setTermino(q)
    setError(null)
    if (q.length < 2) {
      setGrupos(null)
      Object.assign(ultimaBusqueda, { termino: '', grupos: null })
      return
    }
    const esta = ++ultimaBusquedaRef.current
    setBuscando(true)
    try {
      const lista = await buscarGruposEconomicos(q, { limit: 100 })
      if (esta === ultimaBusquedaRef.current) {
        setGrupos(lista)
        Object.assign(ultimaBusqueda, { termino: q, grupos: lista })
      }
    } catch (err) {
      if (esta === ultimaBusquedaRef.current) setError(err.message)
    } finally {
      if (esta === ultimaBusquedaRef.current) setBuscando(false)
    }
  }

  const crearGrupo = async () => {
    setOcupado(true)
    setError(null)
    try {
      const { id } = await createGrupoEconomico({ nombre: nuevoGrupo.nombre.trim(), alias: nuevoGrupo.alias })
      setNuevoGrupo({ nombre: '', alias: '' })
      setCreando(false)
      // Directo adentro del grupo recién creado, que es donde se le cargan los miembros.
      onOpenGrupo(id)
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="grupos">
      <header className="grupos__head">
        <h1>Grupos económicos</h1>
        <p>Entrá a un grupo para administrar sus miembros y roles, o creá uno nuevo.</p>
      </header>

      <div className="grupos__barra">
        <div className="pill-tabs grupos__tabs" role="tablist">
          <button type="button" role="tab" aria-selected="false" className="pill-tabs__tab" onClick={onIrAClientes}>
            <MdPeopleAlt aria-hidden="true" /> Clientes
          </button>
          <button type="button" role="tab" aria-selected="true" className="pill-tabs__tab pill-tabs__tab--active">
            <MdGroups aria-hidden="true" /> Grupos económicos
          </button>
          <button type="button" role="tab" aria-selected="false" className="pill-tabs__tab" onClick={onIrAContactos}>
            <MdContactPhone aria-hidden="true" /> Contactos
          </button>
        </div>

        <div className="grupos__buscador">
          <TextField
            size="medium"
            placeholder="Buscar por nombre o alias del grupo..."
            icon={MdClear}
            value={busqueda}
            onChange={(v) => {
              setBusqueda(v)
              // Borrar todo el texto limpia la tabla sin apretar Buscar.
              if (!v.trim()) buscar('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
          />
          <Button kind="secondary" size="medium" loading={buscando} disabled={busqueda.trim().length < 2} onClick={() => buscar()}>
            <MdSearch /> Buscar
          </Button>
          {grupos !== null && !buscando && (
            <span className="grupos__conteo">{grupos.length === 1 ? '1 grupo' : `${grupos.length} grupos`}</span>
          )}
        </div>

        {!creando && (
          <Button kind="primary" size="medium" onClick={() => setCreando(true)}>
            <MdGroupAdd /> Crear grupo
          </Button>
        )}
      </div>

      {creando && (
        <div className="grupos__nuevo">
          <TextField
            size="medium"
            title="Nombre del grupo"
            placeholder="Ej: Grupo Pérez"
            value={nuevoGrupo.nombre}
            onChange={(v) => setNuevoGrupo((p) => ({ ...p, nombre: v }))}
          />
          <TextField
            size="medium"
            title="Alias (opcional)"
            placeholder="Ej: Pérez Hnos."
            value={nuevoGrupo.alias}
            onChange={(v) => setNuevoGrupo((p) => ({ ...p, alias: v }))}
          />
          <div className="grupos__nuevo-acciones">
            <Button
              kind="primary"
              size="medium"
              disabled={!nuevoGrupo.nombre.trim() || ocupado}
              loading={ocupado}
              onClick={crearGrupo}
            >
              Crear grupo
            </Button>
            <Button kind="tertiary" size="medium" onClick={() => setCreando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="grupos__error" role="alert">
          {error}
        </p>
      )}

      <div className="grupos__tabla">
        <Table
          columns={COLUMNS}
          size="large"
          style={{ '--table-row-size': '60px' }}
          dataState={{ isLoading: buscando, isError: Boolean(error) }}
          errorState={<EmptyState title="Error" description={error || 'No se pudieron buscar los grupos.'} />}
          emptyState={
            grupos === null ? (
              <EmptyState title="Buscá un grupo" description="Escribí el nombre o el alias del grupo y tocá Buscar." />
            ) : (
              <EmptyState title="Sin resultados" description={`No hay grupos para «${termino}».`} />
            )
          }
        >
          <TableHeader>
            {COLUMNS.map((col) => (
              <TableHeaderCell key={col.id} title={col.title} />
            ))}
          </TableHeader>
          <TableBody>
            {(grupos ?? []).map((g) => {
              const abrir = () => onOpenGrupo(g.id)
              return (
                <TableRow key={g.id} className="grupos__row">
                  <TableCell>
                    <div
                      className="grupos__celda grupos__celda--nombre"
                      role="button"
                      tabIndex={0}
                      aria-label={`Administrar ${g.name}`}
                      onClick={abrir}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          abrir()
                        }
                      }}
                    >
                      <MdGroups aria-hidden="true" /> {g.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grupos__celda" onClick={abrir}>
                      {g.alias || <span className="grupos__celda-vacia">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grupos__celda" onClick={abrir}>
                      {g.miembros.length ? (
                        <span className="grupos__celda-miembros">
                          <strong>{g.miembros.length}</strong> — {g.miembros.map((m) => m.clienteNombre).join(', ')}
                        </span>
                      ) : (
                        <span className="grupos__celda-vacia">Sin miembros</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
