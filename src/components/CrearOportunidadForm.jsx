import { useEffect, useRef, useState } from 'react'
import {
  MdClear,
  MdSearch,
  MdHome,
  MdArrowForward,
  MdArrowBack,
  MdEventNote,
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdEdit,
} from 'react-icons/md'
import {
  Button,
  IconButton,
  Dropdown,
  AttentionBox,
  Loader,
  TextField,
  Modal,
  ModalContent,
  ModalFooter,
} from '@vibe/core'
import Stepper from './Stepper'
import StatusBadge from './StatusBadge'
import AlertModal from './AlertModal'
import ErrorDetailBox from './ErrorDetailBox'
import FileUploadField from './FileUploadField'
import AutodataModeloPorAnioMarca from './AutodataModeloPorAnioMarca'
import {
  createOpportunityItem,
  setMultipleColumnValues,
  setConnectedColumnValue,
  uploadFileToColumn,
  setSimpleColumnValue,
  dropdownColumnValue,
  fetchOpportunityDetail,
  fetchLatestUpdate,
  searchContactos,
  searchOportunidades,
  findContactoByCedula,
  fetchContactoOportunidades,
  createContactoItem,
  fetchFileColumnAsFile,
  fetchAutodataModelosByAnioMarca,
  setContactoColumnValues,
  OPORTUNIDAD_CONTACTO_COLUMN_ID,
  CONTACTO_CI_COLUMN_ID,
  CONTACTO_TELEFONO_COLUMN_ID,
  CONTACTO_FECHA_NACIMIENTO_COLUMN_ID,
  CONTACTO_LOCALIDAD_COLUMN_ID,
} from '../services/mondayApi'
import { mapOpportunities } from '../services/opportunityMapper'
import { matchesSearchQuery } from '../services/format'
import './CrearOportunidadForm.css'

// Mismo tag que postea (como Update nativo de monday) el robot que lee Cédula/Carta
// Automóvil cuando falla — ver OpportunityDetail.jsx (ERROR_UPDATE_TAG_LEER), reusado acá
// para mostrar el mismo detalle de error sin duplicar convención.
const ERROR_UPDATE_TAG_LEER = '[LEER]'
const POLL_INTERVAL_MS = 4000

const STEPS = [
  { key: 'personales', label: 'Datos personales' },
  { key: 'oportunidad', label: 'Datos de oportunidad' },
]

// Único label real (con emoji, tal cual está configurado en monday) que muestra el resto
// del formulario "Datos del riesgo" — el resto de los tipos (Vivienda, Persona, etc.)
// todavía no tienen esos campos definidos.
const TIPO_RIESGO_AUTOMOVIL = '🚗 Automóvil'

// Mismos valores reales que color_mm51n4j ("Posee Vehiculo?") en el tablero
// Oportunidades — el toggle de 2 botones (ver JSX) los usa tal cual, "Si"/"No".

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

// AutodataModeloPorAnioMarca y matchesSearchQuery se movieron a sus propios archivos
// compartidos (ver AutodataModeloPorAnioMarca.jsx y services/format.js) — CotizarStepPanel.jsx
// (edición del paso "Cotizar") ahora reusa exactamente lo mismo, en vez de tener su
// propia versión sin filtrar por Año/Marca.

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

