import { useState } from 'react'
import {
  MdCheckCircle,
  MdSend,
  MdEdit,
  MdSave,
  MdClose,
  MdAutorenew,
  MdWarningAmber,
} from 'react-icons/md'
import { Button, Dropdown, AttentionBox } from '@vibe/core'
import { COTIZAR_FIELDS, getMissingCotizarFields } from '../services/cotizarFields'
import StatusBadge from './StatusBadge'
import './CotizarStepPanel.css'

function buildInitialForm(opportunity, departamentos) {
  const currentDept = departamentos.find((d) => d.name === opportunity.departamento)
  return {
    ci: opportunity.ci,
    anio: opportunity.anio,
    modelo: opportunity.modelo,
    marca: opportunity.marca,
    combustible: opportunity.combustible,
    uso: opportunity.uso,
    tipo: opportunity.tipo,
    fechaNacimiento: opportunity.fechaNacimiento,
    zonaCirculacion: opportunity.zonaCirculacion,
    departamentoId: currentDept?.id ?? '',
  }
}

// Adaptador Dropdown (de @vibe/core) <-> nuestros campos de string/id plano:
// Dropdown maneja objetos {value, label} como opción seleccionada, no un
// string/id suelto como nuestro estado de formulario — la conversión de ida
// y vuelta pasa toda acá adentro, el resto del componente sigue viendo
// strings/ids comunes (mismo patrón ya usado en FilterPanel.jsx).
function FieldControl({ field, value, onChange, options, departamentos }) {
  if (field.kind === 'text' || field.kind === 'location') {
    return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
  }
  if (field.kind === 'number') {
    return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
  }
  if (field.kind === 'date') {
    return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
  }
  if (field.kind === 'dropdown' || field.kind === 'status') {
    const dropdownOptions = options.map((opt) => ({ value: opt, label: opt }))
    const selected = dropdownOptions.find((o) => o.value === value) ?? null
    return (
      <Dropdown
        options={dropdownOptions}
        value={selected}
        placeholder="Sin definir"
        clearable
        onClear={() => onChange('')}
        onChange={(option) => onChange(option?.value ?? '')}
      />
    )
  }
  if (field.kind === 'connected') {
    const deptOptions = departamentos.map((d) => ({ value: d.id, label: d.name }))
    const selected = deptOptions.find((o) => o.value === value) ?? null
    return (
      <Dropdown
        options={deptOptions}
        value={selected}
        placeholder="Sin definir"
        clearable
        onClear={() => onChange('')}
        onChange={(option) => onChange(option?.value ?? '')}
      />
    )
  }
  return null
}

