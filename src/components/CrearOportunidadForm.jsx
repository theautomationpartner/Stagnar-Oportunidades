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
  MdCheck,
  MdLocationOn,
  MdSmartphone,
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
import GuardandoOportunidadModal from './GuardandoOportunidadModal'
import AutodataModeloPorAnioMarca from './AutodataModeloPorAnioMarca'
import {
  createOpportunityItem,
  setMultipleColumnValues,
  setConnectedColumnValue,
  uploadFileToColumn,
  dropdownColumnValue,
  leerCartaAutomovil,
  leerCedula,
  deleteItem,
  fetchItemState,
  searchContactos,
  findContactoByCedula,
  fetchContactoOportunidades,
  createContactoItem,
  fetchFileColumnAsFile,
  setContactoColumnValues,
  OPORTUNIDAD_CONTACTO_COLUMN_ID,
  CONTACTO_CI_COLUMN_ID,
  CONTACTO_TELEFONO_COLUMN_ID,
  CONTACTO_FECHA_NACIMIENTO_COLUMN_ID,
  CONTACTO_LOCALIDAD_COLUMN_ID,
  CONTACTO_DEPARTAMENTO_COLUMN_ID,
  CONTACTO_CI_FRENTE_COLUMN_ID,
  CONTACTO_ESTADO_COLUMN_ID,
} from '../services/mondayApi'
import { mapOpportunities } from '../services/opportunityMapper'
import { matchesSearchQuery } from '../services/format'
import './CrearOportunidadForm.css'

