// Helpers de datos personales (teléfono, CI, fecha de nacimiento, nombre) — antes
// vivían adentro de CrearOportunidadForm.jsx (auditoría: extraídos para poder
// reusarlos desde CotizarStepPanel/ClientFicha sin duplicar).


// Uruguay por default (mercado principal de la app), pero editable por si hace falta
// cargar un cliente con otro código — no hay columna real de monday detrás todavía.
// A pedido: código de país compacto con bandera (ver FlagIcon.jsx: SVG, porque los
// emoji de banderas no se ven en Windows). `label` es el texto plano (búsqueda/lectores
// de pantalla); lo visual lo arman valueRenderer/optionRenderer en TelefonoField y
// EditarContactoModal.
export const CODIGO_PAIS_OPTIONS = [
  { value: '+598', label: '+598 Uruguay', iso: 'UY', pais: 'Uruguay' },
  { value: '+54', label: '+54 Argentina', iso: 'AR', pais: 'Argentina' },
  { value: '+55', label: '+55 Brasil', iso: 'BR', pais: 'Brasil' },
  { value: '+595', label: '+595 Paraguay', iso: 'PY', pais: 'Paraguay' },
  { value: '+56', label: '+56 Chile', iso: 'CL', pais: 'Chile' },
]

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
export const CODIGO_PAIS_BY_COUNTRY_SHORT_NAME = Object.fromEntries(
  Object.entries(COUNTRY_SHORT_NAMES).map(([codigo, short]) => [short, codigo])
)

// El teléfono de una Oportunidad ya cargada viene como un solo string de dígitos con el
// código de país pegado adelante, sin separador (ej. "5492281580112") — para
// autocompletar el campo de acá (que espera el código de país aparte, ver Teléfono más
// abajo) hay que sacarle esos dígitos del principio. Si el código de país no se reconoce
// o no matchea el prefijo, se devuelve tal cual — mejor mostrar el dato crudo (y que la
// validación existente avise si no cierra) que perder el teléfono directamente.
export function splitTelefono(rawPhone, countryShortName) {
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
export function stripCi(value) {
  return value.replace(/[.\-\s]/g, '')
}

// Validaciones con mensaje — a diferencia del resto (que solo chequean "no vacío"),
// estos 3 campos necesitan validar el FORMATO del dato, no solo su presencia.
export function ciError(value) {
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
export function fechaError(value) {
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
export function maxFechaNacimiento() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return d.toISOString().slice(0, 10)
}

// Cantidad de dígitos esperada del número (sin el código de país) para cada país
// soportado — Uruguay usa el formato "09X XXX XXX" (9 dígitos).
export const PHONE_DIGIT_LENGTHS = {
  '+598': 9,
  '+54': 10,
  '+55': 11,
  '+595': 9,
  '+56': 9,
}

export function telefonoError(value, codigoPais) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  const expected = PHONE_DIGIT_LENGTHS[codigoPais]
  if (!expected) return null
  if (digits.length !== expected) return `El teléfono debe tener ${expected} dígitos.`
  return null
}

// Marca sutilmente el campo (borde verde/rojo) según su estado — sin tocar todavía, ni
// error, ni válido: no hay nada que señalar antes de que el usuario haya cargado algo.
export function fieldStateClass(value, error) {
  if (!value) return ''
  return error ? ' crear-op__field--invalid' : ' crear-op__field--valid'
}

// El tablero Clientes no tiene columnas separadas de Nombre/Apellido, solo el nombre del
// ítem entero (ej. "Lucía Soledad Martínez") — se parte en la primera palabra (Nombre) y
// el resto (Apellido) para precargar el formulario. Es una aproximación (nombres
// compuestos pueden partirse distinto a como se cargaron originalmente), pero los 2
// campos quedan editables después así que se puede corregir a mano si hace falta.
export function splitNombreApellido(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { nombre: fullName.trim(), apellido: '' }
  return { nombre: parts[0], apellido: parts.slice(1).join(' ') }
}

// El escenario de Make que lee la Cédula de Identidad con IA (ver
// mondayApi.js#leerCedula) puede devolver la fecha como texto "dd/mm/aaaa" (formato
// que suele traer una CI uruguaya) en vez del "aaaa-mm-dd" que espera el
// <input type="date"> de acá — se convierte si matchea ese patrón; si no, se deja tal
// cual (el popup de "Editar" deja corregirla a mano si hace falta).
export function normalizeFechaIA(raw) {
  const value = (raw ?? '').trim()
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!match) return value
  const [, d, m, y] = match
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Payload que espera la columna "phone" de monday (phone_mm519m27 en Oportunidades,
// CONTACTO_TELEFONO_COLUMN_ID en Clientes): código de país + número, solo dígitos, y el
// countryShortName. Antes estaba copiado 3 veces en CrearOportunidadForm.jsx.
export function buildMondayPhone(codigoPais, telefono) {
  return {
    phone: `${(codigoPais ?? '').replace('+', '')}${(telefono ?? '').replace(/\D/g, '')}`,
    countryShortName: COUNTRY_SHORT_NAMES[codigoPais] ?? 'UY',
  }
}

// Iniciales para avatares: primera letra del primer y del último "token" (ej. "Santiago
// González" -> "SG"; "María Clara Pérez" -> "MP"), para no quedar con 1 sola letra en
// nombres compuestos ni con demasiadas en nombres de 3+ palabras. Antes había 3
// versiones (Sidebar.jsx, ClientFicha.jsx y OpportunitiesTable.jsx tomaban las 2
// primeras letras del nombre, "SA").
export function initialsOf(name) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

// Email (opcional): si se carga, tiene que tener formato válido. Chequeo simple
// (algo@algo.algo), sin pretender validar contra el RFC entero.
export function emailError(value) {
  const v = (value ?? '').trim()
  if (!v) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'El email no tiene un formato válido (ej: nombre@dominio.com).'
  return null
}

// Payload de una columna "email" de monday (email_mm6539g3 en Clientes): {email, text}.
export function buildMondayEmail(email) {
  const v = (email ?? '').trim()
  return { email: v, text: v }
}
