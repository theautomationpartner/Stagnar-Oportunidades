import { useEffect, useState } from 'react'
import { MdContactPhone, MdGroupAdd, MdGroups, MdPeopleAlt } from 'react-icons/md'
import { Button, EmptyState, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, TextField } from '@vibe/core'
import LoadingScreen from './LoadingScreen'
import { fetchGruposEconomicos, createGrupoEconomico } from '../services/mondayApi'
// El estilo pill-tabs se importa por componente (no es global) — mismas solapas que
// General/Global/Triple en las cotizaciones.
import './PillTabs.css'
import './GruposSection.css'

// Lista de Grupos Económicos (a pedido: lista, no tarjetas con todo a la vista) — de acá
// se entra a cada grupo para administrarlo (miembros, roles, altas/bajas: ver
// GrupoDetalle). Lo único que se hace desde la lista es crear un grupo nuevo.

const COLUMNS = [
  { id: 'grupo', title: 'Grupo', width: '34%' },
  { id: 'alias', title: 'Alias', width: '18%' },
  { id: 'miembros', title: 'Miembros', width: '48%' },
]

export default function GruposSection({ onOpenGrupo, onIrAClientes, onIrAContactos }) {
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [creando, setCreando] = useState(false)
  const [nuevoGrupo, setNuevoGrupo] = useState({ nombre: '', alias: '' })

  const recargar = () => fetchGruposEconomicos().then(setGrupos)

  useEffect(() => {
    let vivo = true
    fetchGruposEconomicos()
      .then((grs) => vivo && setGrupos(grs))
      .catch((err) => vivo && setError(err.message))
      .finally(() => vivo && setLoading(false))
    return () => {
      vivo = false
    }
  }, [])

  const crearGrupo = async () => {
    setOcupado(true)
    setError(null)
    try {
      const { id } = await createGrupoEconomico({ nombre: nuevoGrupo.nombre.trim(), alias: nuevoGrupo.alias })
      setNuevoGrupo({ nombre: '', alias: '' })
      setCreando(false)
      await recargar().catch(() => {})
      // Directo adentro del grupo recién creado, que es donde se le cargan los miembros.
      onOpenGrupo(id)
    } catch (err) {
      setError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  if (loading) {
    return <LoadingScreen title="Cargando grupos económicos" message="Estamos trayendo los grupos y sus miembros desde monday." />
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
          dataState={{ isLoading: false, isError: Boolean(error) }}
          errorState={<EmptyState title="Error" description={error || 'No se pudieron cargar los grupos.'} />}
          emptyState={
            <EmptyState title="Sin grupos" description="Todavía no hay grupos económicos — creá el primero con el botón de arriba." />
          }
        >
          <TableHeader>
            {COLUMNS.map((col) => (
              <TableHeaderCell key={col.id} title={col.title} />
            ))}
          </TableHeader>
          <TableBody>
            {grupos.map((g) => {
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
