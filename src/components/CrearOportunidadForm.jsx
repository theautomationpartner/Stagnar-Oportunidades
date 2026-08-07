import { useEffect, useRef, useState } from 'react'
import { MdUploadFile, MdClear, MdSearch, MdHome, MdArrowForward } from 'react-icons/md'
import { Button, Dropdown, AttentionBox, Modal, ModalHeader, ModalContent, ModalFooter } from '@vibe/core'
import {
  createOpportunityItem,
  setMultipleColumnValues,
  uploadFileToColumn,
  setSimpleColumnValue,
  dropdownColumnValue,
  fetchAutodataModelosByAnioMarca,
  fetchOpportunityDetail,
  fetchLatestUpdate,
  searchClientes,
  searchOportunidades,
  findClienteByCedula,
  countOportunidadesByCedula,
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

// Sentido inverso de COUNTRY_SHORT_NAMES — para cuando se autocompleta el Teléfono a
// partir de una Oportunidad ya cargada (esa columna solo trae countryShortName, no el
// código de país con el "+").
const CODIGO_PAIS_BY_COUNTRY_SHORT_NAME = Object.fromEntries(
  Object.entries(COUNTRY_SHORT_NAMES).map(([codigo, short]) => [short, codigo])
)

// El teléfono de una Oportunidad ya cargada viene como un solo string de dígitos con el
// código de país pegado adelante, sin separador (ej. "5492281580112") — para
// autocompletar el campo de acá (que espera el código de país aparte, ver Teléfono más
// abajo) hay que sacarle esos dígitos del principio. Si el código de país no se reconoce
// o no matchea el prefijo, se devuelve tal cual — mejor mostrar el dato crudo (y que la
// validación existente avise si no cierra) que perder el teléfono directamente.
function splitTelefono(rawPhone, countryShortName) {
  const codigoPais = CODIGO_PAIS_BY_COUNTRY_SHORT_NAME[countryShortName]
  if (!codigoPais || !rawPhone) return { codigoPais: codigoPais || '', telefono: rawPhone || '' }
  const prefix = codigoPais.replace('+', '')
  const telefono = rawPhone.startsWith(prefix) ? rawPhone.slice(prefix.length) : rawPhone
  return { codigoPais, telefono }
}

// El campo CI acepta puntos/guion para que se pueda tipear como está impreso en el
// documento (ver placeholder "Ej: 4.123.456-7" y ciError más abajo) — pero
// numeric_mm51mb0s es una columna NUMÉRICA real de monday, que rechaza cualquier cosa
// que no sea dígitos puros ("invalid value, please check our API documentation...").
// Se usa esto para limpiar el valor recién al guardar, nunca en el input (ahí se
// necesita crudo, con los puntos/guion, para no romper mientras se está tipeando).
function stripCi(value) {
  return value.replace(/[.\-\s]/g, '')
}

// Validaciones con mensaje — a diferencia del resto (que solo chequean "no vacío"),
// estos 3 campos necesitan validar el FORMATO del dato, no solo su presencia.
function ciError(value) {
  if (!value) return null
  const digits = stripCi(value)
  if (!/^\d+$/.test(digits)) return 'El CI debe contener solo números (podés incluir puntos y guion).'
  return null
}

// A pedido: <input type="date"> nativo (calendario desplegable) en vez del texto
// enmascarado dd/mm/aaaa de antes — el value que entrega el navegador ya viene en
// "aaaa-mm-dd", el mismo formato que espera monday para columnas date (mismo que ya
// escribe CotizarStepPanel/handleSaveCotizarFields para esta columna), así que no hace
// falta convertirlo al guardar. El navegador ya impide fechas inválidas al elegir del
// calendario; esto solo cubre el rango de año razonable.
function fechaError(value) {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  const currentYear = new Date().getFullYear()
  if (!y || y < 1900 || y > currentYear) return 'Año inválido.'
  // A pedido: no se puede cargar un cliente menor de 18 años.
  const today = new Date()
  const birth = new Date(y, m - 1, d)
  let age = today.getFullYear() - birth.getFullYear()
  const yaCumplioEsteAnio =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  if (!yaCumplioEsteAnio) age -= 1
  if (age < 18) return 'Debe ser mayor de 18 años.'
  return null
}

// "max" del calendario nativo: directo la fecha de hace 18 años, para que ni se pueda
// elegir un día que dé menor de edad (en vez de solo avisar después con fechaError).
function maxFechaNacimiento() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return d.toISOString().slice(0, 10)
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

// Marca sutilmente el campo (borde verde/rojo) según su estado — sin tocar todavía, ni
// error, ni válido: no hay nada que señalar antes de que el usuario haya cargado algo.
function fieldStateClass(value, error) {
  if (!value) return ''
  return error ? ' crear-op__field--invalid' : ' crear-op__field--valid'
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
// Búsqueda "amigable" por palabra: cada palabra escrita tiene que aparecer en algún
// lugar de la opción (no en orden, no necesariamente al principio) — a diferencia del
// filtro por defecto del Dropdown (arranca a matchear desde el principio del texto), acá
// alcanza con escribir "Boxer Minibus" para encontrar "PEUGEOT  - Boxer Minibus 1905 cc
// Turbo Diesel" aunque "Boxer" no sea la primera palabra. La usan tanto Modelo
// (matchesModeloQuery, campo puntual) como RequiredDropdown (todos los demás
// searchable del formulario, ver más abajo).
function matchesSearchQuery(label, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = label.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

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
      filterOption={(option, inputValue) => matchesSearchQuery(option.label, inputValue)}
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

// El tablero Clientes no tiene columnas separadas de Nombre/Apellido, solo el nombre del
// ítem entero (ej. "Lucía Soledad Martínez") — se parte en la primera palabra (Nombre) y
// el resto (Apellido) para precargar el formulario. Es una aproximación (nombres
// compuestos pueden partirse distinto a como se cargaron originalmente), pero los 2
// campos quedan editables después así que se puede corregir a mano si hace falta.
function splitNombreApellido(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { nombre: fullName.trim(), apellido: '' }
  return { nombre: parts[0], apellido: parts.slice(1).join(' ') }
}

// Búsqueda en vivo contra los 2 tableros a la vez (Clientes 18420863014 y Oportunidades)
// para precargar Nombre/Apellido/CI de un registro que ya existe, en vez de tipear todo
// de nuevo — el modo de búsqueda (nombre vs. Cédula) lo decide cada función según lo que
// se tipeó (ver searchClientes/searchOportunidades). Cada opción se muestra con una
// etiqueta de a qué tablero pertenece + el nombre a la izquierda, y la Cédula resaltada
// en azul a la derecha (optionRenderer), para distinguir rápido entre resultados
// parecidos y de qué fuente viene cada uno. Al elegir una, onChange recibe la opción
// entera (source/id/name/ci, +nombre/apellido si es de Oportunidad) — se arma en
// handleResultadoSeleccionado.
function ExistingRecordSearch({ value, onChange }) {
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
      Promise.all([searchClientes(term), searchOportunidades(term)])
        .then(([clientes, oportunidades]) => {
          if (cancelled) return
          const clienteOptions = clientes.map((c) => ({
            value: `cliente:${c.id}`,
            label: c.name,
            ci: c.ci,
            source: 'cliente',
            id: c.id,
            name: c.name,
          }))
          const oportunidadOptions = oportunidades.map((o) => ({
            value: `oportunidad:${o.id}`,
            label: o.name,
            ci: o.ci,
            source: 'oportunidad',
            id: o.id,
            name: o.name,
            nombre: o.nombre,
            apellido: o.apellido,
            fechaNacimiento: o.fechaNacimiento,
            telefono: o.telefono,
            telefonoCountryShortName: o.telefonoCountryShortName,
          }))
          setOptions([...clienteOptions, ...oportunidadOptions])
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

  const selected = value ? { value: `${value.source}:${value.id}`, label: value.name, ci: value.ci, source: value.source } : null

  return (
    <Dropdown
      clearable={false}
      searchable
      // Sin esto, el Dropdown vuelve a filtrar por su cuenta las opciones ya devueltas
      // por la búsqueda del servidor contra el texto tipeado — que matchea desde el
      // principio del `label` (mismo default que documenta RequiredDropdown más arriba).
      // Con una Cédula (el label es el nombre, no el número) eso descartaba TODOS los
      // resultados aunque la búsqueda real sí los hubiera encontrado. `options` acá ya
      // viene filtrado por searchClientes/searchOportunidades, así que no hace falta (ni
      // conviene) que el Dropdown filtre una segunda vez.
      filterOption={() => true}
      options={options}
      value={selected}
      loading={loading}
      onInputChange={(input) => setInputValue(input ?? '')}
      placeholder="Escribí un nombre o una cédula..."
      noOptionsMessage={
        inputValue.trim().length < 2 ? 'Escribí para buscar (letras: nombre, números: cédula)' : 'Sin resultados'
      }
      optionRenderer={(option) => (
        <div className="crear-op__cliente-option">
          <span className="crear-op__cliente-option-main">
            <span className={`crear-op__source-tag crear-op__source-tag--${option.source}`}>
              {option.source === 'cliente' ? 'Cliente' : 'Oportunidad'}
            </span>
            {option.label}
          </span>
          {option.ci && <span className="crear-op__cliente-option-ci">{option.ci}</span>}
        </div>
      )}
      onChange={(option) => onChange(option ?? null)}
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
    // automática que completa marca/anio/tipo más abajo). Cédula Identidad es opcional
    // en los dos casos (Sí y No).
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

// clearable={false} SIEMPRE acá — van 2 veces que se prueba activarlo (con la "x" nativa
// del Dropdown) y las 2 terminó en un dato bueno borrándose solo: la primera vez al
// clickear para reabrir y elegir otro valor, esta segunda con solo hacer click afuera
// (blur) después de elegir uno. En vez de perseguir un tercer caso raro de la librería,
// mejor no usar su "clearable" en absoluto — reelegir otra opción (click → abre el menú)
// ya cubre el 100% de los casos reales en un formulario donde todo es obligatorio.
//
// Además, en los campos con `searchable`: 1) filtra por palabra en cualquier lugar de la
// opción (no solo desde el principio, igual que Modelo — ver matchesSearchQuery) y 2) al
// apretar Enter, si hay algo tipeado, elige directo la primera opción que matchea (antes
// había que bajar con la flecha para resaltarla).
function RequiredDropdown({ onChange, onClear, searchable, options, ...props }) {
  const [query, setQuery] = useState('')

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || !searchable || !query.trim()) return
    const match = (options ?? []).find((o) => matchesSearchQuery(o.label, query))
    if (match) {
      e.preventDefault()
      onChange(match)
      setQuery('')
    }
  }

  return (
    <div onKeyDown={handleKeyDown}>
      <Dropdown
        clearable={false}
        searchable={searchable}
        options={options}
        filterOption={searchable ? (option, inputValue) => matchesSearchQuery(option.label, inputValue) : undefined}
        onInputChange={searchable ? (input) => setQuery(input ?? '') : undefined}
        onChange={(option) => {
          setQuery('')
          onChange(option)
        }}
        onClear={onClear ?? (() => onChange(null))}
        {...props}
      />
    </div>
  )
}

// Input de texto con una "x" para borrar el contenido de una — sin esto había que
// seleccionar todo el texto a mano o borrar letra por letra para corregir un campo. Solo
// se usa en los inputs de texto plano (Nombre/Apellido/CI/Fecha/Teléfono); los Dropdown
// del formulario a propósito NO tienen "clearable" (ver RequiredDropdown más arriba —
// ahí la "x" superpuesta con el click de reabrir el menú terminaba borrando el valor por
// error), así que no se les agrega esto.
function ClearableInput({ value, onChange, onClear, ...inputProps }) {
  return (
    <div className="crear-op__input-wrap">
      <input value={value} onChange={onChange} {...inputProps} />
      {value && (
        <button
          type="button"
          className="crear-op__input-clear"
          onClick={onClear}
          aria-label="Borrar campo"
        >
          <MdClear />
        </button>
      )}
    </div>
  )
}

// Sin ítem de monday creado todavía (recién se está completando el formulario), así que
// esto solo guarda el File en memoria — la subida real a la columna correspondiente
// (file_mm51jy06 / file_mm5pc008) se hace más adelante, cuando se sepa en qué paso se
// crea efectivamente el ítem.
function FileField({ label, file, onChange, required = true }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) onChange(dropped)
  }

  return (
    <label className="crear-op__field">
      <span>{label}{required ? ' *' : ''}</span>
      <div
        className={dragOver ? 'crear-op__file crear-op__file--drag-over' : 'crear-op__file'}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
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

// Año/Marca/Modelo/Combustible/Tipo/Uso a mano — se usa en dos casos: Posee Vehículo =
// "No" (nunca hubo archivo que leer) y Posee Vehículo = "Sí" con lectura en "Error" (el
// robot no pudo terminar; se completa/corrige lo que haga falta a mano en vez de trabar
// el formulario). `onModeloChange` varía según el caso: en "No" siempre pisa Combustible/
// Tipo con lo que sepa el modelo elegido (handleModeloChange); en el fallback de "Sí" se
// prioriza lo que ya se haya leído automáticamente (handleModeloChangeConOcr).
function VehiculoManualFields({
  form,
  setForm,
  handleChange,
  anioOptions,
  marcaOptions,
  combustibleOptions,
  tipoOptions,
  usoOptions,
  onModeloChange,
}) {
  return (
    <div className="crear-op__fields--grid">
      <label className="crear-op__field">
        <span>Año *</span>
        <RequiredDropdown
          options={anioOptions}
          value={anioOptions.find((o) => o.value === form.anio) ?? null}
          placeholder="Escribe para buscar resultados"
          searchable
          onChange={(option) => {
            // Cambiar Año/Marca invalida el Modelo elegido (se filtra por esos dos) y lo
            // que se haya autocompletado a partir de él.
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
      <label className="crear-op__field crear-op__field--full">
        <span>Modelo *</span>
        <AutodataModeloPorAnioMarca
          anio={form.anio}
          marca={form.marca}
          tipo={form.tipo}
          combustible={form.combustible}
          value={form.modeloSeleccion}
          onChange={onModeloChange}
        />
      </label>
      <label className="crear-op__field crear-op__field--full">
        <span>Combustible *</span>
        <RequiredDropdown
          options={combustibleOptions}
          value={combustibleOptions.find((o) => o.value === form.combustible) ?? null}
          placeholder="Selecciona una opción"
          onChange={(option) => handleChange('combustible', option?.value ?? '')}
        />
        {form.modeloSeleccion && !form.combustible && (
          <span className="crear-op__autofill-note">
            No fue posible completar este campo automáticamente con el modelo
            seleccionado. Por favor, complételo manualmente.
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
            No fue posible completar este campo automáticamente con el modelo
            seleccionado. Por favor, complételo manualmente.
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
    </div>
  )
}

export default function CrearOportunidadForm({ schema, onCancel, onVerOportunidades, onHome, onCreated }) {
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
  // true una vez que la Cédula ya se subió (caso "Sí": se sube apenas se elige, porque
  // el ítem ya existe a esa altura) — evita que handleGuardar la vuelva a subir de
  // nuevo al final. En el caso "No" (el ítem recién se crea al guardar) esto se queda en
  // false, así que el archivo elegido acá se sube recién en handleGuardar.
  const [cedulaSubida, setCedulaSubida] = useState(false)
  // Mismo mecanismo que cedulaSubiendo/cedulaSubida, pero para la Carta Automóvil del
  // caso "No" (ver handleCartaAutomovilManualChange) — en el caso "Sí" esto también se
  // usa (handleCartaAutomovilChange), aunque ahí el ítem siempre existe para cuando se
  // sube, así que en la práctica cartaSubida ya queda en true de una.
  const [cartaSubiendo, setCartaSubiendo] = useState(false)
  const [cartaSubida, setCartaSubida] = useState(false)
  // Resultado elegido en ExistingRecordSearch (Cliente u Oportunidad) — se guarda aparte
  // del form para poder mostrar "X seleccionado: Y" sin tener que reconstruirlo desde
  // nombre/apellido/ci por separado, y para saber si hay que correr el chequeo de
  // duplicado (ver más abajo: no tiene sentido avisar "ya existe" de algo que el usuario
  // acaba de elegir a propósito).
  const [resultadoSeleccionado, setResultadoSeleccionado] = useState(null)
  // Primera decisión del paso 1: se "resuelve" cuando el usuario elige un resultado de la
  // búsqueda O aprieta "Saltear" — recién ahí se muestran Nombre/Apellido/CI en adelante
  // (antes no es una columna real de monday, solo gatea qué se muestra acá).
  const [busquedaResuelta, setBusquedaResuelta] = useState(false)
  // Sin resultado seleccionado (search salteada o vacía): si ya existe un Cliente y/o ya
  // hay Oportunidades con la Cédula que se está tipeando a mano, se avisa acá (ver el
  // useEffect debounced más abajo).
  const [duplicadoCheck, setDuplicadoCheck] = useState(null)
  // A pedido: el aviso de arriba se muestra como popup (no como cartelito inline) y hay
  // que cerrarlo a mano con "Entendido" — se prende solo cuando llega un resultado nuevo
  // con algo para avisar (ver el useEffect debounced más abajo), no en cada render.
  const [showDuplicadoModal, setShowDuplicadoModal] = useState(false)

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  // Al elegir un resultado (Cliente u Oportunidad), se completan Nombre/Apellido/CI y se
  // abre el resto del formulario. El tablero Clientes no tiene columnas separadas de
  // Nombre/Apellido (solo el nombre completo, ver splitNombreApellido); Oportunidades sí
  // las tiene, así que ahí se usan directo, sin adivinar dónde corta el nombre.
  const handleResultadoSeleccionado = (resultado) => {
    setResultadoSeleccionado(resultado)
    if (!resultado) return
    setBusquedaResuelta(true)
    if (resultado.source === 'oportunidad') {
      // A pedido: Fecha Nacimiento y Teléfono también se autocompletan acá — Cliente no
      // tiene esas columnas (ver mapClienteItem/mondayApi.js), así que es exclusivo del
      // caso Oportunidad.
      const { codigoPais, telefono } = splitTelefono(resultado.telefono, resultado.telefonoCountryShortName)
      setForm((prev) => ({
        ...prev,
        nombre: resultado.nombre || prev.nombre,
        apellido: resultado.apellido || prev.apellido,
        ci: resultado.ci || prev.ci,
        fechaNacimiento: resultado.fechaNacimiento || prev.fechaNacimiento,
        codigoPais: codigoPais || prev.codigoPais,
        telefono: telefono || prev.telefono,
      }))
    } else {
      const { nombre, apellido } = splitNombreApellido(resultado.name)
      setForm((prev) => ({ ...prev, nombre, apellido, ci: resultado.ci || prev.ci }))
    }
  }

  // "No lo encuentro" — abre el resto del formulario para completarlo a mano, sin ningún
  // resultado elegido (limpia Nombre/Apellido/CI por si venían de una búsqueda anterior).
  const handleSaltearBusqueda = () => {
    setResultadoSeleccionado(null)
    setBusquedaResuelta(true)
    setForm((prev) => ({ ...prev, nombre: '', apellido: '', ci: '' }))
  }

  // Solo corre cuando NO hay un resultado elegido a propósito (search salteada, o el
  // usuario sigue tipeando la Cédula a mano) — avisa (sin bloquear) si esa Cédula ya está
  // cargada como Cliente y/o ya tiene Oportunidades. Debounced, recién dispara con una
  // Cédula con formato válido para no pegarle a la API en cada tecla.
  useEffect(() => {
    if (!busquedaResuelta || resultadoSeleccionado) {
      setDuplicadoCheck(null)
      return undefined
    }
    const digits = stripCi(form.ci)
    if (!digits || ciError(form.ci)) {
      setDuplicadoCheck(null)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      Promise.all([findClienteByCedula(digits), countOportunidadesByCedula(digits)])
        .then(([cliente, count]) => {
          if (cancelled) return
          setDuplicadoCheck({ cliente, count })
          if (cliente || count > 0) setShowDuplicadoModal(true)
        })
        .catch(() => {
          if (!cancelled) setDuplicadoCheck(null)
        })
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [form.ci, busquedaResuelta, resultadoSeleccionado])

  // A pedido: apenas carga el schema, el formulario arranca con Tipo de Riesgo =
  // Automóvil (el único con "Datos del riesgo" definidos hasta ahora), Departamento/
  // Localidad = Montevideo y Uso = Particular (los casos más comunes) — se puede cambiar
  // libremente, esto solo evita elegirlos a mano en el caso típico. El guard de abajo
  // evita pisar algo que el usuario ya haya tocado (ej. si el schema tarda en llegar y
  // mientras tanto ya eligió un departamento distinto a mano).
  useEffect(() => {
    if (!schema) return
    setForm((prev) => {
      if (prev.tipoRiesgo || prev.departamentoId || prev.localidadId) return prev
      const defaultDepartamento = (schema.departamentos ?? []).find((d) => d.name === 'Montevideo')
      const defaultLocalidad = (schema.localidades ?? []).find((l) => l.name === 'Montevideo - CP11500')
      const defaultUso = (schema.uso?.options ?? []).find((o) => o.toLowerCase() === 'particular')
      return {
        ...prev,
        tipoRiesgo: TIPO_RIESGO_AUTOMOVIL,
        departamentoId: defaultDepartamento?.id ?? '',
        localidadId: defaultLocalidad?.id ?? '',
        uso: defaultUso ?? prev.uso,
      }
    })
  }, [schema])

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
        busquedaResuelta &&
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
        // Cédula Identidad se pide junto con Carta Automóvil pero es opcional (no
        // bloquea), en los dos casos (Sí y No).
        if (!form.cartaAutomovil) return false
        // Camino feliz: la lectura automática terminó bien ("Leidos"), solo falta elegir
        // Modelo. Mientras está "Leer"/"Leyendo"/"subido"/"subiendo" todavía no hay
        // Marca/Año confiables con qué filtrar Autodata, así que no se puede avanzar.
        if (lecturaEstado === 'Leidos') return Boolean(form.modeloSeleccion)
        // A pedido: si la lectura terminó en "Error", en vez de trabar el formulario se
        // muestra lo que se haya alcanzado a extraer (puede venir vacío) y se completa a
        // mano el resto — mismos campos y misma validación que el caso "No".
        if (lecturaEstado === 'Error') {
          return Boolean(
            form.marca && form.anio && form.modeloSeleccion && form.combustible && form.uso && form.tipo
          )
        }
        return false
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
      numeric_mm51mb0s: stripCi(form.ci),
      date_mm516agw: form.fechaNacimiento,
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

  // Posee Vehículo === "Sí": ya no se piden Marca/Año/Tipo a mano — se leen del archivo.
  // A pedido, subir el archivo NO dispara la lectura automática sola/todavía: se sube y
  // queda en "subido" (ver JSX) hasta que el usuario confirma con el botón "Confirmar
  // lectura" (handleConfirmarLectura), recién ahí se pone color_mm5rzrhk = "Leer" y
  // arranca el robot que completa Marca/Año/Tipo/Combustible directo en el tablero
  // (mismo mecanismo/gate que OpportunityDetail.jsx). Antes de esto se podía subir sin
  // querer un archivo equivocado y ya arrancaba la lectura sin poder frenarla.
  const handleCartaAutomovilChange = async (file) => {
    handleChange('cartaAutomovil', file)
    setCartaSubida(false)
    if (!file) {
      setLecturaEstado('')
      setLecturaError(null)
      return
    }
    setLecturaEstado('subiendo')
    setLecturaError(null)
    setForm((prev) => ({ ...prev, modeloSeleccion: null, marca: '', anio: '', tipo: '' }))
    try {
      const itemId = await ensureItemId()
      await setMultipleColumnValues(itemId, buildBaseColumnValues())
      await uploadFileToColumn(itemId, 'file_mm51jy06', file)
      setCartaSubida(true)
      setLecturaEstado('subido')
    } catch (err) {
      setLecturaEstado('Error')
      setLecturaError(err.message)
    }
  }

  // Caso "No": acá no hay lectura automática que disparar (ver handleCartaAutomovilChange
  // para el caso "Sí") — a pedido, se pide este archivo junto con Cédula Identidad, mismo
  // patrón que esa: si el ítem todavía no existe, se guarda el File en memoria nomás y
  // handleGuardar lo sube una vez creado el ítem; si ya existe, se sube directo.
  const handleCartaAutomovilManualChange = async (file) => {
    handleChange('cartaAutomovil', file)
    setCartaSubida(false)
    if (!file || !createdItemId) return
    setCartaSubiendo(true)
    try {
      await uploadFileToColumn(createdItemId, 'file_mm51jy06', file)
      setCartaSubida(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setCartaSubiendo(false)
    }
  }

  // Recién acá se dispara la lectura automática — el usuario ya vio que el archivo
  // subió bien y confirma explícitamente antes de que el robot lo procese.
  const handleConfirmarLectura = async () => {
    if (!createdItemId) return
    setLecturaEstado('confirmando')
    setLecturaError(null)
    try {
      await setSimpleColumnValue(createdItemId, 'color_mm5rzrhk', 'Leer')
      setLecturaEstado('Leer')
    } catch (err) {
      setLecturaEstado('Error')
      setLecturaError(err.message)
    }
  }

  // Cédula Identidad es opcional en los dos casos (Sí y No) — no bloquea el guardado.
  // Caso "Sí": se pide junto con Carta Automóvil desde el principio, pero el ítem recién
  // existe una vez que ESA se sube (ensureItemId), así que acá puede tocar cualquiera de
  // las 2 ramas de abajo según el orden en que se elijan los archivos. Caso "No": el
  // ítem todavía no existe (recién se crea en handleGuardar), así que acá solo se guarda
  // el File en memoria — handleGuardar la sube una vez que ya hay item_id.
  const handleCedulaIdentidadChange = async (file) => {
    handleChange('cedulaIdentidad', file)
    setCedulaSubida(false)
    if (!file || !createdItemId) return
    setCedulaSubiendo(true)
    try {
      await uploadFileToColumn(createdItemId, 'file_mm5pc008', file)
      setCedulaSubida(true)
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
        // A pedido: aunque termine en "Error", se trae lo que el robot haya alcanzado a
        // completar antes de fallar (puede ser parcial, ej. Marca sí y Tipo no) — mismo
        // dato que en "Leidos", solo que acá puede venir incompleto. matchOption normaliza
        // Combustible contra las opciones reales por si difiere en casing.
        if (estado === 'Leidos' || estado === 'Error') {
          const marca = data.column_values.find((cv) => cv.id === 'dropdown_mm51ykrd')?.text?.trim() || ''
          const anio = data.column_values.find((cv) => cv.id === 'dropdown_mm51mdmq')?.text?.trim() || ''
          const tipo = data.column_values.find((cv) => cv.id === 'dropdown_mm5jqdk')?.text?.trim() || ''
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
        // Caso "No", y caso "Sí" con lectura en "Error": Marca/Año/Uso se completaron (o
        // corrigieron) a mano en el formulario, hay que escribirlos. Caso "Sí" con
        // "Leidos": ya los completó la lectura automática directo en el tablero (ver
        // polling de arriba), no hace falta reescribirlos.
        if (form.poseeVehiculo === 'No' || lecturaEstado === 'Error') {
          extra.dropdown_mm51ykrd = dropdownColumnValue(form.marca)
          // Año es un label puramente numérico ("2006") — mandarlo como string pelado
          // hace que monday lo confunda con un ID de label interno y lo descarte en
          // silencio (ver dropdownColumnValue en mondayApi.js).
          extra.dropdown_mm51mdmq = dropdownColumnValue(form.anio)
          extra.color_mm52ey1d = form.uso
        }
        await setMultipleColumnValues(itemId, extra)
      }

      // Caso "No": la Cédula y/o la Carta Automóvil (si se eligieron) todavía no se
      // subieron — el ítem no existía cuando se seleccionó el archivo (ver
      // handleCedulaIdentidadChange/handleCartaAutomovilManualChange). Caso "Sí": ya se
      // subieron apenas se eligieron, así que cartaSubida/cedulaSubida cortan acá para no
      // duplicarlas.
      if (form.cedulaIdentidad && !cedulaSubida) {
        await uploadFileToColumn(itemId, 'file_mm5pc008', form.cedulaIdentidad)
      }
      if (form.cartaAutomovil && !cartaSubida) {
        await uploadFileToColumn(itemId, 'file_mm51jy06', form.cartaAutomovil)
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
          <div className="crear-op__header-actions">
            <Button kind="secondary" onClick={onVerOportunidades}>
              <MdSearch /> Buscar Oportunidad
            </Button>
            <Button kind="secondary" onClick={onHome}>
              <MdHome /> Inicio
            </Button>
          </div>
        </div>

        <div className="crear-op__progress">
          <div className="crear-op__steps">
            {STEPS.map((s, index) => {
              // El paso 2 recién se muestra una vez que el paso 1 está completo — antes
              // de eso no hay a dónde ir (handleStepClick ya lo bloqueaba), así que
              // mostrar la pill sin poder usarla solo confundía. Al ocultarla en vez de
              // solo deshabilitarla, el paso 1 queda pegado a la izquierda con el mismo
              // gap de siempre entre pills (crear-op__steps), no un hueco vacío al lado.
              if (index === 1 && !isStepValid(0)) return null
              return (
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
              )
            })}
          </div>
          <div className="crear-op__progress-bar">
            <div
              className="crear-op__progress-fill"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {stepIndex === 0 && (
          <div className="crear-op__fields crear-op__fields--grid">
            {/* A pedido: sin la pregunta previa "¿El cliente ya existe?" — un único
                buscador (CI o nombre) que trae resultados de los 2 tableros a la vez
                (Cliente y Oportunidad, diferenciados con una etiqueta en cada opción,
                ver ExistingRecordSearch) y completa Nombre/Apellido/CI al elegir uno. Si
                no aparece nada, "Saltear" abre el resto del formulario para cargarlo a
                mano. */}
            <label className="crear-op__field crear-op__field--full">
              <span>Buscar cliente u oportunidad existente</span>
              <ExistingRecordSearch value={resultadoSeleccionado} onChange={handleResultadoSeleccionado} />
              {resultadoSeleccionado && (
                <span className="crear-op__autofill">
                  {resultadoSeleccionado.source === 'cliente' ? 'Cliente' : 'Oportunidad'} seleccionado:{' '}
                  {resultadoSeleccionado.name} — se completaron{' '}
                  {resultadoSeleccionado.source === 'oportunidad'
                    ? 'Nombre/Apellido/CI/Fecha Nacimiento/Teléfono'
                    : 'Nombre/Apellido/CI'}{' '}
                  abajo, revisalos antes de continuar.
                </span>
              )}
              {!busquedaResuelta && (
                <Button kind="tertiary" className="crear-op__skip-btn" onClick={handleSaltearBusqueda}>
                  No lo encuentro, completar los datos manualmente <MdArrowForward />
                </Button>
              )}
            </label>

            {/* A pedido: el aviso de Cédula duplicada es un popup grande con botón
                "Entendido" para cerrarlo, en vez de un cartelito chico inline — así no
                pasa desapercibido. Solo corre si no hay un resultado ya elegido a
                propósito (ver el useEffect debounced). */}
            {busquedaResuelta && !resultadoSeleccionado && showDuplicadoModal && duplicadoCheck && (
              <Modal id="duplicado-cedula-modal" show onClose={() => setShowDuplicadoModal(false)} size="medium">
                <ModalHeader title="Esta cédula ya tiene actividad cargada" className="crear-op__duplicado-modal-header" />
                <ModalContent className="crear-op__duplicado-modal-content">
                  <AttentionBox type="warning">
                    {duplicadoCheck.cliente && (
                      <div>Ya existe un cliente con esta cédula: {duplicadoCheck.cliente.name}.</div>
                    )}
                    {duplicadoCheck.count > 0 && (
                      <div>
                        Esta cédula tiene {duplicadoCheck.count}{' '}
                        {duplicadoCheck.count === 1 ? 'oportunidad consultada' : 'oportunidades consultadas'}.
                      </div>
                    )}
                  </AttentionBox>
                </ModalContent>
                <ModalFooter
                  primaryButton={{ text: 'Entendido', onClick: () => setShowDuplicadoModal(false) }}
                />
              </Modal>
            )}

            {busquedaResuelta && (
              <>
            <label className={`crear-op__field${fieldStateClass(form.nombre, false)}`}>
              <span>Nombre *</span>
              <ClearableInput
                type="text"
                placeholder="Ingresa el nombre"
                value={form.nombre}
                onChange={(e) => handleChange('nombre', e.target.value)}
                onClear={() => handleChange('nombre', '')}
              />
            </label>
            <label className={`crear-op__field${fieldStateClass(form.apellido, false)}`}>
              <span>Apellido *</span>
              <ClearableInput
                type="text"
                placeholder="Ingresa el apellido"
                value={form.apellido}
                onChange={(e) => handleChange('apellido', e.target.value)}
                onClear={() => handleChange('apellido', '')}
              />
            </label>
            <label className={`crear-op__field${fieldStateClass(form.ci, ciError(form.ci))}`}>
              <span>CI *</span>
              <ClearableInput
                type="text"
                placeholder="Ej: 4.123.456-7"
                value={form.ci}
                onChange={(e) => handleChange('ci', e.target.value)}
                onClear={() => handleChange('ci', '')}
              />
              {ciError(form.ci) && <span className="crear-op__field-error">{ciError(form.ci)}</span>}
            </label>
            <label className={`crear-op__field${fieldStateClass(form.fechaNacimiento, fechaError(form.fechaNacimiento))}`}>
              <span>Fecha Nacimiento *</span>
              <div className="crear-op__date-wrap">
                <input
                  type="date"
                  value={form.fechaNacimiento}
                  max={maxFechaNacimiento()}
                  onChange={(e) => handleChange('fechaNacimiento', e.target.value)}
                />
                {form.fechaNacimiento && (
                  <button
                    type="button"
                    className="crear-op__date-clear"
                    onClick={() => handleChange('fechaNacimiento', '')}
                    aria-label="Borrar campo"
                  >
                    <MdClear />
                  </button>
                )}
              </div>
              {fechaError(form.fechaNacimiento) && (
                <span className="crear-op__field-error">{fechaError(form.fechaNacimiento)}</span>
              )}
            </label>
            <label
              className={`crear-op__field crear-op__field--full${fieldStateClass(form.telefono, telefonoError(form.telefono, form.codigoPais))}`}
            >
              <span>Teléfono *</span>
              <div className="crear-op__phone">
                <div className="crear-op__phone-code">
                  <RequiredDropdown
                    options={CODIGO_PAIS_OPTIONS}
                    value={CODIGO_PAIS_OPTIONS.find((o) => o.value === form.codigoPais) ?? null}
                    onChange={(option) => handleChange('codigoPais', option?.value ?? '')}
                  />
                </div>
                <ClearableInput
                  type="text"
                  placeholder="Ej: 099 123 456"
                  value={form.telefono}
                  onChange={(e) => handleChange('telefono', e.target.value)}
                  onClear={() => handleChange('telefono', '')}
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
            <label className="crear-op__field crear-op__field--full">
              <span>Tipo de Riesgo *</span>
              <RequiredDropdown
                options={tipoRiesgoOptions}
                value={selectedTipoRiesgo}
                placeholder="Selecciona una opción"
                onChange={(option) => handleChange('tipoRiesgo', option?.value ?? '')}
              />
            </label>
              </>
            )}
          </div>
        )}

        {stepIndex === 1 && (
          <div className="crear-op__fields">
            {esAutomovil && (
              <label className="crear-op__field">
                <span>Tenes Carta Automóvil / Cédula Automovil? *</span>
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
                {/* A pedido: los 2 archivos se piden juntos de entrada (Cédula Identidad
                    opcional, no bloquea nada) — antes recién aparecía después de que la
                    lectura terminaba, muy tarde en el flujo. */}
                <div className="crear-op__fields--grid">
                  <FileField
                    label="Carta Automóvil / Cédula Automovil"
                    file={form.cartaAutomovil}
                    onChange={handleCartaAutomovilChange}
                  />
                  <FileField
                    label="Cédula Identidad"
                    required={false}
                    file={form.cedulaIdentidad}
                    onChange={handleCedulaIdentidadChange}
                  />
                </div>
                {cedulaSubiendo && <p className="crear-op__autofill">Subiendo Cédula Identidad...</p>}

                {(lecturaEstado === 'subiendo' ||
                  lecturaEstado === 'confirmando' ||
                  lecturaEstado === 'Leer' ||
                  lecturaEstado === 'Leyendo') && (
                  <AttentionBox type="warning" icon={false}>
                    <span className="crear-op__lectura-spinner" aria-hidden="true" />
                    {lecturaEstado === 'subiendo' && 'Subiendo Carta Automóvil...'}
                    {lecturaEstado === 'confirmando' && 'Confirmando...'}
                    {lecturaEstado === 'Leer' && 'En cola para leer Cédula y Carta Automóvil...'}
                    {lecturaEstado === 'Leyendo' && 'Leyendo Cédula y Carta Automóvil...'}{' '}
                    Esto puede tardar unos segundos, la pantalla se actualiza sola.
                  </AttentionBox>
                )}

                {/* A pedido: subir el archivo NO dispara la lectura sola — queda en
                    "subido" hasta que se confirma acá, para poder revisar que se subió
                    lo que corresponde antes de que el robot lo procese. */}
                {lecturaEstado === 'subido' && (
                  <AttentionBox
                    type="primary"
                    icon={false}
                    text="Archivo subido. Confirmá para iniciar la lectura automática de Carta Automóvil / Cédula Automovil."
                    action={{ text: 'Confirmar lectura', onClick: handleConfirmarLectura }}
                  />
                )}

                {lecturaEstado === 'Error' && (
                  <AttentionBox type="negative">
                    No se pudieron leer los documentos automáticamente. Podés volver a
                    subir el archivo para reintentar, o cambiar manualmente los
                    siguientes campos.
                  </AttentionBox>
                )}
                {lecturaEstado === 'Error' && lecturaError && (
                  <div className="crear-op__error-detail">
                    <strong>Detalle del error:</strong>
                    <pre>{lecturaError}</pre>
                  </div>
                )}

                {/* A pedido: si la lectura falla, en vez de trabar el formulario se
                    muestra lo que se haya alcanzado a extraer (puede venir vacío) y se
                    completa/corrige el resto a mano — mismos campos que el caso "No". */}
                {lecturaEstado === 'Error' && (
                  <>
                    <p className="crear-op__autofill">
                      Datos que se pudieron extraer — Marca: {form.marca || '—'}
                      {' · '}Año: {form.anio || '—'}
                      {' · '}Tipo: {form.tipo || '—'}
                      {' · '}Combustible: {form.combustible || '—'}
                    </p>
                    <VehiculoManualFields
                      form={form}
                      setForm={setForm}
                      handleChange={handleChange}
                      anioOptions={anioOptions}
                      marcaOptions={marcaOptions}
                      combustibleOptions={combustibleOptions}
                      tipoOptions={tipoOptions}
                      usoOptions={usoOptions}
                      onModeloChange={handleModeloChangeConOcr}
                    />
                  </>
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
                        No fue posible completar este campo automáticamente con el modelo
                        seleccionado. Por favor, complételo manualmente.
                      </span>
                    )}
                  </>
                )}
              </>
            )}

            {esAutomovil && form.poseeVehiculo === 'No' && (
              <>
                <VehiculoManualFields
                  form={form}
                  setForm={setForm}
                  handleChange={handleChange}
                  anioOptions={anioOptions}
                  marcaOptions={marcaOptions}
                  combustibleOptions={combustibleOptions}
                  tipoOptions={tipoOptions}
                  usoOptions={usoOptions}
                  onModeloChange={handleModeloChange}
                />
                {/* A pedido: se piden los 2 archivos a la vez acá (antes solo se pedía
                    Cédula Identidad en este caso) — los dos opcionales, no bloquean el
                    guardado. */}
                <div className="crear-op__fields--grid">
                  <FileField
                    label="Carta Automóvil / Cédula Automovil"
                    required={false}
                    file={form.cartaAutomovil}
                    onChange={handleCartaAutomovilManualChange}
                  />
                  <FileField
                    label="Cédula Identidad"
                    required={false}
                    file={form.cedulaIdentidad}
                    onChange={handleCedulaIdentidadChange}
                  />
                </div>
                {cartaSubiendo && <p className="crear-op__autofill">Subiendo Carta Automóvil...</p>}
                {cedulaSubiendo && <p className="crear-op__autofill">Subiendo Cédula Identidad...</p>}
              </>
            )}
          </div>
        )}

        {saveError && <p className="crear-op__error">Error: {saveError}</p>}

        <div className="crear-op__footer">
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
