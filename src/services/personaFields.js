// Helpers de datos personales (teléfono, CI, fecha de nacimiento, nombre) — antes
// vivían adentro de CrearOportunidadForm.jsx (auditoría: extraídos para poder
// reusarlos desde CotizarStepPanel/ClientFicha sin duplicar).


// LOG-06 / LOG-08: label real de la columna Nacionalidad del tablero Clientes
// (dropdown_mm6zq8bg). Es el default de cualquier persona no extranjera y lo que se
// completa solo cuando la cédula leída con IA trae un departamento uruguayo.
export const NACIONALIDAD_URUGUAY = 'URUGUAY'

// Uruguay por default (mercado principal de la app), pero editable por si hace falta
// cargar un cliente con otro código — no hay columna real de monday detrás todavía.
// A pedido: código de país compacto con bandera (ver FlagIcon.jsx: SVG, porque los
// emoji de banderas no se ven en Windows). `label` es el texto plano (búsqueda/lectores
// de pantalla); lo visual lo arman valueRenderer/optionRenderer en ContactoFields.
//
// A pedido (validación por país): cada país dice cómo se escribe un celular ahí y cómo
// queda para WhatsApp. El escenario de Make que manda la cotización usa el número tal
// cual ("+" + lo guardado), así que lo que se guarda tiene que ser ya el formato
// internacional: código de país + número, SIN los agregados de marcación local.
//   - `normalizar(digitos)`: recibe lo que se tipeó (solo dígitos, sin el código de
//     país) y devuelve el número nacional como lo quiere WhatsApp, o null si no cierra.
//     Saca lo que se marca adentro del país (el 0 de Uruguay/Paraguay/Ecuador, el 15 de
//     Argentina) y agrega lo que WhatsApp exige (el 9 de los celulares argentinos).
//   - `ayuda`: el mensaje de error, con el formato esperado.
// Los cinco de siempre (Uruguay, Argentina, Brasil, Paraguay, Chile) tienen reglas
// estrictas porque se conocen bien; el resto valida el largo del celular y que empiece
// como empiezan los celulares de ese país.
const sinCero = (d) => d.replace(/^0+/, '')

// Argentina: el celular para WhatsApp es 9 + código de área + número (10 dígitos sin el
// 9). Se acepta como se suele tipear: con o sin 0 adelante, con o sin el 9, y con el 15
// después del código de área ("011 15 2345 6789"). El código de área es de 2 dígitos
// solo para el 11 (AMBA); el resto, de 3 o 4.
function normalizarArgentina(digitos) {
  let d = sinCero(digitos)
  if (d.length === 11 && d.startsWith('9')) d = d.slice(1)
  if (d.length === 12) {
    const largosArea = d.startsWith('11') ? [2] : [3, 4]
    const area = largosArea.find((a) => d.slice(a, a + 2) === '15')
    if (area) d = d.slice(0, area) + d.slice(area + 2)
  }
  // Sin código de área ("15 2345 6789") no se puede saber de dónde es: no cierra.
  if (d.length !== 10 || d.startsWith('15')) return null
  return `9${d}`
}

