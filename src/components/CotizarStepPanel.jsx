import { useEffect, useState } from 'react'
import { MdAutorenew, MdArrowForward, MdCheckCircle, MdWarningAmber } from 'react-icons/md'
import { Button, Dropdown, AttentionBox, Loader, TextField, NumberField, Modal, ModalContent, ModalFooter } from '@vibe/core'
import { COTIZAR_FIELDS, getMissingCotizarFields } from '../services/cotizarFields'
import { fetchAutodataModelosByAnioMarca } from '../services/mondayApi'
import { matchesSearchQuery } from '../services/format'
import StatusBadge from './StatusBadge'
import AutodataModeloPorAnioMarca from './AutodataModeloPorAnioMarca'
import AlertModal from './AlertModal'
import ErrorDetailBox from './ErrorDetailBox'
import ClientFicha from './ClientFicha'
import './CotizarStepPanel.css'

// A pedido: orden propio del popup "Editar información" — de a 2 por renglón cuando
// tiene sentido (CI/Fecha, Departamento/Localidad, Año/Marca), Modelo solo a lo ancho
// completo (nombres largos de Autodata), Combustible/Tipo/Uso los 3 juntos al final.
// `span` es sobre una grilla de 6 columnas (ver .cotizar-step__grid en
// CotizarStepPanel.css): 3+3 = 2 por renglón, 6 = ancho completo, 2+2+2 = 3 por renglón.
const EDIT_FIELD_LAYOUT = [
  { key: 'ci', span: 3 },
  { key: 'fechaNacimiento', span: 3 },
  { key: 'departamento', span: 3 },
  { key: 'zonaCirculacion', span: 3 },
  { key: 'anio', span: 3 },
  { key: 'marca', span: 3 },
  { key: 'modelo', span: 6 },
  { key: 'combustible', span: 2 },
  { key: 'tipo', span: 2 },
  { key: 'uso', span: 2 },
]

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
  onGoToComparar,
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

  // A pedido: se limpia el error de "faltan campos" apenas se toca cualquier campo, no
  // recién en el próximo "Guardar cambios" — antes, si guardabas con algo vacío y lo
  // completabas sin volver a guardar, el cartel de error viejo se quedaba pegado en
  // pantalla mostrando un campo que ya estaba completo.
  const handleFieldChange = (key, value) => {
    setSaveError(null)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

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

  // Ubicación combina Departamento + Localidad en un solo dato para mostrar (son 2
  // campos reales, ver cotizarFields.js) — el modo "Editar información" no cambia:
  // sigue en una grilla plana con un control por campo (COTIZAR_FIELDS ya en el orden
  // real de columnas de monday, no hace falta agruparlo igual que la vista).
  const ubicacion = [opportunity.departamento, opportunity.zonaCirculacion].filter(Boolean).join(' — ')

  // A pedido: Localidad filtrada por el Departamento elegido EN ESTA EDICIÓN (form,
  // no opportunity) — se busca el nombre real por id contra la lista completa, ya que
  // dropdownOptions.localidades filtra por nombre de texto, no por id.
  const selectedDepartamentoName = (dropdownOptions.departamentos ?? []).find(
    (d) => d.id === form.departamentoId
  )?.name

  // A pedido, estética tipo mockup: mismo criterio que la ficha de Cliente/Lead de
  // "Agregar Oportunidad" — datos de la persona a la izquierda (ficha con nombre grande,
  // ubicación y badges, editable), y a la derecha un checklist propio con los 9 datos
  // mínimos que la automatización de "Cotizar" necesita completos (los mismos de
  // siempre, ver COTIZAR_FIELDS/missingFields — antes vivían mezclados en una sola
  // grilla plana de 9 celdas iguales, sin distinguir "quién es" de "qué falta para
  // cotizar"). missingKeys sale de missingFields (ya calculado arriba) para no
  // duplicar la lógica de qué está completo.
  const missingKeys = new Set(missingFields.map((f) => f.key))
  const checklistItems = [
    { key: 'ci', label: 'Cédula de identidad', value: opportunity.ci, missing: missingKeys.has('ci') },
    {
      key: 'fechaNacimiento',
      label: 'Fecha de nacimiento',
      value: opportunity.fechaNacimiento,
      missing: missingKeys.has('fechaNacimiento'),
    },
    {
      key: 'ubicacion',
      label: 'Ubicación',
      value: ubicacion,
      missing: missingKeys.has('departamento') || missingKeys.has('zonaCirculacion'),
    },
    { key: 'marca', label: 'Marca', value: opportunity.marca, missing: missingKeys.has('marca') },
    { key: 'modelo', label: 'Modelo', value: opportunity.modelo, missing: missingKeys.has('modelo') },
    { key: 'anio', label: 'Año', value: opportunity.anio, missing: missingKeys.has('anio') },
    {
      key: 'combustible',
      label: 'Combustible',
      value: opportunity.combustible,
      missing: missingKeys.has('combustible'),
    },
    { key: 'tipo', label: 'Tipo', value: opportunity.tipo, missing: missingKeys.has('tipo') },
    { key: 'uso', label: 'Uso', value: opportunity.uso, missing: missingKeys.has('uso') },
  ]

  return (
    <div className="cotizar-step">
      <div className="cotizar-step__head">
        <div>
          <h2 className="cotizar-step__title">Información necesaria para cotizar</h2>
          {estadoCotizacion && (
            <div className="cotizar-step__estado">
              <span>Estado de cotización:</span>
              <StatusBadge label={estadoCotizacion} color={estadoCotizacionColor} />
            </div>
          )}
        </div>
      </div>

      <div className="cotizar-step__top-grid">
        {/* Ficha del cliente/Lead — componente compartido con OpportunityDetail.jsx
            (ver ClientFicha.jsx), para que se vea igual en todos los pasos de la
            oportunidad, no solo acá. */}
        <ClientFicha opportunity={opportunity} onEdit={startEditing} />

        <div className="cotizar-step__checklist">
          <h3 className="cotizar-step__checklist-title">Datos mínimos para cotizar</h3>
          <div className="cotizar-step__checklist-items">
            {checklistItems.map((item) => (
              <div
                key={item.key}
                className={
                  item.missing
                    ? 'cotizar-step__checklist-item cotizar-step__checklist-item--missing'
                    : 'cotizar-step__checklist-item cotizar-step__checklist-item--ok'
                }
              >
                {item.missing ? <MdWarningAmber /> : <MdCheckCircle />}
                <span className="cotizar-step__checklist-label">{item.label}</span>
                <span className="cotizar-step__checklist-value">{item.value || '—'}</span>
              </div>
            ))}
          </div>

          {/* A pedido, estética tipo mockup: pegado al checklist que describe (antes
              vivía bien abajo, después de varios otros banners) — "como mucho" un
              aviso chico acá, no un cartel grande aparte compitiendo con el resto de
              la pantalla. */}
          {!editing && !polling && canCotizar && !hasQuotes && (
            <AttentionBox type="primary" className="cotizar-step__checklist-attention">
              Todos los datos necesarios están completos. Al hacer clic en <strong>Cotizar</strong> se
              consultarán las primas en tiempo real.
            </AttentionBox>
          )}
        </div>
      </div>

      {/* A pedido: editar ahora es un popup prolijo (mismo patrón que
          EditarContactoModal en CrearOportunidadForm.jsx: Modal + ModalContent +
          ModalFooter) en vez de reemplazar toda la sección de arriba por una grilla de
          edición — la ficha y el checklist quedan visibles de fondo, no hace falta
          "volver" a ninguna pantalla vieja para salir de editar. */}
      {editing && (
        <Modal id="cotizar-editar-modal" show onClose={() => setEditing(false)} size="large">
          <ModalContent className="cotizar-step__editar-content">
            <h2 className="cotizar-step__editar-title">Editar información</h2>
            <div className="cotizar-step__grid">
              {/* A pedido: orden propio (no el de COTIZAR_FIELDS) — de a 2 por
                  renglón cuando tiene sentido agruparlos (CI/Fecha, Departamento/
                  Localidad, Año/Marca), Modelo solo en su propio renglón a lo ancho
                  completo (con nombres largos de Autodata se quedaba sin lugar y
                  desbordaba la columna angosta de antes), y Combustible/Tipo/Uso los
                  3 juntos al final. */}
              {EDIT_FIELD_LAYOUT.map(({ key, span }) => {
                const f = COTIZAR_FIELDS.find((field) => field.key === key)
                return (
                  <label
                    className="cotizar-step__field cotizar-step__field--edit"
                    style={{ gridColumn: `span ${span}` }}
                    key={f.key}
                  >
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
                        // A pedido: al cambiar el Departamento se limpia la Localidad
                        // elegida — puede ya no pertenecer al departamento nuevo (ver
                        // el filtro de "options" más abajo, mismo criterio que
                        // CrearOportunidadForm.jsx).
                        if (f.key === 'departamento') {
                          setSaveError(null)
                          setForm((prev) => ({ ...prev, departamentoId: v, localidadId: '' }))
                          return
                        }
                        if (f.kind === 'connected') return handleFieldChange(f.idKey, v)
                        if (f.key === 'modelo') return handleFieldChange('modeloSeleccion', v)
                        return handleFieldChange(f.key, v)
                      }}
                      options={
                        // A pedido: sin Departamento elegido se ven todas las
                        // Localidades; una vez elegido, solo las de ese departamento
                        // (texto plano de la propia Localidad, igual que
                        // CrearOportunidadForm.jsx).
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
                )
              })}
            </div>
            {saveError && <p className="cotizar-step__error">Error: {saveError}</p>}
          </ModalContent>
          <ModalFooter
            secondaryButton={{ text: 'Cancelar', onClick: () => setEditing(false), disabled: saving }}
            primaryButton={{
              text: saving ? 'Guardando...' : 'Guardar cambios',
              onClick: handleSave,
              disabled: saving,
            }}
          />
        </Modal>
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

      {/* A pedido: rediseñado — antes era un AttentionBox "positive" (fondo verde
          grande) con el texto y "Recotizar" apretados en una fila. Este ya no es un
          aviso/alerta (nada anda mal, es un estado normal y esperable), así que se
          saca del lenguaje visual de alertas: tarjeta blanca con acento verde a la
          izquierda (mismo patrón que .crear-op__lectura-summary en
          CrearOportunidadForm.css para el mismo tipo de "esto ya está resuelto, con
          una acción al lado"). "Ir a Comparar y enviar" ahora es un botón real (antes
          el texto solo lo MENCIONABA, había que ir a buscar la pestaña del Stepper a
          mano) — jerarquía clara: avanzar es la acción primaria, Recotizar (destruye
          las cotizaciones actuales) queda como secundaria, más chica. */}
      {!editing && !polling && hasQuotes && !confirmingRecotizar && (
        <div className="cotizar-step__quotes-ready">
          <div className="cotizar-step__quotes-ready-info">
            <MdCheckCircle className="cotizar-step__quotes-ready-icon" />
            <div className="cotizar-step__quotes-ready-text">
              <strong>Cotizaciones cargadas</strong>
              <span>Revisalas y enviaselas al cliente desde el siguiente paso.</span>
            </div>
          </div>
          <div className="cotizar-step__quotes-ready-actions">
            <Button
              kind="secondary"
              onClick={() => setConfirmingRecotizar(true)}
              disabled={marking || !canCotizar}
            >
              <MdAutorenew /> Recotizar
            </Button>
            <Button kind="primary" onClick={onGoToComparar}>
              Ir a Comparar y enviar <MdArrowForward />
            </Button>
          </div>
        </div>
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

      {/* A pedido: "Volver a detalles" se sacó del paso 1 (ya está el botón "Volver" del
          breadcrumb, arriba de todo en OpportunityDetail.jsx — quedaba duplicado). Con
          cotizaciones ya cargadas no queda nada que mostrar acá ("Recotizar" vive en el
          banner de arriba), así que directamente no se renderiza el footer. */}
      {!editing && !hasQuotes && (
        <div className="cotizar-step__footer">
          <Button
            kind="primary"
            onClick={() => runCotizarChecks(onMarcarParaCotizar)}
            disabled={marking || polling || checkingConsistencia}
          >
            {checkingConsistencia ? 'Verificando...' : marking ? 'Marcando...' : 'Cotizar'}
          </Button>
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
