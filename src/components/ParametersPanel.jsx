import { useState } from 'react'
import { MdExpandLess, MdExpandMore } from 'react-icons/md'
import { Button } from '@vibe/core'
import './ParametersPanel.css'

// Datos de contexto de la oportunidad (solo lectura). Los parámetros que afectan el
// cálculo (bonificación, descuento, recargo, deducible, edad) ahora se editan por
// cotización individual, en cada QuoteCard — ver /logica-monday-vibe.md.
export default function ParametersPanel({ context }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={collapsed ? 'parameters-panel parameters-panel--collapsed' : 'parameters-panel'}>
      <div className="parameters-panel__head">
        <span className="parameters-panel__title">Datos de la oportunidad</span>
        <Button kind="tertiary" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? <MdExpandMore /> : <MdExpandLess />} {collapsed ? 'Mostrar' : 'Ocultar'}
        </Button>
      </div>

      {!collapsed && (
        <>
          <label className="parameters-field parameters-field--readonly">
            <span>Edad del titular</span>
            <input type="text" value={context.edad ? `${context.edad} años` : '—'} readOnly />
          </label>

          <label className="parameters-field parameters-field--readonly">
            <span>Bien</span>
            <input type="text" value={context.bien} readOnly />
          </label>

          <label className="parameters-field parameters-field--readonly">
            <span>Tipo de combustible</span>
            <input type="text" value={context.combustible} readOnly />
          </label>

          <label className="parameters-field parameters-field--readonly">
            <span>CI del titular</span>
            <input type="text" value={context.ci} readOnly />
          </label>

          <label className="parameters-field parameters-field--readonly">
            <span>Teléfono</span>
            <input type="text" value={context.telefono} readOnly />
          </label>

          <label className="parameters-field parameters-field--readonly">
            <span>Nombre y apellido</span>
            <input type="text" value={context.nombre} readOnly />
          </label>

          <p className="parameters-panel__note">
            Los parámetros de cálculo (bonificación, descuento, recargo, deducible, edad) se
            editan en cada cotización, con el botón "Parámetros" de su tarjeta.
          </p>
        </>
      )}
    </aside>
  )
}
