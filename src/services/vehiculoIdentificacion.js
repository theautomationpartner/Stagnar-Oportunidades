// LOG-21 (red temprana): reglas DURAS de formato para los datos que identifican al
// vehículo. A diferencia del contraste con la póliza —que compara dos lecturas y recién
// puede hablar cuando la póliza ya está emitida— esto se puede chequear en el momento en
// que la Carta Automóvil se lee, antes de cotizar y mucho antes de emitir.
//
// Son reglas verificables, no una IA opinando sobre sí misma: un chasis de 5 caracteres
// no puede ser un chasis, y eso se sabe sin preguntarle a nadie. El caso que motivó esto
// es real: una póliza quedó con chasis "14728".
//
// TODO lo de acá avisa, nunca bloquea. El parque uruguayo tiene autos viejos e importados
// de todos lados, así que una regla que corte el paso terminaría frenando datos buenos.

// El VIN de 17 caracteres es obligatorio en todo el mundo para vehículos fabricados desde
// 1981 (ISO 3779) — antes de eso los números de chasis eran libres y más cortos, así que
// la regla solo se aplica a partir de ese año. Sin año conocido se aplica igual: es el
// caso abrumadoramente más común hoy.
const PRIMER_ANIO_VIN = 1981
const LARGO_VIN = 17
// El VIN excluye I, O y Q justamente para que no se confundan con 1 y 0. Encontrarlas es
// señal de que la lectura confundió un carácter, no de que el vehículo sea raro.
const LETRAS_PROHIBIDAS_VIN = /[IOQ]/

// La matrícula uruguaya vigente son 3 letras + 4 dígitos (SAQ1455), pero conviven chapas
// viejas con otros formatos, así que no se exige el patrón: solo que tenga un largo
// plausible. Con esto "14728" (5) se marca y "SAQ1455" (7) pasa, sin inventar reglas
// sobre formatos que no conocemos.
const LARGO_MIN_MATRICULA = 6
const LARGO_MAX_MATRICULA = 8

const limpio = (valor) => String(valor ?? '').replace(/\s+/g, '').toUpperCase()

// El Motor NO se valida: cada fabricante usa su propio formato (largos y alfabetos
// distintos, con y sin guiones) y no hay un estándar contra el cual medirlo. Inventar una
// regla acá solo generaría avisos falsos.
export function revisarChasis(chasis, anioVehiculo) {
  const valor = limpio(chasis)
  if (!valor) return null
  const anio = Number(anioVehiculo)
  if (Number.isFinite(anio) && anio > 0 && anio < PRIMER_ANIO_VIN) return null

  if (!/^[A-Z0-9]+$/.test(valor)) {
    return `“${chasis}” tiene caracteres que un chasis no lleva (solo letras y números).`
  }
  if (valor.length !== LARGO_VIN) {
    return `“${chasis}” tiene ${valor.length} caracteres y un chasis tiene ${LARGO_VIN}.`
  }
  if (LETRAS_PROHIBIDAS_VIN.test(valor)) {
    return `“${chasis}” trae una I, O o Q, letras que el chasis no usa — probablemente se leyó un 1 o un 0.`
  }
  return null
}

export function revisarMatricula(matricula) {
  const valor = limpio(matricula)
  if (!valor) return null
  if (!/^[A-Z0-9]+$/.test(valor)) {
    return `“${matricula}” tiene caracteres que una matrícula no lleva.`
  }
  if (valor.length < LARGO_MIN_MATRICULA || valor.length > LARGO_MAX_MATRICULA) {
    return `“${matricula}” tiene ${valor.length} caracteres y una matrícula tiene entre ${LARGO_MIN_MATRICULA} y ${LARGO_MAX_MATRICULA}.`
  }
  return null
}

// Todos los reparos de un juego de datos, listos para mostrar: [{ campo, motivo }].
// Vacío = nada que objetar (que no es lo mismo que "está bien": solo que el formato es
// plausible).
export function revisarIdentificacion({ matricula, chasis } = {}, anioVehiculo) {
  const reparos = []
  const porChasis = revisarChasis(chasis, anioVehiculo)
  if (porChasis) reparos.push({ campo: 'Chasis', motivo: porChasis })
  const porMatricula = revisarMatricula(matricula)
  if (porMatricula) reparos.push({ campo: 'Matrícula', motivo: porMatricula })
  return reparos
}