const PAISES_TELEFONO = [
  {
    value: '+598',
    iso: 'UY',
    pais: 'Uruguay',
    ejemplo: '099 123 456',
    // 09X XXX XXX: para WhatsApp va sin el 0 (598 9X XXX XXX).
    normalizar: (d) => (/^9\d{7}$/.test(sinCero(d)) ? sinCero(d) : null),
    ayuda: 'El celular uruguayo es 09X XXX XXX (9 dígitos con el 0, u 8 sin el 0).',
  },
  {
    value: '+54',
    iso: 'AR',
    pais: 'Argentina',
    ejemplo: '11 2345 6789',
    normalizar: normalizarArgentina,
    ayuda:
      'El celular argentino es código de área + número: 10 dígitos (ej. 11 2345 6789). El 0, el 9 y el 15 se pueden poner o no.',
  },
  {
    value: '+55',
    iso: 'BR',
    pais: 'Brasil',
    ejemplo: '11 91234 5678',
    // DDD (2) + número: 9 dígitos que empiezan con 9 los celulares; 8 los de antes.
    normalizar: (d) => (/^[1-9]{2}9?\d{8}$/.test(sinCero(d)) ? sinCero(d) : null),
    ayuda: 'El teléfono brasileño es DDD + número: 11 dígitos (ej. 11 91234 5678), o 10 los más viejos.',
  },
  {
    value: '+595',
    iso: 'PY',
    pais: 'Paraguay',
    ejemplo: '0981 123 456',
    normalizar: (d) => (/^9\d{8}$/.test(sinCero(d)) ? sinCero(d) : null),
    ayuda: 'El celular paraguayo es 09XX XXX XXX (10 dígitos con el 0, o 9 sin el 0).',
  },
  {
    value: '+56',
    iso: 'CL',
    pais: 'Chile',
    ejemplo: '9 1234 5678',
    normalizar: (d) => (/^9\d{8}$/.test(sinCero(d)) ? sinCero(d) : null),
    ayuda: 'El celular chileno es 9 XXXX XXXX (9 dígitos, empieza con 9).',
  },
  {
    value: '+51',
    iso: 'PE',
    pais: 'Perú',
    ejemplo: '912 345 678',
    normalizar: (d) => (/^9\d{8}$/.test(d) ? d : null),
    ayuda: 'El celular peruano es 9XX XXX XXX (9 dígitos, empieza con 9).',
  },
  {
    value: '+591',
    iso: 'BO',
    pais: 'Bolivia',
    ejemplo: '712 34567',
    normalizar: (d) => (/^[67]\d{7}$/.test(d) ? d : null),
    ayuda: 'El celular boliviano tiene 8 dígitos y empieza con 6 o 7.',
  },
  {
    value: '+57',
    iso: 'CO',
    pais: 'Colombia',
    ejemplo: '312 345 6789',
    normalizar: (d) => (/^3\d{9}$/.test(d) ? d : null),
    ayuda: 'El celular colombiano es 3XX XXX XXXX (10 dígitos, empieza con 3).',
  },
  {
    value: '+593',
    iso: 'EC',
    pais: 'Ecuador',
    ejemplo: '099 123 4567',
    normalizar: (d) => (/^9\d{8}$/.test(sinCero(d)) ? sinCero(d) : null),
    ayuda: 'El celular ecuatoriano es 09X XXX XXXX (10 dígitos con el 0, o 9 sin el 0).',
  },
  {
    value: '+58',
    iso: 'VE',
    pais: 'Venezuela',
    ejemplo: '0412 123 4567',
    normalizar: (d) => (/^4\d{9}$/.test(sinCero(d)) ? sinCero(d) : null),
    ayuda: 'El celular venezolano es 04XX XXX XXXX (11 dígitos con el 0, o 10 sin el 0).',
  },
  {
    value: '+52',
    iso: 'MX',
    pais: 'México',
    ejemplo: '55 1234 5678',
    // 10 dígitos. El "1" que se usaba antes para los celulares (52 1 …) ya no va.
    normalizar: (d) => {
      const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
      return /^\d{10}$/.test(n) ? n : null
    },
    ayuda: 'El teléfono mexicano tiene 10 dígitos (ej. 55 1234 5678).',
  },
  {
    value: '+506',
    iso: 'CR',
    pais: 'Costa Rica',
    ejemplo: '8312 3456',
    normalizar: (d) => (/^[5-8]\d{7}$/.test(d) ? d : null),
    ayuda: 'El celular costarricense tiene 8 dígitos.',
  },
  {
    value: '+507',
    iso: 'PA',
    pais: 'Panamá',
    ejemplo: '6123 4567',
    normalizar: (d) => (/^6\d{7}$/.test(d) ? d : null),
    ayuda: 'El celular panameño tiene 8 dígitos y empieza con 6.',
  },
  {
    value: '+502',
    iso: 'GT',
    pais: 'Guatemala',
    ejemplo: '5123 4567',
    normalizar: (d) => (/^\d{8}$/.test(d) ? d : null),
    ayuda: 'El teléfono guatemalteco tiene 8 dígitos.',
  },
  {
    value: '+503',
    iso: 'SV',
    pais: 'El Salvador',
    ejemplo: '7012 3456',
    normalizar: (d) => (/^\d{8}$/.test(d) ? d : null),
    ayuda: 'El teléfono salvadoreño tiene 8 dígitos.',
  },
  {
    value: '+504',
    iso: 'HN',
    pais: 'Honduras',
    ejemplo: '9123 4567',
    normalizar: (d) => (/^\d{8}$/.test(d) ? d : null),
    ayuda: 'El teléfono hondureño tiene 8 dígitos.',
  },
  {
    value: '+505',
    iso: 'NI',
    pais: 'Nicaragua',
    ejemplo: '8123 4567',
    normalizar: (d) => (/^\d{8}$/.test(d) ? d : null),
    ayuda: 'El teléfono nicaragüense tiene 8 dígitos.',
  },
  {
    value: '+53',
    iso: 'CU',
    pais: 'Cuba',
    ejemplo: '5123 4567',
    normalizar: (d) => (/^5\d{7}$/.test(d) ? d : null),
    ayuda: 'El celular cubano tiene 8 dígitos y empieza con 5.',
  },
]

