import { MdEdit, MdLocationOn, MdSmartphone } from 'react-icons/md'
import { Button } from '@vibe/core'
import './ClientFicha.css'

// Ficha del cliente/Lead de la oportunidad — antes solo vivía en el paso "Cotizar" (ver
// CotizarStepPanel.jsx), a pedido ahora se repite igual en el resto de los pasos
// (Comparar/Confirmar/Emitir, ver OpportunityDetail.jsx) en vez de la tarjeta más simple
// que tenían antes. Componente propio (no duplicado en cada lugar que lo usa) para que
// los dos queden siempre iguales si se retoca el diseño.
// `tag`: badge chico al lado del nombre (ej. el número corto de la oportunidad, solo lo
// usa OpportunityDetail). `actions`: nodo extra en el header, al lado de "Editar" (ej.
// "Recotizar", solo en Comparar/Confirmar). `onEdit` ausente esconde el link "Editar".
// `children`: contenido extra dentro de la misma tarjeta, debajo del Vehículo (ej. la
// propuesta elegida en el paso "Emitir", ver EmitirStepPanel.jsx) — para no repetir la
// info personal/del vehículo en una tarjeta aparte.
export default function ClientFicha({ opportunity, onEdit, tag, actions, children }) {
  const ubicacion = [opportunity.departamento, opportunity.zonaCirculacion].filter(Boolean).join(' — ')

  return (
    <div className="client-ficha">
      <div className="client-ficha__header">
        <div className="client-ficha__identity">
          <div className="client-ficha__avatar">{opportunity.clienteNombre.slice(0, 2).toUpperCase()}</div>
          <div className="client-ficha__heading">
            <div className="client-ficha__name-row">
              <h3 className="client-ficha__name">{opportunity.clienteNombre}</h3>
              {tag && <span className="client-ficha__tag">{tag}</span>}
            </div>
            <span className="client-ficha__address">
              <MdLocationOn />
              {ubicacion || 'Sin ubicación cargada'}
            </span>
          </div>
        </div>
        <div className="client-ficha__header-actions">
          {actions}
          {onEdit && (
            <Button kind="tertiary" className="client-ficha__edit-link" onClick={onEdit}>
              <MdEdit /> Editar
            </Button>
          )}
        </div>
      </div>

      <div className="client-ficha__badges">
        <span className="client-ficha__badge">CI: {opportunity.ci || '—'}</span>
        <span className="client-ficha__badge">Nacimiento: {opportunity.fechaNacimiento || '—'}</span>
        <span className="client-ficha__badge">
          <MdSmartphone />
          {opportunity.telefono || '—'}
        </span>
        {/* A pedido: id real del ítem en monday, como dato extra — útil para ir a
            buscarlo directo en monday si hace falta (soporte, debug), sin tener que
            andar deduciéndolo de la URL. */}
        <span className="client-ficha__badge">ID: {opportunity.id}</span>
      </div>

      <div className="client-ficha__vehiculo">
        <span className="client-ficha__vehiculo-label">Vehículo</span>
        <strong className="client-ficha__vehiculo-title">
          {[opportunity.marca, opportunity.modelo].filter(Boolean).join(' ') || 'Sin vehículo cargado'}
          {opportunity.anio && ` (${opportunity.anio})`}
        </strong>
        {(opportunity.combustible || opportunity.tipo || opportunity.uso) && (
          <span className="client-ficha__vehiculo-meta">
            {[opportunity.combustible, opportunity.tipo, opportunity.uso && `Uso ${opportunity.uso}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>

      {children}
    </div>
  )
}
