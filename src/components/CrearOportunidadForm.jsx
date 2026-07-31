import { useEffect, useRef, useState } from 'react'
import { MdClose, MdUploadFile, MdClear } from 'react-icons/md'
import { Button, Dropdown } from '@vibe/core'
import {
  createOpportunityItem,
  setMultipleColumnValues,
  uploadFileToColumn,
  setSimpleColumnValue,
  searchAutodataModelos,
} from '../services/mondayApi'
import './CrearOportunidadForm.css'

const STEPS = [
  { key: 'personales', label: 'Datos personales' },
  { key: 'oportunidad', label: 'Datos Oportunidad' },
]

// Único label real (con emoji, tal cual está configurado en monday) que muestra el resto
// del formulario "Datos del riesgo" — el resto de los tipos (Vivienda, Persona, etc.)
// todavía no tienen esos campos definidos.
const TIPO_RIESGO_AUTOMOVIL = '🚗 Automóvil'

// Mismos labels reales que color_mm51n4j ("Posee Vehiculo?") en el tablero Oportunidades.
const POSEE_VEHICULO_OPTIONS = [
  { value: 'Si', label: 'Si' },
  { value: 'No', label: 'No' },
]

// Uruguay por default (mercado principal de la app), pero editable por si hace falta
// cargar un cliente con otro código — no hay columna real de monday detrás todavía.
const CODIGO_PAIS_OPTIONS = [
  { value: '+598', label: '(+598) Uruguay' },
  { value: '+54', label: '(+54) Argentina' },
  { value: '+55', label: '(+55) Brasil' },
  { value: '+595', label: '(+595) Paraguay' },
  { value: '+56', label: '(+56) Chile' },
]

// La columna Teléfono (phone_mm519m27) es tipo "phone" real de monday — el formato que
// espera change_column_value es {"phone": "<código+número sin espacios>", "countryShortName": "XX"}.
const COUNTRY_SHORT_NAMES = {
  '+598': 'UY',
  '+54': 'AR',
  '+55': 'BR',
  '+595': 'PY',
  '+56': 'CL',
}

// El input de Fecha Nacimiento guarda "dd/mm/aaaa" (ver formatFechaInput) — monday
// espera "aaaa-mm-dd" para columnas date (mismo formato que ya escribe
// CotizarStepPanel/handleSaveCotizarFields para esta misma columna).
function toIsoDate(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('/')
  return `${y}-${m}-${d}`
}

// Validaciones con mensaje — a diferencia del resto (que solo chequean "no vacío"),
// estos 3 campos necesitan validar el FORMATO del dato, no solo su presencia.
function ciError(value) {
  if (!value) return null
  const digits = value.replace(/[.\-\s]/g, '')
  if (!/^\d+$/.test(digits)) return 'El CI debe contener solo números (podés incluir puntos y guion).'
  return null
}

function fechaError(value) {
  if (!value) return null
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return 'Completá el día, mes y año.'
  const [d, m, y] = value.split('/').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth) return 'Fecha inválida.'
  const currentYear = new Date().getFullYear()
  if (y < 1900 || y > currentYear) return 'Año inválido.'
  return null
}

// Cantidad de dígitos esperada del número (sin el código de país) para cada país
// soportado — Uruguay usa el formato "09X XXX XXX" (9 dígitos).
const PHONE_DIGIT_LENGTHS = {
  '+598': 9,
  '+54': 10,
  '+55': 11,
  '+595': 9,
  '+56': 9,
}

function telefonoError(value, codigoPais) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  const expected = PHONE_DIGIT_LENGTHS[codigoPais]
  if (!expected) return null
  if (digits.length !== expected) return `El teléfono debe tener ${expected} dígitos.`
  return null
}

// Modelo (Autodata): mismo componente/mecanismo que en CotizarStepPanel.jsx — el
// tablero vinculado (AUTODATA V1 + V2, board_relation_mm5422v9) tiene más de 15.000
// ítems combinados, así que no se puede precargar como Departamento/Localidad. Se
// busca en vivo por texto (mínimo 2 caracteres, debounce 300ms) contra los dos
// tableros reales.
function AutodataModeloSelect({ value, onChange }) {
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
      clearable={false}
      searchable
      options={options}
      value={selected}
      loading={loading}
      onInputChange={(input) => setInputValue(input ?? '')}
      placeholder="Buscar modelo..."
      noOptionsMessage={inputValue.trim().length < 2 ? 'Escribí para buscar' : 'Sin resultados'}
      onChange={(option) => onChange(option ? { id: option.value, name: option.label } : null)}
    />
  )
}

