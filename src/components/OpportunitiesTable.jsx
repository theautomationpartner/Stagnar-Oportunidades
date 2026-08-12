import Avatar from './Avatar'
import StatusBadge from './StatusBadge'
import './OpportunitiesTable.css'

function handleRowKeyDown(event, onOpen) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen()
  }
}

export default function OpportunitiesTable({ opportunities, loading, error, onOpenOpportunity }) {
  return (
    <section className="opps-table-wrap">
      <div className="opps-table-wrap__head">
        <span>Oportunidades encontradas ({opportunities.length})</span>
      </div>

      {loading && <div className="opps-table__status">Cargando oportunidades desde monday...</div>}
      {error && <div className="opps-table__status opps-table__status--error">Error: {error}</div>}

      {!loading && !error && (
        <table className="opps-table">
          <thead>
            <tr>
              <th>Oportunidad</th>
              <th>Cliente</th>
              <th>Bien</th>
              <th>Compañías cotizadas</th>
              <th>Estado</th>
              <th>Última cotización</th>
              <th>Asignado a</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.map((opp) => {
              const openThisOpportunity = () => onOpenOpportunity(opp.id)
              return (
                <tr
                  key={opp.id}
                  className="opps-table__row"
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver cotizaciones de ${opp.clienteNombre}`}
                  onClick={openThisOpportunity}
                  onKeyDown={(e) => handleRowKeyDown(e, openThisOpportunity)}
                >
                  <td>
                    <div className="opps-table__opp">
                      <span className="opps-table__opp-id">{opp.oppNumber}</span>
                      <span className="opps-table__opp-name">{opp.clienteNombre}</span>
                    </div>
                  </td>
                  <td>
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
                  </td>
                  <td>
                    <div className="opps-table__bien">
                      <div>{opp.bienLinea1}</div>
                      {opp.bienLinea2 && <div className="opps-table__bien-meta">{opp.bienLinea2}</div>}
                    </div>
                  </td>
                  <td>{opp.companias}</td>
                  <td>
                    <StatusBadge label={opp.estadoLabel} color={opp.estadoColor} />
                  </td>
                  <td>{opp.ultimaCotizacion}</td>
                  <td>
                    <Avatar label={opp.asignadoIniciales} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
