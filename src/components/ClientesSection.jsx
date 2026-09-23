import { useEffect, useMemo, useState } from 'react'
import { MdChevronLeft, MdChevronRight, MdClear, MdContactPhone, MdGroups, MdPeopleAlt, MdSearch } from 'react-icons/md'
import { Button, Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell, EmptyState, TextField } from '@vibe/core'
import Avatar from './Avatar'
import LoadingScreen from './LoadingScreen'
import StatusBadge from './StatusBadge'
import { fetchClientesGestion } from '../services/mondayApi'
import { initialsOf } from '../services/personaFields'
import { normalizarParaMatch } from '../services/format'
// El estilo pill-tabs se importa por componente (no es global) — sin esto las solapas
// Clientes/Grupos quedaban como botones pelados.
import './PillTabs.css'
import './ClientesSection.css'

// Tabla de Clientes — puerta de entrada a la gestión de cada uno (contactos, empresa
// donde trabaja, relaciones y grupo económico, ver ClienteGestion). El tablero es chico
// (decenas), así que se trae entero y la búsqueda filtra local — sin paginado ni cursor.

const COLUMNS = [
  { id: 'cliente', title: 'Cliente', width: '26%' },
  { id: 'tipo', title: 'Tipo', width: '12%' },
  { id: 'contactos', title: 'Contactos', width: '22%' },
  { id: 'empresa', title: 'Empresa donde trabaja', width: '20%' },
  { id: 'grupo', title: 'Grupo económico', width: '20%' },
]

// Colores fijos (no salen del schema en vivo como los de Oportunidades): acá el tipo es
// parte del modelo de la app — naranja empresa, verde particular, gris otro/su falta.
export const TIPO_CLIENTE_COLORS = {
  Empresa: { bg: '#fdab3d', border: '#e99729' },
  Particular: { bg: '#00c875', border: '#00b461' },
  Otro: { bg: '#c4c4c4', border: '#b0b0b0' },
}
const TIPO_COLOR_DEFAULT = { bg: '#c4c4c4', border: '#b0b0b0' }

// A pedido: la tabla pagina de a 50 como máximo (todo está en memoria — el paginado es
// solo para que la página no se haga interminable, no hay cursor de por medio).
const PAGE_SIZE = 50

// Números de página con "…" — misma idea que la tabla de Oportunidades (getPageNumbers),
// en versión mínima: primera, última, la actual con una de margen, y el resto resumido.
function paginasVisibles(actual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = [...new Set([1, total, actual - 1, actual, actual + 1])]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b)
  const conHuecos = []
  set.forEach((p, i) => {
    if (i > 0 && p - set[i - 1] > 1) conHuecos.push(null)
    conHuecos.push(p)
  })
  return conHuecos
}