function buildInitialForm() {
  return {
    nombre: '',
    apellido: '',
    ci: '',
    fechaNacimiento: '',
    codigoPais: '+598',
    telefono: '',
    localidadId: '',
    tipoRiesgo: '',
    poseeVehiculo: '',
    // Modelo (Autodata) — se pide siempre que sea Automóvil, sin importar la respuesta
    // de Posee Vehículo.
    modeloSeleccion: null,
    // Posee Vehículo === "Si": se cargan estos dos archivos en vez de tipear los datos.
    cartaAutomovil: null,
    cedulaIdentidad: null,
    // Posee Vehículo === "No": no hay archivo que leer, se tipean estos 5 campos a mano.
    marca: '',
    anio: '',
    combustible: '',
    uso: '',
    tipo: '',
  }
}

// Todos los campos son obligatorios (sin excepción) — con datos requeridos no tiene
// sentido "clearable". OJO: @vibe/core's Dropdown viene con clearable=true POR DEFECTO
// (no alcanza con simplemente no pasar la prop) — hay que pasar clearable={false}
// explícito. Con la "x" de limpiar visible, quedaba pegada justo donde el usuario
// clickeaba para reabrir y cambiar el valor, y terminaba borrando el dato por error en
// vez de dejarlo reelegir. Sin clearable, click en el control siempre abre el menú para
// elegir otra opción directo, sin ese paso intermedio de "borrar primero".
function RequiredDropdown(props) {
  return <Dropdown clearable={false} {...props} />
}

// dd/mm/aaaa con auto-inserción de "/" a medida que se escribe, en vez de un
// <input type="date"> nativo — a pedido: el date input nativo no dejaba completar el
// día "24" derecho (typing rápido de dos dígitos se comía uno). Reconstruir el string
// siempre desde los dígitos puros (sin guardar las "/" como parte del estado real)
// evita el problema por completo, en vez de depender del manejo de segmentos del
// navegador.
function formatFechaInput(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  let out = digits.slice(0, 2)
  if (digits.length > 2) out += '/' + digits.slice(2, 4)
  if (digits.length > 4) out += '/' + digits.slice(4, 8)
  return out
}

// Sin ítem de monday creado todavía (recién se está completando el formulario), así que
// esto solo guarda el File en memoria — la subida real a la columna correspondiente
// (file_mm51jy06 / file_mm5pc008) se hace más adelante, cuando se sepa en qué paso se
// crea efectivamente el ítem.
function FileField({ label, file, onChange }) {
  const inputRef = useRef(null)
  return (
    <label className="crear-op__field">
      <span>{label} *</span>
      <div className="crear-op__file">
        <input
          ref={inputRef}
          type="file"
          className="crear-op__file-input"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
        <Button kind="secondary" onClick={() => inputRef.current?.click()}>
          <MdUploadFile /> {file ? 'Cambiar archivo' : 'Subir archivo'}
        </Button>
        {file && (
          <span className="crear-op__file-name">
            {file.name}
            <button
              type="button"
              className="crear-op__file-clear"
              onClick={() => onChange(null)}
              aria-label={`Quitar ${label}`}
            >
              <MdClear />
            </button>
          </span>
        )}
      </div>
    </label>
  )
}

