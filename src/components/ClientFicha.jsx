import { MdEdit, MdLocationOn, MdSmartphone, MdHome } from 'react-icons/md'
import { Button } from '@vibe/core'
import ClienteArchivos from './ClienteArchivos'
import { formatShortDate, modeloSinMarca } from '../services/format'
import { initialsOf } from '../services/personaFields'
import './ClientFicha.css'

// Ficha del cliente/Lead de la oportunidad — antes solo vivía en el paso "Cotizar" (ver
// CotizarStepPanel.jsx), a pedido ahora se repite igual en el resto de los pasos
// (Comparar/Confirmar/Emitir, ver OpportunityDetail.jsx) en vez de la tarjeta más simple
// que tenían antes. Componente propio (no duplicado en cada lugar que lo usa) para que
// los dos queden siempre iguales si se retoca el diseño.
// `tag`: badge chico al lado del nombre (ej. el número corto de la oportunidad, solo lo
// usa OpportunityDetail). `actions`: nodo extra en el header, al lado de "Editar" (ej.
// "Recotizar", solo en Comparar/Confirmar). `onEdit` ausente esconde el link "Editar"
// del header (datos personales). `onEditVehiculo` (a pedido: "Editar" separado para
// Datos personales y para Vehículo, cada uno abre su propio popup con solo esos
// campos, ver CotizarStepPanel.jsx) — ausente esconde el link "Editar" de la sección
// Vehículo; los demás usos de ClientFicha (que no lo pasan) quedan sin ese botón, sin
// cambios. `children`: contenido extra dentro de la misma tarjeta, debajo del Vehículo
// (ej. la propuesta elegida en el paso "Emitir", ver EmitirStepPanel.jsx) — para no
// repetir la info personal/del vehículo en una tarjeta aparte.
// `showDocumentos` (default true): sección "Documentos del cliente/lead" (columna
// Archivos del tablero Clientes, ver ClienteArchivos) — solo aparece si la oportunidad
// tiene un Cliente/Lead vinculado (opportunity.clienteId, llega en el detalle).
export default function ClientFicha({
  opportunity,
  onEdit,
  onEditVehiculo,
  tag,
  actions,
  children,
  showDocumentos = true,
}) {
  const ubicacion = [opportunity.departamento, opportunity.zonaCirculacion].filter(Boolean).join(' — ')
  // A pedido: "Cliente" o "Lead" según la Situación real en el tablero Clientes — no
  // llamar "cliente" a quien todavía es un lead.
  const situacion = opportunity.clienteSituacion || ''
  const esLead = situacion.toLowerCase() === 'lead'

  return (
    <div className="client-ficha">
      <div className="client-ficha__header">
        <div className="client-ficha__identity">
          <div className="client-ficha__avatar">{initialsOf(opportunity.clienteNombre)}</div>
          <div className="client-ficha__heading">
            <div className="client-ficha__name-row">
              <h3 className="client-ficha__name">{opportunity.clienteNombre}</h3>
              {tag && <span className="client-ficha__tag">{tag}</span>}
              {situacion && <span className="client-ficha__tag">{situacion}</span>}
            </div>
            {/* A pedido: una sola línea de ubicación. Con Cliente/Lead vinculado se muestra
                su domicilio principal (casa: Dirección, Localidad, Departamento del tablero
                Clientes); solo si la oportunidad no tiene persona vinculada (casos viejos)
                se cae a la ubicación de circulación propia de la oportunidad, para no
                perder el dato. */}
            {opportunity.clienteId ? (
              <span className="client-ficha__address" title="Domicilio principal">
                <MdHome />
                {opportunity.clienteDomicilio || 'Sin domicilio cargado'}
              </span>
            ) : (
              <span className="client-ficha__address" title="Ubicación">
                <MdLocationOn />
                {ubicacion || 'Sin ubicación cargada'}
              </span>
            )}
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
        <span className="client-ficha__badge">Nacimiento: {opportunity.fechaNacimiento ? formatShortDate(opportunity.fechaNacimiento) : "—"}</span>
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
        <div className="client-ficha__vehiculo-head">
          <span className="client-ficha__vehiculo-label">Vehículo</span>
          {onEditVehiculo && (
            <Button kind="tertiary" className="client-ficha__edit-link" onClick={onEditVehiculo}>
              <MdEdit /> Editar
            </Button>
          )}
        </div>
        <strong className="client-ficha__vehiculo-title">
          {[opportunity.marca, modeloSinMarca(opportunity.marca, opportunity.modelo)].filter(Boolean).join(' ') || 'Sin vehículo cargado'}
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

      {showDocumentos && opportunity.clienteId && (
        <ClienteArchivos contactoId={opportunity.clienteId} tipo={esLead ? 'lead' : 'cliente'} />
      )}

      {children}
    </div>
  )
}
