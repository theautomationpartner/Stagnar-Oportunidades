import { MdChevronLeft, MdChevronRight } from 'react-icons/md'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell, EmptyState, Button } from '@vibe/core'
import Avatar from './Avatar'
import StatusBadge from './StatusBadge'
import './OpportunitiesTable.css'

// A pedido: anchos explícitos en vez del reparto parejo por defecto (7 columnas a
// ancho igual) — "Bien" y "Cliente" traen 2 líneas de texto y quedaban muy angostas
// (se veían cortadas); "Última cotización" ahora es una fecha corta (dd/mm/aa, ver
// formatShortDate) y "Asignado a" solo un avatar, así que les alcanza con bastante
// menos.
// Mismo tamaño de página que usa App.jsx para cortar `opportunities` — acá solo hace
// falta para calcular el rango "mostrando X-Y" del encabezado (ver más abajo).
const PAGE_SIZE = 20

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
  onOpenOpportunity,
}) {
  // `opportunities` acá es solo la página actual (20, ver PAGE_SIZE en App.jsx) —
  // `totalFiltered` es el total de resultados de la búsqueda/filtros (sobre TODO lo
  // cargado, no solo esta página) y `totalLoaded` cuántas oportunidades se trajeron del
  // tablero antes de filtrar. boardTotalCount es el total REAL del tablero (items_count,
  // sin el límite de la consulta) — si es mayor a totalLoaded, se llegó al techo de la
  // consulta (500) y hay que avisar en vez de dejar creer que se buscó sobre todo.
  const isFiltered = totalFiltered !== totalLoaded
  const hitFetchCap = boardTotalCount > totalLoaded
  const firstShown = totalFiltered === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastShown = totalFiltered === 0 ? 0 : firstShown + opportunities.length - 1

  return (
    <section className="opps-table-wrap">
      <div className="opps-table-wrap__head">
        <span>
          {isFiltered
            ? `${totalFiltered} resultado${totalFiltered === 1 ? '' : 's'} de ${totalLoaded} oportunidades — mostrando ${firstShown}-${lastShown}`
            : `Oportunidades encontradas (${totalFiltered}) — mostrando ${firstShown}-${lastShown}`}
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

      {/* A pedido: paginado de a 20 (ver PAGE_SIZE, App.jsx) — solo Anterior/Siguiente +
          "Página X de Y", nada de números de página sueltos (con 500 oportunidades como
          techo, la lista de páginas sería larguísima). Se esconde con 1 sola página, no
          tiene sentido mostrar controles que no hacen nada. */}
      {totalPages > 1 && (
        <div className="opps-table-wrap__pagination">
          <Button kind="tertiary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            <MdChevronLeft /> Anterior
          </Button>
          <span className="opps-table-wrap__pagination-label">
            Página {page} de {totalPages}
          </span>
          <Button kind="tertiary" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
            Siguiente <MdChevronRight />
          </Button>
        </div>
      )}
    </section>
  )
}
