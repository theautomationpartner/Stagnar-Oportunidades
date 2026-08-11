import { useEffect, useState } from 'react'
import { MdEdit, MdSave, MdClose, MdAutorenew, MdSend } from 'react-icons/md'
import { Button, Dropdown, AttentionBox, Loader, TextField, NumberField } from '@vibe/core'
import { COTIZAR_FIELDS, getMissingCotizarFields } from '../services/cotizarFields'
import { matchesSearchQuery } from '../services/format'
import StatusBadge from './StatusBadge'
import AutodataModeloPorAnioMarca from './AutodataModeloPorAnioMarca'
import AlertModal from './AlertModal'
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
// strings/ids comunes (mismo patrón ya usado en FilterPanel.jsx). `searchable` +
// filterOption (matchesSearchQuery, ver services/format.js) en los 3 primeros — a
// pedido, antes no se podía filtrar tipeando en ninguno de estos.
function FieldControl({ field, value, onChange, options, anio, marca, tipo, combustible }) {
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
        searchable
        filterOption={(option, inputValue) => matchesSearchQuery(option.label, inputValue)}
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
        searchable
        filterOption={(option, inputValue) => matchesSearchQuery(option.label, inputValue)}
        clearable
        onClear={() => onChange('')}
        onChange={(option) => onChange(option?.value ?? '')}
      />
    )
  }
  if (field.kind === 'autodata') {
    // A pedido: filtrado por Año + Marca ya elegidos en esta misma edición (antes era
    // una búsqueda libre por texto sin acotar, mismo componente que ya usa
    // CrearOportunidadForm.jsx para lo mismo).
    return (
      <AutodataModeloPorAnioMarca anio={anio} marca={marca} tipo={tipo} combustible={combustible} value={value} onChange={onChange} />
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
  onSave,
  estadoCotizacion,
  estadoCotizacionColor,
  polling,
  errorDetail,
  onBack,
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => buildInitialForm(opportunity, dropdownOptions))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [confirmingRecotizar, setConfirmingRecotizar] = useState(false)

  // A pedido, estética tipo mockup: popup compartido (AlertModal) para "Error al
  // cotizar" en vez de texto suelto — cerrarlo es solo visual, `marking` se resetea a
  // true en cada intento nuevo (ver handleMarcarParaCotizar en OpportunityDetail.jsx,
  // que también limpia markError/errorDetail ahí mismo), así que vuelve a aparecer si
  // el reintento vuelve a fallar en vez de quedar escondido para siempre.
  const [errorModalDismissed, setErrorModalDismissed] = useState(false)
  useEffect(() => {
    if (marking) setErrorModalDismissed(false)
  }, [marking])

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

  // A pedido, estética tipo mockup: la grilla de solo lectura se muestra agrupada en 3
  // columnas (Cédula/Fecha Nacimiento/Ubicación, Marca/Modelo/Año, Combustible/Tipo/
  // Uso) en vez de la lista plana de COTIZAR_FIELDS — Ubicación combina Departamento +
  // Localidad en una sola celda (son 2 campos reales, ver cotizarFields.js). El modo
  // "Editar información" no cambia: sigue en una grilla plana con un control por campo
  // (COTIZAR_FIELDS ya en el orden real de columnas de monday, no hace falta agruparlo
  // igual que la vista).
  const ubicacion = [opportunity.departamento, opportunity.zonaCirculacion].filter(Boolean).join(' — ')

  // A pedido: Localidad filtrada por el Departamento elegido EN ESTA EDICIÓN (form,
  // no opportunity) — se busca el nombre real por id contra la lista completa, ya que
  // dropdownOptions.localidades filtra por nombre de texto, no por id.
  const selectedDepartamentoName = (dropdownOptions.departamentos ?? []).find(
    (d) => d.id === form.departamentoId
  )?.name

  return (
    <div className="cotizar-step">
      <div className="cotizar-step__head">
        <div>
          <h2 className="cotizar-step__title">Datos base de la oportunidad</h2>
          {estadoCotizacion && (
            <div className="cotizar-step__estado">
              <span>Estado de cotización:</span>
              <StatusBadge label={estadoCotizacion} color={estadoCotizacionColor} />
            </div>
          )}
        </div>
        {!editing && (
          <Button kind="tertiary" className="cotizar-step__edit-link" onClick={startEditing}>
            <MdEdit /> Editar información
          </Button>
        )}
      </div>

      {!editing && (
        <div className="cotizar-step__grid">
          <div className="cotizar-step__field">
            <span className="cotizar-step__field-label">Cédula de identidad</span>
            <span className="cotizar-step__field-value">{opportunity.ci || '—'}</span>
          </div>
          <div className="cotizar-step__field">
            <span className="cotizar-step__field-label">Fecha de nacimiento</span>
            <span className="cotizar-step__field-value">{opportunity.fechaNacimiento || '—'}</span>
          </div>
          <div className="cotizar-step__field">
            <span className="cotizar-step__field-label">Ubicación</span>
            <span className="cotizar-step__field-value">{ubicacion || '—'}</span>
          </div>
          <div className="cotizar-step__field">
            <span className="cotizar-step__field-label">Marca</span>
            <span className="cotizar-step__field-value">{opportunity.marca || '—'}</span>
          </div>
          <div className="cotizar-step__field">
            <span className="cotizar-step__field-label">Modelo</span>
            <span className="cotizar-step__field-value">{opportunity.modelo || '—'}</span>
          </div>
          <div className="cotizar-step__field">
            <span className="cotizar-step__field-label">Año</span>
            <span className="cotizar-step__field-value">{opportunity.anio || '—'}</span>
          </div>
          <div className="cotizar-step__field">
            <span className="cotizar-step__field-label">Combustible</span>
            <span className="cotizar-step__field-value">{opportunity.combustible || '—'}</span>
          </div>
          <div className="cotizar-step__field">
            <span className="cotizar-step__field-label">Tipo</span>
            <span className="cotizar-step__field-value">{opportunity.tipo || '—'}</span>
          </div>
          <div className="cotizar-step__field">
            <span className="cotizar-step__field-label">Uso</span>
            <span className="cotizar-step__field-value">{opportunity.uso || '—'}</span>
          </div>
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
                  // A pedido: al cambiar el Departamento se limpia la Localidad elegida —
                  // puede ya no pertenecer al departamento nuevo (ver el filtro de
                  // "options" más abajo, mismo criterio que CrearOportunidadForm.jsx).
                  if (f.key === 'departamento') {
                    setForm((prev) => ({ ...prev, departamentoId: v, localidadId: '' }))
                    return
                  }
                  if (f.kind === 'connected') return handleFieldChange(f.idKey, v)
                  if (f.key === 'modelo') return handleFieldChange('modeloSeleccion', v)
                  return handleFieldChange(f.key, v)
                }}
                options={
                  // A pedido: sin Departamento elegido se ven todas las Localidades; una
                  // vez elegido, solo las de ese departamento (texto plano de la propia
                  // Localidad, igual que CrearOportunidadForm.jsx).
                  f.key === 'zonaCirculacion' && selectedDepartamentoName
                    ? (dropdownOptions.localidades ?? []).filter((l) => l.departamento === selectedDepartamentoName)
                    : dropdownOptions[f.optionsKey] ?? []
                }
                anio={form.anio}
                marca={form.marca}
                tipo={form.tipo}
                combustible={form.combustible}
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

      {/* A pedido, estética tipo mockup: banner celeste avisando que ya se puede
          cotizar, en vez de dejar la ausencia de cotizaciones sin ningún mensaje
          positivo — reemplaza la aclaración que antes vivía al lado de los datos del
          cliente (ver OpportunityDetail.jsx). */}
      {!editing && !polling && canCotizar && !hasQuotes && (
        <AttentionBox type="primary">
          Todos los datos necesarios están completos. Al hacer clic en{' '}
          <strong>Cotizar en aseguradoras</strong> se consultarán las primas en tiempo real.
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
        </AttentionBox>
      )}

      {!editing && !polling && errorDetail && (
        <div className="cotizar-step__error-detail">
          <strong>Detalle del error (último update en la oportunidad):</strong>
          <pre>{errorDetail}</pre>
        </div>
      )}

      {/* A pedido, estética tipo mockup: el botón "Cotizar en aseguradoras" (caso sin
          cotizaciones todavía) vuelve a vivir acá, junto a "Volver a detalles" — antes
          vivía al lado de los datos del cliente (ver OpportunityDetail.jsx). Con
          cotizaciones ya cargadas, "Recotizar" sigue en el banner de arriba — acá solo
          queda "Volver". */}
      {!editing && (
        <div className="cotizar-step__footer">
          <Button kind="secondary" onClick={onBack}>
            Volver a detalles
          </Button>
          {!hasQuotes && (
            <Button kind="primary" onClick={onMarcarParaCotizar} disabled={marking || !canCotizar || polling}>
              <MdSend /> {marking ? 'Marcando...' : 'Cotizar en aseguradoras'}
            </Button>
          )}
        </div>
      )}

      {(markError || errorDetail) && !errorModalDismissed && (
        <AlertModal
          id="cotizar-error-modal"
          type="error"
          title={hasQuotes ? 'Error al recotizar' : 'Error al cotizar'}
          description="No se pudo completar la cotización con las aseguradoras. Podés revisar el detalle del error más abajo, en esta misma pantalla, antes de reintentar."
          onClose={() => setErrorModalDismissed(true)}
          secondaryButton={{ text: 'Cancelar', onClick: () => setErrorModalDismissed(true) }}
          primaryButton={{ text: 'Reintentar', danger: true, onClick: onMarcarParaCotizar, disabled: marking }}
        />
      )}
    </div>
  )
}
