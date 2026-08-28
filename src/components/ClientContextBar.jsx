import { useEffect, useRef, useState } from 'react'
import { MdExpandLess, MdExpandMore, MdSmartphone } from 'react-icons/md'
import { Button } from '@vibe/core'
import ClienteArchivos from './ClienteArchivos'
import { formatShortDate } from '../services/format'
import { initialsOf } from '../services/personaFields'
import './ClientContextBar.css'

// Barra de contexto del Cliente/Lead para los pasos 2, 3 y 4 de una Oportunidad
// (a pedido): una sola línea con lo justo para saber de quién y de qué vehículo es la
// oportunidad, a todo el ancho, CERRADA por defecto. "Ver más" despliega, como
// continuación de la misma tarjeta, SOLO lo que la barra no muestra (nacimiento,
// domicilio, ID de monday, tipo de vehículo, documentos) — nada se repite — como panel
// flotante por ENCIMA del contenido de abajo (no lo empuja); se cierra con click afuera,
// Escape o el mismo botón. Las acciones (Editar/Recotizar) van en la barra.
export default function ClientContextBar({ opportunity, onEdit, actions, tag }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const toggleRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const situacion = opportunity.clienteSituacion || ''
  const esLead = situacion.toLowerCase() === 'lead'
  const ubicacion = [opportunity.departamento, opportunity.zonaCirculacion].filter(Boolean).join(' — ')
  const vehiculo = [opportunity.marca, opportunity.modelo].filter(Boolean).join(' ')
  const vehiculoMeta = [opportunity.anio && `(${opportunity.anio})`, opportunity.combustible, opportunity.uso]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={open ? 'client-bar client-bar--open' : 'client-bar'} ref={rootRef}>
      <div className="client-bar__row">
        <div className="client-bar__avatar" aria-hidden="true">
          {initialsOf(opportunity.clienteNombre)}
        </div>
        <div className="client-bar__main">
          <div className="client-bar__line">
            <strong className="client-bar__name">{opportunity.clienteNombre}</strong>
            {tag && <span className="client-bar__tag">{tag}</span>}
            {situacion && <span className="client-bar__tag">{situacion}</span>}
            <span className="client-bar__sep" aria-hidden="true">·</span>
            <span className="client-bar__data">CI {opportunity.ci || '—'}</span>
            <span className="client-bar__sep" aria-hidden="true">·</span>
            <span className="client-bar__data">
              <MdSmartphone /> {opportunity.telefono || '—'}
            </span>
          </div>
          <div className="client-bar__line client-bar__line--vehiculo">
            <span className="client-bar__vehiculo">{vehiculo || 'Sin vehículo cargado'}</span>
            {vehiculoMeta && <span className="client-bar__vehiculo-meta">{vehiculoMeta}</span>}
          </div>
        </div>
        <div className="client-bar__actions">
          {actions}
          {onEdit && (
            <Button kind="tertiary" size="small" onClick={onEdit}>
              Editar
            </Button>
          )}
          <Button
            ref={toggleRef}
            kind="tertiary"
            size="small"
            className="client-bar__toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="client-bar-panel"
          >
            {open ? 'Ver menos' : 'Ver más'} {open ? <MdExpandLess /> : <MdExpandMore />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="client-bar__panel" id="client-bar-panel" role="region" aria-label="Más datos del cliente">
          <dl className="client-bar__details">
            <div className="client-bar__detail">
              <dt>Nacimiento</dt>
              <dd>{opportunity.fechaNacimiento ? formatShortDate(opportunity.fechaNacimiento) : '—'}</dd>
            </div>
            <div className="client-bar__detail">
              <dt>{opportunity.clienteId ? 'Domicilio' : 'Ubicación'}</dt>
              <dd>{opportunity.clienteId ? opportunity.clienteDomicilio || '—' : ubicacion || '—'}</dd>
            </div>
            <div className="client-bar__detail">
              <dt>Zona de circulación</dt>
              <dd>{ubicacion || '—'}</dd>
            </div>
            <div className="client-bar__detail">
              <dt>Tipo de vehículo</dt>
              <dd>{opportunity.tipo || '—'}</dd>
            </div>
            <div className="client-bar__detail">
              <dt>ID en monday</dt>
              <dd>{opportunity.id}</dd>
            </div>
          </dl>
          {opportunity.clienteId && (
            <ClienteArchivos contactoId={opportunity.clienteId} tipo={esLead ? 'lead' : 'cliente'} />
          )}
        </div>
      )}
    </div>
  )
}
