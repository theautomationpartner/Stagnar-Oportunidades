import { useEffect, useMemo, useState } from 'react'
import { MdChevronLeft, MdChevronRight, MdContactPhone, MdGroups, MdPeopleAlt, MdSearch } from 'react-icons/md'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell, EmptyState, TextField } from '@vibe/core'
import Avatar from './Avatar'
import { fetchContactosCrmTodos } from '../services/mondayApi'
import { initialsOf } from '../services/personaFields'
import { normalizarParaMatch } from '../services/format'
// El estilo pill-tabs se importa por componente (no es global), igual que en Clientes y
// Grupos: sin esto las solapas quedan como botones pelados.
import './PillTabs.css'
import './ContactosSection.css'

// Tabla del tablero Contactos: a quién se le manda la información. Es una vista de
// consulta — de acá no se edita nada; el alta y la vinculación pasan por el paso 1 de
// Crear Oportunidad.
//
// El tablero es chico (decenas), así que se trae entero y la búsqueda filtra en memoria.
// El recorrido con cursor igual está en fetchContactosCrmTodos: el día que crezca, lo que
// falla en silencio es traer una sola página y no enterarse.

const COLUMNS = [
  { id: 'contacto', title: 'Contacto', width: '30%' },
  { id: 'telefono', title: 'Teléfono', width: '20%' },
  { id: 'email', title: 'Email', width: '25%' },
  { id: 'clientes', title: 'Clientes', width: '25%' },
]

// A pedido: máximo 50 por página. Todo está en memoria — el paginado existe para que la
// página no se haga interminable, no hay cursor de por medio.
const PAGE_SIZE = 50

// Números de página con "…": primera, última, la actual con una de margen, y el resto
// resumido. Mismo criterio que las otras tablas de la app.
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

// Un contacto puede estar vinculado a varios Clientes y la lista entera no entra en una
// celda. Se resume por cantidad y los nombres quedan en el title, al alcance del mouse.
// La cantidad sale de clienteIds y no de contar comas: monday junta los nombres con ", "
// y un cliente con coma en el nombre daría un número inventado.
function clientesDeContacto(c) {
  const cuantos = c.clienteIds?.length ?? 0
  if (!cuantos || !c.clienteNombre) return null
  return {
    resumen: cuantos === 1 ? c.clienteNombre : `${cuantos} clientes`,
    detalle: c.clienteNombre,
  }
}

export default function ContactosSection({ onIrAClientes, onIrAGrupos }) {
  const [contactos, setContactos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let vivo = true
    fetchContactosCrmTodos()
      .then((lista) => {
        if (vivo) setContactos(lista)
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
    // Sin distinguir tildes (normalizarParaMatch): "lucia" encuentra "Lucía".
    const q = normalizarParaMatch(busqueda)
    if (!q) return contactos
    return contactos.filter((c) =>
      [c.name, c.telefono, c.email, c.clienteNombre]
        .filter(Boolean)
        .some((v) => normalizarParaMatch(v).includes(q))
    )
  }, [contactos, busqueda])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  const paginaActual = Math.min(page, totalPaginas)
  const pagina = useMemo(
    () => filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE),
    [filtrados, paginaActual]
  )
  const primeraFila = filtrados.length === 0 ? 0 : (paginaActual - 1) * PAGE_SIZE + 1
  const ultimaFila = filtrados.length === 0 ? 0 : primeraFila + pagina.length - 1

  return (
    <section className="contactos">
      <header className="contactos__head">
        <h1>Contactos</h1>
        <p>A quién se le manda la información. Un contacto puede pertenecer a varios clientes.</p>
      </header>

      {/* Las tres solapas son las tres vistas de lo mismo: por cliente, por grupo
          económico y por contacto. Misma barra que Clientes y Grupos. */}
      <div className="contactos__toolbar">
        <div className="pill-tabs contactos__tabs" role="tablist">
          <button type="button" role="tab" aria-selected="false" className="pill-tabs__tab" onClick={onIrAClientes}>
            <MdPeopleAlt aria-hidden="true" /> Clientes
          </button>
          <button type="button" role="tab" aria-selected="false" className="pill-tabs__tab" onClick={onIrAGrupos}>
            <MdGroups aria-hidden="true" /> Grupos económicos
          </button>
          <button type="button" role="tab" aria-selected="true" className="pill-tabs__tab pill-tabs__tab--active">
            <MdContactPhone aria-hidden="true" /> Contactos
          </button>
        </div>
        <TextField
          size="medium"
          wrapperClassName="contactos__buscador"
          placeholder="Buscar por nombre, teléfono, email o cliente..."
          icon={MdSearch}
          value={busqueda}
          onChange={(v) => {
            setBusqueda(v)
            setPage(1)
          }}
        />
        <span className="contactos__conteo">
          {loading ? 'Cargando...' : `${filtrados.length} de ${contactos.length} contactos`}
        </span>
      </div>

      <div className="contactos__tabla">
        <Table
          columns={COLUMNS}
          size="large"
          style={{ '--table-row-size': '68px' }}
          dataState={{ isLoading: loading, isError: Boolean(error) }}
          errorState={<EmptyState title="Error" description={error || 'No se pudieron cargar los contactos.'} />}
          emptyState={<EmptyState title="Sin contactos" description="No se encontraron contactos para mostrar." />}
        >
          <TableHeader>
            {COLUMNS.map((col) => (
              <TableHeaderCell key={col.id} title={col.title} />
            ))}
          </TableHeader>
          <TableBody>
            {pagina.map((c) => {
              const clientes = clientesDeContacto(c)
              return (
                <TableRow key={c.id} className="contactos__row">
                  <TableCell>
                    <div className="contactos__celda contactos__celda--contacto">
                      <Avatar label={initialsOf(c.name)} />
                      <span className="contactos__nombre">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="contactos__celda">
                      {c.telefono || <span className="contactos__vacio">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="contactos__celda">
                      {c.email || <span className="contactos__vacio">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="contactos__celda">
                      {clientes ? (
                        <span className="contactos__clientes" title={clientes.detalle}>
                          {clientes.resumen}
                        </span>
                      ) : (
                        <span className="contactos__vacio">Sin cliente</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {filtrados.length > PAGE_SIZE && (
        <div className="contactos__paginado">
          <span className="contactos__paginado-resumen">
            Mostrando {primeraFila} a {ultimaFila} de {filtrados.length} contactos
          </span>
          <div className="contactos__paginado-paginas">
            <button
              type="button"
              className="contactos__page-btn"
              onClick={() => setPage(paginaActual - 1)}
              disabled={paginaActual <= 1}
              aria-label="Página anterior"
            >
              <MdChevronLeft />
            </button>
            {paginasVisibles(paginaActual, totalPaginas).map((p, i) =>
              p === null ? (
                <span key={`hueco-${i}`} className="contactos__page-gap">
                  …
                </span>
              ) : (
                <button
                  type="button"
                  key={p}
                  className={
                    p === paginaActual ? 'contactos__page-btn contactos__page-btn--activa' : 'contactos__page-btn'
                  }
                  onClick={() => setPage(p)}
                  aria-current={p === paginaActual ? 'page' : undefined}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              className="contactos__page-btn"
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