export default function CrearOportunidadForm({ schema, onCancel, onVerOportunidades, onCreated }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState(buildInitialForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const localidades = schema?.localidades ?? []
  const localidadOptions = localidades.map((l) => ({ value: l.id, label: l.name }))
  const selectedLocalidad = localidadOptions.find((o) => o.value === form.localidadId) ?? null

  const selectedPoseeVehiculo = POSEE_VEHICULO_OPTIONS.find((o) => o.value === form.poseeVehiculo) ?? null

  const tipoRiesgoOptions = (schema?.tipoRiesgo?.options ?? []).map((opt) => ({ value: opt, label: opt }))
  const selectedTipoRiesgo = tipoRiesgoOptions.find((o) => o.value === form.tipoRiesgo) ?? null
  const esAutomovil = form.tipoRiesgo === TIPO_RIESGO_AUTOMOVIL

  const marcaOptions = (schema?.marcas ?? []).map((opt) => ({ value: opt, label: opt }))
  const anioOptions = (schema?.anios ?? []).map((opt) => ({ value: opt, label: opt }))
  const combustibleOptions = (schema?.combustibles ?? []).map((opt) => ({ value: opt, label: opt }))
  const usoOptions = (schema?.uso?.options ?? []).map((opt) => ({ value: opt, label: opt }))
  const tipoOptions = (schema?.tipo ?? []).map((opt) => ({ value: opt, label: opt }))

  // Válido para avanzar de este paso al siguiente — todos los campos son obligatorios
  // (no vacíos) y, para CI/Fecha Nacimiento/Teléfono, además tienen que tener un
  // formato válido (ver ciError/fechaError/telefonoError).
  const isStepValid = (index) => {
    if (index === 0) {
      return Boolean(
        form.nombre &&
          form.apellido &&
          form.ci &&
          !ciError(form.ci) &&
          form.fechaNacimiento &&
          !fechaError(form.fechaNacimiento) &&
          form.codigoPais &&
          form.telefono &&
          !telefonoError(form.telefono, form.codigoPais) &&
          form.localidadId &&
          form.tipoRiesgo
      )
    }
    if (index === 1) {
      if (!esAutomovil) return true
      if (!form.poseeVehiculo || !form.modeloSeleccion) return false
      if (form.poseeVehiculo === 'Si') return Boolean(form.cartaAutomovil && form.cedulaIdentidad)
      return Boolean(form.marca && form.anio && form.combustible && form.uso && form.tipo)
    }
    return false
  }

  // El paso 2 se llama como el Tipo de Riesgo elegido en el paso 1 (ej. "🚗 Automóvil"),
  // en vez de un nombre fijo genérico — hasta que se elija algo, se muestra el label
  // original como placeholder.
  const stepLabels = [STEPS[0].label, form.tipoRiesgo || STEPS[1].label]

  const isLastStep = stepIndex === STEPS.length - 1
  const canAdvance = isStepValid(stepIndex)

  const handleContinuar = () => {
    if (!canAdvance || isLastStep) return
    setStepIndex((i) => i + 1)
  }

  // Se crea el ítem PELADO (solo el nombre) y recién después se asientan todas las
  // columnas en un mutation separado (change_multiple_column_values) — si van juntas en
  // el mismo create_item, monday no dispara las automatizaciones que dependen de un
  // cambio de columna real (incluida la de "cuando se crea el ítem, hacer algo", si esa
  // automatización mira el valor de alguna columna). Recién con el ítem ya creado (tiene
  // id real) se suben los archivos de Carta Automóvil/Cédula si corresponde (la subida
  // de archivos necesita un item_id existente, no se puede hacer antes).
  const handleGuardar = async () => {
    if (!canAdvance || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const itemName = `${form.nombre} ${form.apellido}`.trim()
      const created = await createOpportunityItem(itemName)

      const columnValues = {
        deal_stage: 'Nueva',
        text_mm51b055: form.nombre,
        text_mm51ez7e: form.apellido,
        numeric_mm51mb0s: form.ci,
        date_mm516agw: toIsoDate(form.fechaNacimiento),
        phone_mm519m27: {
          phone: `${form.codigoPais.replace('+', '')}${form.telefono.replace(/\D/g, '')}`,
          countryShortName: COUNTRY_SHORT_NAMES[form.codigoPais] ?? 'UY',
        },
        color_mm5atxav: form.tipoRiesgo,
        board_relation_mm5sqf8t: { item_ids: [Number(form.localidadId)] },
      }
      if (esAutomovil) {
        columnValues.color_mm51n4j = form.poseeVehiculo
        columnValues.board_relation_mm5422v9 = { item_ids: [Number(form.modeloSeleccion.id)] }
        if (form.poseeVehiculo === 'No') {
          columnValues.dropdown_mm51ykrd = form.marca
          columnValues.dropdown_mm51mdmq = form.anio
          columnValues.dropdown_mm52jp01 = form.combustible
          columnValues.color_mm52ey1d = form.uso
          columnValues.dropdown_mm5jqdk = form.tipo
        }
      }
      await setMultipleColumnValues(created.id, columnValues)

      if (esAutomovil && form.poseeVehiculo === 'Si') {
        await Promise.all([
          uploadFileToColumn(created.id, 'file_mm51jy06', form.cartaAutomovil),
          uploadFileToColumn(created.id, 'file_mm5pc008', form.cedulaIdentidad),
        ])
        // Dispara la lectura automática de Cédula/Carta Automóvil (color_mm5rzrhk) —
        // mismo mecanismo/gate ya armado en OpportunityDetail.jsx (Leer/Leyendo/
        // Leidos/Error), que ahora va a arrancar a pollear apenas se abra la oportunidad.
        await setSimpleColumnValue(created.id, 'color_mm5rzrhk', 'Leer')
      }

      onCreated?.(created.id)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Ir y venir libremente entre los dos pasos: hacia atrás siempre se puede: hacia
  // adelante solo si el paso 1 ya está completo (mismo criterio que "Guardar y
  // continuar", para no saltar a un paso que depende de datos que todavía faltan).
  const handleStepClick = (index) => {
    if (index === stepIndex) return
    if (index < stepIndex || isStepValid(index - 1)) setStepIndex(index)
  }

  return (
    <div className="crear-op">
      <div className="crear-op__card">
        <div className="crear-op__header">
          <h1 className="crear-op__title">Agregar Oportunidades</h1>
          <button className="crear-op__close" onClick={onCancel} aria-label="Cerrar">
            <MdClose />
          </button>
        </div>

        <div className="crear-op__progress">
          <div className="crear-op__steps">
            {STEPS.map((s, index) => (
              <button
                key={s.key}
                type="button"
                className={
                  index === stepIndex
                    ? 'crear-op__step crear-op__step--active'
                    : 'crear-op__step'
                }
                onClick={() => handleStepClick(index)}
              >
                Paso {index + 1} — {stepLabels[index]}
              </button>
            ))}
          </div>
          <div className="crear-op__progress-bar">
            <div
              className="crear-op__progress-fill"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {stepIndex === 0 && (
          <div className="crear-op__fields">
            <label className="crear-op__field">
              <span>Nombre *</span>
              <input
                type="text"
                placeholder="Ingresa el nombre"
                value={form.nombre}
                onChange={(e) => handleChange('nombre', e.target.value)}
              />
            </label>
            <label className="crear-op__field">
              <span>Apellido *</span>
              <input
                type="text"
                placeholder="Ingresa el apellido"
                value={form.apellido}
                onChange={(e) => handleChange('apellido', e.target.value)}
              />
            </label>
            <label className="crear-op__field">
              <span>CI *</span>
              <input
                type="text"
                placeholder="Ej: 4.123.456-7"
                value={form.ci}
                onChange={(e) => handleChange('ci', e.target.value)}
              />
              {ciError(form.ci) && <span className="crear-op__field-error">{ciError(form.ci)}</span>}
            </label>
            <label className="crear-op__field">
              <span>Fecha Nacimiento *</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="dd/mm/aaaa"
                value={form.fechaNacimiento}
                onChange={(e) => handleChange('fechaNacimiento', formatFechaInput(e.target.value))}
              />
              {fechaError(form.fechaNacimiento) && (
                <span className="crear-op__field-error">{fechaError(form.fechaNacimiento)}</span>
              )}
            </label>
            <label className="crear-op__field">
              <span>Teléfono *</span>
              <div className="crear-op__phone">
                <div className="crear-op__phone-code">
                  <RequiredDropdown
                    options={CODIGO_PAIS_OPTIONS}
                    value={CODIGO_PAIS_OPTIONS.find((o) => o.value === form.codigoPais) ?? null}
                    onChange={(option) => handleChange('codigoPais', option?.value ?? '')}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Ej: 099 123 456"
                  value={form.telefono}
                  onChange={(e) => handleChange('telefono', e.target.value)}
                />
              </div>
              {telefonoError(form.telefono, form.codigoPais) && (
                <span className="crear-op__field-error">
                  {telefonoError(form.telefono, form.codigoPais)}
                </span>
              )}
            </label>
            <label className="crear-op__field">
              <span>Localidad *</span>
              <RequiredDropdown
                options={localidadOptions}
                value={selectedLocalidad}
                placeholder="Escribe para buscar resultados"
                searchable
                onChange={(option) => handleChange('localidadId', option?.value ?? '')}
              />
            </label>
            <label className="crear-op__field">
              <span>Tipo de Riesgo *</span>
              <RequiredDropdown
                options={tipoRiesgoOptions}
                value={selectedTipoRiesgo}
                placeholder="Selecciona una opción"
                onChange={(option) => handleChange('tipoRiesgo', option?.value ?? '')}
              />
            </label>
          </div>
        )}

        {stepIndex === 1 && (
          <div className="crear-op__fields">
            {esAutomovil && (
              <label className="crear-op__field">
                <span>Posee Vehículo? *</span>
                <RequiredDropdown
                  options={POSEE_VEHICULO_OPTIONS}
                  value={selectedPoseeVehiculo}
                  placeholder="Selecciona una opción"
                  onChange={(option) => handleChange('poseeVehiculo', option?.value ?? '')}
                />
              </label>
            )}

            {!esAutomovil && (
              <p className="crear-op__empty">
                Todavía no hay campos definidos para este tipo de riesgo.
              </p>
            )}

            {esAutomovil && (
              <label className="crear-op__field">
                {/* Se pide siempre que sea Automóvil, sin importar Posee Vehículo — el
                    tablero vinculado (AUTODATA V1+V2) tiene >15.000 ítems combinados,
                    ver AutodataModeloSelect. */}
                <span>Modelo *</span>
                <AutodataModeloSelect
                  value={form.modeloSeleccion}
                  onChange={(v) => handleChange('modeloSeleccion', v)}
                />
              </label>
            )}

            {esAutomovil && form.poseeVehiculo === 'Si' && (
              <>
                <FileField
                  label="Carta Automóvil / Cédula Automovil"
                  file={form.cartaAutomovil}
                  onChange={(file) => handleChange('cartaAutomovil', file)}
                />
                <FileField
                  label="Cédula Identidad"
                  file={form.cedulaIdentidad}
                  onChange={(file) => handleChange('cedulaIdentidad', file)}
                />
              </>
            )}

            {esAutomovil && form.poseeVehiculo === 'No' && (
              <>
                <label className="crear-op__field">
                  <span>Marca *</span>
                  <RequiredDropdown
                    options={marcaOptions}
                    value={marcaOptions.find((o) => o.value === form.marca) ?? null}
                    placeholder="Escribe para buscar resultados"
                    searchable
                    onChange={(option) => handleChange('marca', option?.value ?? '')}
                  />
                </label>
                <label className="crear-op__field">
                  <span>Año *</span>
                  <RequiredDropdown
                    options={anioOptions}
                    value={anioOptions.find((o) => o.value === form.anio) ?? null}
                    placeholder="Escribe para buscar resultados"
                    searchable
                    onChange={(option) => handleChange('anio', option?.value ?? '')}
                  />
                </label>
                <label className="crear-op__field">
                  <span>Combustible *</span>
                  <RequiredDropdown
                    options={combustibleOptions}
                    value={combustibleOptions.find((o) => o.value === form.combustible) ?? null}
                    placeholder="Selecciona una opción"
                    onChange={(option) => handleChange('combustible', option?.value ?? '')}
                  />
                </label>
                <label className="crear-op__field">
                  <span>Uso *</span>
                  <RequiredDropdown
                    options={usoOptions}
                    value={usoOptions.find((o) => o.value === form.uso) ?? null}
                    placeholder="Escribe para buscar resultados"
                    searchable
                    onChange={(option) => handleChange('uso', option?.value ?? '')}
                  />
                </label>
                <label className="crear-op__field">
                  <span>Tipo *</span>
                  <RequiredDropdown
                    options={tipoOptions}
                    value={tipoOptions.find((o) => o.value === form.tipo) ?? null}
                    placeholder="Escribe para buscar resultados"
                    searchable
                    onChange={(option) => handleChange('tipo', option?.value ?? '')}
                  />
                </label>
              </>
            )}
          </div>
        )}

        {saveError && <p className="crear-op__error">Error: {saveError}</p>}

        <div className="crear-op__footer">
          <Button kind="tertiary" onClick={onVerOportunidades} disabled={saving}>
            Ver oportunidades existentes
          </Button>
          <div className="crear-op__footer-actions">
            {stepIndex === 0 ? (
              <Button kind="secondary" onClick={onCancel} disabled={saving}>
                Cancelar
              </Button>
            ) : (
              <Button kind="secondary" onClick={() => setStepIndex((i) => i - 1)} disabled={saving}>
                Atrás
              </Button>
            )}
            <Button
              kind="primary"
              onClick={isLastStep ? handleGuardar : handleContinuar}
              disabled={!canAdvance || saving}
            >
              {isLastStep ? (saving ? 'Guardando...' : 'Guardar') : 'Guardar y continuar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