// Búsqueda en vivo contra los 2 tableros a la vez (Contactos 18420863016 y Oportunidades
// 18420863013) para precargar los datos personales de un registro que ya existe, en vez
// de tipear todo de nuevo — el modo de búsqueda (nombre vs. Cédula) lo decide cada
// función según lo que se tipeó (ver searchContactos/searchOportunidades). Resultado de
// Oportunidades se etiqueta "Lead" (persona sin Contacto formal todavía, ver el dedup por
// CI más abajo) en vez de "Cliente"/"Oportunidad" — nombra mejor lo que es cada uno.
// Cada opción se muestra con su etiqueta + el nombre a la izquierda, y la Cédula
// resaltada en azul a la derecha (optionRenderer), para distinguir rápido entre
// resultados parecidos y de qué fuente viene cada uno. Al elegir una, onChange recibe la
// opción entera (source/id/name/ci + datos personales — ambas fuentes ya traen
// Fecha Nacimiento/Teléfono/Departamento/Localidad) — se arma en
// handleResultadoSeleccionado.
function ExistingRecordSearch({ value, onChange }) {
  const [inputValue, setInputValue] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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
      Promise.all([searchContactos(term), searchOportunidades(term)])
        .then(([contactos, oportunidades]) => {
          if (cancelled) return
          const contactoOptions = contactos.map((c) => ({
            value: `contacto:${c.id}`,
            label: c.name,
            ci: c.ci,
            source: 'contacto',
            id: c.id,
            name: c.name,
            fechaNacimiento: c.fechaNacimiento,
            telefono: c.telefono,
            telefonoCountryShortName: c.telefonoCountryShortName,
            departamentoNombre: c.departamentoNombre,
            localidadNombre: c.localidadNombre,
          }))
          // A pedido: si esta persona YA es Contacto, no se muestra de nuevo como
          // "Lead" a partir de una Oportunidad vieja suya (mismo CI) — un solo
          // resultado, el de Contacto (fuente completa).
          const contactoCis = new Set(contactoOptions.map((c) => stripCi(c.ci)).filter(Boolean))
          const leadOptions = oportunidades
            .filter((o) => !stripCi(o.ci) || !contactoCis.has(stripCi(o.ci)))
            .map((o) => ({
              value: `lead:${o.id}`,
              label: o.name,
              ci: o.ci,
              source: 'lead',
              id: o.id,
              name: o.name,
              nombre: o.nombre,
              apellido: o.apellido,
              fechaNacimiento: o.fechaNacimiento,
              telefono: o.telefono,
              telefonoCountryShortName: o.telefonoCountryShortName,
              departamentoNombre: o.departamentoNombre,
              localidadNombre: o.localidadNombre,
              modelo: o.modelo,
            }))
          setOptions([...contactoOptions, ...leadOptions])
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

  // Cruz propia (no el "clearable" nativo del Dropdown, ver el comentario grande de
  // más abajo sobre por qué se dejó en false) — a pedido, borra tanto lo tipeado en
  // este campo como el resultado ya elegido, y el onChange(null) de abajo es lo que le
  // avisa al padre que también limpie los datos del form que se habían autocompletado.
  // No hace falta remontar nada acá: al pasar `value` de un resultado elegido a null,
  // el propio Dropdown (downshift por debajo) ya limpia su inputValue interno solo,
  // como parte de su manejo normal de un selectedItem controlado que cambia.
  const handleClear = () => {
    setInputValue('')
    setOptions([])
    setMenuOpen(false)
    onChange(null)
  }

  return (
    <div className="crear-op__search-wrap">
      <Dropdown
        clearable={false}
        searchable
        // Sin esto, el Dropdown vuelve a filtrar por su cuenta las opciones ya devueltas
        // por la búsqueda del servidor contra el texto tipeado — que matchea desde el
        // principio del `label` (mismo default que documenta RequiredDropdown más arriba).
        // Con una Cédula (el label es el nombre, no el número) eso descartaba TODOS los
        // resultados aunque la búsqueda real sí los hubiera encontrado. `options` acá ya
        // viene filtrado por searchContactos/searchOportunidades, así que no hace falta (ni
        // conviene) que el Dropdown filtre una segunda vez.
        filterOption={() => true}
        options={options}
        value={selected}
        loading={loading}
        inputValue={inputValue}
        onInputChange={(input) => setInputValue(input ?? '')}
        isMenuOpen={menuOpen}
        onMenuOpen={() => setMenuOpen(true)}
        onMenuClose={() => setMenuOpen(false)}
        placeholder="Buscá a la persona por nombre o cédula..."
        noOptionsMessage={
          inputValue.trim().length < 2 ? 'Escribí para buscar (letras: nombre, números: cédula)' : 'Sin resultados'
        }
        optionRenderer={(option) => (
          <div className="crear-op__cliente-option">
            <div className="crear-op__cliente-option-row">
              <span className="crear-op__cliente-option-main">
                <span className={`crear-op__source-tag crear-op__source-tag--${option.source}`}>
                  {option.source === 'contacto' ? 'Contacto' : 'Lead'}
                </span>
                {option.label}
              </span>
              {option.ci && <span className="crear-op__cliente-option-ci">{option.ci}</span>}
            </div>
            {/* A pedido: el modelo del vehículo de esa Oportunidad, para distinguir de un
                vistazo si esta persona tiene varias — solo los resultados "Lead" (vienen
                de una Oportunidad) tienen esta info, Contacto no. */}
            {option.modelo && <span className="crear-op__cliente-option-modelo">{option.modelo}</span>}
          </div>
        )}
        onChange={(option) => onChange(option ?? null)}
      />
      {(inputValue || selected) && (
        <button
          type="button"
          className="crear-op__search-clear"
          onClick={handleClear}
          aria-label="Borrar búsqueda"
        >
          <MdClear />
        </button>
      )}
    </div>
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

// A pedido: si eligen una persona en "Buscar Persona" y se van del formulario (Inicio,
// Ver Oportunidades) antes de terminar de cargar la Oportunidad, no hay que hacerlos
// buscar de nuevo al volver — se guarda ese resultado (y los datos personales que
// autocompletó) en localStorage por un rato corto nada más: pensado para "me fui un
// momento y vuelvo", no para autocompletar algo de hace rato con datos capaz ya viejos.
const PERSISTED_SEARCH_KEY = 'stagnari:crear-op:buscar-persona'
const PERSISTED_SEARCH_TTL_MS = 10 * 60 * 1000

function loadPersistedSearch() {
  try {
    const raw = window.localStorage.getItem(PERSISTED_SEARCH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > PERSISTED_SEARCH_TTL_MS) {
      window.localStorage.removeItem(PERSISTED_SEARCH_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function savePersistedSearch(data) {
  try {
    window.localStorage.setItem(PERSISTED_SEARCH_KEY, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch {
    // localStorage lleno o deshabilitado (modo privado, etc.): no es crítico, el
    // formulario sigue funcionando igual, solo no se recuerda para la próxima.
  }
}

function clearPersistedSearch() {
  try {
    window.localStorage.removeItem(PERSISTED_SEARCH_KEY)
  } catch {
    // sin efecto si ya no existía o localStorage no está disponible.
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

// Año/Marca/Modelo/Combustible/Tipo/Uso a mano — se usa en dos casos: Posee Vehículo =
// "No" (nunca hubo archivo que leer) y Posee Vehículo = "Sí" con lectura en "Error" (el
// robot no pudo terminar; se completa/corrige lo que haga falta a mano en vez de trabar
// el formulario). `onModeloChange` varía según el caso: en "No" siempre pisa Combustible/
// Tipo con lo que sepa el modelo elegido (handleModeloChange); en el fallback de "Sí" se
// prioriza lo que ya se haya leído automáticamente (handleModeloChangeConOcr).
// highlightEmpty (a pedido, estética tipo mockup): cuando la lectura automática de la
// Carta Automóvil falla, en vez de un aviso genérico se resaltan en amarillo justo los
// campos que quedaron vacíos (los que SÍ se leyeron quedan con su estilo normal) — el
// mismo campo puede llegar acá ya completado (Año/Marca/Combustible/Uso) o vacío
// (Modelo/Tipo, por ejemplo), según lo que haya podido extraer el robot.
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
  highlightEmpty = false,
  modeloDisabled = false,
}) {
  const missingClass = (value) => (highlightEmpty && !value ? ' crear-op__field--missing' : '')

  return (
    <div className="crear-op__fields--grid">
      <label className={`crear-op__field${missingClass(form.anio)}`}>
        <span>Año *</span>
        <RequiredDropdown
          options={anioOptions}
          value={anioOptions.find((o) => o.value === form.anio) ?? null}
          placeholder={highlightEmpty && !form.anio ? 'Seleccioná el año faltante...' : 'Escribe para buscar resultados'}
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
      <label className={`crear-op__field${missingClass(form.marca)}`}>
        <span>Marca *</span>
        <RequiredDropdown
          options={marcaOptions}
          value={marcaOptions.find((o) => o.value === form.marca) ?? null}
          placeholder={highlightEmpty && !form.marca ? 'Seleccioná la marca faltante...' : 'Escribe para buscar resultados'}
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
      <label className={`crear-op__field crear-op__field--full${missingClass(form.modeloSeleccion)}`}>
        <span>Modelo *</span>
        <AutodataModeloPorAnioMarca
          anio={form.anio}
          marca={form.marca}
          tipo={form.tipo}
          combustible={form.combustible}
          value={form.modeloSeleccion}
          onChange={onModeloChange}
          placeholder={highlightEmpty && !form.modeloSeleccion ? 'Seleccioná el modelo faltante...' : undefined}
          disabled={modeloDisabled}
        />
      </label>
      <label className={`crear-op__field crear-op__field--full${missingClass(form.combustible)}`}>
        <span>Combustible *</span>
        <RequiredDropdown
          options={combustibleOptions}
          value={combustibleOptions.find((o) => o.value === form.combustible) ?? null}
          placeholder={highlightEmpty && !form.combustible ? 'Seleccioná el combustible faltante...' : 'Selecciona una opción'}
          onChange={(option) => handleChange('combustible', option?.value ?? '')}
        />
        {form.modeloSeleccion && !form.combustible && (
          <span className="crear-op__autofill-note">
            No fue posible completar este campo automáticamente con el modelo
            seleccionado. Por favor, complételo manualmente.
          </span>
        )}
      </label>
      <label className={`crear-op__field${missingClass(form.tipo)}`}>
        <span>Tipo *</span>
        <RequiredDropdown
          options={tipoOptions}
          value={tipoOptions.find((o) => o.value === form.tipo) ?? null}
          placeholder={highlightEmpty && !form.tipo ? 'Seleccioná el tipo...' : 'Escribe para buscar resultados'}
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
      <label className={`crear-op__field${missingClass(form.uso)}`}>
        <span>Uso *</span>
        <RequiredDropdown
          options={usoOptions}
          value={usoOptions.find((o) => o.value === form.uso) ?? null}
          placeholder={highlightEmpty && !form.uso ? 'Seleccioná el uso faltante...' : 'Escribe para buscar resultados'}
          searchable
          onChange={(option) => handleChange('uso', option?.value ?? '')}
        />
      </label>
    </div>
  )
}

// A pedido: popup para editar los datos del Contacto ya elegido directo desde acá — a
// diferencia del resto del form (que solo vive en esta Oportunidad hasta guardar), lo
// que se cambia acá escribe DE UNA en el Contacto real (ver handleSaveContacto en el
// componente principal). CI/Nombre/Apellido quedan afuera a propósito — son datos de
// identidad, no se tocan desde una Oportunidad puntual.
function EditarContactoModal({ form, departamentoOptions, localidades, onSave, onClose, saving, error }) {
  const [fechaNacimiento, setFechaNacimiento] = useState(form.fechaNacimiento)
  const [codigoPais, setCodigoPais] = useState(form.codigoPais)
  const [telefono, setTelefono] = useState(form.telefono)
  const [departamentoId, setDepartamentoId] = useState(form.departamentoId)
  const [localidadId, setLocalidadId] = useState(form.localidadId)

  const selectedDepartamento = departamentoOptions.find((o) => o.value === departamentoId) ?? null
  const localidadOptions = localidades
    .filter((l) => !selectedDepartamento || l.departamento === selectedDepartamento.label)
    .map((l) => ({ value: l.id, label: l.name }))
  const selectedLocalidad = localidadOptions.find((o) => o.value === localidadId) ?? null

  const telefonoErr = telefonoError(telefono, codigoPais)
  const fechaErr = fechaError(fechaNacimiento)
  const canSave = !telefonoErr && !fechaErr && departamentoId && localidadId

  return (
    <Modal id="editar-contacto-modal" show onClose={onClose} size="medium">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">Editar contacto</h2>
        {error && <p className="crear-op__error">Error: {error}</p>}
        <div className="crear-op__fields--grid">
          <label className={`crear-op__field${fieldStateClass(fechaNacimiento, fechaErr)}`}>
            <span>Fecha Nacimiento *</span>
            <div className="crear-op__date-wrap">
              <input
                type="date"
                value={fechaNacimiento}
                max={maxFechaNacimiento()}
                onChange={(e) => setFechaNacimiento(e.target.value)}
              />
            </div>
            {fechaErr && <span className="crear-op__field-error">{fechaErr}</span>}
          </label>
          <label className="crear-op__field crear-op__field--full">
            <span>Teléfono *</span>
            <div className="crear-op__phone">
              <div className="crear-op__phone-code">
                <RequiredDropdown
                  options={CODIGO_PAIS_OPTIONS}
                  value={CODIGO_PAIS_OPTIONS.find((o) => o.value === codigoPais) ?? null}
                  onChange={(option) => setCodigoPais(option?.value ?? '')}
                />
              </div>
              <TextField
                wrapperClassName="crear-op__phone-number"
                placeholder="Ej: 099 123 456"
                value={telefono}
                onChange={setTelefono}
                icon={MdClear}
                onIconClick={() => setTelefono('')}
                validation={telefonoErr ? { status: 'error' } : telefono ? { status: 'success' } : undefined}
              />
            </div>
            {telefonoErr && <span className="crear-op__field-error">{telefonoErr}</span>}
          </label>
          <label className="crear-op__field">
            <span>Departamento *</span>
            <RequiredDropdown
              options={departamentoOptions}
              value={selectedDepartamento}
              placeholder="Escribe para buscar resultados"
              searchable
              onChange={(option) => {
                setDepartamentoId(option?.value ?? '')
                setLocalidadId('')
              }}
            />
          </label>
          <label className="crear-op__field">
            <span>Localidad *</span>
            <RequiredDropdown
              options={localidadOptions}
              value={selectedLocalidad}
              placeholder={selectedDepartamento ? 'Escribe para buscar resultados' : 'Elegí primero un departamento'}
              disabled={!selectedDepartamento}
              searchable
              onChange={(option) => setLocalidadId(option?.value ?? '')}
            />
          </label>
        </div>
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose, disabled: saving }}
        primaryButton={{
          text: saving ? 'Guardando...' : 'Guardar',
          disabled: !canSave || saving,
          onClick: () => onSave({ fechaNacimiento, codigoPais, telefono, departamentoId, localidadId }),
        }}
      />
    </Modal>
  )
}

export default function CrearOportunidadForm({
  schema,
  opportunities,
  onCancel,
  onVerOportunidades,
  onHome,
  onOpenOportunidad,
  onCreated,
}) {
  const [stepIndex, setStepIndex] = useState(0)
  // Calculado una sola vez, al montar (ver loadPersistedSearch) — de acá salen los
  // valores iniciales de form/resultadoSeleccionado/searchPreview/busquedaResuelta más
  // abajo, para que la Oportunidad anterior a medio cargar (si hay una vigente, dentro
  // de PERSISTED_SEARCH_TTL_MS) aparezca ya autocompleta desde el primer render.
  const [initialPersistedSearch] = useState(loadPersistedSearch)
  const [form, setForm] = useState(() => ({
    ...buildInitialForm(),
    ...(initialPersistedSearch?.personales ?? {}),
  }))
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
  // A pedido, estética tipo mockup: tras una lectura exitosa (Leidos + Modelo ya
  // elegido) se muestra un resumen compacto en vez de los campos sueltos — "Editar
  // datos" lo cambia por VehiculoManualFields (mismos campos, ahora editables) para
  // corregir algo puntual sin perder lo demás. Se resetea a false cada vez que se sube
  // un archivo nuevo (ver handleCartaAutomovilChange) para no arrancar la lectura
  // siguiente ya en modo edición.
  const [editingLeidos, setEditingLeidos] = useState(false)
  const [cedulaSubiendo, setCedulaSubiendo] = useState(false)
  // true una vez que la Cédula ya se subió (caso "Sí": se sube apenas se elige, porque
  // el ítem ya existe a esa altura) — evita que handleGuardar la vuelva a subir de
  // nuevo al final. En el caso "No" (el ítem recién se crea al guardar) esto se queda en
  // false, así que el archivo elegido acá se sube recién en handleGuardar.
  const [cedulaSubida, setCedulaSubida] = useState(false)
  // A pedido: marca si el archivo actual de Cédula Identidad vino del autocompletado
  // (ver handleAutofillCedula) en vez de elegido a mano — gatea el recubrimiento verde
  // de FileField (highlighted). Se apaga solo si el usuario cambia o quita el archivo
  // (ver handleCedulaIdentidadChange), sea a mano o autocompletado de nuevo.
  const [cedulaAutofilled, setCedulaAutofilled] = useState(false)
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
  const [resultadoSeleccionado, setResultadoSeleccionado] = useState(
    () => initialPersistedSearch?.resultadoSeleccionado ?? null
  )
  // A pedido: elegir un resultado en el buscador autocompleta directo (ver
  // handleSearchPreview, que setea los 2 juntos) — searchPreview controla el value del
  // Dropdown y de qué persona se trae el historial; resultadoSeleccionado es lo mismo
  // ya aplicado al form. Quedan siempre en sincro entre sí, pero se mantienen como 2
  // variables separadas porque cada una alimenta una parte distinta del componente.
  const [searchPreview, setSearchPreview] = useState(() => initialPersistedSearch?.searchPreview ?? null)
  // A pedido: qué oportunidad anterior (de la lista debajo de la tarjeta de
  // confirmación) está expandida mostrando su detalle — una a la vez, igual que el
  // mockup ("Ocultar detalle" en la que está abierta, "Ver detalle" en el resto).
  const [expandedOppId, setExpandedOppId] = useState(null)
  // A pedido: popup "Editar" para modificar los datos del Contacto ya elegido (ver
  // EditarContactoModal y handleSaveContacto más abajo) — solo aplica cuando la persona
  // vino de "Contacto" en el buscador (Lead/"crear de 0" siguen con el form editable de
  // siempre, ver el JSX del paso 1).
  const [editingContacto, setEditingContacto] = useState(false)
  const [savingContacto, setSavingContacto] = useState(false)
  const [savingContactoError, setSavingContactoError] = useState(null)
  // A pedido: el historial (panel derecho, ver JSX) se puede filtrar por estado tocando
  // el contador correspondiente — null es "Total" (sin filtrar). Tocar el mismo contador
  // ya activo lo desactiva (mismo botón sirve de filtro Y de contador, "funciona de las
  // dos formas"). Se resetea solo si cambia la persona elegida (ver el useEffect debajo
  // de previousOportunidades más abajo).
  const [historialFilter, setHistorialFilter] = useState(null)
  // A pedido: si la Oportunidad elegida en el buscador ya tenía Cédula Identidad
  // subida, se reusa ese mismo archivo acá (ver handleResultadoSeleccionado/
  // fetchFileColumnAsFile) — este estado solo prende un cartelito mientras se descarga,
  // no bloquea nada del resto del form.
  const [cedulaAutofillLoading, setCedulaAutofillLoading] = useState(false)
  // Primera decisión del paso 1: se "resuelve" cuando el usuario elige un resultado de la
  // búsqueda O aprieta "Saltear" — recién ahí se muestran Nombre/Apellido/CI en adelante
  // (antes no es una columna real de monday, solo gatea qué se muestra acá).
  const [busquedaResuelta, setBusquedaResuelta] = useState(
    () => Boolean(initialPersistedSearch?.resultadoSeleccionado)
  )
  // Sin resultado seleccionado (search salteada o vacía): si ya existe un Cliente y/o ya
  // hay Oportunidades con la Cédula que se está tipeando a mano, se avisa acá (ver el
  // useEffect debounced más abajo).
  const [duplicadoCheck, setDuplicadoCheck] = useState(null)
  // A pedido: el aviso se muestra como popup (no como cartelito inline) y hay que
  // cerrarlo a mano — se prende solo cuando llega un Cliente nuevo para avisar (ver el
  // useEffect debounced más abajo), no en cada render.
  const [showDuplicadoModal, setShowDuplicadoModal] = useState(false)
  // TextField (@vibe/core) mantiene un estado interno propio para el debounce que no se
  // sincroniza al toque cuando su `value` cambia desde AFUERA (no por su propio
  // onChange) — al limpiar Nombre/Apellido/CI/Teléfono de golpe con setForm (ver la
  // cruz de "Buscar Persona" más abajo) quedan un instante desincronizados con el
  // ícono ya recalculado, y esa combinación hace que el componente tire una excepción
  // (pantalla en blanco). Igual que con el Dropdown de ExistingRecordSearch, forzarlos
  // a remontar de cero (key) evita el problema.
  const [textFieldsResetKey, setTextFieldsResetKey] = useState(0)

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  // Al elegir un resultado (Contacto o Lead), se completan los datos personales y se abre
  // el resto del formulario. Las 2 fuentes ya traen Fecha Nacimiento/Teléfono/
  // Departamento/Localidad (ver searchContactos/searchOportunidades en mondayApi.js) —
  // Contacto solo tiene el nombre completo en un campo (sin columnas separadas de
  // Nombre/Apellido, ver splitNombreApellido); Lead (Oportunidad) sí las tiene, se usan
  // directo sin adivinar dónde corta el nombre.
  const handleResultadoSeleccionado = (resultado) => {
    setResultadoSeleccionado(resultado)
    if (!resultado) {
      // A pedido: la cruz de "Buscar Persona" no solo limpia el buscador, también
      // deshace el autocompletado que había disparado la selección anterior — si no,
      // quedaban datos de un resultado que ya no está elegido.
      setForm((prev) => ({
        ...prev,
        nombre: '',
        apellido: '',
        ci: '',
        fechaNacimiento: '',
        codigoPais: '+598',
        telefono: '',
        departamentoId: '',
        localidadId: '',
      }))
      setTextFieldsResetKey((k) => k + 1)
      return
    }
    setBusquedaResuelta(true)
    // Departamento/Localidad vienen como nombre (display_value de un board_relation, ver
    // mondayApi.js), hay que matchearlos contra la lista real para sacar el id que
    // necesita el Dropdown — mismo criterio que ya usa cotizarFields.js para los campos
    // "connected".
    const { codigoPais, telefono } = splitTelefono(resultado.telefono, resultado.telefonoCountryShortName)
    const departamentoMatch = (schema?.departamentos ?? []).find(
      (d) => d.name.toLowerCase() === (resultado.departamentoNombre || '').toLowerCase()
    )
    const localidadMatch = (schema?.localidades ?? []).find(
      (l) => l.name.toLowerCase() === (resultado.localidadNombre || '').toLowerCase()
    )
    const { nombre, apellido } =
      resultado.source === 'lead'
        ? { nombre: resultado.nombre, apellido: resultado.apellido }
        : splitNombreApellido(resultado.name)
    setForm((prev) => ({
      ...prev,
      nombre: nombre || prev.nombre,
      apellido: apellido || prev.apellido,
      ci: resultado.ci || prev.ci,
      fechaNacimiento: resultado.fechaNacimiento || prev.fechaNacimiento,
      codigoPais: codigoPais || prev.codigoPais,
      telefono: telefono || prev.telefono,
      departamentoId: departamentoMatch?.id ?? prev.departamentoId,
      localidadId: localidadMatch?.id ?? prev.localidadId,
    }))
    // A pedido: si esa persona ya tenía Cédula Identidad subida, se reusa acá — Lead
    // (Oportunidad) la guarda en file_mm5pc008, Contacto en file_mm4whbdc ("🪪 CI Frente",
    // tablero Contactos 18420863016). Fire-and-forget: no bloquea el resto del
    // autocompletado ni la confirmación si tarda o si no tenía archivo.
    const cedulaColumnId = resultado.source === 'lead' ? 'file_mm5pc008' : 'file_mm4whbdc'
    handleAutofillCedula(resultado.id, cedulaColumnId)
  }

  // Descarga la Cédula Identidad ya subida en una Oportunidad o Contacto anterior y la
  // deja como si el usuario la hubiera elegido a mano (ver handleCedulaIdentidadChange,
  // sin cambios — mismo File, misma lógica de subida diferida). Si no tenía archivo,
  // fetchFileColumnAsFile devuelve null y acá no se hace nada — no hay nada raro que
  // avisar, simplemente no había Cédula para reusar.
  const handleAutofillCedula = async (itemId, columnId) => {
    setCedulaAutofillLoading(true)
    try {
      const file = await fetchFileColumnAsFile(itemId, columnId)
      if (file) await handleCedulaIdentidadChange(file, true)
    } catch {
      // Silencioso — la descarga falló, el usuario sigue pudiendo subirla a mano como
      // si este intento nunca hubiera pasado.
    } finally {
      setCedulaAutofillLoading(false)
    }
  }

  // onChange de ExistingRecordSearch — a pedido, elegir un resultado autocompleta
  // directo (antes había un paso intermedio de "preview" con un botón "Usar datos de
  // este..." aparte, de punta a punta). La cruz (resultado null) deshace el
  // autocompletado igual, mismo circuito.
  const handleSearchPreview = (resultado) => {
    setSearchPreview(resultado)
    handleResultadoSeleccionado(resultado)
  }

  // A pedido: recuerda por PERSISTED_SEARCH_TTL_MS lo elegido en "Buscar Persona" —
  // incluso SIN confirmar todavía ("Usar datos de...") — para poder recuperarlo si el
  // usuario se va del formulario (ej. "Ir a esta oportunidad" desde el historial de abajo)
  // y vuelve antes de que expire (ver initialPersistedSearch más arriba). Si se deshace la
  // selección (cruz de "Buscar Persona"), se borra lo guardado — no tiene sentido
  // autocompletar algo que el usuario acaba de descartar a propósito.
  useEffect(() => {
    if (!searchPreview) {
      clearPersistedSearch()
      return
    }
    savePersistedSearch({
      searchPreview,
      resultadoSeleccionado,
      personales: resultadoSeleccionado
        ? {
            nombre: form.nombre,
            apellido: form.apellido,
            ci: form.ci,
            fechaNacimiento: form.fechaNacimiento,
            codigoPais: form.codigoPais,
            telefono: form.telefono,
            departamentoId: form.departamentoId,
            localidadId: form.localidadId,
          }
        : null,
    })
    // Solo cuando cambia la selección/confirmación — no en cada tecla de Nombre/Apellido/
    // CI/Teléfono editados a mano después (guardamos la foto de ese momento, no cada
    // cambio posterior; igual sigue vigente por el resto del TTL).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchPreview, resultadoSeleccionado])

  // "No lo encuentro" — abre el resto del formulario para completarlo a mano, sin ningún
  // resultado elegido (limpia Nombre/Apellido/CI por si venían de una búsqueda anterior).
  const handleSaltearBusqueda = () => {
    setResultadoSeleccionado(null)
    setSearchPreview(null)
    setBusquedaResuelta(true)
    setForm((prev) => ({ ...prev, nombre: '', apellido: '', ci: '' }))
  }

  // A pedido: desde la pantalla ya con los datos autocompletados, "Cambiar persona"
  // vuelve a la búsqueda — mismo circuito que la cruz de "Buscar Persona" (deshace el
  // autocompletado, ver handleResultadoSeleccionado(null)) más ocultar esta pantalla,
  // para poder elegir otra persona sin arrastrar nada de la anterior.
  const handleVolverABuscar = () => {
    handleResultadoSeleccionado(null)
    setSearchPreview(null)
    setBusquedaResuelta(false)
  }

  // Solo corre cuando NO hay un resultado elegido a propósito por "Buscar Persona" (search
  // salteada — "crear de 0" — y el usuario sigue completando Nombre/Apellido/CI a mano) —
  // avisa (sin bloquear) si esa persona ya está cargada como Contacto, por Cédula o por
  // Nombre + Apellido (lo que haya completo primero). CI exacto tiene prioridad porque es
  // inequívoco; Nombre+Apellido es una búsqueda más laxa (contains_text), así que solo se
  // dispara con los 2 campos completos y se queda con el primer resultado. Debounced para
  // no pegarle a la API en cada tecla. Por ahora solo avisa por Contacto (no por
  // Oportunidades/Lead ya cargadas con esa Cédula) — variante aparte, pendiente.
  useEffect(() => {
    if (!busquedaResuelta || resultadoSeleccionado) {
      setDuplicadoCheck(null)
      return undefined
    }
    const digits = stripCi(form.ci)
    const ciValida = digits && !ciError(form.ci)
    const nombreCompleto = form.nombre.trim() && form.apellido.trim() ? `${form.nombre} ${form.apellido}`.trim() : ''
    if (!ciValida && !nombreCompleto) {
      setDuplicadoCheck(null)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      const lookup = ciValida
        ? findContactoByCedula(digits)
        : searchContactos(nombreCompleto).then((r) => r[0] ?? null)
      lookup
        .then((contacto) => {
          if (cancelled) return
          setDuplicadoCheck({ contacto })
          if (contacto) setShowDuplicadoModal(true)
        })
        .catch(() => {
          if (!cancelled) setDuplicadoCheck(null)
        })
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [form.ci, form.nombre, form.apellido, busquedaResuelta, resultadoSeleccionado])

  // "Cancelar" — cierra el popup sin tocar nada, el usuario sigue completando el form a
  // mano como si el aviso no hubiera aparecido.
  const handleCancelDuplicadoModal = () => {
    setShowDuplicadoModal(false)
  }

  // "Confirmar" — aplica directo los datos de ese Contacto (mismo circuito que elegir un
  // resultado en "Buscar Persona", ver handleSearchPreview/handleResultadoSeleccionado)
  // en vez de solo avisar: pisa los datos personales con los reales del Contacto
  // encontrado (ya viene completo — CI/Fecha Nacimiento/Teléfono/Departamento/
  // Localidad, ver mapContactoItem). También se guarda en searchPreview para que el
  // buscador de arriba y el cartelito "Contacto seleccionado" de abajo lo reflejen.
  const handleConfirmDuplicadoContacto = () => {
    if (!duplicadoCheck?.contacto) return
    const resultado = { ...duplicadoCheck.contacto, source: 'contacto' }
    setShowDuplicadoModal(false)
    setSearchPreview(resultado)
    handleResultadoSeleccionado(resultado)
  }

  // "Guardar" del popup "Editar contacto" (ver EditarContactoModal) — a diferencia del
  // resto del form, esto escribe DIRECTO en el Contacto real (no espera al guardado
  // final de la Oportunidad), y recién si eso sale bien actualiza el form local para que
  // la descripción de solo lectura y el resto de la Oportunidad reflejen lo nuevo.
  const handleSaveContacto = async (values) => {
    if (!resultadoSeleccionado?.id) return
    setSavingContacto(true)
    setSavingContactoError(null)
    try {
      await setContactoColumnValues(resultadoSeleccionado.id, {
        [CONTACTO_FECHA_NACIMIENTO_COLUMN_ID]: values.fechaNacimiento,
        [CONTACTO_TELEFONO_COLUMN_ID]: {
          phone: `${values.codigoPais.replace('+', '')}${values.telefono.replace(/\D/g, '')}`,
          countryShortName: COUNTRY_SHORT_NAMES[values.codigoPais] ?? 'UY',
        },
        [CONTACTO_LOCALIDAD_COLUMN_ID]: { item_ids: [Number(values.localidadId)] },
      })
      setForm((prev) => ({ ...prev, ...values }))
      setEditingContacto(false)
    } catch (err) {
      setSavingContactoError(err.message)
    } finally {
      setSavingContacto(false)
    }
  }

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

  const tipoRiesgoOptions = (schema?.tipoRiesgo?.options ?? []).map((opt) => ({ value: opt, label: opt }))
  const selectedTipoRiesgo = tipoRiesgoOptions.find((o) => o.value === form.tipoRiesgo) ?? null
  const esAutomovil = form.tipoRiesgo === TIPO_RIESGO_AUTOMOVIL

  // A pedido: la lectura automática puede terminar en "Leidos" (éxito) sin haber podido
  // leer TODOS los campos igual (ej. Tipo vacío aunque Marca/Año sí salieron) — antes
  // se asumía que "Leidos" == todo completo salvo el Modelo, y esos campos vacíos
  // quedaban mostrados como texto muerto ("—") sin forma de completarlos. Ahora
  // "completo" se chequea de verdad (mismos campos que exige el fallback de Error) para
  // saber si corresponde mostrar el resumen compacto o los campos editables con lo que
  // falte resaltado en amarillo.
  const vehiculoLeidoCompleto = Boolean(
    form.marca && form.anio && form.modeloSeleccion && form.combustible && form.uso && form.tipo
  )

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

  // A pedido: "¿Es alguno de estos vehículos?" (ver vehiculosAnteriores/JSX) — pisa
  // Marca/Año/Combustible/Tipo/Uso con los de esa oportunidad anterior y deja el campo
  // en "No, ingresar manualmente" (mismos campos que ese camino, ahora precompletados,
  // el usuario los puede seguir editando antes de continuar). El Modelo en sí es texto
  // suelto en la oportunidad vieja (text_mm54fb7m), no necesariamente conectado a un
  // ítem real de Autodata — se busca ese ítem real por Año+Marca+nombre para dejarlo
  // bien conectado en la oportunidad nueva; si no se encuentra (nombre no matchea
  // exacto), se deja sin elegir y el usuario lo termina de elegir a mano abajo (con
  // Año/Marca ya filtrados, así que igual queda rápido).
  // A pedido: mientras busca, el campo Modelo queda no editable (ver
  // buscandoModeloAnterior/JSX) — evita que el usuario toque el dropdown y lo pisen de
  // golpe cuando termine la búsqueda (o al revés, que elija algo justo antes de que la
  // búsqueda lo pise a él).
  const [buscandoModeloAnterior, setBuscandoModeloAnterior] = useState(false)

  const handleSelectVehiculoAnterior = async (v) => {
    setForm((prev) => ({
      ...prev,
      poseeVehiculo: 'No',
      marca: v.marca,
      anio: v.anio,
      combustible: v.combustible,
      tipo: v.tipo,
      uso: v.uso || prev.uso,
      modeloSeleccion: null,
    }))
    setBuscandoModeloAnterior(true)
    try {
      const modelos = await fetchAutodataModelosByAnioMarca(v.anio, v.marca)
      const modeloText = (v.modelo || '').trim().toLowerCase()
      // A pedido: match exacto primero (más preciso cuando coincide tal cual), y si no
      // hay ninguno, contains por palabra — el nombre real en Autodata suele traer la
      // Marca pegada adelante (ej. "FORD  - Nuevo Fiesta 1.6 First dir, a/a 5p.") que
      // text_mm54fb7m no siempre repite tal cual, así que la igualdad estricta sola se
      // queda corta.
      const match =
        modelos.find((m) => m.name.trim().toLowerCase() === modeloText) ||
        modelos.find((m) => matchesSearchQuery(m.name, v.modelo))
      if (match) setForm((prev) => ({ ...prev, modeloSeleccion: match }))
    } catch {
      // Si falla la búsqueda, el Modelo queda para elegir a mano — no bloquea el resto
      // del autocompletado (Marca/Año/Combustible/Tipo/Uso ya se aplicaron igual).
    } finally {
      setBuscandoModeloAnterior(false)
    }
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
          form.departamentoId
      )
    }
    if (index === 1) {
      // Tipo de Riesgo vive en este paso ahora (ver JSX) — sin elegirlo no hay nada más
      // que validar.
      if (!form.tipoRiesgo) return false
      if (!esAutomovil) return true
      if (!form.poseeVehiculo) return false
      if (form.poseeVehiculo === 'Si') {
        // Cédula Identidad se pide junto con Carta Automóvil pero es opcional (no
        // bloquea), en los dos casos (Sí y No).
        if (!form.cartaAutomovil) return false
        // Camino feliz: la lectura automática terminó bien ("Leidos") — pero puede haber
        // terminado sin completar TODOS los campos (ver vehiculoLeidoCompleto), no solo
        // el Modelo. Mientras está "Leer"/"Leyendo"/"subido"/"subiendo" todavía no hay
        // Marca/Año confiables con qué filtrar Autodata, así que no se puede avanzar.
        if (lecturaEstado === 'Leidos') return vehiculoLeidoCompleto
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
  // A pedido: subir el archivo dispara la lectura automática directo (color_mm5rzrhk =
  // "Leer"), sin el paso intermedio de "Confirmar lectura" que había antes — el archivo
  // elegido ya es la confirmación.
  const handleCartaAutomovilChange = async (file) => {
    handleChange('cartaAutomovil', file)
    setCartaSubida(false)
    setEditingLeidos(false)
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
      await setSimpleColumnValue(itemId, 'color_mm5rzrhk', 'Leer')
      setLecturaEstado('Leer')
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

  // Cédula Identidad es opcional en los dos casos (Sí y No) — no bloquea el guardado.
  // Caso "Sí": se pide junto con Carta Automóvil desde el principio, pero el ítem recién
  // existe una vez que ESA se sube (ensureItemId), así que acá puede tocar cualquiera de
  // las 2 ramas de abajo según el orden en que se elijan los archivos. Caso "No": el
  // ítem todavía no existe (recién se crea en handleGuardar), así que acá solo se guarda
  // el File en memoria — handleGuardar la sube una vez que ya hay item_id.
  const handleCedulaIdentidadChange = async (file, isAutofill = false) => {
    handleChange('cedulaIdentidad', file)
    setCedulaAutofilled(isAutofill)
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

  // A pedido: toda Oportunidad nueva queda con el campo Contacto completo, nunca vacío
  // — si se eligió un Contacto existente en "Buscar Persona" se reusa ese id; si no (Lead
  // o "Crear desde cero"), se crea un Contacto nuevo con los mismos datos personales que
  // ya se cargaron acá, para no volver a tipearlos. Esto es además lo que hace que el
  // historial por relación (ver contactoOportunidades más arriba) se empiece a llenar
  // solo de acá en adelante.
  const ensureContactoId = async () => {
    if (resultadoSeleccionado?.source === 'contacto') return resultadoSeleccionado.id
    const created = await createContactoItem(`${form.nombre} ${form.apellido}`.trim(), {
      [CONTACTO_CI_COLUMN_ID]: stripCi(form.ci),
      [CONTACTO_TELEFONO_COLUMN_ID]: {
        phone: `${form.codigoPais.replace('+', '')}${form.telefono.replace(/\D/g, '')}`,
        countryShortName: COUNTRY_SHORT_NAMES[form.codigoPais] ?? 'UY',
      },
      [CONTACTO_FECHA_NACIMIENTO_COLUMN_ID]: form.fechaNacimiento,
      [CONTACTO_LOCALIDAD_COLUMN_ID]: { item_ids: [Number(form.localidadId)] },
    })
    return created.id
  }

  const handleGuardar = async () => {
    if (!canAdvance || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const itemId = await ensureItemId()
      await setMultipleColumnValues(itemId, buildBaseColumnValues())

      const contactoId = await ensureContactoId()
      await setConnectedColumnValue(itemId, OPORTUNIDAD_CONTACTO_COLUMN_ID, [Number(contactoId)])

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

      clearPersistedSearch()
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

  // Mismo componente Stepper.jsx que usa OpportunityDetail (círculos numerados + línea
  // de progreso), en vez de las pills propias que tenía este form antes — a pedido, para
  // que la estética de "pasos" sea consistente en toda la app. A pedido: el paso 2 ahora
  // se ve siempre (antes se ocultaba hasta completar el paso 1) — sigue sin ser
  // clickeable hasta entonces (`clickable` de abajo no cambió), solo deja de estar
  // escondido para que el usuario sepa de entrada que hay un paso más. A pedido: el
  // nombre del paso 2 ya no cambia según el Tipo de Riesgo elegido (antes mostraba ej.
  // "🚗 Automóvil") — queda fijo en "Datos de oportunidad" (STEPS[1].label), sin importar
  // qué se elija.
  const stepperSteps = STEPS.map((s, index) => ({
    key: s.key,
    label: s.label,
    status: index < stepIndex ? 'done' : index === stepIndex ? 'active' : 'pending',
    clickable: index < stepIndex || (index > stepIndex && isStepValid(index - 1)),
  }))

  // El resultado en preview ya está confirmado (autocompletado real aplicado) cuando
  // coincide con resultadoSeleccionado — en la práctica siempre es así apenas se elige
  // algo (ver handleSearchPreview), gatea si se muestra el cartelito "seleccionado: ...".
  const previewConfirmed = Boolean(
    resultadoSeleccionado &&
      searchPreview &&
      resultadoSeleccionado.source === searchPreview.source &&
      resultadoSeleccionado.id === searchPreview.id
  )

  // A pedido: cuando la persona elegida es un Contacto, el historial se lee de la
  // relación real Contacto→Oportunidades (más precisa que un escaneo por CI, ver
  // fetchContactoOportunidades en mondayApi.js) — pero esa relación recién se empieza a
  // completar de acá en adelante (ver handleGuardar más abajo), así que las Oportunidades
  // viejas de un Contacto que todavía no estaban vinculadas no aparecerían solas ahí.
  const [contactoOportunidades, setContactoOportunidades] = useState([])
  useEffect(() => {
    if (!searchPreview || searchPreview.source !== 'contacto') {
      setContactoOportunidades([])
      return undefined
    }
    let cancelled = false
    fetchContactoOportunidades(searchPreview.id)
      .then((items) => {
        if (cancelled) return
        setContactoOportunidades(mapOpportunities(items, { estadoOportunidad: schema?.estadoOportunidad?.colorsByLabel ?? {} }))
      })
      .catch(() => {
        if (!cancelled) setContactoOportunidades([])
      })
    return () => {
      cancelled = true
    }
  }, [searchPreview?.id, searchPreview?.source, schema])

  // A pedido: cuando la persona elegida es un Lead (una Oportunidad vieja, sin Contacto
  // formal todavía), su propio vehículo entra SIEMPRE como candidato en "¿Es alguno de
  // estos vehículos?" (ver vehiculosAnteriores más abajo) — se trae directo por id en vez
  // de depender de que la Cédula matchee contra `opportunities` (ver
  // previousOportunidadesPorCi, más abajo): así aparece igual aunque esa Oportunidad no
  // tuviera la Cédula cargada, o el buscador haya deduplicado el Lead con otra Oportunidad
  // de la misma persona (ver el criterio de "más completa" en searchOportunidades,
  // mondayApi.js). Mismas columnas que ya lee el polling de lectura automática más arriba.
  const [leadVehiculo, setLeadVehiculo] = useState(null)
  useEffect(() => {
    if (!searchPreview || searchPreview.source !== 'lead') {
      setLeadVehiculo(null)
      return undefined
    }
    let cancelled = false
    fetchOpportunityDetail(searchPreview.id)
      .then((data) => {
        if (cancelled || !data) return
        const textOf = (id) => data.column_values.find((cv) => cv.id === id)?.text?.trim() || ''
        const marca = textOf('dropdown_mm51ykrd')
        const anio = textOf('dropdown_mm51mdmq')
        const modelo = textOf('text_mm54fb7m')
        if (!marca || !anio || !modelo) {
          setLeadVehiculo(null)
          return
        }
        setLeadVehiculo({
          id: searchPreview.id,
          marca,
          anio,
          modelo,
          combustible: textOf('dropdown_mm52jp01'),
          tipo: textOf('dropdown_mm5jqdk'),
          uso: textOf('color_mm52ey1d'),
        })
      })
      .catch(() => {
        if (!cancelled) setLeadVehiculo(null)
      })
    return () => {
      cancelled = true
    }
  }, [searchPreview?.id, searchPreview?.source])

  // A pedido: mostrar las oportunidades anteriores de la persona elegida en el
  // buscador — reusa `opportunities` (App.jsx ya lo trae completo y mapeado, ver
  // opportunityMapper.js, mismos datos que la tabla principal) en vez de armar una
  // consulta nueva a monday. Se matchea por CI (mismo criterio que
  // findContactoByCedula, ver mondayApi.js). Se combina con contactoOportunidades (la
  // relación real, ver arriba) y se deduplica por id — nunca se pierde historial
  // existente mientras la relación todavía no cubre todo, y con el tiempo la relación
  // real termina siendo la fuente completa por sí sola.
  const previousOportunidadesPorCi =
    searchPreview?.ci && opportunities
      ? opportunities.filter((o) => o.ci && stripCi(o.ci) === stripCi(searchPreview.ci))
      : []
  const previousOportunidades = Array.from(
    new Map([...contactoOportunidades, ...previousOportunidadesPorCi].map((o) => [o.id, o])).values()
  )

  // Contadores por estado para el filtro del panel de historial (ver JSX) — un chip por
  // cada estado que realmente aparece entre las oportunidades de esta persona, en el
  // orden en que aparece la primera vez (no fijo ni alfabético, así se adapta solo si el
  // tablero agrega o saca estados).
  const historialEstados = []
  previousOportunidades.forEach((o) => {
    if (!historialEstados.some((e) => e.label === o.estadoLabel)) {
      historialEstados.push({ label: o.estadoLabel, color: o.estadoColor, count: 0 })
    }
  })
  historialEstados.forEach((e) => {
    e.count = previousOportunidades.filter((o) => o.estadoLabel === e.label).length
  })

  const historialFiltradas = historialFilter
    ? previousOportunidades.filter((o) => o.estadoLabel === historialFilter)
    : previousOportunidades

  const hasHistorial = Boolean(searchPreview && previousOportunidades.length > 0)

  // A pedido: en el paso 2 (Datos del riesgo), si la persona elegida ya tiene vehículos
  // cotizados antes, se pueden elegir de ahí en vez de tipear todo de nuevo — reusa
  // `previousOportunidades` (ya cargado para el historial, ver arriba), deduplicado por
  // Marca+Modelo+Año (una misma persona puede tener varias oportunidades del mismo auto
  // por recotizaciones/otra aseguradora). Solo entran los que sí tienen los 3 datos
  // completos — no tiene sentido ofrecer un vehículo a medio cargar. `leadVehiculo` (el
  // propio vehículo del Lead elegido, ver más arriba) va AL FINAL a propósito: si tiene
  // la misma clave que uno ya traído por CI, gana él (viene de una lectura directa y
  // siempre completa), y si no matcheaba por CI, se suma como candidato nuevo.
  const vehiculosAnteriores = Array.from(
    new Map(
      [...previousOportunidades.filter((o) => o.marca && o.modelo && o.anio), ...(leadVehiculo ? [leadVehiculo] : [])].map(
        (o) => [`${o.marca.toLowerCase()}|${o.modelo.toLowerCase()}|${o.anio}`, o]
      )
    ).values()
  )

  // Si cambia la persona elegida (o se deselecciona), el filtro de historial vuelve a
  // "Total" — no tiene sentido arrastrar un filtro de estado de la persona anterior.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setHistorialFilter(null), [searchPreview?.id])

  return (
    <div className="crear-op">
      <div className={hasHistorial ? 'crear-op__card crear-op__card--wide' : 'crear-op__card'}>
        <div className="crear-op__header">
          {/* Columna vacía a la izquierda solo para que el grid de 3 columnas centre el
              Stepper de verdad (mismo criterio que .opp-detail__breadcrumb). */}
          <div />
          <Stepper
            steps={stepperSteps}
            activeKey={STEPS[stepIndex].key}
            onSelect={(key) => handleStepClick(STEPS.findIndex((s) => s.key === key))}
          />
          <div className="crear-op__header-actions">
            <IconButton icon={MdSearch} onClick={onVerOportunidades} aria-label="Buscar Oportunidad" />
            <IconButton icon={MdHome} onClick={onHome} aria-label="Inicio" />
          </div>
        </div>

        {stepIndex === 0 && (
          <div className="crear-op__fields">
            {/* A pedido: la búsqueda y los datos ya autocompletados viven en 2
                "pantallas" separadas (nunca las 2 juntas) — antes el campo "Buscar
                Persona" se quedaba visible arriba con el resultado ya elegido mientras
                abajo aparecía todo el resto del formulario, quedaba redundante (el
                nombre ya se ve repetido en Datos personales) y competía por atención.
                Elegir un resultado (o "Crear Persona desde Cero") anima la transición de
                una pantalla a la otra (key distinto por pantalla, ver el CSS) — "Cambiar
                persona" (ver handleVolverABuscar) siempre permite volver atrás y elegir
                otra cosa, sin perder nada: solo deshace el autocompletado, mismo
                circuito que la cruz de "Buscar Persona" de antes. */}
            {!busquedaResuelta ? (
              <div className="crear-op__search-screen" key="search-screen">
                <label className="crear-op__field crear-op__field--full">
                  <span>Buscar Persona</span>
                  <ExistingRecordSearch value={searchPreview} onChange={handleSearchPreview} />
                  <Button kind="tertiary" className="crear-op__skip-btn" onClick={handleSaltearBusqueda}>
                    Crear Persona desde Cero <MdArrowForward />
                  </Button>
                </label>
              </div>
            ) : (
              <div className="crear-op__data-screen" key="data-screen">
                <Button kind="tertiary" className="crear-op__volver-btn" onClick={handleVolverABuscar}>
                  <MdArrowBack /> Cambiar persona
                </Button>

                {previewConfirmed && (
                  <span className="crear-op__autofill">
                    {/* A pedido: Contacto y Lead ya traen los mismos datos personales (ver
                        handleResultadoSeleccionado), así que el mensaje deja de depender
                        de la fuente. */}
                    {resultadoSeleccionado.source === 'contacto' ? 'Contacto' : 'Lead'} seleccionado:{' '}
                    {resultadoSeleccionado.name} — se completaron
                    Nombre/Apellido/CI/Fecha Nacimiento/Teléfono/Departamento/Localidad abajo, revisalos antes de
                    continuar.
                  </span>
                )}

                {/* A pedido: estética tipo mockup para los popups de confirmación — ícono en
                    círculo celeste, título y descripción en el cuerpo, "Cancelar" +
                    acción primaria abajo a la derecha. Solo corre si no hay un resultado ya
                    elegido a propósito en "Buscar Persona" (ver el useEffect debounced,
                    solo activo en esta pantalla porque busquedaResuelta ya es true acá).
                    "Cancelar" cierra sin tocar nada; "Confirmar" aplica directo los datos de
                    ese Contacto (ver handleConfirmDuplicadoContacto). */}
                {!resultadoSeleccionado && showDuplicadoModal && duplicadoCheck?.contacto && (
                  <AlertModal
                    id="duplicado-cedula-modal"
                    type="info"
                    title="Cédula de Identidad existente en Contacto"
                    description="Usaremos los datos de este contacto para completar los datos personales."
                    onClose={handleCancelDuplicadoModal}
                    secondaryButton={{ text: 'Cancelar', onClick: handleCancelDuplicadoModal }}
                    primaryButton={{ text: 'Confirmar', onClick: handleConfirmDuplicadoContacto }}
                  />
                )}

                {editingContacto && (
                  <EditarContactoModal
                    form={form}
                    departamentoOptions={departamentoOptions}
                    localidades={localidades}
                    saving={savingContacto}
                    error={savingContactoError}
                    onClose={() => {
                      setEditingContacto(false)
                      setSavingContactoError(null)
                    }}
                    onSave={handleSaveContacto}
                  />
                )}

              <div className={hasHistorial ? 'crear-op__step1-layout' : 'crear-op__step1-layout crear-op__step1-layout--solo'}>
              <div className="crear-op__step1-main">
                {/* A pedido: estética tipo mockup — campos agrupados en secciones con
                    encabezado propio (Datos personales/Contacto/Ubicación/Documentación/
                    Datos de la oportunidad) en vez de una sola grilla plana. */}
                {resultadoSeleccionado?.source === 'contacto' ? (
                  // A pedido: para un Contacto ya existente, sus datos personales se
                  // muestran como descripción de solo lectura (no como formulario) — se
                  // confirmó que es la persona correcta con la tarjeta de arriba y el
                  // historial de al lado, no hace falta que se vea editable como si se
                  // estuviera cargando de cero. "Editar" abre un popup aparte que
                  // modifica el Contacto real (ver EditarContactoModal más abajo), no
                  // solo el form de esta Oportunidad.
                  <div className="crear-op__section">
                    <div className="crear-op__contacto-resumen-head">
                      <h3 className="crear-op__section-title">Datos personales</h3>
                      <Button kind="tertiary" onClick={() => setEditingContacto(true)}>
                        <MdEdit /> Editar
                      </Button>
                    </div>
                    <div className="crear-op__contacto-resumen-grid">
                      <div className="crear-op__contacto-resumen-field">
                        <span className="crear-op__contacto-resumen-label">Nombre</span>
                        <span className="crear-op__contacto-resumen-value">
                          {`${form.nombre} ${form.apellido}`.trim() || '—'}
                        </span>
                      </div>
                      <div className="crear-op__contacto-resumen-field">
                        <span className="crear-op__contacto-resumen-label">CI</span>
                        <span className="crear-op__contacto-resumen-value">{form.ci || '—'}</span>
                      </div>
                      <div className="crear-op__contacto-resumen-field">
                        <span className="crear-op__contacto-resumen-label">Fecha de nacimiento</span>
                        <span className="crear-op__contacto-resumen-value">{form.fechaNacimiento || '—'}</span>
                      </div>
                      <div className="crear-op__contacto-resumen-field">
                        <span className="crear-op__contacto-resumen-label">Teléfono</span>
                        <span className="crear-op__contacto-resumen-value">
                          {form.telefono ? `${form.codigoPais} ${form.telefono}` : '—'}
                        </span>
                      </div>
                      <div className="crear-op__contacto-resumen-field crear-op__contacto-resumen-field--full">
                        <span className="crear-op__contacto-resumen-label">Ubicación</span>
                        <span className="crear-op__contacto-resumen-value">
                          {[selectedDepartamento?.label, selectedLocalidad?.label].filter(Boolean).join(' — ') || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="crear-op__section">
                      <h3 className="crear-op__section-title">Datos personales</h3>
                      <div className="crear-op__fields--grid">
                        {/* TextField nativo de @vibe/core en vez de <label> + ClearableInput a
                            mano — ya trae label (title/required), botón de limpiar (icon/
                            onIconClick/clearOnIconClick) y el borde verde/rojo (validation) de
                            fábrica. `icon` SIEMPRE en MdClear, nunca condicionado a si hay
                            valor (`form.x ? MdClear : undefined`) — internamente el
                            componente ya oculta el ícono solo cuando el campo está vacío, así
                            que ese condicional era redundante Y además el causante de una
                            excepción real: si el valor se limpia desde AFUERA (no tipeando,
                            ver la cruz de "Buscar Persona" más arriba), hay un instante en
                            que su estado interno de debounce todavía no bajó a vacío mientras
                            `icon` ya pasó a `undefined` — esa combinación (valor todavía
                            verdadero + ícono ya indefinido) hace que el componente intente
                            leer `icon.length` y tira "Cannot read properties of undefined"
                            (pantalla en blanco). Pasando siempre un ícono definido, esa
                            combinación imposible de lograr no existe más. */}
                        <TextField
                          key={`nombre-${textFieldsResetKey}`}
                          wrapperClassName="crear-op__field"
                          title="Nombre"
                          required
                          placeholder="Ingresa el nombre"
                          value={form.nombre}
                          onChange={(value) => handleChange('nombre', value)}
                          icon={MdClear}
                          onIconClick={() => handleChange('nombre', '')}
                          validation={form.nombre ? { status: 'success' } : undefined}
                        />
                        <TextField
                          key={`apellido-${textFieldsResetKey}`}
                          wrapperClassName="crear-op__field"
                          title="Apellido"
                          required
                          placeholder="Ingresa el apellido"
                          value={form.apellido}
                          onChange={(value) => handleChange('apellido', value)}
                          icon={MdClear}
                          onIconClick={() => handleChange('apellido', '')}
                          validation={form.apellido ? { status: 'success' } : undefined}
                        />
                        <TextField
                          key={`ci-${textFieldsResetKey}`}
                          wrapperClassName="crear-op__field"
                          title="CI"
                          required
                          placeholder="Ej: 4.123.456-7"
                          value={form.ci}
                          onChange={(value) => handleChange('ci', value)}
                          icon={MdClear}
                          onIconClick={() => handleChange('ci', '')}
                          validation={
                            ciError(form.ci)
                              ? { status: 'error', text: ciError(form.ci) }
                              : form.ci
                                ? { status: 'success' }
                                : undefined
                          }
                        />
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
                      </div>
                    </div>

                    <div className="crear-op__section">
                      <h3 className="crear-op__section-title">Contacto</h3>
                      <div className="crear-op__fields--grid">
                        <label className="crear-op__field crear-op__field--full">
                          <span>Teléfono *</span>
                          <div className="crear-op__phone">
                            <div className="crear-op__phone-code">
                              <RequiredDropdown
                                options={CODIGO_PAIS_OPTIONS}
                                value={CODIGO_PAIS_OPTIONS.find((o) => o.value === form.codigoPais) ?? null}
                                onChange={(option) => handleChange('codigoPais', option?.value ?? '')}
                              />
                            </div>
                            {/* Sin title acá — el label de arriba ("Teléfono *") ya cubre a los 2
                                campos (código de país + número) juntos. */}
                            <TextField
                              key={`telefono-${textFieldsResetKey}`}
                              wrapperClassName="crear-op__phone-number"
                              placeholder="Ej: 099 123 456"
                              value={form.telefono}
                              onChange={(value) => handleChange('telefono', value)}
                              icon={MdClear}
                              onIconClick={() => handleChange('telefono', '')}
                              validation={
                                telefonoError(form.telefono, form.codigoPais)
                                  ? { status: 'error' }
                                  : form.telefono
                                    ? { status: 'success' }
                                    : undefined
                              }
                            />
                          </div>
                          {telefonoError(form.telefono, form.codigoPais) && (
                            <span className="crear-op__field-error">
                              {telefonoError(form.telefono, form.codigoPais)}
                            </span>
                          )}
                        </label>
                      </div>
                    </div>

                    <div className="crear-op__section">
                      <h3 className="crear-op__section-title">Ubicación</h3>
                      <div className="crear-op__fields--grid">
                        <label className="crear-op__field">
                          <span>Departamento *</span>
                          <RequiredDropdown
                            options={departamentoOptions}
                            value={selectedDepartamento}
                            placeholder="Escribe para buscar resultados"
                            searchable
                            onChange={(option) => {
                              // Al cambiar el departamento, se limpia la Localidad elegida —
                              // puede ya no pertenecer al departamento nuevo (el dropdown de
                              // acá abajo se filtra por esto mismo).
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
                      </div>
                    </div>
                  </>
                )}

                <div className="crear-op__section">
                  <h3 className="crear-op__section-title">Documentación</h3>
                  <div className="crear-op__fields--grid">
                    {/* A pedido: Cédula Identidad se pide acá, en el paso 1, en vez de
                        repetida en las 2 ramas del paso 2 (Posee Vehículo Sí/No) —
                        opcional, no bloquea avanzar. El archivo queda en memoria hasta
                        que exista el ítem (se crea recién en el paso 2 o al guardar);
                        handleGuardar tiene el fallback que lo sube si todavía no se
                        subió para entonces. */}
                    <FileUploadField
                      label="Cédula Identidad"
                      required={false}
                      file={form.cedulaIdentidad}
                      onUpload={handleCedulaIdentidadChange}
                      onDelete={() => handleCedulaIdentidadChange(null)}
                      fullWidth
                      highlighted={cedulaAutofilled}
                    />
                    {cedulaAutofillLoading && (
                      <p className="crear-op__autofill">
                        <Loader size={13} className="crear-op__lectura-spinner" /> Buscando Cédula Identidad de una
                        oportunidad anterior...
                      </p>
                    )}
                    {cedulaSubiendo && <p className="crear-op__autofill">Subiendo Cédula Identidad...</p>}
                  </div>
                </div>

              </div>

              {/* A pedido: panel de historial a la derecha del formulario (antes iba
                  arriba, adentro de "Buscar Persona") — contador por estado que también
                  funciona de filtro (tocar el mismo estado ya activo lo desactiva, ver
                  handleHistorialFilterClick) y, debajo, la lista ya filtrada con el mismo
                  "Ver detalle"/resumen breve de siempre por oportunidad. Solo se muestra
                  si la persona elegida tiene oportunidades anteriores. */}
              {hasHistorial && (
                <div className="crear-op__historial">
                  <span className="crear-op__historial-title">
                    <MdEventNote /> Oportunidades anteriores de{' '}
                    {searchPreview.source === 'contacto' ? 'este contacto' : 'esta persona'}
                  </span>

                  <div className="crear-op__historial-counters">
                    <button
                      type="button"
                      className={
                        historialFilter === null
                          ? 'crear-op__historial-counter crear-op__historial-counter--active'
                          : 'crear-op__historial-counter'
                      }
                      onClick={() => setHistorialFilter(null)}
                    >
                      Total <strong>{previousOportunidades.length}</strong>
                    </button>
                    {historialEstados.map((e) => (
                      <button
                        type="button"
                        key={e.label}
                        className={
                          historialFilter === e.label
                            ? 'crear-op__historial-counter crear-op__historial-counter--active'
                            : 'crear-op__historial-counter'
                        }
                        style={{ '--counter-color': e.color.bg, '--counter-bg': `${e.color.bg}1a` }}
                        onClick={() => setHistorialFilter((prev) => (prev === e.label ? null : e.label))}
                      >
                        {e.label} <strong>{e.count}</strong>
                      </button>
                    ))}
                  </div>

                  {historialFiltradas.map((o) => {
                    const isExpanded = expandedOppId === o.id
                    return (
                      <div className="crear-op__historial-item" key={o.id}>
                        <div className="crear-op__historial-row">
                          {/* A pedido: el número de oportunidad (siempre presente, lo
                              asigna la app — ver oppNumber en opportunityMapper.js) en
                              vez de bienLinea1 — este último cae a item.name (el título
                              del ítem en monday) cuando todavía no hay Marca/Modelo
                              cargados (oportunidades "Nueva"), y ese fallback puede
                              terminar mostrando el propio nombre del cliente acá,
                              rompiendo la fila. */}
                          <span className="crear-op__historial-desc">{o.oppNumber}</span>
                          <StatusBadge label={o.estadoLabel} color={o.estadoColor} />
                          <button
                            type="button"
                            className="crear-op__historial-toggle"
                            onClick={() => setExpandedOppId(isExpanded ? null : o.id)}
                          >
                            {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                            {isExpanded ? <MdKeyboardArrowUp /> : <MdKeyboardArrowDown />}
                          </button>
                        </div>
                        {/* A pedido: solo fecha de cotización + datos del bien asegurado +
                            "Ir a esta oportunidad" — el número/estado ya se ven en la
                            fila de arriba, no hace falta repetirlos acá adentro. */}
                        {isExpanded && (
                          <div className="crear-op__historial-detail">
                            <div className="crear-op__historial-detail-grid">
                              <div className="crear-op__historial-detail-box">
                                <span className="crear-op__historial-detail-label">Fecha de cotización</span>
                                <strong>{o.ultimaCotizacion}</strong>
                              </div>
                              <div className="crear-op__historial-detail-box">
                                <span className="crear-op__historial-detail-label">Bien asegurado</span>
                                <strong>{o.bienLinea1}</strong>
                                {o.bienLinea2 && <span>{o.bienLinea2}</span>}
                              </div>
                            </div>
                            <Button
                              kind="primary"
                              className="crear-op__historial-detail-btn"
                              onClick={() => onOpenOportunidad?.(o.id)}
                            >
                              Ir a esta oportunidad <MdArrowForward />
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
              </div>
            )}
          </div>
        )}

        {stepIndex === 1 && (
          <div className="crear-op__fields">
            {/* A pedido: Tipo de Riesgo se movió acá (antes vivía en el paso 1, sección
                "Datos de la oportunidad") — tiene más sentido en el paso que literalmente
                se llama así, y de paso el resto de este paso ya depende de este mismo
                campo (ver esAutomovil más abajo). Llega completado con el default de
                Vehículo (ver el useEffect que arranca con TIPO_RIESGO_AUTOMOVIL), pero
                se puede cambiar libremente acá. */}
            <div className="crear-op__section">
              <h3 className="crear-op__section-title">Datos de oportunidad</h3>
              <div className="crear-op__fields--grid">
                <label className="crear-op__field crear-op__field--full">
                  <span>Tipo de Riesgo *</span>
                  <RequiredDropdown
                    options={tipoRiesgoOptions}
                    value={selectedTipoRiesgo}
                    placeholder="Selecciona una opción"
                    onChange={(option) => handleChange('tipoRiesgo', option?.value ?? '')}
                  />
                </label>
              </div>
            </div>

            {/* A pedido: si la persona elegida ya tiene vehículos cotizados antes (ver
                vehiculosAnteriores más arriba), se pueden elegir acá en vez de tipear
                Marca/Modelo/Año/Combustible/Tipo de nuevo — "ninguno de estos" es
                simplemente no tocar esta sección y seguir con el flujo de siempre
                (Sí/No de abajo). */}
            {esAutomovil && vehiculosAnteriores.length > 0 && (
              <div className="crear-op__section">
                {/* A pedido: con un solo candidato (ej. el vehículo propio de un Lead
                    recién elegido) el encabezado ofrece esa opción de forma directa en
                    vez del genérico "¿es alguno de estos?" pensado para elegir entre
                    varios — mismas tarjetas clickeables debajo en los dos casos. */}
                <h3 className="crear-op__section-title">
                  {vehiculosAnteriores.length === 1
                    ? 'Encontramos un vehículo cargado antes'
                    : '¿Es alguno de estos vehículos?'}
                </h3>
                <div className="crear-op__vehiculos-anteriores">
                  {vehiculosAnteriores.map((v) => {
                    const isActive =
                      form.marca === v.marca &&
                      form.anio === v.anio &&
                      (form.modeloSeleccion?.name || '').toLowerCase() === (v.modelo || '').toLowerCase()
                    return (
                      <button
                        type="button"
                        key={v.id}
                        className={
                          isActive
                            ? 'crear-op__vehiculo-anterior crear-op__vehiculo-anterior--active'
                            : 'crear-op__vehiculo-anterior'
                        }
                        onClick={() => handleSelectVehiculoAnterior(v)}
                      >
                        <span className="crear-op__vehiculo-anterior-title">
                          {v.marca} {v.modelo}
                        </span>
                        {/* A pedido: Marca/Modelo (arriba) + Año/Combustible/Tipo, los 5
                            datos del vehículo de un vistazo — antes faltaba Tipo acá. */}
                        <span className="crear-op__vehiculo-anterior-meta">
                          {[v.anio, v.combustible, v.tipo].filter(Boolean).join(' · ')}
                        </span>
                        {vehiculosAnteriores.length === 1 && (
                          <span className="crear-op__vehiculo-anterior-cta">Usar este vehículo</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {esAutomovil && (
              <>
                {/* A pedido, estética tipo mockup: título + subtítulo propios del paso
                    (antes no tenía), y el toggle de 2 botones en vez del dropdown
                    "Si"/"No" — mismos valores reales que color_mm51n4j, solo cambia el
                    control. */}
                <div>
                  <h2 className="crear-op__risk-title">Detalles del riesgo — {form.tipoRiesgo}</h2>
                  <p className="crear-op__risk-subtitle">¿Tenés la Cédula o Carta del vehículo a cotizar?</p>
                </div>
                <div className="crear-op__toggle">
                  <button
                    type="button"
                    className={
                      form.poseeVehiculo === 'Si'
                        ? 'crear-op__toggle-btn crear-op__toggle-btn--active'
                        : 'crear-op__toggle-btn'
                    }
                    onClick={() => handleChange('poseeVehiculo', 'Si')}
                  >
                    Sí, tengo el documento
                  </button>
                  <button
                    type="button"
                    className={
                      form.poseeVehiculo === 'No'
                        ? 'crear-op__toggle-btn crear-op__toggle-btn--active'
                        : 'crear-op__toggle-btn'
                    }
                    onClick={() => handleChange('poseeVehiculo', 'No')}
                  >
                    No, ingresar manualmente
                  </button>
                </div>
              </>
            )}

            {!esAutomovil && (
              <p className="crear-op__empty">
                Todavía no hay campos definidos para este tipo de riesgo.
              </p>
            )}

            {esAutomovil && form.poseeVehiculo === 'Si' && (
              <>
                {/* Cédula Identidad se movió al paso 1 (a pedido) — acá solo queda Carta
                    Automóvil, la que dispara la lectura automática. Caja grande
                    centrada (prominent) SOLO mientras no hay archivo — apenas se elige
                    uno, se reemplaza por una fila compacta (mismo lenguaje que el resto
                    de la app: Cédula Identidad, Póliza, etc.) que se queda FIJA ahí pase
                    lo que pase con la lectura (subiendo/analizando/leído/incompleto/
                    error, ver más abajo). A pedido: antes "eliminar" era un link de
                    texto suelto, distinto y en un lugar distinto en cada uno de esos 4
                    estados — ahora es un único botón, siempre pegado al archivo al que
                    se refiere (más fácil de encontrar, ni hay que ir a buscarlo según en
                    qué estado esté la lectura). uploading refleja la subida real del
                    archivo (lecturaEstado "subiendo") con el mismo spinner/leyenda que
                    ya usa este componente en el resto de la app. */}
                {!form.cartaAutomovil ? (
                  <FileUploadField
                    label="Cédula/Carta Automóvil"
                    file={form.cartaAutomovil}
                    onUpload={handleCartaAutomovilChange}
                    prominent
                    helperText="Subí una foto o PDF de la Cédula o Carta Automóvil del vehículo para autocompletar sus datos."
                    buttonLabel="Adjuntar Cédula/Carta Automóvil"
                  />
                ) : (
                  <FileUploadField
                    label="Cédula/Carta Automóvil"
                    file={form.cartaAutomovil}
                    uploading={lecturaEstado === 'subiendo'}
                    onDelete={() => handleCartaAutomovilChange(null)}
                    deleteLabel="Eliminar archivo y reintentar"
                    showReplaceButton={false}
                  />
                )}

                {(lecturaEstado === 'Leer' || lecturaEstado === 'Leyendo') && (
                  <div className="crear-op__lectura-analyzing">
                    <Loader size={20} className="crear-op__lectura-analyzing-spinner" />
                    <div>
                      <strong>Analizando cédula del vehículo...</strong>
                      <span>
                        {lecturaEstado === 'Leer' && 'En cola para leer el documento...'}
                        {lecturaEstado === 'Leyendo' &&
                          'Extrayendo Marca, Modelo y Año con Inteligencia Artificial.'}
                      </span>
                    </div>
                  </div>
                )}

                {/* A pedido: si la lectura falla, en vez de trabar el formulario se avisa
                    en amarillo (mismo color que los campos resaltados de abajo, ver
                    VehiculoManualFields#highlightEmpty) y se completa/corrige lo que
                    haga falta a mano — mismos campos que el caso "No". Eliminar el
                    archivo y probar con otro es la fila de arriba (ver más arriba). */}
                {lecturaEstado === 'Error' && (
                  <>
                    <AttentionBox type="warning">
                      No pudimos leer todos los datos del documento. Por favor, completá
                      manualmente los campos resaltados en amarillo.
                    </AttentionBox>
                    <ErrorDetailBox detail={lecturaError} title="Detalle del error:" className="crear-op__error-detail-spacing" />
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
                      highlightEmpty
                    />
                  </>
                )}

                {/* A pedido, estética tipo mockup: tras leer TODO (Marca/Año/Tipo/
                    Combustible/Uso/Modelo, ver vehiculoLeidoCompleto), un resumen
                    compacto en vez de los campos sueltos — "Editar datos" lo cambia por
                    VehiculoManualFields (mismos campos, ahora editables). */}
                {lecturaEstado === 'Leidos' && vehiculoLeidoCompleto && !editingLeidos && (
                  <div className="crear-op__lectura-summary">
                    <div className="crear-op__lectura-summary-info">
                      <strong>
                        {form.marca} {form.modeloSeleccion.name} ({form.anio})
                      </strong>
                      <span>
                        {[form.combustible, form.tipo, form.uso && `Uso ${form.uso}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="crear-op__lectura-summary-edit"
                      onClick={() => setEditingLeidos(true)}
                    >
                      Editar datos <MdEdit />
                    </button>
                  </div>
                )}

                {/* A pedido: si la lectura ("Leidos") no completó TODOS los campos —
                    puede pasar aunque haya terminado "bien", no solo en "Error" — se
                    muestran los mismos campos editables con lo que falte resaltado en
                    amarillo, en vez de texto muerto ("—") sin forma de completarlo.
                    También se usa para "Editar datos" del resumen de arriba. Eliminar el
                    archivo y probar con otro es la fila de arriba (ver más arriba). */}
                {lecturaEstado === 'Leidos' && (!vehiculoLeidoCompleto || editingLeidos) && (
                  <>
                    {!vehiculoLeidoCompleto && (
                      <p className="crear-op__lectura-incompleto-hint">
                        No pudimos leer todos los datos automáticamente — completá lo que
                        falta abajo, o eliminá el archivo arriba para volver a intentar
                        con otro documento.
                      </p>
                    )}
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
                      highlightEmpty={!vehiculoLeidoCompleto}
                    />
                  </>
                )}
              </>
            )}

            {esAutomovil && form.poseeVehiculo === 'No' && (
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
                modeloDisabled={buscandoModeloAnterior}
              />
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
