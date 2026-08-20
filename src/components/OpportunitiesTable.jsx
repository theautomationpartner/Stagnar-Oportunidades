import { MdChevronLeft, MdChevronRight } from 'react-icons/md'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell, EmptyState, Dropdown } from '@vibe/core'
import Avatar from './Avatar'
import StatusBadge from './StatusBadge'
import './OpportunitiesTable.css'

// A pedido: anchos explícitos en vez del reparto parejo por defecto (7 columnas a
// ancho igual) — "Bien" y "Cliente" traen 2 líneas de texto y quedaban muy angostas
// (se veían cortadas); "Última cotización" ahora es una fecha corta (dd/mm/aa, ver
// formatShortDate) y "Asignado a" solo un avatar, así que les alcanza con bastante
// menos.
const COLUMNS = [
  { id: 'oportunidad', title: 'Oportunidad', width: '13%' },
  { id: 'cliente', title: 'Cliente', width: '21%' },
  { id: 'bien', title: 'Bien', width: '21%' },
  { id: 'companias', title: 'Compañías cotizadas', width: '15%' },
  { id: 'estado', title: 'Estado', width: '14%' },
  { id: 'ultimaCotizacion', title: 'Última cotización', width: '9%' },
  { id: 'asignado', title: 'Asignado a', width: '7%' },
]

function handleRowKeyDown(event, onOpen) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen()
  }
}

// A pedido: números de página clickeables (1, 2, 3...) en vez de solo "Página X de Y"
// — siempre se ven la 1ra, la última, y la actual con una de margen a cada lado;
// el resto se resume con "…" para no listar las 50 páginas que puede llegar a haber
// (500 oportunidades / 10 por página). `null` en el array marca dónde va cada "…".
function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const withGaps = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) withGaps.push(null)
    withGaps.push(p)
  })
  return withGaps
}

// Envuelve el contenido de cada celda con el mismo click handler — así toda
// la fila queda clickeable (no solo un botón al final), sin depender de un
// onClick en TableRow (el componente nativo no lo soporta, solo className/
// style/id). El foco por teclado vive únicamente en la primera celda de la
// fila, como punto de entrada accesible equivalente al de toda la fila.
function ClickableCell({ children, onOpen, focusable, ariaLabel, className }) {
  return (
    <div
      className={className ? `opps-table__clickable-cell ${className}` : 'opps-table__clickable-cell'}
      onClick={onOpen}
      role={focusable ? 'button' : undefined}
      aria-label={focusable ? ariaLabel : undefined}
      tabIndex={focusable ? 0 : undefined}
      onKeyDown={focusable ? (e) => handleRowKeyDown(e, onOpen) : undefined}
    >
      {children}
    </div>
  )
}

const PAGE_SIZE_DROPDOWN_OPTIONS_DEFAULT = [10, 25, 50, 100]