const PAIS_POR_CODIGO = Object.fromEntries(PAISES_TELEFONO.map((p) => [p.value, p]))

export const CODIGO_PAIS_OPTIONS = PAISES_TELEFONO.map(({ value, iso, pais }) => ({
  value,
  label: `${value} ${pais}`,
  iso,
  pais,
}))

const COUNTRY_SHORT_NAMES = Object.fromEntries(PAISES_TELEFONO.map((p) => [p.value, p.iso]))

// Placeholder del campo según el país elegido.
export function ejemploTelefono(codigoPais) {
  return `Ej: ${PAIS_POR_CODIGO[codigoPais]?.ejemplo ?? PAIS_POR_CODIGO['+598'].ejemplo}`
}

// Lo tipeado → el número nacional listo para WhatsApp (sin el código de país), o null si
// no tiene la forma de un celular de ese país. Si se pegó el número entero con el
// código de país adelante ("+54 9 11 …" con +54 elegido), se le saca.
export function normalizarTelefono(value, codigoPais) {
  let d = String(value ?? '').replace(/\D/g, '')
  if (!d) return null
  const pais = PAIS_POR_CODIGO[codigoPais]
  const prefijo = String(codigoPais ?? '').replace('+', '')
  if (!pais) return d.length >= 6 && d.length <= 14 ? d : null
  const directo = pais.normalizar(d)
  if (directo) return directo
  if (prefijo && d.startsWith(prefijo)) return pais.normalizar(d.slice(prefijo.length))
  return null
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

// El RUT uruguayo son 12 dígitos. Acá se exige el largo, a diferencia de ciError, por
// una razón concreta: la búsqueda de duplicados clasifica el número por su pinta (ver
// tipoDeTerminoNumerico) y con menos de 11 dígitos lo toma por otra cosa, así que un RUT
// a medias no encuentra la empresa que ya está cargada y el duplicado entra igual.
export function rutError(value) {
  if (!value) return null
  const digits = stripCi(value)
  if (!/^\d+$/.test(digits)) return 'El RUT debe contener solo números (podés incluir puntos y guion).'
  if (digits.length !== 12) return 'El RUT tiene 12 dígitos.'
  return null
}

// Qué documento pide el alta según el tipo de cliente. Una empresa no tiene cédula: su
// documento es el RUT y vive en su propia columna del tablero Clientes. Tenerlos
// separados no es cosmético — la búsqueda de duplicados mira cada uno en su columna, así
// que un RUT guardado como CI no encontraría a la empresa que ya existe.
export function documentoDelTipoCliente(tipoCliente) {
  return tipoCliente === 'Empresa'
    ? { label: 'RUT', placeholder: 'Ej: 216261300015', validar: rutError }
    : { label: 'CI', placeholder: 'Ej: 4.123.456-7', validar: ciError }
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

// Lo que se compara para detectar un teléfono repetido: los últimos 8 dígitos (monday
// guarda números de antes con y sin el 0 de Uruguay, y así coinciden igual). Lo tipeado
// se normaliza ANTES de cortar: un celular argentino tipeado con el 15 ("2281 15 58
// 0112") se guarda sin el 15, y su cola cruda ("15580112") no coincidiría con la
// guardada ("81580112"). Sin código de país (lo que viene de monday), los dígitos tal cual.
export function colaTelefono(telefono, codigoPais) {
  const d = (codigoPais && normalizarTelefono(telefono, codigoPais)) || String(telefono ?? '').replace(/\D/g, '')
  return d.slice(-8)
}

// A pedido: ya no es un largo fijo por país (rechazaba el celular uruguayo sin el 0, o
// el argentino con el 9 o el 15): se acepta si tiene la forma de un celular del país
// elegido, se escriba como se escriba (ver normalizarTelefono).
export function telefonoError(value, codigoPais) {
  if (!value) return null
  if (normalizarTelefono(value, codigoPais)) return null
  return PAIS_POR_CODIGO[codigoPais]?.ayuda ?? 'El teléfono tiene que tener entre 6 y 14 dígitos.'
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

// Reunión del 24/09: si una búsqueda de contacto no encuentra nada, se ofrece crearlo con
// lo que se buscó. Lo usan el alta (ContactoFields), la sección Contactos y la ficha del
// cliente. Un término que es un número se toma como celular (con su código de país si lo
// trae, "+54 11..."); uno con "@", como email; cualquier otra cosa, como el nombre.
export const pareceTelefono = (termino) => /^\+?[\d\s().-]{6,}$/.test(String(termino ?? '').trim())
const pareceEmail = (termino) => String(termino ?? '').includes('@')

export function contactoDesdeBusqueda(termino, codigoPaisPorDefecto) {
  const limpio = String(termino ?? '').trim()
  if (pareceEmail(limpio)) return { email: limpio }
  if (!pareceTelefono(limpio)) return { nombre: limpio }
  if (limpio.startsWith('+')) {
    const digitos = limpio.replace(/\D/g, '')
    // El código más largo primero: "+595" no tiene que leerse como "+59" + "5...".
    const codigo = [...CODIGO_PAIS_OPTIONS]
      .sort((a, b) => b.value.length - a.value.length)
      .find((o) => digitos.startsWith(o.value.slice(1)))
    if (codigo) return { codigoPais: codigo.value, telefono: digitos.slice(codigo.value.length - 1) }
  }
  return { codigoPais: codigoPaisPorDefecto || '+598', telefono: limpio }
}

// Bug reportado: si se buscó por un celular o un email y alguno de los resultados YA lo
// tiene, ofrecer "crearlo con lo buscado" lleva a un popup que de todos modos no deja
// crearlo (teléfono repetido) y se llenaba de avisos. En ese caso el botón no se ofrece.
// Por nombre sí: puede ser otra persona que se llama igual. Los teléfonos se comparan por
// los últimos 8 dígitos, igual que el chequeo de duplicados del popup.
export function busquedaYaRegistrada(termino, resultados = []) {
  const limpio = String(termino ?? '').trim()
  if (pareceEmail(limpio)) {
    return resultados.some((r) => String(r.email ?? '').trim().toLowerCase() === limpio.toLowerCase())
  }
  if (pareceTelefono(limpio)) {
    const cola = limpio.replace(/\D/g, '').slice(-8)
    return resultados.some((r) => String(r.telefono ?? '').replace(/\D/g, '').slice(-8) === cola)
  }
  return false
}

// El texto del botón: "Crear contacto con el celular 099…", "…con el email …" o
// "Crear el contacto «Ana Gómez»".
export function textoCrearDesdeBusqueda(termino) {
  const limpio = String(termino ?? '').trim()
  if (pareceEmail(limpio)) return `Crear contacto con el email ${limpio}`
  if (pareceTelefono(limpio)) return `Crear contacto con el celular ${limpio}`
  return `Crear el contacto «${limpio}»`
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

// Payload que espera la columna "phone" de monday (contact_phone en Contactos —desde
// MON-14 el teléfono es del Contacto, no del Cliente— y phone_mm519m27 en Oportunidades,
// donde queda la copia de a qué número se cotizó): código de país + número, solo dígitos,
// y el countryShortName. Antes estaba copiado 3 veces en CrearOportunidadForm.jsx.
// A pedido: el número va ya en formato WhatsApp (ver normalizarTelefono): "59899123456",
// no "598099123456". Si no se pudo normalizar, los dígitos tal cual (como antes).
export function buildMondayPhone(codigoPais, telefono) {
  const numero = normalizarTelefono(telefono, codigoPais) ?? (telefono ?? '').replace(/\D/g, '')
  return {
    phone: `${(codigoPais ?? '').replace('+', '')}${numero}`,
    countryShortName: COUNTRY_SHORT_NAMES[codigoPais] ?? 'UY',
  }
}

// El número con el que se manda por WhatsApp (sin "+"). Lo guardado puede venir de
// antes, con el 0 de marcación local adentro ("598099…") o sin código de país si se
// tipeó a mano en el envío ("099…"): se reconoce el país por el prefijo (Uruguay si no
// tiene) y se normaliza. Si no se reconoce la forma, los dígitos tal cual.
export function telefonoParaWhatsApp(raw) {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  const pais = [...PAISES_TELEFONO]
    .sort((a, b) => b.value.length - a.value.length)
    .find((p) => d.startsWith(p.value.replace('+', '')))
  if (pais) {
    const prefijo = pais.value.replace('+', '')
    const nacional = pais.normalizar(d.slice(prefijo.length))
    if (nacional) return prefijo + nacional
  }
  const uruguayo = PAIS_POR_CODIGO['+598'].normalizar(d)
  if (uruguayo) return `598${uruguayo}`
  return d
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

// Payload de una columna "email" de monday (contact_email en Contactos): {email, text}.
export function buildMondayEmail(email) {
  const v = (email ?? '').trim()
  return { email: v, text: v }
}

// countryShortName a partir de un teléfono guardado como dígitos con el código de país
// adelante (ej. "5492281580112" → "AR"; "59899123456" → "UY"). Se prueban primero los
// prefijos más largos para no confundir +595 con +59… Devuelve 'UY' si no matchea.
export function countryShortNameFromDigits(digits) {
  const d = String(digits ?? '').replace(/\D/g, '')
  const codes = Object.keys(COUNTRY_SHORT_NAMES)
    .map((c) => c.replace('+', ''))
    .sort((a, b) => b.length - a.length)
  const hit = codes.find((c) => d.startsWith(c))
  return hit ? COUNTRY_SHORT_NAMES[`+${hit}`] : 'UY'
}

// Para MOSTRAR un teléfono guardado como dígitos con el código de país pegado
// ("542281580112" → "+54 2281580112"): se lee mejor y deja claro de qué país es.
export function telefonoParaMostrar(digits) {
  const d = String(digits ?? '').replace(/\D/g, '')
  if (!d) return ''
  const { codigoPais, telefono } = splitTelefono(d, countryShortNameFromDigits(d))
  return codigoPais && telefono !== d ? `${codigoPais} ${telefono}` : d
}
