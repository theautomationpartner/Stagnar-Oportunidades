import { useEffect, useRef, useState } from 'react'
import {
  MdUploadFile,
  MdClear,
  MdSearch,
  MdHome,
  MdArrowForward,
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
  Modal,
  ModalContent,
  ModalFooter,
  Loader,
  TextField,
} from '@vibe/core'
import Stepper from './Stepper'
import StatusBadge from './StatusBadge'
import AutodataModeloPorAnioMarca from './AutodataModeloPorAnioMarca'
import {
  createOpportunityItem,
  setMultipleColumnValues,
  uploadFileToColumn,
  setSimpleColumnValue,
  dropdownColumnValue,
  fetchOpportunityDetail,
  fetchLatestUpdate,
  searchClientes,
  searchOportunidades,
  findClienteByCedula,
  countOportunidadesByCedula,
  fetchFileColumnAsFile,
} from '../services/mondayApi'
import { matchesSearchQuery } from '../services/format'
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

// Iniciales para el avatar de la tarjeta de confirmación (ver JSX) — primera letra de
// las 2 primeras palabras del nombre completo, igual que el "MC"/"SG" del mockup.
function initialsOf(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('')
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
// A pedido: cuando se tipea a mano una Cédula (búsqueda salteada) que YA existe como
// Cliente u Oportunidad (ver el aviso de duplicado en el padre), ese mismo valor se
// manda como seedTerm para que el buscador de abajo lo muestre de una — el padre le
// pone un `key` distinto a ExistingRecordSearch cada vez que llega un seedTerm nuevo
// (ver su uso más abajo), así que ESTE componente se remonta de cero por completo, y
// puede leer seedTerm directo como valor inicial de sus propios useState. Se probó
// primero con un useEffect que "sembraba" el valor en un Dropdown ya montado (con su
// propio remount interno) y nunca se reflejó — el Dropdown de @vibe/core (downshift
// por debajo) solo lee su prop `inputValue` como valor INICIAL al montarse, así que
// cualquier intento de actualizarlo después de ese primer render, por más remount
// interno que se le agregue, corre el riesgo de un desfasaje de timing entre efectos.
// Remontando el COMPONENTE ENTERO desde el padre en vez de un pedazo interno, el
// Dropdown nuevo nace directo con el valor correcto, sin depender de ningún efecto.
function ExistingRecordSearch({ value, onChange, seedTerm }) {
  const [inputValue, setInputValue] = useState(seedTerm || '')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  // Arranca abierto cuando este montaje vino de un seedTerm — onMenuOpen/onMenuClose
  // lo devuelven al comportamiento normal (foco, click afuera, elegir una opción) apenas
  // el usuario vuelve a interactuar.
  const [menuOpen, setMenuOpen] = useState(Boolean(seedTerm))

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
            departamentoNombre: o.departamentoNombre,
            localidadNombre: o.localidadNombre,
            modelo: o.modelo,
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
        // Refuerzo del seedTerm (ver el comentario grande más arriba): con foco real de
        // verdad en el input, la librería no lo puede llegar a marcar como "blur" nunca.
        autoFocus={Boolean(seedTerm)}
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
        inputValue={inputValue}
        onInputChange={(input) => setInputValue(input ?? '')}
        isMenuOpen={menuOpen}
        onMenuOpen={() => setMenuOpen(true)}
        onMenuClose={() => setMenuOpen(false)}
        placeholder="Escribí un nombre o una cédula..."
        noOptionsMessage={
          inputValue.trim().length < 2 ? 'Escribí para buscar (letras: nombre, números: cédula)' : 'Sin resultados'
        }
        optionRenderer={(option) => (
          <div className="crear-op__cliente-option">
            <div className="crear-op__cliente-option-row">
              <span className="crear-op__cliente-option-main">
                <span className={`crear-op__source-tag crear-op__source-tag--${option.source}`}>
                  {option.source === 'cliente' ? 'Cliente' : 'Oportunidad'}
                </span>
                {option.label}
              </span>
              {option.ci && <span className="crear-op__cliente-option-ci">{option.ci}</span>}
            </div>
            {/* A pedido: el modelo del vehículo de esa Oportunidad, para distinguir de un
                vistazo si esta persona tiene varias — Cliente no tiene esta info. */}
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

// Sin ítem de monday creado todavía (recién se está completando el formulario), así que
// esto solo guarda el File en memoria — la subida real a la columna correspondiente
// (file_mm51jy06 / file_mm5pc008) se hace más adelante, cuando se sepa en qué paso se
// crea efectivamente el ítem.
function FileField({
  label,
  file,
  onChange,
  required = true,
  fullWidth = false,
  highlighted = false,
  // A pedido, estética tipo mockup: caja grande centrada con borde punteado, texto de
  // ayuda y botón con texto propio (Carta Automóvil en el paso 2) — en vez de la caja
  // compacta de siempre (Cédula Identidad en el paso 1). Mismo componente para no
  // duplicar la lógica de drag&drop/preview/limpiar, solo cambia el layout.
  prominent = false,
  helperText,
  buttonLabel,
}) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)

  // A pedido: previsualización cuando el archivo es una imagen (lo más común para la
  // Cédula escaneada/fotografiada) — un PDF no se puede mostrar como thumbnail sin una
  // librería aparte, ahí se sigue mostrando solo el nombre. revokeObjectURL en el
  // cleanup para no dejar URLs colgadas cada vez que cambia el archivo.
  useEffect(() => {
    if (!file || !file.type?.startsWith('image/')) {
      setPreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

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
    <label className={fullWidth ? 'crear-op__field crear-op__field--full' : 'crear-op__field'}>
      {label && <span>{label}{required ? ' *' : ''}</span>}
      <div
        className={[
          'crear-op__file',
          dragOver && 'crear-op__file--drag-over',
          // A pedido: recubrimiento verde de todo el campo — forma visual de avisar que
          // este archivo vino solo (autocompletado de una Oportunidad anterior, ver
          // handleAutofillCedula), no que el usuario lo subió a mano.
          highlighted && 'crear-op__file--highlighted',
          prominent && 'crear-op__file--prominent',
        ]
          .filter(Boolean)
          .join(' ')}
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
        {prominent && !file && helperText && <p className="crear-op__file-helper">{helperText}</p>}
        {previewUrl && <img className="crear-op__file-preview" src={previewUrl} alt="" />}
        <Button kind={prominent ? 'primary' : 'secondary'} onClick={() => inputRef.current?.click()}>
          <MdUploadFile /> {buttonLabel || (file ? 'Cambiar archivo' : 'Subir archivo')}
        </Button>
        {file && (
          <span className="crear-op__file-name">
            {file.name}
            <button
              type="button"
              className="crear-op__file-clear"
              onClick={() => onChange(null)}
              aria-label={`Quitar ${label || 'archivo'}`}
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
  const [resultadoSeleccionado, setResultadoSeleccionado] = useState(null)
  // A pedido: elegir un resultado en el buscador ya NO autocompleta directo — primero
  // se muestra una tarjeta de confirmación con los datos que se van a usar (ver más
  // abajo), y recién al apretar "Usar datos de este..." se aplican de verdad (ver
  // handleConfirmPreview). searchPreview es lo que el usuario tiene elegido en el
  // buscador en este momento, haya confirmado o no todavía — resultadoSeleccionado
  // sigue siendo solo lo YA confirmado (autofill real).
  const [searchPreview, setSearchPreview] = useState(null)
  // A pedido: qué oportunidad anterior (de la lista debajo de la tarjeta de
  // confirmación) está expandida mostrando su detalle — una a la vez, igual que el
  // mockup ("Ocultar detalle" en la que está abierta, "Ver detalle" en el resto).
  const [expandedOppId, setExpandedOppId] = useState(null)
  // A pedido: si la Oportunidad elegida en el buscador ya tenía Cédula Identidad
  // subida, se reusa ese mismo archivo acá (ver handleResultadoSeleccionado/
  // fetchFileColumnAsFile) — este estado solo prende un cartelito mientras se descarga,
  // no bloquea nada del resto del form.
  const [cedulaAutofillLoading, setCedulaAutofillLoading] = useState(false)
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
  // A pedido: cuando la Cédula tipeada a mano resulta duplicada, se manda ese mismo
  // valor al buscador de arriba (ver ExistingRecordSearch/seedTerm) para que aparezcan
  // ahí los resultados reales, en vez de dejar el aviso como único indicio.
  const [duplicadoSeedCi, setDuplicadoSeedCi] = useState('')
  // Contador aparte SOLO para forzar el remount de ExistingRecordSearch (ver su `key`
  // más abajo) — si se usara duplicadoSeedCi solo, repetir la MISMA Cédula dos veces
  // seguidas (ej. limpiar y volver a tipear la misma) no cambia su valor, así que React
  // no vuelve a disparar el remount la segunda vez. El nonce sí cambia siempre.
  const [duplicadoSeedNonce, setDuplicadoSeedNonce] = useState(0)
  // TextField (@vibe/core) mantiene un estado interno propio para el debounce que no se
  // sincroniza al toque cuando su `value` cambia desde AFUERA (no por su propio
  // onChange) — al limpiar Nombre/Apellido/CI/Teléfono de golpe con setForm (ver la
  // cruz de "Buscar Persona" más abajo) quedan un instante desincronizados con el
  // ícono ya recalculado, y esa combinación hace que el componente tire una excepción
  // (pantalla en blanco). Igual que con el Dropdown de ExistingRecordSearch, forzarlos
  // a remontar de cero (key) evita el problema.
  const [textFieldsResetKey, setTextFieldsResetKey] = useState(0)

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  // Al elegir un resultado (Cliente u Oportunidad), se completan Nombre/Apellido/CI y se
  // abre el resto del formulario. El tablero Clientes no tiene columnas separadas de
  // Nombre/Apellido (solo el nombre completo, ver splitNombreApellido); Oportunidades sí
  // las tiene, así que ahí se usan directo, sin adivinar dónde corta el nombre.
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
    if (resultado.source === 'oportunidad') {
      // A pedido: Fecha Nacimiento, Teléfono, Departamento y Localidad también se
      // autocompletan acá — Cliente no tiene esas columnas (ver mapClienteItem/
      // mondayApi.js), así que es exclusivo del caso Oportunidad. Departamento/Localidad
      // vienen como nombre (display_value de un board_relation, ver mondayApi.js), hay
      // que matchearlos contra la lista real para sacar el id que necesita el Dropdown
      // — mismo criterio que ya usa cotizarFields.js para los campos "connected".
      const { codigoPais, telefono } = splitTelefono(resultado.telefono, resultado.telefonoCountryShortName)
      const departamentoMatch = (schema?.departamentos ?? []).find(
        (d) => d.name.toLowerCase() === (resultado.departamentoNombre || '').toLowerCase()
      )
      const localidadMatch = (schema?.localidades ?? []).find(
        (l) => l.name.toLowerCase() === (resultado.localidadNombre || '').toLowerCase()
      )
      setForm((prev) => ({
        ...prev,
        nombre: resultado.nombre || prev.nombre,
        apellido: resultado.apellido || prev.apellido,
        ci: resultado.ci || prev.ci,
        fechaNacimiento: resultado.fechaNacimiento || prev.fechaNacimiento,
        codigoPais: codigoPais || prev.codigoPais,
        telefono: telefono || prev.telefono,
        departamentoId: departamentoMatch?.id ?? prev.departamentoId,
        localidadId: localidadMatch?.id ?? prev.localidadId,
      }))
      // A pedido: si esa Oportunidad ya tenía Cédula Identidad subida, se reusa acá
      // también — Clientes no tiene esta columna, así que es exclusivo del caso
      // Oportunidad (mismo criterio que Fecha Nacimiento/Teléfono/Departamento más
      // arriba). Fire-and-forget: no bloquea el resto del autocompletado ni la
      // confirmación si tarda o si esa Oportunidad no tenía archivo.
      handleAutofillCedula(resultado.id)
    } else {
      const { nombre, apellido } = splitNombreApellido(resultado.name)
      setForm((prev) => ({ ...prev, nombre, apellido, ci: resultado.ci || prev.ci }))
    }
  }

  // Descarga la Cédula Identidad ya subida en una Oportunidad anterior y la deja como si
  // el usuario la hubiera elegido a mano (ver handleCedulaIdentidadChange, sin cambios —
  // mismo File, misma lógica de subida diferida). Si esa Oportunidad no tenía archivo,
  // fetchFileColumnAsFile devuelve null y acá no se hace nada — no hay nada raro que
  // avisar, simplemente no había Cédula para reusar.
  const handleAutofillCedula = async (itemId) => {
    setCedulaAutofillLoading(true)
    try {
      const file = await fetchFileColumnAsFile(itemId, 'file_mm5pc008')
      if (file) await handleCedulaIdentidadChange(file, true)
    } catch {
      // Silencioso — la descarga falló, el usuario sigue pudiendo subirla a mano como
      // si este intento nunca hubiera pasado.
    } finally {
      setCedulaAutofillLoading(false)
    }
  }

  // onChange de ExistingRecordSearch — a diferencia de antes, elegir un resultado acá
  // NO autocompleta directo, solo lo deja "en preview" (ver la tarjeta de confirmación
  // más abajo en el JSX). La cruz (resultado null) sí deshace de una un autocompletado
  // ya confirmado — no tiene sentido esperar una segunda confirmación para limpiar.
  const handleSearchPreview = (resultado) => {
    setSearchPreview(resultado)
    if (!resultado) handleResultadoSeleccionado(null)
  }

  // "Usar datos de este cliente/oportunidad" en la tarjeta de confirmación — recién acá
  // se aplica el autocompletado real (handleResultadoSeleccionado, sin cambios).
  const handleConfirmPreview = () => {
    if (searchPreview) handleResultadoSeleccionado(searchPreview)
  }

  // "No lo encuentro" — abre el resto del formulario para completarlo a mano, sin ningún
  // resultado elegido (limpia Nombre/Apellido/CI por si venían de una búsqueda anterior).
  const handleSaltearBusqueda = () => {
    setResultadoSeleccionado(null)
    setSearchPreview(null)
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
          // El seed del buscador (ver seedTerm/handleCloseDuplicadoModal más abajo) se
          // dispara recién al CERRAR este modal, no acá — mientras el modal está abierto
          // atrapa el foco, y el buscador (que nunca llega a tener el foco real) queda
          // marcado como "perdió el foco" por la librería y se resetea solo.
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

  // "Cancelar" — cierra el popup de Cédula duplicada sin tocar el buscador de arriba,
  // el usuario sigue completando el form a mano como si el aviso no hubiera aparecido.
  const handleCancelDuplicadoModal = () => {
    setShowDuplicadoModal(false)
  }

  // "Continuar" — cierra el popup Y recién ahí siembra el buscador de arriba con esa
  // misma Cédula (ver seedTerm en ExistingRecordSearch) — con el modal todavía abierto
  // el buscador no llega a abrirse de verdad (ver el comentario en el useEffect de
  // arriba). El setTimeout es necesario: Modal usa react-focus-lock con
  // returnFocus=true, que al cerrarse devuelve el foco al campo de CI (donde estaba
  // escribiendo el usuario) en un timeout propio de esa librería — si sembramos ANTES
  // de que eso termine, el buscador alcanza a tener el foco un instante y despues se lo
  // vuelven a sacar, y downshift (la librería del Dropdown) lo toma como que perdió el
  // foco y resetea todo solo. 100ms le da tiempo de sobra a que termine primero.
  const handleContinueDuplicadoModal = () => {
    setShowDuplicadoModal(false)
    setTimeout(() => {
      setDuplicadoSeedCi(form.ci)
      setDuplicadoSeedNonce((n) => n + 1)
    }, 100)
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

  // Mismo componente Stepper.jsx que usa OpportunityDetail (círculos numerados + línea
  // de progreso), en vez de las pills propias que tenía este form antes — a pedido, para
  // que la estética de "pasos" sea consistente en toda la app. El paso 2 se sigue
  // ocultando hasta que el paso 1 esté completo (antes no hay a dónde ir).
  const stepperSteps = STEPS.map((s, index) => ({
    key: s.key,
    label: stepLabels[index],
    status: index < stepIndex ? 'done' : index === stepIndex ? 'active' : 'pending',
    clickable: index < stepIndex || (index > stepIndex && isStepValid(index - 1)),
  })).filter((_, index) => index !== 1 || isStepValid(0))

  // El resultado en preview ya está confirmado (autocompletado real aplicado) cuando
  // coincide con resultadoSeleccionado — gatea si se muestra la tarjeta de confirmación
  // (sin confirmar) o el cartelito de "ya se completó" (confirmado).
  const previewConfirmed = Boolean(
    resultadoSeleccionado &&
      searchPreview &&
      resultadoSeleccionado.source === searchPreview.source &&
      resultadoSeleccionado.id === searchPreview.id
  )

  // A pedido: mostrar las oportunidades anteriores de la persona elegida en el
  // buscador — reusa `opportunities` (App.jsx ya lo trae completo y mapeado, ver
  // opportunityMapper.js, mismos datos que la tabla principal) en vez de armar una
  // consulta nueva a monday. Se matchea por CI (mismo criterio que
  // countOportunidadesByCedula/findClienteByCedula, ver mondayApi.js).
  const previousOportunidades =
    searchPreview?.ci && opportunities
      ? opportunities.filter((o) => o.ci && stripCi(o.ci) === stripCi(searchPreview.ci))
      : []

  return (
    <div className="crear-op">
      <div className="crear-op__card">
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
            {/* A pedido: sin la pregunta previa "¿El cliente ya existe?" — un único
                buscador (CI o nombre) que trae resultados de los 2 tableros a la vez
                (Cliente y Oportunidad, diferenciados con una etiqueta en cada opción,
                ver ExistingRecordSearch) y completa Nombre/Apellido/CI al elegir uno. Si
                no aparece nada, "Saltear" abre el resto del formulario para cargarlo a
                mano. */}
            <label className="crear-op__field crear-op__field--full">
              <span>Buscar Persona</span>
              <ExistingRecordSearch
                key={duplicadoSeedNonce}
                value={searchPreview}
                onChange={handleSearchPreview}
                seedTerm={duplicadoSeedCi}
              />
              {/* A pedido: elegir un resultado ya no autocompleta directo — se muestra
                  primero esta tarjeta con los datos que se van a usar, y recién al
                  apretar "Usar datos de este..." se aplican de verdad (estética tipo
                  mockup: avatar con iniciales, nombre, CI/Tel/Departamento en una línea,
                  botón de confirmación). */}
              {searchPreview && !previewConfirmed && (
                <div className="crear-op__preview-card">
                  <span className="crear-op__preview-avatar">{initialsOf(searchPreview.name)}</span>
                  <div className="crear-op__preview-info">
                    <span className="crear-op__preview-name">{searchPreview.name}</span>
                    <span className="crear-op__preview-meta">
                      {[
                        searchPreview.ci && `CI ${searchPreview.ci}`,
                        searchPreview.telefono && `Tel ${searchPreview.telefono}`,
                        searchPreview.departamentoNombre,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <Button kind="tertiary" className="crear-op__preview-btn" onClick={handleConfirmPreview}>
                    Usar datos de {searchPreview.source === 'cliente' ? 'este cliente' : 'esta oportunidad'}{' '}
                    <MdArrowForward />
                  </Button>
                </div>
              )}
              {/* A pedido: oportunidades anteriores de la persona elegida (mismo criterio
                  de CI que el chequeo de duplicado) — reusa `opportunities`, ya cargado y
                  mapeado por App.jsx, sin pegarle a monday de nuevo (ver
                  previousOportunidades más arriba). Una expandida a la vez. */}
              {searchPreview && previousOportunidades.length > 0 && (
                <div className="crear-op__historial">
                  <span className="crear-op__historial-title">
                    <MdEventNote /> Oportunidades anteriores de{' '}
                    {searchPreview.source === 'cliente' ? 'este cliente' : 'esta persona'}
                  </span>
                  {previousOportunidades.map((o) => {
                    const isExpanded = expandedOppId === o.id
                    const companias = o.companias !== '—' ? o.companias.split(', ') : []
                    return (
                      <div className="crear-op__historial-item" key={o.id}>
                        <div className="crear-op__historial-row">
                          <span className="crear-op__historial-date">{o.ultimaCotizacion}</span>
                          <span className="crear-op__historial-desc">{o.bienLinea1}</span>
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
                        {isExpanded && (
                          <div className="crear-op__historial-detail">
                            <div className="crear-op__historial-detail-header">
                              <span className="crear-op__historial-detail-title">{o.oppNumber} — Detalle del bien</span>
                              <StatusBadge label={o.estadoLabel} color={o.estadoColor} />
                            </div>
                            <div className="crear-op__historial-detail-grid">
                              <div className="crear-op__historial-detail-box">
                                <span className="crear-op__historial-detail-label">Bien asegurado</span>
                                <strong>{o.bienLinea1}</strong>
                                {o.bienLinea2 && <span>{o.bienLinea2}</span>}
                              </div>
                              <div className="crear-op__historial-detail-box">
                                <span className="crear-op__historial-detail-label">Compañías cotizadas</span>
                                {companias.length > 0 && (
                                  <div className="crear-op__historial-companias">
                                    {companias.map((c) => (
                                      <span key={c} className="crear-op__historial-compania-tag">
                                        {c}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <span>Última cotización: {o.ultimaCotizacion}</span>
                              </div>
                            </div>
                            <Button kind="primary" onClick={() => onOpenOportunidad?.(o.id)}>
                              Ir a esta oportunidad <MdArrowForward />
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {previewConfirmed && (
                <span className="crear-op__autofill">
                  {resultadoSeleccionado.source === 'cliente' ? 'Cliente' : 'Oportunidad'} seleccionado:{' '}
                  {resultadoSeleccionado.name} — se completaron{' '}
                  {resultadoSeleccionado.source === 'oportunidad'
                    ? 'Nombre/Apellido/CI/Fecha Nacimiento/Teléfono/Departamento/Localidad'
                    : 'Nombre/Apellido/CI'}{' '}
                  abajo, revisalos antes de continuar.
                </span>
              )}
              {!busquedaResuelta && (
                <Button kind="tertiary" className="crear-op__skip-btn" onClick={handleSaltearBusqueda}>
                  Buscar manualmente <MdArrowForward />
                </Button>
              )}
            </label>

            {/* A pedido: estética tipo mockup para los popups de confirmación — ícono en
                círculo celeste, título y descripción en el cuerpo, "Cancelar" +
                acción primaria abajo a la derecha, en vez del AttentionBox con un solo
                botón "Entendido" de antes. Solo corre si no hay un resultado ya elegido
                a propósito (ver el useEffect debounced). "Cancelar" cierra sin tocar el
                buscador; "Continuar" lo siembra con la Cédula (ver handleContinue/
                handleCancelDuplicadoModal). */}
            {busquedaResuelta && !resultadoSeleccionado && showDuplicadoModal && duplicadoCheck && (
              <Modal id="duplicado-cedula-modal" show onClose={handleCancelDuplicadoModal} size="small">
                <ModalContent className="confirm-modal__content">
                  <span className="confirm-modal__icon">
                    <MdSearch />
                  </span>
                  <h2 className="confirm-modal__title">Esta cédula ya tiene actividad cargada</h2>
                  <p className="confirm-modal__desc">
                    {duplicadoCheck.cliente &&
                      `Ya existe un cliente con esta cédula: ${duplicadoCheck.cliente.name}. `}
                    {duplicadoCheck.count > 0 &&
                      `Esta cédula tiene ${duplicadoCheck.count} ${
                        duplicadoCheck.count === 1 ? 'oportunidad consultada' : 'oportunidades consultadas'
                      }.`}
                  </p>
                </ModalContent>
                <ModalFooter
                  secondaryButton={{ text: 'Cancelar', onClick: handleCancelDuplicadoModal }}
                  primaryButton={{ text: 'Continuar', onClick: handleContinueDuplicadoModal }}
                />
              </Modal>
            )}

            {busquedaResuelta && (
              <>
                {/* A pedido: estética tipo mockup — campos agrupados en secciones con
                    encabezado propio (Datos personales/Contacto/Ubicación/Documentación/
                    Datos de la oportunidad) en vez de una sola grilla plana. */}
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

                <div className="crear-op__section">
                  <h3 className="crear-op__section-title">Documentación</h3>
                  <div className="crear-op__fields--grid">
                    {/* A pedido: Cédula Identidad se pide acá, en el paso 1, en vez de
                        repetida en las 2 ramas del paso 2 (Posee Vehículo Sí/No) —
                        opcional, no bloquea avanzar. El archivo queda en memoria hasta
                        que exista el ítem (se crea recién en el paso 2 o al guardar);
                        handleGuardar tiene el fallback que lo sube si todavía no se
                        subió para entonces. */}
                    <FileField
                      label="Cédula Identidad"
                      required={false}
                      file={form.cedulaIdentidad}
                      onChange={handleCedulaIdentidadChange}
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

                <div className="crear-op__section">
                  <h3 className="crear-op__section-title">Datos de la oportunidad</h3>
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
              </>
            )}
          </div>
        )}

        {stepIndex === 1 && (
          <div className="crear-op__fields">
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
                    centrada (prominent) mientras no hay archivo, o si la lectura
                    anterior falló (para poder reintentar con otro). El resto del tiempo
                    (procesando/leído) no hace falta — el estado de abajo ya lo cubre. */}
                {(!form.cartaAutomovil || lecturaEstado === 'Error') && (
                  <FileField
                    file={form.cartaAutomovil}
                    onChange={handleCartaAutomovilChange}
                    prominent
                    helperText="Subí una foto o PDF de la cédula para autocompletar el vehículo."
                    buttonLabel="Adjuntar Cédula / Carta"
                  />
                )}

                {(lecturaEstado === 'subiendo' ||
                  lecturaEstado === 'confirmando' ||
                  lecturaEstado === 'Leer' ||
                  lecturaEstado === 'Leyendo') && (
                  <div className="crear-op__lectura-analyzing">
                    <Loader size={20} className="crear-op__lectura-analyzing-spinner" />
                    <div>
                      <strong>Analizando cédula del vehículo...</strong>
                      <span>
                        {lecturaEstado === 'subiendo' && 'Subiendo el archivo...'}
                        {lecturaEstado === 'confirmando' && 'Confirmando...'}
                        {lecturaEstado === 'Leer' && 'En cola para leer el documento...'}
                        {lecturaEstado === 'Leyendo' &&
                          'Extrayendo Marca, Modelo y Año con Inteligencia Artificial.'}
                      </span>
                    </div>
                  </div>
                )}

                {/* A pedido: subir el archivo NO dispara la lectura sola — queda en
                    "subido" hasta que se confirma acá, para poder revisar que se subió
                    lo que corresponde antes de que el robot lo procese. */}
                {/* A pedido: tarjeta propia (mismo lenguaje visual que
                    crear-op__lectura-analyzing/summary de acá abajo) en vez del
                    AttentionBox genérico de antes. */}
                {lecturaEstado === 'subido' && (
                  <div className="crear-op__lectura-subido">
                    <p>
                      Archivo subido. Confirmá para iniciar la lectura automática de Carta
                      Automóvil / Cédula Automovil.
                    </p>
                    <Button kind="secondary" onClick={handleConfirmarLectura}>
                      Confirmar lectura
                    </Button>
                  </div>
                )}

                {/* A pedido: si la lectura falla, en vez de trabar el formulario se avisa
                    en amarillo (mismo color que los campos resaltados de abajo, ver
                    VehiculoManualFields#highlightEmpty) y se completa/corrige lo que
                    haga falta a mano — mismos campos que el caso "No". */}
                {lecturaEstado === 'Error' && (
                  <>
                    <AttentionBox type="warning">
                      No pudimos leer todos los datos del documento. Por favor, completá
                      manualmente los campos resaltados en amarillo.
                    </AttentionBox>
                    {lecturaError && (
                      <div className="crear-op__error-detail">
                        <strong>Detalle del error:</strong>
                        <pre>{lecturaError}</pre>
                      </div>
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
                    También se usa para "Editar datos" del resumen de arriba. */}
                {lecturaEstado === 'Leidos' && (!vehiculoLeidoCompleto || editingLeidos) && (
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