export default function OpportunitiesTable({
  opportunities,
  totalFiltered,
  totalLoaded,
  boardTotalCount,
  loading,
  error,
  page,
  totalPages,
  onPageChange,
  pageSize,
  pageSizeOptions = PAGE_SIZE_DROPDOWN_OPTIONS_DEFAULT,
  onPageSizeChange,
  onOpenOpportunity,
}) {
  // `opportunities` acá es solo la página actual (ver `pageSize`, elegible desde el pie
  // de la tabla) — `totalFiltered` es el total de resultados de la búsqueda/filtros
  // (sobre TODO lo cargado, no solo esta página) y `totalLoaded` cuántas oportunidades
  // se trajeron del tablero antes de filtrar. boardTotalCount es el total REAL del
  // tablero (items_count, sin el límite de la consulta) — si es mayor a totalLoaded, se
  // llegó al techo de la consulta (500) y hay que avisar en vez de dejar creer que se
  // buscó sobre todo.
  const isFiltered = totalFiltered !== totalLoaded
  const hitFetchCap = boardTotalCount > totalLoaded
  const firstShown = totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1
  const lastShown = totalFiltered === 0 ? 0 : firstShown + opportunities.length - 1
  const pageSizeSelected = pageSizeOptions.map((n) => ({ value: String(n), label: String(n) })).find(
    (o) => Number(o.value) === pageSize
  )

  return (
    <section className="opps-table-wrap">
      <div className="opps-table-wrap__head">
        <span>
          {isFiltered
            ? `${totalFiltered} resultado${totalFiltered === 1 ? '' : 's'} de ${totalLoaded} oportunidades`
            : `Oportunidades encontradas (${totalFiltered})`}
        </span>
        {hitFetchCap && (
          <span className="opps-table-wrap__cap-warning">
            Mostrando {totalLoaded} de {boardTotalCount} — hay más oportunidades en el
            tablero de las que se pueden cargar de una.
          </span>
        )}
      </div>

      {/* size="large" (48px) no alcanza para 2 líneas de texto + avatar de
          nuestras celdas (el row height del Table de @vibe/core es fijo, no
          crece solo con el contenido) — se pisa la variable CSS que usa
          internamente para darle más alto real. Envuelta en su propio div
          (opps-table-wrap__table) para que el min-width del scroll horizontal en
          mobile (ver CSS) apunte puntual a la tabla y no a la barra de paginación de
          más abajo, que ahora también es un hijo directo de .opps-table-wrap. */}
      <div className="opps-table-wrap__table">
      <Table
        columns={COLUMNS}
        size="large"
        style={{ '--table-row-size': '76px' }}
        dataState={{ isLoading: loading, isError: Boolean(error) }}
        errorState={<EmptyState title="Error" description={error || 'Ocurrió un error al cargar las oportunidades.'} />}
        emptyState={<EmptyState title="Sin oportunidades" description="No se encontraron oportunidades para mostrar." />}
      >
        <TableHeader>
          {COLUMNS.map((col) => (
            <TableHeaderCell key={col.id} title={col.title} />
          ))}
        </TableHeader>
        <TableBody>
          {opportunities.map((opp) => {
            const openThisOpportunity = () => onOpenOpportunity(opp.id)
            const ariaLabel = `Ver cotizaciones de ${opp.clienteNombre}`
            return (
              <TableRow key={opp.id} className="opps-table__row">
                <TableCell>
                  <ClickableCell onOpen={openThisOpportunity} focusable ariaLabel={ariaLabel}>
                    <span className="opps-table__opp-id">{opp.oppNumber}</span>
                  </ClickableCell>
                </TableCell>
                <TableCell>
                  <ClickableCell onOpen={openThisOpportunity}>
                    <div className="opps-table__cliente">
                      <Avatar label={opp.clienteNombre.slice(0, 2).toUpperCase()} />
                      <div>
                        <div className="opps-table__cliente-name">{opp.clienteNombre}</div>
                        <div className="opps-table__cliente-meta">
                          {opp.ci && <span>CI: {opp.ci}</span>}
                          {opp.telefono && <span>Tel: {opp.telefono}</span>}
                        </div>
                      </div>
                    </div>
                  </ClickableCell>
                </TableCell>
                <TableCell>
                  <ClickableCell onOpen={openThisOpportunity}>
                    <div className="opps-table__bien">
                      <div>{opp.bienLinea1}</div>
                      {opp.bienLinea2 && <div className="opps-table__bien-meta">{opp.bienLinea2}</div>}
                    </div>
                  </ClickableCell>
                </TableCell>
                <TableCell>
                  <ClickableCell onOpen={openThisOpportunity}>{opp.companias}</ClickableCell>
                </TableCell>
                <TableCell>
                  <ClickableCell onOpen={openThisOpportunity}>
                    <StatusBadge label={opp.estadoLabel} color={opp.estadoColor} />
                  </ClickableCell>
                </TableCell>
                <TableCell>
                  <ClickableCell onOpen={openThisOpportunity}>{opp.ultimaCotizacion}</ClickableCell>
                </TableCell>
                <TableCell>
                  <ClickableCell onOpen={openThisOpportunity} className="opps-table__asignado-cell">
                    <Avatar label={opp.asignadoIniciales} />
                  </ClickableCell>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </div>

      {/* A pedido, estética tipo mockup: 3 zonas — "Mostrando X a Y de Z" a la
          izquierda, números de página clickeables en el medio (ver getPageNumbers,
          con "…" para no listar las 50 páginas que puede haber con 500 oportunidades
          como techo), y a la derecha el selector de cuántas mostrar por página
          (10/25/50/100). Antes era "Anterior/Siguiente" + "Página X de Y" nomás. Se
          esconde solo si no hay ningún resultado (ahí ya se ve el emptyState de la
          tabla, no hace falta paginado de nada). */}
      {totalFiltered > 0 && (
        <div className="opps-table-wrap__pagination">
          <span className="opps-table-wrap__pagination-summary">
            Mostrando {firstShown} a {lastShown} de {totalFiltered} oportunidad{totalFiltered === 1 ? '' : 'es'}
          </span>

          <div className="opps-table-wrap__pagination-pages">
            <button
              type="button"
              className="opps-table-wrap__page-btn"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="Página anterior"
            >
              <MdChevronLeft />
            </button>
            {getPageNumbers(page, totalPages).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="opps-table-wrap__page-gap">
                  …
                </span>
              ) : (
                <button
                  type="button"
                  key={p}
                  className={
                    p === page
                      ? 'opps-table-wrap__page-btn opps-table-wrap__page-btn--active'
                      : 'opps-table-wrap__page-btn'
                  }
                  onClick={() => onPageChange(p)}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              className="opps-table-wrap__page-btn"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              aria-label="Página siguiente"
            >
              <MdChevronRight />
            </button>
          </div>

          <div className="opps-table-wrap__page-size">
            <span>Mostrar</span>
            <Dropdown
              size="small"
              className="opps-table-wrap__page-size-dropdown"
              options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
              value={pageSizeSelected}
              searchable={false}
              clearable={false}
              onChange={(option) => onPageSizeChange(Number(option.value))}
            />
          </div>
        </div>
      )}
    </section>
  )
}