export default function CotizarStepPanel({
  opportunity,
  hasQuotes,
  onMarcarParaCotizar,
  marking,
  markError,
  dropdownOptions,
  departamentos,
  onSave,
  estadoCotizacion,
  estadoCotizacionColor,
  polling,
  errorDetail,
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => buildInitialForm(opportunity, departamentos))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [confirmingRecotizar, setConfirmingRecotizar] = useState(false)

  // Ningún campo base puede quedar vacío: si falta alguno, no dejamos cotizar/recotizar
  // (la automatización de monday que genera los subitems necesita todos estos datos).
  const missingFields = getMissingCotizarFields(opportunity)
  const canCotizar = missingFields.length === 0

  const handleRecotizarConfirm = () => {
    setConfirmingRecotizar(false)
    onMarcarParaCotizar()
  }

  const startEditing = () => {
    setForm(buildInitialForm(opportunity, departamentos))
    setSaveError(null)
    setEditing(true)
  }

  const handleFieldChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaveError(null)
    const missing = getMissingCotizarFields(form)
    if (missing.length > 0) {
      setSaveError(
        `Completá estos campos antes de guardar: ${missing.map((f) => f.label).join(', ')}.`
      )
      return
    }
    setSaving(true)
    try {
      await onSave(form)
      setEditing(false)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cotizar-step">
      <div className="cotizar-step__head">
        <div>
          <h2 className="cotizar-step__title">Datos con los que se generó la cotización</h2>
          <p className="cotizar-step__subtitle">
            Esta es la información de la oportunidad que se usa como base para cotizar en las
            compañías.
          </p>
          {estadoCotizacion && (
            <div className="cotizar-step__estado">
              <span>Estado de cotización:</span>
              <StatusBadge label={estadoCotizacion} color={estadoCotizacionColor} />
            </div>
          )}
        </div>
        {!editing && (
          <Button kind="secondary" onClick={startEditing}>
            <MdEdit /> Editar
          </Button>
        )}
      </div>

      {!editing && (
        <div className="cotizar-step__grid">
          {COTIZAR_FIELDS.map((f) => (
            <div className="cotizar-step__field" key={f.key}>
              <span className="cotizar-step__field-label">{f.label}</span>
              <span className="cotizar-step__field-value">{opportunity[f.key] || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="cotizar-step__grid">
          {COTIZAR_FIELDS.map((f) => (
            <label className="cotizar-step__field cotizar-step__field--edit" key={f.key}>
              <span className="cotizar-step__field-label">{f.label}</span>
              <FieldControl
                field={f}
                value={f.key === 'departamento' ? form.departamentoId : form[f.key]}
                onChange={(v) => handleFieldChange(f.key === 'departamento' ? 'departamentoId' : f.key, v)}
                options={dropdownOptions[f.optionsKey] ?? []}
                departamentos={departamentos}
              />
            </label>
          ))}
        </div>
      )}

      {editing && (
        <div className="cotizar-step__edit-actions">
          <Button kind="primary" onClick={handleSave} disabled={saving}>
            <MdSave /> {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
          <Button kind="secondary" onClick={() => setEditing(false)} disabled={saving}>
            <MdClose /> Cancelar
          </Button>
          {saveError && <p className="cotizar-step__error">Error: {saveError}</p>}
        </div>
      )}

      {!editing && !polling && !canCotizar && (
        <AttentionBox type="negative">
          <MdWarningAmber /> Completá estos campos antes de {hasQuotes ? 'recotizar' : 'cotizar'}:{' '}
          <strong>{missingFields.map((f) => f.label).join(', ')}</strong>.
        </AttentionBox>
      )}

      {!editing && polling && (
        <AttentionBox type="warning" icon={false}>
          <span className="cotizar-step__spinner" aria-hidden="true" />
          {hasQuotes ? 'Recotizando' : 'Cotizando'} con las compañías... esto puede tardar unos
          segundos. La pantalla se va a actualizar sola apenas esté lista.
        </AttentionBox>
      )}

      {!editing && !polling && hasQuotes && !confirmingRecotizar && (
        <AttentionBox type="positive">
          <div className="cotizar-step__banner-row">
            <span>
              <MdCheckCircle /> Esta oportunidad ya tiene cotizaciones cargadas. Pasá al paso
              "Comparar y enviar" para verlas.
            </span>
            <Button
              kind="secondary"
              className="cotizar-step__recotizar-btn"
              onClick={() => setConfirmingRecotizar(true)}
              disabled={marking || !canCotizar}
            >
              <MdAutorenew /> Recotizar
            </Button>
          </div>
        </AttentionBox>
      )}

      {!editing && !polling && hasQuotes && confirmingRecotizar && (
        <AttentionBox type="negative">
          <p>
            <MdWarningAmber /> Al recotizar se van a <strong>eliminar todos los datos de la
            cotización actual</strong> (todas las tarjetas por compañía y cobertura) y se van a
            generar unos nuevos desde cero. ¿Confirmás?
          </p>
          <div className="cotizar-step__warning-actions">
            <Button kind="primary" onClick={handleRecotizarConfirm} disabled={marking || !canCotizar}>
              <MdAutorenew /> {marking ? 'Marcando...' : 'Sí, recotizar'}
            </Button>
            <Button kind="secondary" onClick={() => setConfirmingRecotizar(false)} disabled={marking}>
              Cancelar
            </Button>
          </div>
          {markError && <p className="cotizar-step__error">Error: {markError}</p>}
        </AttentionBox>
      )}

      {!editing && !polling && !hasQuotes && (
        <AttentionBox type="warning">
          <div className="cotizar-step__banner-row">
            <p>Todavía no se generó ninguna cotización para esta oportunidad.</p>
            <Button kind="primary" onClick={onMarcarParaCotizar} disabled={marking || !canCotizar}>
              <MdSend /> {marking ? 'Marcando...' : 'Cotizar'}
            </Button>
          </div>
          {markError && <p className="cotizar-step__error">Error: {markError}</p>}
        </AttentionBox>
      )}

      {!editing && !polling && errorDetail && (
        <div className="cotizar-step__error-detail">
          <strong>Detalle del error (último update en la oportunidad):</strong>
          <pre>{errorDetail}</pre>
        </div>
      )}
    </div>
  )
}