export default function ClientesSection({ onOpenCliente, onIrAGrupos, onIrAContactos }) {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // A pedido, igual que el resto de la app: la búsqueda NO es en vivo. `busqueda` es lo
  // que se está tipeando y `termino` lo que de verdad filtra la tabla — se aplica recién
  // con "Buscar" o Enter.
  const [busqueda, setBusqueda] = useState('')
  const [termino, setTermino] = useState('')
  const [page, setPage] = useState(1)

  const buscar = (valor = busqueda) => {
    setTermino(valor)
    setPage(1)
  }

  useEffect(() => {
    let vivo = true
    fetchClientesGestion()
      .then((lista) => {
        if (vivo) setClientes(lista)
      })
      .catch((err) => {
        if (vivo) setError(err.message)
      })
      .finally(() => {
        if (vivo) setLoading(false)
      })
    return () => {
      vivo = false
    }
  }, [])

  const filtrados = useMemo(() => {
    // Sin distinguir tildes (normalizarParaMatch): "logistica" encuentra "Logística".
    const q = normalizarParaMatch(termino)
    if (!q) return clientes
    return clientes.filter((c) =>
      [c.name, c.nombre, c.apellido, c.ci, c.rut, c.razonSocial, c.grupo?.name, c.empresa?.name]
        .filter(Boolean)
        .some((v) => normalizarParaMatch(v).includes(q))
    )
  }, [clientes, termino])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  const paginaActual = Math.min(page, totalPaginas)
  const pagina = useMemo(
    () => filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE),
    [filtrados, paginaActual]
  )
  const primeraFila = filtrados.length === 0 ? 0 : (paginaActual - 1) * PAGE_SIZE + 1
  const ultimaFila = filtrados.length === 0 ? 0 : primeraFila + pagina.length - 1

  // La misma pantalla verde que Grupos y el fallback de Suspense: el esqueleto de la
  // tabla era otra espera distinta para lo mismo.
  if (loading) {
    return <LoadingScreen title="Cargando clientes" message="Estamos trayendo la lista de clientes desde monday." />
  }

  return (
    <section className="clientes">
      <header className="clientes__head">
        <h1>Clientes</h1>
        <p>Elegí un cliente para gestionar sus contactos, relaciones y grupo económico.</p>
      </header>

      {/* Una sola fila de herramientas (a pedido, antes las solapas ocupaban un renglón
          entero): solapas Clientes/Grupos + buscador + conteo. Las solapas son las dos
          entradas de la misma gestión — por cliente (esta tabla) o por grupo económico
          (GruposSection). */}
      <div className="clientes__toolbar">
        <div className="pill-tabs clientes__tabs" role="tablist">
          <button type="button" role="tab" aria-selected="true" className="pill-tabs__tab pill-tabs__tab--active">
            <MdPeopleAlt aria-hidden="true" /> Clientes
          </button>
          <button type="button" role="tab" aria-selected="false" className="pill-tabs__tab" onClick={onIrAGrupos}>
            <MdGroups aria-hidden="true" /> Grupos económicos
          </button>
          <button type="button" role="tab" aria-selected="false" className="pill-tabs__tab" onClick={onIrAContactos}>
            <MdContactPhone aria-hidden="true" /> Contactos
          </button>
        </div>
        <div className="clientes__buscador">
          <TextField
            size="medium"
            placeholder="Buscar por nombre, CI, RUT, razón social, grupo..."
            icon={MdClear}
            value={busqueda}
            onChange={(v) => {
              setBusqueda(v)
              // Borrar todo el texto vuelve a la lista completa sin apretar Buscar: es
              // "salir de la búsqueda", no una búsqueda nueva.
              if (!v.trim()) buscar('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
          />
          <Button kind="secondary" size="medium" onClick={() => buscar()}>
            <MdSearch /> Buscar
          </Button>
          <span className="clientes__conteo">
            {termino.trim()
              ? `${filtrados.length} de ${clientes.length} clientes`
              : `${clientes.length} clientes`}
          </span>
        </div>
      </div>

      <div className="clientes__tabla">
        {/* isLoading en false siempre: mientras carga, el componente devuelve la
            pantalla de carga y no llega a renderizar la tabla. */}
        <Table
          columns={COLUMNS}
          size="large"
          style={{ '--table-row-size': '68px' }}
          dataState={{ isLoading: false, isError: Boolean(error) }}
          errorState={<EmptyState title="Error" description={error || 'No se pudieron cargar los clientes.'} />}
          emptyState={<EmptyState title="Sin clientes" description="No se encontraron clientes para mostrar." />}
        >
          <TableHeader>
            {COLUMNS.map((col) => (
              <TableHeaderCell key={col.id} title={col.title} />
            ))}
          </TableHeader>
          <TableBody>
            {pagina.map((c) => {
              const abrir = () => onOpenCliente(c.id)
              return (
                <TableRow key={c.id} className="clientes__row">
                  <TableCell>
                    <div
                      className="clientes__celda clientes__celda--cliente"
                      role="button"
                      tabIndex={0}
                      aria-label={`Gestionar ${c.name}`}
                      onClick={abrir}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          abrir()
                        }
                      }}
                    >
                      <Avatar label={initialsOf(c.name)} />
                      <div>
                        <div className="clientes__nombre">{c.name}</div>
                        <div className="clientes__meta">
                          {c.tipo === 'Empresa'
                            ? [c.rut && `RUT: ${c.rut}`, c.razonSocial].filter(Boolean).join(' · ')
                            : c.ci
                              ? `CI: ${c.ci}`
                              : ''}
                          {c.estado ? `${c.ci || c.rut || c.razonSocial ? ' · ' : ''}${c.estado}` : ''}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="clientes__celda" onClick={abrir}>
                      {c.tipo ? (
                        <StatusBadge label={c.tipo} color={TIPO_CLIENTE_COLORS[c.tipo] ?? TIPO_COLOR_DEFAULT} />
                      ) : (
                        <span className="clientes__vacio">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="clientes__celda" onClick={abrir}>
                      {c.contactos.length ? (
                        <span className="clientes__lista-nombres">{c.contactos.map((x) => x.name).join(', ')}</span>
                      ) : (
                        <span className="clientes__vacio">Sin contactos</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="clientes__celda" onClick={abrir}>
                      {c.empresa ? c.empresa.name : <span className="clientes__vacio">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="clientes__celda" onClick={abrir}>
                      {c.grupo ? c.grupo.name : <span className="clientes__vacio">—</span>}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Paginado local, máx 50 por página (a pedido) — misma estética que la tabla de
          Oportunidades: resumen a la izquierda, números clickeables en el medio. */}
      {filtrados.length > PAGE_SIZE && (
        <div className="clientes__paginado">
          <span className="clientes__paginado-resumen">
            Mostrando {primeraFila} a {ultimaFila} de {filtrados.length} clientes
          </span>
          <div className="clientes__paginado-paginas">
            <button
              type="button"
              className="clientes__page-btn"
              onClick={() => setPage(paginaActual - 1)}
              disabled={paginaActual <= 1}
              aria-label="Página anterior"
            >
              <MdChevronLeft />
            </button>
            {paginasVisibles(paginaActual, totalPaginas).map((p, i) =>
              p === null ? (
                <span key={`hueco-${i}`} className="clientes__page-gap">
                  …
                </span>
              ) : (
                <button
                  type="button"
                  key={p}
                  className={p === paginaActual ? 'clientes__page-btn clientes__page-btn--activa' : 'clientes__page-btn'}
                  onClick={() => setPage(p)}
                  aria-current={p === paginaActual ? 'page' : undefined}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              className="clientes__page-btn"
              onClick={() => setPage(paginaActual + 1)}
              disabled={paginaActual >= totalPaginas}
              aria-label="Página siguiente"
            >
              <MdChevronRight />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