// `label` es el texto corto del Stepper de arriba (círculos numerados); `navLabel` es
// el texto que usan los botones "Volver a.../Continuar a..." del footer (ver más abajo)
// — separado de `label` por si algún paso necesita decir algo distinto en cada lugar.
const STEPS = [
  { key: 'personales', label: 'Seleccionar Persona', navLabel: 'Seleccionar Persona' },
  { key: 'tipo-riesgo', label: 'Seleccionar Tipo de Riesgo', navLabel: 'Seleccionar Tipo de Riesgo' },
  { key: 'riesgo', label: 'Cargar Datos del Riesgo', navLabel: 'Cargar Datos del Riesgo' },
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

// A pedido: asterisco de obligatorio en rojo en TODOS los campos — antes era texto
// suelto (" *") sin ese color en los <label><span> armados a mano (Fecha Nacimiento,
// Teléfono, Departamento, Localidad, Año/Marca/Modelo/etc.), mientras que el TextField
// nativo de @vibe/core (Nombre/Apellido/CI) sí lo trae rojo de fábrica — quedaba
// inconsistente. Un solo componente en vez de repetir el span a mano en cada campo.
function Required() {
  return <span className="crear-op__required">*</span>
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

// El escenario de Make que lee la Cédula de Identidad con IA (ver
// mondayApi.js#leerCedula) puede devolver la fecha como texto "dd/mm/aaaa" (formato
// que suele traer una CI uruguaya) en vez del "aaaa-mm-dd" que espera el
// <input type="date"> de acá — se convierte si matchea ese patrón; si no, se deja tal
// cual (el popup de "Editar" deja corregirla a mano si hace falta).
function normalizeFechaIA(raw) {
  const value = (raw ?? '').trim()
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!match) return value
  const [, d, m, y] = match
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Búsqueda contra el tablero Clientes (18420863014) para precargar los datos personales
// de un registro que ya existe, en vez de tipear todo de nuevo — el modo de búsqueda
// (nombre vs. Cédula) lo decide searchContactos según lo que se tipeó. A pedido: la
// consulta NO se dispara solo, hay que tocar "Buscar" (o Enter) — antes buscaba en cada
// tecla (debounced), pero eso pegaba a la API de más con cada letra tipeada. Un mismo
// ítem puede volver etiquetado "Cliente" (contacto completo) o "Lead" (persona
// encontrada a través de una Oportunidad vieja, datos más livianos) — el campo Situación
// del propio tablero (ver mapContactoItem en mondayApi.js) dice cuál es. Cada opción se
// muestra con su etiqueta + el nombre a la izquierda, y la Cédula resaltada en azul a la
// derecha (optionRenderer). Al elegir una, onChange recibe la opción entera
// (source/id/name/ci + datos personales) — se arma en handleResultadoSeleccionado.
function ExistingRecordSearch({ value, onChange }) {
  const [inputValue, setInputValue] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Distingue "todavía no buscaste nada" (noOptionsMessage invita a tocar Buscar) de
  // "buscaste y no había resultados" (avisa que no encontró nada) — sin esto los 2 casos
  // mostraban el mismo mensaje.
  const [searched, setSearched] = useState(false)

  const handleBuscar = () => {
    const term = inputValue.trim()
    if (term.length < 2) return
    setLoading(true)
    setMenuOpen(true)
    searchContactos(term)
      .then((resultados) => {
        setOptions(
          resultados.map((c) => ({
            value: `${c.source}:${c.id}`,
            label: c.name,
            ci: c.ci,
            source: c.source,
            id: c.id,
            name: c.name,
            fechaNacimiento: c.fechaNacimiento,
            telefono: c.telefono,
            telefonoCountryShortName: c.telefonoCountryShortName,
            departamentoNombre: c.departamentoNombre,
            localidadNombre: c.localidadNombre,
          }))
        )
        setSearched(true)
      })
      .finally(() => setLoading(false))
  }

  // Si se sigue tipeando después de una búsqueda ya hecha, los resultados quedan
  // desactualizados respecto al texto — se esconden hasta la próxima búsqueda explícita
  // en vez de dejarlos ahí sugiriendo que ya reflejan lo que hay tipeado ahora.
  const handleInputChange = (input) => {
    setInputValue(input ?? '')
    if (searched) {
      setOptions([])
      setSearched(false)
    }
  }

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
    setSearched(false)
    setMenuOpen(false)
    onChange(null)
  }

  return (
    <div className="crear-op__search-wrap">
      {/* Enter dispara la misma búsqueda que el botón — no hace falta soltar el teclado
          para ir a buscarlo con el mouse. onKeyDownCapture (no onKeyDown) + stopPropagation:
          el propio Dropdown (downshift por debajo) también escucha Enter y, sin
          highlightedIndex (acá nunca hay uno resaltado — filterOption/highlight propios
          no se usan), lo interpreta como "borrar lo tipeado" — hay que interceptarlo ANTES
          de que le llegue, no después. */}
      <div
        className="crear-op__search-row"
        onKeyDownCapture={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          e.stopPropagation()
          handleBuscar()
        }}
      >
        <div className="crear-op__search-dropdown-wrap">
          <Dropdown
            clearable={false}
            searchable
            // Sin esto, el Dropdown vuelve a filtrar por su cuenta las opciones ya
            // devueltas por la búsqueda del servidor contra el texto tipeado — que
            // matchea desde el principio del `label` (mismo default que documenta
            // RequiredDropdown más arriba). Con una Cédula (el label es el nombre, no el
            // número) eso descartaba TODOS los resultados aunque la búsqueda real sí los
            // hubiera encontrado. `options` acá ya viene filtrado por searchContactos,
            // así que no hace falta (ni conviene) que el Dropdown filtre una segunda vez.
            filterOption={() => true}
            options={options}
            value={selected}
            loading={loading}
            inputValue={inputValue}
            onInputChange={handleInputChange}
            isMenuOpen={menuOpen}
            onMenuOpen={() => setMenuOpen(true)}
            onMenuClose={() => setMenuOpen(false)}
            placeholder="Colocá la cédula de identidad o el nombre y apellido..."
            noOptionsMessage={
              !searched ? 'Escribí y tocá "Buscar" (o Enter)' : 'Sin resultados'
            }
            optionRenderer={(option) => (
              <div className="crear-op__cliente-option">
                <div className="crear-op__cliente-option-row">
                  <span className="crear-op__cliente-option-main">
                    <span className={`crear-op__source-tag crear-op__source-tag--${option.source}`}>
                      {option.source === 'contacto' ? 'Cliente' : 'Lead'}
                    </span>
                    {option.label}
                  </span>
                  {option.ci && <span className="crear-op__cliente-option-ci">{option.ci}</span>}
                </div>
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
        <Button
          kind="secondary"
          className="crear-op__search-btn"
          onClick={handleBuscar}
          disabled={inputValue.trim().length < 2 || loading}
        >
          <MdSearch /> Buscar
        </Button>
      </div>
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
        <span>Año <Required /></span>
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
        <span>Marca <Required /></span>
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
        <span>Modelo <Required /></span>
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
        <span>Combustible <Required /></span>
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
        <span>Tipo <Required /></span>
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
        <span>Uso <Required /></span>
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
        <h2 className="crear-op__editar-contacto-title">Editar cliente</h2>
        {error && <p className="crear-op__error">Error: {error}</p>}
        <div className="crear-op__fields--grid">
          <label className={`crear-op__field${fieldStateClass(fechaNacimiento, fechaErr)}`}>
            <span>Fecha Nacimiento <Required /></span>
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
            <span>Teléfono <Required /></span>
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
            <span>Departamento <Required /></span>
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
            <span>Localidad <Required /></span>
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

// Popup "Editar" para el perfil de un Lead recién leído con IA (ver
// handleCedulaLeadChange más abajo) — a diferencia de EditarContactoModal (que escribe
// DIRECTO a un Contacto real que ya existe en monday), acá todavía no hay ningún ítem
// creado: "Guardar" solo actualiza el `form` local, igual que cualquier campo tipeado a
// mano. Por eso también incluye Nombre/Apellido/CI (EditarContactoModal los deja
// afuera a propósito, son datos de identidad de un Contacto ya dado de alta) — acá son
// justo los campos que la IA pudo haber leído mal y hay que poder corregir.
function EditarLeadModal({ form, departamentoOptions, localidades, onSave, onClose }) {
  const [nombre, setNombre] = useState(form.nombre)
  const [apellido, setApellido] = useState(form.apellido)
  const [ci, setCi] = useState(form.ci)
  const [fechaNacimiento, setFechaNacimiento] = useState(form.fechaNacimiento)
  const [departamentoId, setDepartamentoId] = useState(form.departamentoId)
  const [localidadId, setLocalidadId] = useState(form.localidadId)

  const selectedDepartamento = departamentoOptions.find((o) => o.value === departamentoId) ?? null
  const localidadOptions = localidades
    .filter((l) => !selectedDepartamento || l.departamento === selectedDepartamento.label)
    .map((l) => ({ value: l.id, label: l.name }))
  const selectedLocalidad = localidadOptions.find((o) => o.value === localidadId) ?? null

  const ciErr = ciError(ci)
  const fechaErr = fechaError(fechaNacimiento)
  const canSave =
    nombre.trim() && apellido.trim() && ci.trim() && !ciErr && fechaNacimiento && !fechaErr && departamentoId && localidadId

  return (
    <Modal id="editar-lead-modal" show onClose={onClose} size="medium">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">Editar datos personales</h2>
        <div className="crear-op__fields--grid">
          <label className="crear-op__field">
            <span>Nombre <Required /></span>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="crear-op__field">
            <span>Apellido <Required /></span>
            <input type="text" value={apellido} onChange={(e) => setApellido(e.target.value)} />
          </label>
          <label className={`crear-op__field${fieldStateClass(ci, ciErr)}`}>
            <span>CI <Required /></span>
            <input type="text" value={ci} onChange={(e) => setCi(e.target.value)} />
            {ciErr && <span className="crear-op__field-error">{ciErr}</span>}
          </label>
          <label className={`crear-op__field${fieldStateClass(fechaNacimiento, fechaErr)}`}>
            <span>Fecha Nacimiento <Required /></span>
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
          <label className="crear-op__field">
            <span>Departamento <Required /></span>
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
            <span>Localidad <Required /></span>
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
        secondaryButton={{ text: 'Cancelar', onClick: onClose }}
        primaryButton={{
          text: 'Guardar',
          disabled: !canSave,
          onClick: () => onSave({ nombre, apellido, ci: stripCi(ci), fechaNacimiento, departamentoId, localidadId }),
        }}
      />
    </Modal>
  )
}

// Fila de Teléfono, reusada tanto por el formulario manual ("No tengo la Cédula") como
// por el perfil leído con IA ("Sí" + lectura ok) — la IA no devuelve teléfono, así que
// en los 2 casos hay que pedirlo aparte.
function TelefonoField({ form, handleChange, resetKey }) {
  return (
    <div className="crear-op__section">
      <h3 className="crear-op__section-title">Contacto</h3>
      <div className="crear-op__fields--grid">
        <label className="crear-op__field crear-op__field--full">
          <span>Teléfono <Required /></span>
          <div className="crear-op__phone">
            <div className="crear-op__phone-code">
              <RequiredDropdown
                options={CODIGO_PAIS_OPTIONS}
                value={CODIGO_PAIS_OPTIONS.find((o) => o.value === form.codigoPais) ?? null}
                onChange={(option) => handleChange('codigoPais', option?.value ?? '')}
              />
            </div>
            <TextField
              key={`telefono-${resetKey}`}
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
            <span className="crear-op__field-error">{telefonoError(form.telefono, form.codigoPais)}</span>
          )}
        </label>
      </div>
    </div>
  )
}

// Título grande de cada paso (círculo azul numerado + texto, sin subtítulo) — mismo
// número que ese paso muestra en el Stepper de arriba (ver STEPS), así que el título
// nunca queda desincronizado del contador si algún día cambia el orden/cantidad de
// pasos. `number` a mano (no `stepIndex + 1`) porque el llamado a este componente vive
// adentro de un `{stepIndex === N && (...)}` puntual, no en un .map — no hay de dónde
// sacar el índice ahí. aria-hidden en el círculo: es un adorno visual que repite un
// número que un lector de pantalla ya anuncia por otro lado (el Stepper es navegable
// con aria-selected, ver Stepper.jsx), no hace falta leerlo de nuevo acá.
function StepHeading({ number, title }) {
  return (
    <span className="crear-op__step-heading">
      <span className="crear-op__step-badge" aria-hidden="true">
        {number}
      </span>
      <span className="crear-op__step-title">{title}</span>
    </span>
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
  // A pedido: popup con el paso a paso de "Guardar" (ver GuardandoOportunidadModal) —
  // key del paso que está corriendo AHORA MISMO (los anteriores en la lista ya
  // terminaron), null cuando no se está guardando.
  const [guardarStepKey, setGuardarStepKey] = useState(null)

  // A pedido: el ítem de la Oportunidad ya NO se crea antes de tiempo (antes, con
  // "Posee Vehículo: Sí", se creaba apenas se subía la Carta Automóvil, para poder
  // subirle el archivo y disparar una automatización de monday que la leía) — ahora la
  // lectura la hace un escenario de Make (ver leerCartaAutomovil en mondayApi.js) sin
  // tocar monday para nada, así que el ítem recién se crea al final del paso 3, en
  // handleGuardar, igual que el resto de los campos (ver ensureItemId más abajo).
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
  // A pedido: marca si el archivo actual de Cédula Identidad vino del autocompletado
  // (ver handleAutofillCedula) en vez de elegido a mano — gatea el recubrimiento verde
  // de FileField (highlighted). Se apaga solo si el usuario cambia o quita el archivo
  // (ver handleCedulaIdentidadChange), sea a mano o autocompletado de nuevo.
  const [cedulaAutofilled, setCedulaAutofilled] = useState(false)
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
  // A pedido: si el resultado de "Buscar Persona" viene restaurado de localStorage (ver
  // initialPersistedSearch, hasta 10 minutos viejo) puede que ya no exista más en
  // monday (alguien lo borró en el medio) — antes esto recién se descubría al fallar
  // "Guardar", varios pasos después. El useEffect de acá abajo lo valida apenas monta el
  // formulario y, si ya no existe, limpia la selección y avisa con este popup en vez de
  // dejarlo pasar en silencio. Un resultado recién elegido en el buscador (no
  // restaurado) nunca necesita este chequeo — viene de una búsqueda que acaba de
  // consultar monday en ese mismo instante, no puede estar desactualizado.
  const [personaBorradaAviso, setPersonaBorradaAviso] = useState(null)
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
  // A pedido: al crear un Lead desde cero, antes de mostrar el formulario a mano se
  // pregunta si tienen la Cédula de Identidad — "Sí" pide el archivo y lo manda a leer
  // con IA (ver handleCedulaLeadChange); "No" cae al formulario de siempre. '' (sin
  // responder) no muestra ninguno de los 2 todavía.
  const [tieneCedulaLead, setTieneCedulaLead] = useState('')
  const [cedulaLeadFile, setCedulaLeadFile] = useState(null)
  const [leyendoCedulaLead, setLeyendoCedulaLead] = useState(false)
  const [cedulaLeadError, setCedulaLeadError] = useState(null)
  // true una vez que la IA devolvió algo y ya se aplicó al `form` — gatea si se
  // muestra el perfil de solo lectura (ver JSX) en vez de solo el campo de archivo.
  const [leadPerfilListo, setLeadPerfilListo] = useState(false)
  const [editingLeadPerfil, setEditingLeadPerfil] = useState(false)

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  // Valida el resultado restaurado de localStorage (ver comentario de
  // personaBorradaAviso más arriba) — corre una sola vez, al montar. Solo le pega a
  // monday si de verdad había algo restaurado; un formulario nuevo (sin nada
  // persistido, o con la búsqueda salteada) no dispara ninguna consulta de más.
  useEffect(() => {
    const restaurado = initialPersistedSearch?.resultadoSeleccionado
    if (!restaurado?.id) return undefined
    let cancelled = false
    fetchItemState(restaurado.id)
      .then((item) => {
        if (cancelled) return
        if (item && item.state === 'active') return
        setResultadoSeleccionado(null)
        setSearchPreview(null)
        setBusquedaResuelta(false)
        clearPersistedSearch()
        setPersonaBorradaAviso({ name: restaurado.name, ci: restaurado.ci })
      })
      .catch(() => {
        // Sin conexión / hiccup puntual: no se avisa nada raro, se deja seguir con lo
        // restaurado tal cual — es preferible dejar pasar un caso borrado sin detectar
        // (se termina viendo igual al guardar, ver el manejo de ese error en
        // handleGuardar) a tirar un popup por un problema de red que no tiene nada que
        // ver con si la persona sigue existiendo o no.
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Al elegir un resultado (Cliente o Lead), se completan los datos personales y se abre
  // el resto del formulario. Los 2 ya traen Fecha Nacimiento/Teléfono/Departamento/
  // Localidad (ver searchContactos en mondayApi.js) — ninguno tiene columnas separadas
  // de Nombre/Apellido, se parte el nombre completo (ver splitNombreApellido).
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
    // El tablero Clientes no tiene columnas separadas de Nombre/Apellido (Cliente o
    // Lead, da igual) — se parte el nombre completo del ítem, mismo criterio que
    // splitNombreApellido de más arriba.
    const { nombre, apellido } = splitNombreApellido(resultado.name)
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
    // A pedido: si esa persona ya tenía Cédula Identidad (CI Frente) subida en Clientes,
    // se reusa acá — Cliente y Lead viven en el mismo tablero ahora, así que siempre es
    // la misma columna sin importar cuál de los dos sea. Fire-and-forget: no bloquea el
    // resto del autocompletado ni la confirmación si tarda o si no tenía archivo.
    handleAutofillCedula(resultado.id)
  }

  // Descarga la Cédula Identidad (CI Frente) ya subida en un Cliente/Lead anterior y la
  // deja como si el usuario la hubiera elegido a mano (ver handleCedulaIdentidadChange,
  // sin cambios — mismo File, misma lógica de subida diferida). Si no tenía archivo,
  // fetchFileColumnAsFile devuelve null y acá no se hace nada — no hay nada raro que
  // avisar, simplemente no había Cédula para reusar.
  const handleAutofillCedula = async (itemId) => {
    setCedulaAutofillLoading(true)
    try {
      const file = await fetchFileColumnAsFile(itemId, CONTACTO_CI_FRENTE_COLUMN_ID)
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

  // Limpia el gate de "¿Tenés la Cédula de Identidad?" (ver JSX del paso 1) y todo lo
  // que haya quedado de un intento anterior de leerla con IA — se llama tanto al
  // arrancar "Crear Lead" de cero como al volver a buscar, para no arrastrar el
  // archivo/perfil de una persona distinta.
  const resetCedulaLead = () => {
    setTieneCedulaLead('')
    setCedulaLeadFile(null)
    setLeyendoCedulaLead(false)
    setCedulaLeadError(null)
    setLeadPerfilListo(false)
  }

  // "No lo encuentro" — abre el resto del formulario para completarlo a mano, sin ningún
  // resultado elegido (limpia Nombre/Apellido/CI por si venían de una búsqueda anterior).
  const handleSaltearBusqueda = () => {
    setResultadoSeleccionado(null)
    setSearchPreview(null)
    setBusquedaResuelta(true)
    setForm((prev) => ({ ...prev, nombre: '', apellido: '', ci: '' }))
    resetCedulaLead()
  }

  // A pedido: desde la pantalla ya con los datos autocompletados, "Cambiar persona"
  // vuelve a la búsqueda — mismo circuito que la cruz de "Buscar Persona" (deshace el
  // autocompletado, ver handleResultadoSeleccionado(null)) más ocultar esta pantalla,
  // para poder elegir otra persona sin arrastrar nada de la anterior.
  const handleVolverABuscar = () => {
    handleResultadoSeleccionado(null)
    setSearchPreview(null)
    setBusquedaResuelta(false)
    resetCedulaLead()
  }

  // Bug reportado: "Inicio"/"Buscar Oportunidad" salían del formulario sin pasar por
  // handleVolverABuscar, así que no limpiaban lo persistido (ver PERSISTED_SEARCH_KEY
  // más arriba) — al volver a "Crear Oportunidad" para cargar una persona distinta,
  // esa selección vieja (todavía dentro del TTL de 10 minutos) se restauraba sola.
  // Salir del formulario por cualquier camino (no solo "Buscar persona") tiene que
  // descartar la selección sin confirmar, igual que la cruz de "Buscar Persona".
  const handleExit = (destino) => {
    clearPersistedSearch()
    destino?.()
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
    // mapContactoItem ya trae `source` resuelto (Cliente/Lead) — no hace falta pisarlo.
    const resultado = duplicadoCheck.contacto
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
        // A diferencia de antes (mirror automático desde Localidad), ahora Departamento
        // es una conexión propia — hay que escribirla explícitamente.
        [CONTACTO_DEPARTAMENTO_COLUMN_ID]: { item_ids: [Number(values.departamentoId)] },
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
  // completado por la lectura automática de la Carta Automóvil (ver
  // handleCartaAutomovilChange más abajo) — a diferencia de handleModeloChange (que
  // siempre pisa con lo que sepa el modelo elegido), acá el dato leído automáticamente
  // tiene prioridad y el del modelo de Autodata solo se usa como respaldo si ese campo
  // vino vacío.
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
          form.departamentoId
      )
    }
    if (index === 1) {
      // Paso "Tipo de Riesgo" — un solo campo, nada más que validar.
      return Boolean(form.tipoRiesgo)
    }
    if (index === 2) {
      // Paso "Datos del riesgo" — sin campos definidos todavía para otro Tipo de Riesgo
      // que no sea Automóvil (ver el mensaje "Todavía no hay campos definidos..." en el
      // JSX), así que no hay nada que bloquee avanzar en ese caso.
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
  // columna real. Memoiza el id creado (createdItemId) por si esto se llegara a llamar
  // más de una vez — en la práctica hoy es siempre desde handleGuardar nomás, nada crea
  // el ítem antes (ver comentario de createdItemId más arriba).
  const ensureItemId = async () => {
    if (createdItemId) return createdItemId
    // A pedido: "Nombre Apellido-Marca-Año-Modelo" cuando ya se sabe el vehículo (a
    // esta altura, adentro de handleGuardar, isStepValid ya exigió que esté completo)
    // — sin vehículo (Tipo de Riesgo distinto de Automóvil), queda solo "Nombre
    // Apellido".
    const nombreCompleto = `${form.nombre} ${form.apellido}`.trim()
    const itemName =
      esAutomovil && form.modeloSeleccion
        ? `${nombreCompleto}-${form.marca}-${form.anio}-${form.modeloSeleccion.name}`
        : nombreCompleto
    const created = await createOpportunityItem(itemName)
    setCreatedItemId(created.id)
    return created.id
  }

  // Posee Vehículo === "Sí": ya no se piden Marca/Año/Tipo a mano — se leen del archivo.
  // A pedido: el archivo se manda directo a un escenario de Make (leerCartaAutomovil,
  // ver mondayApi.js) que devuelve los datos que pudo extraer, SIN crear nada en monday
  // todavía — ni el ítem de la Oportunidad ni el archivo se suben acá, eso recién pasa
  // al guardar (ver handleGuardar). Subir el archivo dispara la lectura directo, sin
  // paso intermedio de "Confirmar lectura" — el archivo elegido ya es la confirmación.
  const handleCartaAutomovilChange = async (file) => {
    handleChange('cartaAutomovil', file)
    setEditingLeidos(false)
    if (!file) {
      setLecturaEstado('')
      setLecturaError(null)
      return
    }
    setLecturaEstado('Leyendo')
    setLecturaError(null)
    setForm((prev) => ({ ...prev, modeloSeleccion: null, marca: '', anio: '', tipo: '' }))
    try {
      const extraido = await leerCartaAutomovil(file)
      // Nombres de campo tolerantes (marca/Marca, anio/año/Año) — para no depender de
      // que el JSON que devuelve el escenario de Make use exactamente un casing/acento
      // en particular.
      const pick = (...keys) => {
        for (const key of keys) {
          const value = extraido?.[key]
          if (value != null && String(value).trim()) return String(value).trim()
        }
        return ''
      }
      // Convención acordada con el escenario de Make: si no pudo leer nada del
      // documento (no es una Carta/Cédula, imagen ilegible, etc.), en vez de un JSON con
      // los campos vacíos devuelve { "error": "motivo" } — eso sí se trata como falla
      // real (mismo AttentionBox rojo que un error de red). Campos sueltos vacíos, en
      // cambio, se tratan como lectura PARCIAL (ver vehiculoLeidoCompleto/highlightEmpty
      // más abajo) — se completan a mano, no hace falta reintentar todo el documento.
      const errorMsg = pick('error', 'Error')
      if (errorMsg) {
        setLecturaEstado('Error')
        setLecturaError(errorMsg)
        return
      }
      setForm((prev) => ({
        ...prev,
        marca: pick('marca', 'Marca'),
        anio: pick('anio', 'año', 'Anio', 'Año'),
        tipo: pick('tipo', 'Tipo'),
        combustible: matchOption(combustibleOptions, pick('combustible', 'Combustible')),
        uso: matchOption(usoOptions, pick('uso', 'Uso')) || prev.uso,
      }))
      setLecturaEstado('Leidos')
    } catch (err) {
      setLecturaEstado('Error')
      setLecturaError(err.message)
    }
  }

  // Caso "No": acá no hay lectura automática que disparar (ver handleCartaAutomovilChange
  // para el caso "Sí") — el archivo queda en memoria nomás, handleGuardar lo sube recién
  // al final junto con el resto (ítem de la Oportunidad todavía no existe a esta altura).
  const handleCartaAutomovilManualChange = (file) => {
    handleChange('cartaAutomovil', file)
  }

  // Cédula Identidad es opcional en los dos casos (Sí y No) — no bloquea el guardado. El
  // ítem de la Oportunidad todavía no existe a esta altura (ver comentario de
  // createdItemId más arriba), así que acá solo se guarda el File en memoria —
  // handleGuardar lo sube una vez que ya haya item_id.
  const handleCedulaIdentidadChange = (file, isAutofill = false) => {
    handleChange('cedulaIdentidad', file)
    setCedulaAutofilled(isAutofill)
  }

  // A pedido: al crear un Lead desde cero, si tienen la Cédula de Identidad a mano se
  // manda a leer con IA (mismo escenario de Make que ya lee la Carta Automóvil, ver
  // services/mondayApi.js#leerCedula) en vez de tipear todo a mano — nombre_completo se
  // parte igual que un Contacto (splitNombreApellido), y Departamento/Localidad (vienen
  // como nombre, no id) se matchean contra el schema real, mismo criterio que
  // handleResultadoSeleccionado más abajo para un resultado del buscador. El mismo
  // archivo se reusa como Cédula Identidad de la Documentación (ver
  // handleCedulaIdentidadChange arriba) para no pedirlo 2 veces.
  const handleCedulaLeadChange = async (file) => {
    setCedulaLeadFile(file)
    setCedulaLeadError(null)
    setLeadPerfilListo(false)
    if (!file) return
    setLeyendoCedulaLead(true)
    try {
      const data = await leerCedula(file)
      const { nombre, apellido } = splitNombreApellido(data.nombre_completo || '')
      const departamentoNombre = (data.departametno || data.departamento || '').trim()
      const departamentoMatch = (schema?.departamentos ?? []).find(
        (d) => d.name.toLowerCase() === departamentoNombre.toLowerCase()
      )
      const localidadNombre = (data.localidad || '').trim()
      const localidadMatch = (schema?.localidades ?? []).find(
        (l) => l.name.toLowerCase() === localidadNombre.toLowerCase()
      )
      if (!nombre && !data.ci) {
        // La IA no pudo leer nada útil — se avisa y se deja el archivo puesto para
        // reintentar (o pasar a "No" y cargar a mano), en vez de mostrar un perfil vacío.
        setCedulaLeadError('No pudimos leer los datos del documento.')
        return
      }
      setForm((prev) => ({
        ...prev,
        nombre: nombre || prev.nombre,
        apellido: apellido || prev.apellido,
        ci: data.ci || prev.ci,
        fechaNacimiento: normalizeFechaIA(data.fecha_nacimineto || data.fecha_nacimiento) || prev.fechaNacimiento,
        departamentoId: departamentoMatch?.id ?? prev.departamentoId,
        localidadId: localidadMatch?.id ?? prev.localidadId,
      }))
      handleCedulaIdentidadChange(file, true)
      setLeadPerfilListo(true)
    } catch (err) {
      setCedulaLeadError(err.message)
    } finally {
      setLeyendoCedulaLead(false)
    }
  }

  const handleSaveLeadPerfil = (values) => {
    setForm((prev) => ({ ...prev, ...values }))
    setEditingLeadPerfil(false)
  }

  // A pedido: toda Oportunidad nueva queda con el campo Cliente completo, nunca vacío —
  // si se eligió un resultado existente en "Buscar Persona" (Cliente o Lead, da igual:
  // los dos son ítems reales del tablero Clientes) se reusa ese id directo; si no
  // ("Crear Lead" desde cero), se crea un Cliente nuevo con los mismos datos personales
  // que ya se cargaron acá, para no volver a tipearlos — con Situación = "Lead" (nunca
  // "Cliente"), porque nace de una Oportunidad sin haber pasado por el buscador, no de
  // un alta real de Cliente. Esto es además lo que hace que el historial por relación
  // (ver contactoOportunidades más arriba) se empiece a llenar solo de acá en adelante.
  const ensureContactoId = async () => {
    if (resultadoSeleccionado?.id) return resultadoSeleccionado.id
    const created = await createContactoItem(`${form.nombre} ${form.apellido}`.trim(), {
      [CONTACTO_ESTADO_COLUMN_ID]: 'Lead',
      [CONTACTO_CI_COLUMN_ID]: stripCi(form.ci),
      [CONTACTO_TELEFONO_COLUMN_ID]: {
        phone: `${form.codigoPais.replace('+', '')}${form.telefono.replace(/\D/g, '')}`,
        countryShortName: COUNTRY_SHORT_NAMES[form.codigoPais] ?? 'UY',
      },
      [CONTACTO_FECHA_NACIMIENTO_COLUMN_ID]: form.fechaNacimiento,
      [CONTACTO_LOCALIDAD_COLUMN_ID]: { item_ids: [Number(form.localidadId)] },
      [CONTACTO_DEPARTAMENTO_COLUMN_ID]: { item_ids: [Number(form.departamentoId)] },
    })
    return created.id
  }

  // A pedido: los pasos que se muestran en GuardandoOportunidadModal — "Guardando datos
  // del vehículo"/"Subiendo documentos" solo aparecen si de verdad va a pasar algo ahí
  // (Tipo de Riesgo Automóvil, y/o algún archivo elegido), para no prometer un paso que
  // handleGuardar ni siquiera va a correr.
  const guardarSteps = [
    { key: 'item', label: 'Creando la oportunidad' },
    { key: 'contacto', label: 'Vinculando con el cliente' },
    ...(esAutomovil ? [{ key: 'vehiculo', label: 'Guardando los datos del vehículo' }] : []),
    ...(form.cedulaIdentidad || form.cartaAutomovil ? [{ key: 'archivos', label: 'Subiendo los documentos' }] : []),
  ]

  // A pedido: "Guardar" es atómico — se hace todo, o no queda nada (antes, si fallaba a
  // mitad de camino, el ítem de la Oportunidad ya creado quedaba huérfano en monday, a
  // medio cargar; cada reintento sumaba OTRO huérfano más). Acá se trackea qué se llegó
  // a CREAR en esta corrida puntual (createdOpportunityId/createdContactoId — no lo que
  // ya existía de antes, eso no se toca) para poder deshacerlo en el catch si algo
  // después falla.
  const handleGuardar = async () => {
    if (!canAdvance || saving) return
    setSaving(true)
    setSaveError(null)
    let createdOpportunityId = null
    let createdContactoId = null
    try {
      setGuardarStepKey('item')
      const itemId = await ensureItemId()
      createdOpportunityId = itemId
      await setMultipleColumnValues(itemId, buildBaseColumnValues())

      setGuardarStepKey('contacto')
      const yaExistiaContacto = Boolean(resultadoSeleccionado?.id)
      const contactoId = await ensureContactoId()
      if (!yaExistiaContacto) createdContactoId = contactoId
      await setConnectedColumnValue(itemId, OPORTUNIDAD_CONTACTO_COLUMN_ID, [Number(contactoId)])

      if (esAutomovil) {
        setGuardarStepKey('vehiculo')
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
        extra.dropdown_mm51ykrd = dropdownColumnValue(form.marca)
        // Año es un label puramente numérico ("2006") — mandarlo como string pelado
        // hace que monday lo confunda con un ID de label interno y lo descarte en
        // silencio (ver dropdownColumnValue en mondayApi.js).
        extra.dropdown_mm51mdmq = dropdownColumnValue(form.anio)
        extra.color_mm52ey1d = form.uso
        await setMultipleColumnValues(itemId, extra)
      }

      // El ítem no existía cuando se eligieron estos archivos (ver
      // handleCedulaIdentidadChange/handleCartaAutomovilChange/handleCartaAutomovilManualChange
      // — ninguno de los 3 sube nada, solo guardan el File en memoria), así que se suben
      // recién acá, ya con item_id.
      if (form.cedulaIdentidad || form.cartaAutomovil) {
        setGuardarStepKey('archivos')
        if (form.cedulaIdentidad) await uploadFileToColumn(itemId, 'file_mm5pc008', form.cedulaIdentidad)
        if (form.cartaAutomovil) await uploadFileToColumn(itemId, 'file_mm51jy06', form.cartaAutomovil)
      }

      clearPersistedSearch()
      onCreated?.(itemId)
    } catch (err) {
      // Rollback: se borra lo que se haya llegado a crear EN ESTA corrida (nunca algo
      // que ya existía de antes) — si eso también falla, se avisa en vez de tapar el
      // huérfano en silencio, para poder ir a borrarlo a mano en monday.
      const rollbackFallidos = []
      if (createdOpportunityId) {
        try {
          await deleteItem(createdOpportunityId)
        } catch {
          rollbackFallidos.push(`Oportunidad ${createdOpportunityId}`)
        }
      }
      if (createdContactoId) {
        try {
          await deleteItem(createdContactoId)
        } catch {
          rollbackFallidos.push(`Cliente ${createdContactoId}`)
        }
      }
      // No dejar createdItemId apuntando a un ítem que ya no existe (se acaba de borrar
      // arriba, o nunca se llegó a crear) — un reintento tiene que crear uno nuevo de
      // cero, nunca reusar este.
      setCreatedItemId(null)
      // A pedido: si monday rechaza la conexión porque el Cliente/Lead elegido ya no
      // existe (se borró mientras tanto — "Connecting deleted items isn't allowed"),
      // "Reintentar" tal cual iba a fallar EXACTO IGUAL: ensureContactoId sigue viendo
      // resultadoSeleccionado.id y reusa ese mismo id muerto. Se limpia acá (sin tocar
      // el resto del form — Nombre/Apellido/CI/etc. siguen siendo válidos, lo único roto
      // es el vínculo) para que el próximo intento cree un Cliente/Lead NUEVO con esos
      // mismos datos en vez de insistir con uno borrado.
      const personaBorrada = /deleted items/i.test(err.message)
      if (personaBorrada) {
        setResultadoSeleccionado(null)
        setSearchPreview(null)
      }
      setSaveError(
        personaBorrada
          ? 'La persona que habías elegido en "Buscar Persona" ya no existe en monday (se borró en el medio). Tocá "Reintentar": se va a crear un Cliente/Lead nuevo con estos mismos datos.'
          : rollbackFallidos.length
            ? `${err.message} (no se pudo deshacer solo, revisá a mano en monday: ${rollbackFallidos.join(', ')})`
            : err.message
      )
    } finally {
      setSaving(false)
      setGuardarStepKey(null)
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
            <IconButton icon={MdSearch} onClick={() => handleExit(onVerOportunidades)} aria-label="Buscar Oportunidad" />
            <IconButton icon={MdHome} onClick={() => handleExit(onHome)} aria-label="Inicio" />
          </div>
        </div>

        {stepIndex === 0 && (
          <div className="crear-op__fields">
            {/* A pedido: la búsqueda y los datos ya autocompletados viven en 2
                "pantallas" separadas (nunca las 2 juntas) — antes el campo "Buscar
                Persona" se quedaba visible arriba con el resultado ya elegido mientras
                abajo aparecía todo el resto del formulario, quedaba redundante (el
                nombre ya se ve repetido en Datos personales) y competía por atención.
                Elegir un resultado (o "Crear Lead") anima la transición de una pantalla
                a la otra (key distinto por pantalla, ver el CSS) — "Buscar persona" en
                el footer (ver handleVolverABuscar) siempre permite volver atrás y elegir
                otra cosa, sin perder nada: solo deshace el autocompletado, mismo
                circuito que la cruz de "Buscar Persona" de antes. */}
            {!busquedaResuelta ? (
              <div className="crear-op__search-screen" key="search-screen">
                <label className="crear-op__field crear-op__field--full">
                  <StepHeading number={1} title="Seleccionar Persona" />
                  <ExistingRecordSearch value={searchPreview} onChange={handleSearchPreview} />
                  <Button kind="tertiary" className="crear-op__skip-btn" onClick={handleSaltearBusqueda}>
                    Crear Lead
                  </Button>
                </label>
              </div>
            ) : (
              <div className="crear-op__data-screen" key="data-screen">
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
                    type="warning"
                    title="Cédula de Identidad ya registrada"
                    description={
                      <>
                        Encontramos esta Cédula de Identidad ya cargada en el tablero Clientes:
                        <br />
                        <br />
                        Nombre: <strong>{duplicadoCheck.contacto.name}</strong>
                        <br />
                        Situación: <strong>{duplicadoCheck.contacto.situacion || 'Cliente'}</strong>
                        <br />
                        <br />
                        ¿Deseás continuar con la información de este registro?
                      </>
                    }
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
                {resultadoSeleccionado ? (
                  // A pedido: para un resultado ya existente (Cliente o Lead, misma
                  // ficha para los dos — la única diferencia es el tag), sus datos
                  // personales se muestran como descripción de solo lectura (no como
                  // formulario) — se confirmó que es la persona correcta con la tarjeta
                  // de arriba y el historial de al lado, no hace falta que se vea
                  // editable como si se estuviera cargando de cero. "Editar" abre un
                  // popup aparte que modifica el ítem real (ver EditarContactoModal más
                  // abajo), no solo el form de esta Oportunidad. Solo se vuelve al
                  // formulario editable de siempre cuando no hay ningún resultado
                  // elegido ("Crear Lead" desde cero, ver handleSaltearBusqueda).
                  <div className="crear-op__ficha">
                    <div className="crear-op__ficha-header">
                      <div className="crear-op__ficha-heading">
                        <span
                          className={`crear-op__source-tag crear-op__source-tag--${resultadoSeleccionado.source}`}
                        >
                          {resultadoSeleccionado.source === 'contacto' ? 'Cliente' : 'Lead'}
                        </span>
                        <h2 className="crear-op__ficha-name">
                          {`${form.nombre} ${form.apellido}`.trim() || '—'}
                        </h2>
                        <span className="crear-op__ficha-address">
                          <MdLocationOn />
                          {[selectedDepartamento?.label, selectedLocalidad?.label].filter(Boolean).join(', ') ||
                            'Sin ubicación cargada'}
                        </span>
                      </div>
                      <Button kind="tertiary" onClick={() => setEditingContacto(true)}>
                        <MdEdit /> Editar
                      </Button>
                    </div>
                    <div className="crear-op__ficha-badges">
                      <span className="crear-op__ficha-badge">CI: {form.ci || '—'}</span>
                      <span className="crear-op__ficha-badge">Nacimiento: {form.fechaNacimiento || '—'}</span>
                      <span className="crear-op__ficha-badge">
                        <MdSmartphone />
                        {form.telefono ? `${form.codigoPais} ${form.telefono}` : '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* A pedido: antes de mostrar el formulario a mano para "Crear Lead",
                        se pregunta si tienen la Cédula de Identidad — mismo criterio que
                        "¿Tenés la Cédula o Carta del vehículo?" del paso 3 (mismo toggle,
                        ver .crear-op__toggle). "Sí" manda el archivo a leer con IA
                        (ver handleCedulaLeadChange) y muestra el resultado como perfil de
                        solo lectura (mismo lenguaje que la ficha de un Cliente/Lead ya
                        elegido, ver más arriba) en vez de un formulario — "Editar" abre un
                        popup para corregir lo que la IA haya leído mal (ver
                        EditarLeadModal). "No" cae al formulario de siempre. */}
                    <div className="crear-op__section">
                      <h3 className="crear-op__section-title">Datos personales</h3>
                      <p className="crear-op__risk-subtitle">¿Tenés la Cédula de Identidad de la persona?</p>
                      <div className="crear-op__toggle">
                        <button
                          type="button"
                          className={
                            tieneCedulaLead === 'Si'
                              ? 'crear-op__toggle-btn crear-op__toggle-btn--active'
                              : 'crear-op__toggle-btn'
                          }
                          onClick={() => setTieneCedulaLead('Si')}
                        >
                          Sí, tengo el documento
                        </button>
                        <button
                          type="button"
                          className={
                            tieneCedulaLead === 'No'
                              ? 'crear-op__toggle-btn crear-op__toggle-btn--active'
                              : 'crear-op__toggle-btn'
                          }
                          onClick={() => setTieneCedulaLead('No')}
                        >
                          No, ingresar manualmente
                        </button>
                      </div>
                    </div>

                    {tieneCedulaLead === 'Si' && (
                      <div className="crear-op__section">
                        {!cedulaLeadFile ? (
                          <FileUploadField
                            label="Cédula de Identidad"
                            file={cedulaLeadFile}
                            onUpload={handleCedulaLeadChange}
                            prominent
                            helperText="Subí una foto o PDF de la Cédula de Identidad para completar los datos automáticamente."
                            buttonLabel="Adjuntar Cédula de Identidad"
                          />
                        ) : (
                          <FileUploadField
                            label="Cédula de Identidad"
                            file={cedulaLeadFile}
                            uploading={leyendoCedulaLead}
                            onDelete={() => handleCedulaLeadChange(null)}
                            deleteLabel="Eliminar archivo y reintentar"
                            showReplaceButton={false}
                          />
                        )}
                        {cedulaLeadError && (
                          <AttentionBox type="warning" className="crear-op__lead-error">
                            No pudimos leer los datos automáticamente. Completá lo que falta con
                            "Editar", o eliminá el archivo de arriba para probar con otro documento.
                          </AttentionBox>
                        )}
                      </div>
                    )}

                    {tieneCedulaLead === 'Si' && leadPerfilListo && (
                      <>
                        <div className="crear-op__ficha">
                          <div className="crear-op__ficha-header">
                            <div className="crear-op__ficha-heading">
                              <span className="crear-op__source-tag crear-op__source-tag--lead">Lead</span>
                              <h2 className="crear-op__ficha-name">
                                {`${form.nombre} ${form.apellido}`.trim() || '—'}
                              </h2>
                              <span className="crear-op__ficha-address">
                                <MdLocationOn />
                                {[selectedDepartamento?.label, selectedLocalidad?.label].filter(Boolean).join(', ') ||
                                  'Sin ubicación cargada'}
                              </span>
                            </div>
                            <Button kind="tertiary" onClick={() => setEditingLeadPerfil(true)}>
                              <MdEdit /> Editar
                            </Button>
                          </div>
                          <div className="crear-op__ficha-badges">
                            <span className="crear-op__ficha-badge">CI: {form.ci || '—'}</span>
                            <span className="crear-op__ficha-badge">Nacimiento: {form.fechaNacimiento || '—'}</span>
                          </div>
                        </div>

                        <TelefonoField form={form} handleChange={handleChange} resetKey={textFieldsResetKey} />
                      </>
                    )}

                    {tieneCedulaLead === 'No' && (
                      <>
                        <div className="crear-op__section">
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
                              <span>Fecha Nacimiento <Required /></span>
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

                        <TelefonoField form={form} handleChange={handleChange} resetKey={textFieldsResetKey} />

                        <div className="crear-op__section">
                          <h3 className="crear-op__section-title">Ubicación</h3>
                          <div className="crear-op__fields--grid">
                            <label className="crear-op__field">
                              <span>Departamento <Required /></span>
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
                              <span>Localidad <Required /></span>
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

                    {editingLeadPerfil && (
                      <EditarLeadModal
                        form={form}
                        departamentoOptions={departamentoOptions}
                        localidades={localidades}
                        onClose={() => setEditingLeadPerfil(false)}
                        onSave={handleSaveLeadPerfil}
                      />
                    )}
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
                    {searchPreview.source === 'contacto' ? 'este cliente' : 'esta persona'}
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
                          {/* A pedido: fecha de cotización y cantidad de recotizaciones a
                              simple vista, sin tener que desplegar el detalle. */}
                          <span className="crear-op__historial-meta">{o.ultimaCotizacion}</span>
                          <span className="crear-op__historial-meta">
                            {o.recotizaciones} {o.recotizaciones === 1 ? 'recotización' : 'recotizaciones'}
                          </span>
                          <button
                            type="button"
                            className="crear-op__historial-toggle"
                            onClick={() => setExpandedOppId(isExpanded ? null : o.id)}
                          >
                            {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                            {isExpanded ? <MdKeyboardArrowUp /> : <MdKeyboardArrowDown />}
                          </button>
                        </div>
                        {/* A pedido: al desplegar, el vehículo/bien vinculado — fecha y
                            recotizaciones ya se ven en la fila de arriba, no hace falta
                            repetirlas acá adentro. */}
                        {isExpanded && (
                          <div className="crear-op__historial-detail">
                            <div className="crear-op__historial-detail-box">
                              <span className="crear-op__historial-detail-label">Bien asegurado</span>
                              <strong>{o.bienLinea1}</strong>
                              {o.bienLinea2 && <span>{o.bienLinea2}</span>}
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
            {/* A pedido: paso propio para Tipo de Riesgo (antes vivía junto con "Datos
                del riesgo" en un mismo paso) — el Stepper de arriba ahora muestra los 3
                pasos reales del flujo. Llega completado con el default de Vehículo (ver
                el useEffect que arranca con TIPO_RIESGO_AUTOMOVIL), pero se puede
                cambiar libremente acá. */}
            <StepHeading number={2} title="Seleccionar Tipo de Riesgo" />
            <div className="crear-op__section">
              <div className="crear-op__fields--grid">
                <label className="crear-op__field crear-op__field--full">
                  <span>Tipo de Riesgo <Required /></span>
                  <RequiredDropdown
                    options={tipoRiesgoOptions}
                    value={selectedTipoRiesgo}
                    placeholder="Selecciona una opción"
                    onChange={(option) => handleChange('tipoRiesgo', option?.value ?? '')}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {stepIndex === 2 && (
          <div className="crear-op__fields">
            <StepHeading number={3} title="Cargar Datos del Riesgo" />
            {esAutomovil && (
              <>
                {/* A pedido, estética tipo mockup: subtítulo propio del paso, y el
                    toggle de 2 botones en vez del dropdown "Si"/"No" — mismos valores
                    reales que color_mm51n4j, solo cambia el control. A pedido: se sacó
                    la selección de "¿es alguno de estos vehículos?" (ver git history)
                    — este paso deja solo la pregunta de abajo, ahora más destacada
                    (ver .crear-op__risk-subtitle). */}
                <p className="crear-op__risk-subtitle">¿Tenés la Cédula o Carta del vehículo a cotizar?</p>
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
                    lo que pase con la lectura (analizando/leído/incompleto/error, ver
                    más abajo). A pedido: antes "eliminar" era un link de texto suelto,
                    distinto y en un lugar distinto en cada uno de esos estados — ahora
                    es un único botón, siempre pegado al archivo al que se refiere (más
                    fácil de encontrar, ni hay que ir a buscarlo según en qué estado esté
                    la lectura). El archivo no se sube a monday en este paso (ver
                    handleCartaAutomovilChange) — solo se le manda al escenario de Make
                    que lo lee, así que acá no hay "uploading" que mostrar. */}
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
                    onDelete={() => handleCartaAutomovilChange(null)}
                    deleteLabel="Eliminar archivo y reintentar"
                    showReplaceButton={false}
                  />
                )}

                {lecturaEstado === 'Leyendo' && (
                  <div className="crear-op__lectura-analyzing">
                    <Loader size={20} className="crear-op__lectura-analyzing-spinner" />
                    <div>
                      <strong>Analizando cédula del vehículo...</strong>
                      <span>Extrayendo Marca, Año, Combustible, Tipo y Uso con Inteligencia Artificial.</span>
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
                    {/* A pedido: volver al resumen compacto de arriba — solo tiene
                        sentido si ya está todo completo (si no, no hay resumen al que
                        volver, se sigue viendo esto hasta que lo esté). Mismo estilo
                        (link chico en verde) que "Editar datos" del resumen — es la
                        acción inversa de esa, tiene que leerse como el mismo lenguaje
                        visual, no como un botón de página (footer) ni un texto
                        genérico. El texto deja explícito qué confirma (los datos del
                        vehículo), no un "Listo" ambiguo que podía referirse a cualquier
                        cosa. */}
                    {editingLeidos && vehiculoLeidoCompleto && (
                      <button
                        type="button"
                        className="crear-op__lectura-summary-edit"
                        onClick={() => setEditingLeidos(false)}
                      >
                        Confirmar datos del vehículo <MdCheck />
                      </button>
                    )}
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
              />
            )}
          </div>
        )}

        {/* A pedido: footer con los 2 botones en los extremos (Volver a la izquierda,
            Continuar a la derecha) en vez de los 2 agrupados a la derecha como antes —
            y con el nombre del paso al que van, en vez de "Atrás"/"Guardar y continuar"
            genéricos (ver STEPS más arriba, navLabel de cada paso). En el paso 1, con
            una persona ya elegida (busquedaResuelta), este botón reemplaza al viejo
            "Cambiar persona" (mismo handleVolverABuscar) — mientras se está buscando
            todavía (nada elegido) sigue siendo "Cancelar" (sale del formulario entero,
            no hay a dónde "volver" adentro del propio paso 1). */}
        <div className="crear-op__footer">
          {stepIndex === 0 ? (
            busquedaResuelta ? (
              <Button kind="secondary" className="crear-op__footer-back" onClick={handleVolverABuscar} disabled={saving}>
                <MdArrowBack /> Buscar persona
              </Button>
            ) : (
              <Button kind="secondary" className="crear-op__footer-back" onClick={() => handleExit(onCancel)} disabled={saving}>
                <MdArrowBack /> Cancelar
              </Button>
            )
          ) : (
            <Button
              kind="secondary"
              className="crear-op__footer-back"
              onClick={() => setStepIndex((i) => i - 1)}
              disabled={saving}
            >
              <MdArrowBack /> Volver a {STEPS[stepIndex - 1].navLabel}
            </Button>
          )}
          <div className="crear-op__footer-actions">
            <Button
              kind="primary"
              onClick={isLastStep ? handleGuardar : handleContinuar}
              disabled={!canAdvance || saving}
            >
              {isLastStep ? (saving ? 'Creando...' : 'Crear Oportunidad') : `Continuar a ${STEPS[stepIndex + 1].navLabel}`}{' '}
              <MdArrowForward />
            </Button>
          </div>
        </div>
      </div>

      {/* A pedido: si el resultado de "Buscar Persona" restaurado de una visita
          anterior (ver personaBorradaAviso más arriba) ya no existe en monday, se avisa
          apenas se detecta (al montar) en vez de descubrirlo recién al fallar
          "Guardar" varios pasos después. */}
      {personaBorradaAviso && (
        <AlertModal
          id="persona-borrada-modal"
          type="warning"
          title="La persona seleccionada ya no existe"
          description={
            `El cliente ${personaBorradaAviso.name || 'seleccionado'}` +
            (personaBorradaAviso.ci ? `, CI ${personaBorradaAviso.ci},` : '') +
            ' fue eliminado de monday. Por favor, realice una nueva búsqueda.'
          }
          onClose={() => setPersonaBorradaAviso(null)}
          primaryButton={{ text: 'Entendido', onClick: () => setPersonaBorradaAviso(null) }}
        />
      )}

      <GuardandoOportunidadModal show={saving} steps={guardarSteps} currentStepKey={guardarStepKey} />

      {/* A pedido: el error de "Guardar" ahora es un popup (mismo AlertModal que el
          resto de la app), no un texto suelto abajo del todo — "Reintentar" vuelve a
          correr handleGuardar tal cual (el rollback de arriba ya se encargó de que no
          quede nada a medio cargar de la corrida anterior). */}
      {saveError && (
        <AlertModal
          id="guardar-error-modal"
          type="error"
          title="No se pudo crear la oportunidad"
          description={saveError}
          onClose={() => setSaveError(null)}
          secondaryButton={{ text: 'Cerrar', onClick: () => setSaveError(null) }}
          primaryButton={{ text: 'Reintentar', danger: true, onClick: handleGuardar }}
        />
      )}
    </div>
  )
}
