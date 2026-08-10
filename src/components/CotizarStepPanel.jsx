import { useState, useEffect } from 'react'
import { MdEdit, MdSave, MdClose, MdAutorenew } from 'react-icons/md'
import { Button, Dropdown, AttentionBox, Loader, TextField, NumberField } from '@vibe/core'
import { COTIZAR_FIELDS, getMissingCotizarFields } from '../services/cotizarFields'
import { searchAutodataModelos } from '../services/mondayApi'
import StatusBadge from './StatusBadge'
import './CotizarStepPanel.css'

function buildInitialForm(opportunity, dropdownOptions) {
  const form = {
    ci: opportunity.ci,
    anio: opportunity.anio,
    modelo: opportunity.modelo,
    // Solo se completa si en esta edición se elige un modelo nuevo del buscador
    // Autodata (ver AutodataModeloSelect) — null significa "no se tocó", se sigue
    // usando el `modelo` (texto) real de arriba tal cual está.
    modeloSeleccion: null,
    marca: opportunity.marca,
    combustible: opportunity.combustible,
    uso: opportunity.uso,
    tipo: opportunity.tipo,
    fechaNacimiento: opportunity.fechaNacimiento,
  }
  // Campos "connected" (Departamento, Zona de circulación/Localidad): el form necesita
  // el ID real (para el Dropdown y para guardar), no solo el nombre que ya trae
  // `opportunity` — se busca por nombre en la lista real de cada uno (dropdownOptions,
  // ver idKey/optionsKey en cotizarFields.js).
  for (const field of COTIZAR_FIELDS) {
    if (field.kind !== 'connected') continue
    const options = dropdownOptions[field.optionsKey] ?? []
    const current = options.find((o) => o.name === opportunity[field.key])
    form[field.key] = opportunity[field.key]
    form[field.idKey] = current?.id ?? ''
  }
  return form
}

// Adaptador Dropdown (de @vibe/core) <-> nuestros campos de string/id plano:
// Dropdown maneja objetos {value, label} como opción seleccionada, no un
// string/id suelto como nuestro estado de formulario — la conversión de ida
// y vuelta pasa toda acá adentro, el resto del componente sigue viendo
// strings/ids comunes (mismo patrón ya usado en FilterPanel.jsx).
// Modelo (Autodata): a diferencia de Departamento, el tablero vinculado (AUTODATA V1 +
// V2) tiene más de 15.000 ítems combinados — no se puede precargar como el resto de
// los "connected". Se busca en vivo por texto (mínimo 2 caracteres, debounce 300ms)
// contra la API real (ver mondayApi.js#searchAutodataModelos) y se muestra hasta ~24
// coincidencias. `value` es la selección NUEVA hecha en esta edición ({id, name} o
// null si no se tocó) — el texto real actual (`currentLabel`) se muestra como
// placeholder para que se vea qué modelo tiene cargado hoy la oportunidad.
function AutodataModeloSelect({ currentLabel, value, onChange }) {
  const [inputValue, setInputValue] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = inputValue.trim()
    if (term.length < 2) {
      setOptions([])
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      searchAutodataModelos(term)
        .then((results) => {
          if (!cancelled) setOptions(results.map((r) => ({ value: r.id, label: r.name })))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [inputValue])

  const selected = value ? { value: value.id, label: value.name } : null

  return (
    <Dropdown
      searchable
      options={options}
      value={selected}
      loading={loading}
      onInputChange={(input) => setInputValue(input ?? '')}
      placeholder={currentLabel ? `Actual: ${currentLabel}` : 'Buscar modelo...'}
      noOptionsMessage={inputValue.trim().length < 2 ? 'Escribí para buscar' : 'Sin resultados'}
      clearable
      onClear={() => onChange(null)}
      onChange={(option) => onChange(option ? { id: option.value, name: option.label } : null)}
    />
  )
}

function FieldControl({ field, value, onChange, options, currentModelo }) {
  if (field.kind === 'text') {
    return <TextField size="small" value={value} onChange={(newValue) => onChange(newValue)} />
  }
  if (field.kind === 'number') {
    // NumberField (@vibe/core) maneja number|null, el form de este panel sigue en
    // string (mismo criterio que el resto de los campos) — se adapta acá mismo.
    return (
      <NumberField
        size="small"
        value={value === '' ? null : Number(value)}
        onChange={(newValue) => onChange(newValue == null ? '' : String(newValue))}
      />
    )
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
    // A diferencia de 'dropdown'/'status' (donde `options` son strings sueltos), acá
    // vienen como {id, name} — mismo campo `options` (dropdownOptions[f.optionsKey]),
    // distinto shape según el tipo real de la columna.
    const connectedOptions = options.map((o) => ({ value: o.id, label: o.name }))
    const selected = connectedOptions.find((o) => o.value === value) ?? null
    return (
      <Dropdown
        options={connectedOptions}
        value={selected}
        placeholder="Sin definir"
        clearable
        onClear={() => onChange('')}
        onChange={(option) => onChange(option?.value ?? '')}
      />
    )
  }
  if (field.kind === 'autodata') {
    return <AutodataModeloSelect currentLabel={currentModelo} value={value} onChange={onChange} />
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
  onSave,
  estadoCotizacion,
  estadoCotizacionColor,
  polling,
  errorDetail,
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => buildInitialForm(opportunity, dropdownOptions))
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
    setForm(buildInitialForm(opportunity, dropdownOptions))
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
                value={
                  f.kind === 'connected'
                    ? form[f.idKey]
                    : f.key === 'modelo'
                      ? form.modeloSeleccion
                      : form[f.key]
                }
                onChange={(v) => {
                  if (f.kind === 'connected') return handleFieldChange(f.idKey, v)
                  if (f.key === 'modelo') return handleFieldChange('modeloSeleccion', v)
                  return handleFieldChange(f.key, v)
                }}
                options={dropdownOptions[f.optionsKey] ?? []}
                currentModelo={opportunity.modelo}
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

      {/* Sin ícono manual — AttentionBox ya pone el suyo propio según "type" (acá
          duplicaba el de advertencia). */}
      {!editing && !polling && !canCotizar && (
        <AttentionBox type="negative">
          Completá estos campos antes de {hasQuotes ? 'recotizar' : 'cotizar'}:{' '}
          <strong>{missingFields.map((f) => f.label).join(', ')}</strong>.
        </AttentionBox>
      )}

      {!editing && polling && (
        <AttentionBox type="warning" icon={false}>
          <Loader size={13} className="cotizar-step__spinner" />
          {hasQuotes ? 'Recotizando' : 'Cotizando'} con las compañías... esto puede tardar unos
          segundos. La pantalla se va a actualizar sola apenas esté lista.
        </AttentionBox>
      )}

      {!editing && !polling && hasQuotes && !confirmingRecotizar && (
        <AttentionBox type="positive">
          <div className="cotizar-step__banner-row">
            <span>
              Esta oportunidad ya tiene cotizaciones cargadas. Pasá al paso "Comparar y
              enviar" para verlas.
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
            Al recotizar se van a <strong>eliminar todos los datos de la cotización
            actual</strong> (todas las tarjetas por compañía y cobertura) y se van a
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

      {/* A pedido: el botón "Cotizar" (caso sin cotizaciones todavía) se sacó de acá —
          ahora vive al lado de los datos del cliente, ver OpportunityDetail.jsx. */}

      {!editing && !polling && errorDetail && (
        <div className="cotizar-step__error-detail">
          <strong>Detalle del error (último update en la oportunidad):</strong>
          <pre>{errorDetail}</pre>
        </div>
      )}
    </div>
  )
}
