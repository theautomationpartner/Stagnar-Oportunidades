import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell, EmptyState } from '@vibe/core'
import Avatar from './Avatar'
import StatusBadge from './StatusBadge'
import './OpportunitiesTable.css'

const COLUMNS = [
  { id: 'oportunidad', title: 'Oportunidad' },
  { id: 'cliente', title: 'Cliente' },
  { id: 'bien', title: 'Bien' },
  { id: 'companias', title: 'Compañías cotizadas' },
  { id: 'estado', title: 'Estado' },
  { id: 'ultimaCotizacion', title: 'Última cotización' },
  { id: 'asignado', title: 'Asignado a' },
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
function ClickableCell({ children, onOpen, focusable, ariaLabel }) {
  return (
    <div
      className="opps-table__clickable-cell"
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

export default function OpportunitiesTable({ opportunities, loading, error, onOpenOpportunity }) {
  return (
    <section className="opps-table-wrap">
      <div className="opps-table-wrap__head">
        <span>Oportunidades encontradas ({opportunities.length})</span>
      </div>

      {/* size="large" (48px) no alcanza para 2 líneas de texto + avatar de
          nuestras celdas (el row height del Table de @vibe/core es fijo, no
          crece solo con el contenido) — se pisa la variable CSS que usa
          internamente para darle más alto real. */}
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
                    <div className="opps-table__opp">
                      <span className="opps-table__opp-id">{opp.oppNumber}</span>
                      <span className="opps-table__opp-name">{opp.clienteNombre}</span>
                    </div>
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
                  <ClickableCell onOpen={openThisOpportunity}>
                    <Avatar label={opp.asignadoIniciales} />
                  </ClickableCell>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}
