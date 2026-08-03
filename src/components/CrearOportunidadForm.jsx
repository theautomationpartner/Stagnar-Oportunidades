import { useEffect, useRef, useState } from 'react'
import { MdClose, MdUploadFile, MdClear } from 'react-icons/md'
import { Button, Dropdown, AttentionBox } from '@vibe/core'
import {
  createOpportunityItem,
  setMultipleColumnValues,
  uploadFileToColumn,
  setSimpleColumnValue,
  dropdownColumnValue,
  fetchAutodataModelosByAnioMarca,
  fetchOpportunityDetail,
  fetchLatestUpdate,
} from '../services/mondayApi'
import './CrearOportunidadForm.css'

// Mismo tag que postea (como Update nativo de monday) el robot que lee Cédula/Carta
// Automóvil cuando falla — ver OpportunityDetail.jsx (ERROR_UPDATE_TAG_LEER), reusado acá
// para mostrar el mismo detalle de error sin duplicar convención.
const ERROR_UPDATE_TAG_LEER = '[LEER]'
const POLL_INTERVAL_MS = 4000

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

// Modelo (Autodata), a partir de Año + Marca ya conocidos — se usa en los dos casos de
// Posee Vehículo: "No" (elegidos a mano) y "Sí" (completados por la lectura automática
// de la Carta Automóvil, ver handleCartaAutomovilChange). Solo muestra los modelos
// reales que existen para esa combinación exacta en cualquiera de los dos tableros de
// Autodata (V1 + V2, board_relation_mm5422v9, +15.000 ítems combinados — no se puede
// precargar como Departamento/Localidad, ni dejar buscar cualquier texto libre).
//
// tipo/combustible (opcionales): cuando además se conocen de antemano (caso "Sí" — los
// completa la lectura automática antes de elegir Modelo), se usan para acotar más la
// lista adentro de ese Año+Marca — cada resultado ya trae su propio combustible/tipo,
// así que el matcheo es client-side, sin pegarle una consulta extra a la API. Si el
// filtro estricto no deja ningún modelo (dato incompleto/ruidoso en Autodata), se cae al
// listado amplio de Año+Marca en vez de dejar al usuario sin opciones para elegir.
function AutodataModeloPorAnioMarca({ anio, marca, tipo, combustible, value, onChange }) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!anio || !marca) {
      setOptions([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    fetchAutodataModelosByAnioMarca(anio, marca)
      .then((results) => {
        if (cancelled) return
        // Mismo cuidado que en AutodataModeloSelect: combustible/tipo tienen que viajar
        // colgados de la opción, si no se pierden antes de llegar al autocompletado.
        const mapped = results.map((r) => ({ value: r.id, label: r.name, combustible: r.combustible, tipo: r.tipo }))
        const matchesLeido = (o) =>
          (!tipo || (o.tipo && o.tipo.toLowerCase() === tipo.toLowerCase())) &&
          (!combustible || (o.combustible && o.combustible.toLowerCase() === combustible.toLowerCase()))
        const strict = tipo || combustible ? mapped.filter(matchesLeido) : mapped
        setOptions(strict.length > 0 ? strict : mapped)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [anio, marca, tipo, combustible])

  const selected = value ? { value: value.id, label: value.name } : null
  const disabled = !anio || !marca

  return (
    <Dropdown
      clearable={false}
      searchable
      options={options}
      value={selected}
      loading={loading}
      disabled={disabled}
      placeholder={disabled ? 'Elegí primero Año y Marca' : 'Selecciona un modelo'}
      noOptionsMessage={loading ? 'Buscando...' : 'Sin modelos para esa combinación'}
      onChange={(option) =>
        onChange(option ? { id: option.value, name: option.label, combustible: option.combustible, tipo: option.tipo } : null)
      }
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
    departamentoId: '',
    tipoRiesgo: '',
    poseeVehiculo: '',
    // Modelo (Autodata) — se pide siempre que sea Automóvil, sin importar la respuesta
    // de Posee Vehículo.
    modeloSeleccion: null,
    // Posee Vehículo === "Si": Carta Automóvil obligatoria (dispara la lectura
    // automática que completa marca/anio/tipo más abajo); Cédula Identidad opcional.
    cartaAutomovil: null,
    cedulaIdentidad: null,
    // Posee Vehículo === "No": no hay archivo que leer, se tipean estos 5 campos a mano.
    // Posee Vehículo === "Si": marca/anio/tipo los completa la lectura automática de la
    // Carta Automóvil en vez de tipearlos (ver handleCartaAutomovilChange); uso no aplica.
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
function FileField({ label, file, onChange, required = true }) {
  const inputRef = useRef(null)
  return (
    <label className="crear-op__field">
      <span>{label}{required ? ' *' : ''}</span>
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

  // Posee Vehículo === "Sí": a diferencia del resto del formulario, este flujo necesita
  // que el ítem ya exista en monday ANTES de terminar el paso 2 (subir la Carta
  // Automóvil, disparar la lectura automática vía color_mm5rzrhk, y esperar a que
  // complete Marca/Año/Tipo) — se crea apenas se sube ese archivo, no recién al hacer
  // clic en "Guardar" como en el resto de los casos (ver ensureItemId más abajo).
  const [createdItemId, setCreatedItemId] = useState(null)
  const [lecturaEstado, setLecturaEstado] = useState('')
  const [lecturaError, setLecturaError] = useState(null)
  const [cedulaSubiendo, setCedulaSubiendo] = useState(false)

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const departamentos = schema?.departamentos ?? []
  const departamentoOptions = departamentos.map((d) => ({ value: d.id, label: d.name }))
  const selectedDepartamento = departamentoOptions.find((o) => o.value === form.departamentoId) ?? null

  // Filtro interactivo: sin Departamento elegido, se ven todas las localidades; una vez
  // elegido, solo las de ese departamento (texto plano de la propia Localidad,
  // text_mm5wbef5 — no hace falta ir a buscar el board_relation).
  const localidades = schema?.localidades ?? []
  const localidadOptions = localidades
    .filter((l) => !selectedDepartamento || l.departamento === selectedDepartamento.label)
    .map((l) => ({ value: l.id, label: l.name }))
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

  // Matchea sin distinguir mayúsculas — el dato real de Autodata a veces difiere en
  // casing de nuestra opción real (ej. "Diesel" vs nuestro "DIesel"). Si no hay dato o
  // no matchea ninguna opción real, devuelve vacío en vez de forzar un valor inventado.
  const matchOption = (options, rawValue) => {
    if (!rawValue) return ''
    return options.find((o) => o.value.toLowerCase() === rawValue.toLowerCase())?.value ?? ''
  }

  // Al elegir un Modelo (Autodata), autocompleta Combustible y Tipo del formulario con
  // lo que sepa ese ítem — si no tiene el dato, o no coincide con ninguna de nuestras
  // opciones reales, se deja vacío (se avisa en el campo, ver JSX) en vez de forzar
  // cualquier cosa.
  const handleModeloChange = (modelo) => {
    setForm((prev) => ({
      ...prev,
      modeloSeleccion: modelo,
      combustible: matchOption(combustibleOptions, modelo?.combustible),
      tipo: matchOption(tipoOptions, modelo?.tipo),
    }))
  }

  // Caso Posee Vehículo === "Sí": a esta altura Tipo (y a veces Combustible) ya viene
  // completado por la lectura automática de la Carta Automóvil (ver polling de
  // lecturaEstado más abajo) — a diferencia de handleModeloChange (que siempre pisa con
  // lo que sepa el modelo elegido), acá el dato leído automáticamente tiene prioridad y
  // el del modelo de Autodata solo se usa como respaldo si ese campo vino vacío.
  const handleModeloChangeConOcr = (modelo) => {
    setForm((prev) => ({
      ...prev,
      modeloSeleccion: modelo,
      combustible: prev.combustible || matchOption(combustibleOptions, modelo?.combustible),
      tipo: prev.tipo || matchOption(tipoOptions, modelo?.tipo),
    }))
  }

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
          form.departamentoId &&
          form.tipoRiesgo
      )
    }
    if (index === 1) {
      if (!esAutomovil) return true
      if (!form.poseeVehiculo) return false
      if (form.poseeVehiculo === 'Si') {
        // Hay que esperar a que la lectura automática termine ("Leidos") antes de poder
        // elegir Modelo — mientras está "Leer"/"Leyendo"/"Error" todavía no hay Marca/Año
        // confiables con qué filtrar Autodata.
        return Boolean(form.cartaAutomovil && lecturaEstado === 'Leidos' && form.modeloSeleccion)
      }
      if (!form.modeloSeleccion) return false
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

  // Todo lo que ya se sabe antes de llegar a Modelo/Combustible/Uso/Tipo — se usa tanto
  // para crear el ítem apenas se sube la Carta Automóvil (caso "Sí", ver
  // handleCartaAutomovilChange) como en el guardado final, para no duplicar la lista de
  // columnas en dos lugares.
  const buildBaseColumnValues = () => {
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
      board_relation_mm54tq30: { item_ids: [Number(form.departamentoId)] },
    }
    if (esAutomovil) columnValues.color_mm51n4j = form.poseeVehiculo
    return columnValues
  }

  // Se crea el ítem PELADO (solo el nombre) y recién después se asientan las columnas en
  // un mutation separado (change_multiple_column_values) — si van juntas en el mismo
  // create_item, monday no dispara las automatizaciones que dependen de un cambio de
  // columna real. Memoiza el id creado (createdItemId) para no crear un ítem duplicado
  // si esto se llama más de una vez (pasa en el caso "Sí": una vez al subir la Carta
  // Automóvil, y de nuevo al hacer clic en "Guardar").
  const ensureItemId = async () => {
    if (createdItemId) return createdItemId
    const itemName = `${form.nombre} ${form.apellido}`.trim()
    const created = await createOpportunityItem(itemName)
    setCreatedItemId(created.id)
    return created.id
  }

  // Posee Vehículo === "Sí": ya no se piden Marca/Año/Tipo a mano — se suben la Carta
  // Automóvil, se dispara la lectura automática (color_mm5rzrhk = "Leer") y se espera a
  // que ese robot complete esos 3 campos directo en el tablero (mismo mecanismo/gate que
  // OpportunityDetail.jsx). Recién ahí se puede filtrar Autodata por Año+Marca y mostrar
  // los modelos candidatos (ver AutodataModeloPorAnioMarca en el JSX).
  const handleCartaAutomovilChange = async (file) => {
    handleChange('cartaAutomovil', file)
    if (!file) return
    setLecturaEstado('subiendo')
    setLecturaError(null)
    setForm((prev) => ({ ...prev, modeloSeleccion: null, marca: '', anio: '', tipo: '' }))
    try {
      const itemId = await ensureItemId()
      await setMultipleColumnValues(itemId, buildBaseColumnValues())
      await uploadFileToColumn(itemId, 'file_mm51jy06', file)
      await setSimpleColumnValue(itemId, 'color_mm5rzrhk', 'Leer')
      setLecturaEstado('Leer')
    } catch (err) {
      setLecturaEstado('Error')
      setLecturaError(err.message)
    }
  }

  // Cédula Identidad ahora es opcional (ya no bloquea el guardado) — como el ítem ya
  // existe para cuando este campo aparece (recién se muestra después de "Leidos"), se
  // sube directo apenas se elige el archivo en vez de esperar a "Guardar".
  const handleCedulaIdentidadChange = async (file) => {
    handleChange('cedulaIdentidad', file)
    if (!file || !createdItemId) return
    setCedulaSubiendo(true)
    try {
      await uploadFileToColumn(createdItemId, 'file_mm5pc008', file)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setCedulaSubiendo(false)
    }
  }

  // Refleja en vivo los cambios de color_mm5rzrhk mientras se procesa la lectura
  // automática de la Carta Automóvil: reconsulta cada POLL_INTERVAL_MS y corta el
  // polling apenas llega a un estado terminal ("Leidos" o "Error"). Al llegar a "Leidos"
  // trae Marca/Año/Tipo ya completados por el robot para poder filtrar Autodata.
  useEffect(() => {
    if (lecturaEstado !== 'Leer' && lecturaEstado !== 'Leyendo') return undefined
    if (!createdItemId) return undefined
    let cancelled = false

    const tick = async () => {
      try {
        const data = await fetchOpportunityDetail(createdItemId)
        if (cancelled || !data) return
        const estado = data.column_values.find((cv) => cv.id === 'color_mm5rzrhk')?.text?.trim()
        if (!estado || estado === lecturaEstado) return
        setLecturaEstado(estado)
        if (estado === 'Leidos') {
          const marca = data.column_values.find((cv) => cv.id === 'dropdown_mm51ykrd')?.text?.trim() || ''
          const anio = data.column_values.find((cv) => cv.id === 'dropdown_mm51mdmq')?.text?.trim() || ''
          const tipo = data.column_values.find((cv) => cv.id === 'dropdown_mm5jqdk')?.text?.trim() || ''
          // El robot también completa Combustible directo en el tablero (no solo
          // Marca/Año/Tipo) — matchOption lo normaliza contra las opciones reales por si
          // difiere en casing (ver el mismo cuidado en handleModeloChange).
          const combustibleLeido = data.column_values.find((cv) => cv.id === 'dropdown_mm52jp01')?.text?.trim() || ''
          setForm((prev) => ({
            ...prev,
            marca,
            anio,
            tipo,
            combustible: matchOption(combustibleOptions, combustibleLeido),
          }))
        }
        if (estado === 'Error') {
          try {
            const update = await fetchLatestUpdate(createdItemId, ERROR_UPDATE_TAG_LEER)
            if (!cancelled) setLecturaError(update?.text_body?.trim() || null)
          } catch {
            // sin detalle disponible, se muestra igual el estado "Error" pelado
          }
        }
      } catch {
        // hiccup de red puntual: se reintenta en el próximo tick
      }
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [lecturaEstado, createdItemId])

  const handleGuardar = async () => {
    if (!canAdvance || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const itemId = await ensureItemId()
      await setMultipleColumnValues(itemId, buildBaseColumnValues())

      if (esAutomovil) {
        const extra = {
          board_relation_mm5422v9: { item_ids: [Number(form.modeloSeleccion.id)] },
          // El paso Cotizar muestra el Modelo desde text_mm54fb7m, no desde la conexión
          // (que la automatización de "Cotizar" vacía después de usarla) — como en este
          // punto todavía no se cotizó nada, si no escribimos esto acá el campo queda en
          // "—" hasta la primera cotización.
          text_mm54fb7m: form.modeloSeleccion.name,
        }
        if (form.combustible) extra.dropdown_mm52jp01 = dropdownColumnValue(form.combustible)
        if (form.tipo) extra.dropdown_mm5jqdk = dropdownColumnValue(form.tipo)
        if (form.poseeVehiculo === 'No') {
          extra.dropdown_mm51ykrd = dropdownColumnValue(form.marca)
          // Año es un label puramente numérico ("2006") — mandarlo como string pelado
          // hace que monday lo confunda con un ID de label interno y lo descarte en
          // silencio (ver dropdownColumnValue en mondayApi.js).
          extra.dropdown_mm51mdmq = dropdownColumnValue(form.anio)
          extra.color_mm52ey1d = form.uso
        }
        // Caso "Sí": Marca/Año ya los completó la lectura automática directo en el
        // tablero (ver polling de arriba) — no hace falta reescribirlos acá.
        await setMultipleColumnValues(itemId, extra)
      }

      onCreated?.(itemId)
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
              <span>Departamento *</span>
              <RequiredDropdown
                options={departamentoOptions}
                value={selectedDepartamento}
                placeholder="Escribe para buscar resultados"
                searchable
                onChange={(option) => {
                  // Al cambiar el departamento, se limpia la Localidad elegida — puede
                  // ya no pertenecer al departamento nuevo (el dropdown de acá abajo se
                  // filtra por esto mismo).
                  handleChange('departamentoId', option?.value ?? '')
                  handleChange('localidadId', '')
                }}
              />
            </label>
            <label className="crear-op__field">
              <span>Localidad *</span>
              <RequiredDropdown
                options={localidadOptions}
                value={selectedLocalidad}
                placeholder={
                  selectedDepartamento ? 'Escribe para buscar resultados' : 'Elegí primero un departamento'
                }
                disabled={!selectedDepartamento}
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

            {esAutomovil && form.poseeVehiculo === 'Si' && (
              <>
                <FileField
                  label="Carta Automóvil / Cédula Automovil"
                  file={form.cartaAutomovil}
                  onChange={handleCartaAutomovilChange}
                />

                {(lecturaEstado === 'subiendo' ||
                  lecturaEstado === 'Leer' ||
                  lecturaEstado === 'Leyendo') && (
                  <AttentionBox type="warning" icon={false}>
                    <span className="crear-op__lectura-spinner" aria-hidden="true" />
                    {lecturaEstado === 'subiendo' && 'Subiendo Carta Automóvil...'}
                    {lecturaEstado === 'Leer' && 'En cola para leer Cédula y Carta Automóvil...'}
                    {lecturaEstado === 'Leyendo' && 'Leyendo Cédula y Carta Automóvil...'}{' '}
                    Esto puede tardar unos segundos, la pantalla se actualiza sola.
                  </AttentionBox>
                )}

                {lecturaEstado === 'Error' && (
                  <AttentionBox type="negative">
                    No se pudieron leer los documentos automáticamente. Podés volver a
                    subir el archivo para reintentar.
                  </AttentionBox>
                )}
                {lecturaEstado === 'Error' && lecturaError && (
                  <div className="crear-op__error-detail">
                    <strong>Detalle del error:</strong>
                    <pre>{lecturaError}</pre>
                  </div>
                )}

                {lecturaEstado === 'Leidos' && (
                  <>
                    <p className="crear-op__autofill">
                      Datos leídos automáticamente — Marca: {form.marca || '—'}
                      {' · '}Año: {form.anio || '—'}
                      {' · '}Tipo: {form.tipo || '—'}
                      {' · '}Combustible: {form.combustible || '—'}
                    </p>
                    <label className="crear-op__field">
                      <span>Modelo *</span>
                      <AutodataModeloPorAnioMarca
                        anio={form.anio}
                        marca={form.marca}
                        tipo={form.tipo}
                        combustible={form.combustible}
                        value={form.modeloSeleccion}
                        onChange={handleModeloChangeConOcr}
                      />
                    </label>
                    {form.modeloSeleccion && !form.combustible && (
                      <span className="crear-op__autofill-note">
                        No se pudo determinar el Combustible automáticamente.
                      </span>
                    )}
                    <FileField
                      label="Cédula Identidad"
                      required={false}
                      file={form.cedulaIdentidad}
                      onChange={handleCedulaIdentidadChange}
                    />
                    {cedulaSubiendo && <p className="crear-op__autofill">Subiendo Cédula Identidad...</p>}
                  </>
                )}
              </>
            )}

            {esAutomovil && form.poseeVehiculo === 'No' && (
              <>
                <label className="crear-op__field">
                  <span>Año *</span>
                  <RequiredDropdown
                    options={anioOptions}
                    value={anioOptions.find((o) => o.value === form.anio) ?? null}
                    placeholder="Escribe para buscar resultados"
                    searchable
                    onChange={(option) => {
                      // Cambiar Año/Marca invalida el Modelo elegido (se filtra por esos
                      // dos) y lo que se haya autocompletado a partir de él.
                      setForm((prev) => ({
                        ...prev,
                        anio: option?.value ?? '',
                        modeloSeleccion: null,
                        combustible: '',
                        tipo: '',
                      }))
                    }}
                  />
                </label>
                <label className="crear-op__field">
                  <span>Marca *</span>
                  <RequiredDropdown
                    options={marcaOptions}
                    value={marcaOptions.find((o) => o.value === form.marca) ?? null}
                    placeholder="Escribe para buscar resultados"
                    searchable
                    onChange={(option) => {
                      setForm((prev) => ({
                        ...prev,
                        marca: option?.value ?? '',
                        modeloSeleccion: null,
                        combustible: '',
                        tipo: '',
                      }))
                    }}
                  />
                </label>
                <label className="crear-op__field">
                  <span>Modelo *</span>
                  <AutodataModeloPorAnioMarca
                    anio={form.anio}
                    marca={form.marca}
                    value={form.modeloSeleccion}
                    onChange={handleModeloChange}
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
                  {form.modeloSeleccion && !form.combustible && (
                    <span className="crear-op__autofill-note">
                      No se pudo autocompletar con el modelo elegido — completalo a mano.
                    </span>
                  )}
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
                  {form.modeloSeleccion && !form.tipo && (
                    <span className="crear-op__autofill-note">
                      No se pudo autocompletar con el modelo elegido — completalo a mano.
                    </span>
                  )}
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
