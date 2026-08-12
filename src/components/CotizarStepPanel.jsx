import { useEffect, useState } from 'react'
import { MdEdit, MdSave, MdClose, MdAutorenew, MdSend } from 'react-icons/md'
import { Button, Dropdown, AttentionBox, Loader, TextField, NumberField } from '@vibe/core'
import { COTIZAR_FIELDS, getMissingCotizarFields } from '../services/cotizarFields'
import { fetchAutodataModelosByAnioMarca } from '../services/mondayApi'
import { matchesSearchQuery } from '../services/format'
import StatusBadge from './StatusBadge'
import AutodataModeloPorAnioMarca from './AutodataModeloPorAnioMarca'
import AlertModal from './AlertModal'
import ErrorDetailBox from './ErrorDetailBox'
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

  // A pedido: antes de mandar a cotizar/recotizar se avisa en 2 pasos. 1) Si falta algún
  // dato base, un popup tipo "Faltan datos requeridos" (mismo patrón que
  // ConfirmarStepPanel) que bloquea de verdad — no deja ni un botón de "reintentar", el
  // único camino es "Completar datos faltantes" (abre la edición). 2) Si no falta nada,
  // se valida contra Autodata que el Modelo cargado exista de verdad para la Marca/Año
  // elegidos, y que Combustible/Tipo coincidan con los reales de ese modelo — acá NO se
  // bloquea (el dato puede estar bien igual, Autodata no es infalible), solo se avisa
  // con Cancelar/Continuar por si el usuario prefiere corregir antes de intentar.
  const [showMissingFieldsModal, setShowMissingFieldsModal] = useState(false)
  const [consistencyWarning, setConsistencyWarning] = useState(null)
  const [checkingConsistencia, setCheckingConsistencia] = useState(false)

  const runCotizarChecks = async (proceed) => {
    if (!canCotizar) {
      setShowMissingFieldsModal(true)
      return
    }
    setCheckingConsistencia(true)
    try {
      const modelos = await fetchAutodataModelosByAnioMarca(opportunity.anio, opportunity.marca)
      const match = modelos.find((m) => m.name.trim().toLowerCase() === opportunity.modelo.trim().toLowerCase())
      if (!match) {
        // A pedido: nada de listar TODOS los modelos disponibles para esa Marca/Año (con
        // marcas de muchas versiones termina siendo una lista larguísima e irrelevante,
        // ver mockup) — en vez de eso, un aviso simple de "no tenemos datos confirmados
        // para este modelo" + un recordatorio de qué Año/Combustible/Tipo hay cargados
        // ahora mismo en la oportunidad, para que el usuario los revise sin tener que
        // salir del popup.
        setConsistencyWarning({
          title: 'El modelo no coincide con Marca/Año',
          description: `No tenemos datos confirmados en nuestro sistema para el modelo cargado ("${opportunity.modelo}") con ${opportunity.marca} ${opportunity.anio}. Esto puede hacer que falle la cotización. ¿Querés intentar igualmente?`,
          detailsTitle: 'Datos cargados para este modelo:',
          detailsList: [
            `Año: ${opportunity.anio || '—'}`,
            `Combustible: ${opportunity.combustible || '—'}`,
            `Tipo: ${opportunity.tipo || '—'}`,
          ],
          onConfirm: proceed,
        })
        return
      }
      const combustibleOk =
        !match.combustible || match.combustible.toLowerCase() === (opportunity.combustible || '').toLowerCase()
      const tipoOk = !match.tipo || match.tipo.toLowerCase() === (opportunity.tipo || '').toLowerCase()
      if (!combustibleOk || !tipoOk) {
        // A pedido: acá el dato correcto es uno solo (el real de este modelo, no una
        // lista) — se lo mostramos directo en la descripción en vez de un detailsList.
        setConsistencyWarning({
          title: 'Combustible/Tipo no coinciden',
          description: `Estás por completar una cotización con Combustible "${opportunity.combustible || '—'}" y Tipo "${
            opportunity.tipo || '—'
          }", pero en nuestro sistema este modelo tiene Combustible "${match.combustible || '—'}" y Tipo "${
            match.tipo || '—'
          }". Esto puede hacer que falle la cotización. ¿Querés intentar igualmente?`,
          onConfirm: proceed,
        })
        return
      }
    } catch {
      // Si la validación en sí falla (ej. problema de red al consultar Autodata), no
      // bloqueamos cotizar por eso — se sigue de largo sin el aviso.
    } finally {
      setCheckingConsistencia(false)
    }
    proceed()
  }

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

      {/* A pedido: mismo popup compartido que el resto de los avisos (antes era un
          AttentionBox inline) — "Sí, recotizar" en rojo (danger) porque es la acción
          destructiva acá (borra todas las cotizaciones cargadas), no una simple
          confirmación. */}
      {!editing && !polling && hasQuotes && confirmingRecotizar && (
        <AlertModal
          id="cotizar-recotizar-modal"
          type="warning"
          title="¿Recotizar esta oportunidad?"
          description={
            <>
              Al recotizar se van a <strong>eliminar todos los datos de la cotización actual</strong> (todas
              las tarjetas por compañía y cobertura) y se van a generar unos nuevos desde cero.
            </>
          }
          onClose={() => setConfirmingRecotizar(false)}
          secondaryButton={{ text: 'Cancelar', onClick: () => setConfirmingRecotizar(false), disabled: marking }}
          primaryButton={{
            text: checkingConsistencia ? 'Verificando...' : marking ? 'Marcando...' : 'Sí, recotizar',
            danger: true,
            onClick: () => runCotizarChecks(handleRecotizarConfirm),
            disabled: marking || !canCotizar || checkingConsistencia,
          }}
        />
      )}

      {!editing && !polling && (
        <ErrorDetailBox detail={errorDetail} className="cotizar-step__error-detail-spacing" />
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
            <Button
              kind="primary"
              onClick={() => runCotizarChecks(onMarcarParaCotizar)}
              disabled={marking || polling || checkingConsistencia}
            >
              <MdSend /> {checkingConsistencia ? 'Verificando...' : marking ? 'Marcando...' : 'Cotizar en aseguradoras'}
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

      {showMissingFieldsModal && (
        <AlertModal
          id="cotizar-faltan-datos-modal"
          type="warning"
          title="Faltan datos requeridos"
          description={`No podés ${hasQuotes ? 'recotizar' : 'cotizar'} porque hay información obligatoria que no ha sido completada.`}
          detailsTitle="Campos pendientes:"
          detailsList={missingFields.map((f) => f.label)}
          onClose={() => setShowMissingFieldsModal(false)}
          primaryButton={{
            text: 'Completar datos faltantes',
            onClick: () => {
              setShowMissingFieldsModal(false)
              startEditing()
            },
          }}
        />
      )}

      {consistencyWarning && (
        <AlertModal
          id="cotizar-consistencia-modal"
          type="warning"
          title={consistencyWarning.title}
          description={consistencyWarning.description}
          detailsTitle={consistencyWarning.detailsTitle}
          detailsList={consistencyWarning.detailsList}
          detailsTone="neutral"
          onClose={() => setConsistencyWarning(null)}
          secondaryButton={{ text: 'Cancelar', onClick: () => setConsistencyWarning(null) }}
          primaryButton={{
            text: 'Continuar',
            onClick: () => {
              const proceed = consistencyWarning.onConfirm
              setConsistencyWarning(null)
              proceed()
            },
          }}
        />
      )}
    </div>
  )
}
