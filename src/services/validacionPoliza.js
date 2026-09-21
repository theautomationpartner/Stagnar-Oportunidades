// Validación de los datos de la póliza emitida, antes de dar por cerrada la emisión.
//
// Quién hace qué: el escenario de Make lee el PDF de la póliza —que es lo único que la
// app no puede hacer— compara contra la oportunidad y escribe el resultado en estas
// columnas. La app no compara nada acá: muestra lo que el escenario dejó, en vivo, y no
// deja emitir mientras algo esté en rojo sin que alguien lo revise.
//
// Son cuatro cosas distintas y por eso son cuatro estados y no uno: si la póliza sale a
// nombre de otra persona, el problema y quién lo arregla no tienen nada que ver con que
// el premio no coincida con lo cotizado.
export const VALIDACIONES_POLIZA = [
  {
    key: 'persona',
    label: 'Persona',
    detalle: 'El titular de la póliza es el cliente de la oportunidad',
    estadoColumnId: 'color_mm7a2pek',
    motivoColumnId: 'text_mm7aht52',
  },
  {
    key: 'vehiculo',
    label: 'Vehículo',
    detalle: 'Matrícula, chasis, motor, marca y año',
    estadoColumnId: 'color_mm7a61dm',
    motivoColumnId: 'text_mm7az2f0',
  },
  {
    key: 'compania',
    label: 'Compañía',
    detalle: 'La aseguradora de la póliza es la de la cotización elegida',
    estadoColumnId: 'color_mm7a9rjz',
    motivoColumnId: 'text_mm7ap30z',
  },
  {
    key: 'cotizacion',
    label: 'Cotización',
    detalle: 'Cobertura y premio contra lo cotizado',
    estadoColumnId: 'color_mm7agwbv',
    motivoColumnId: 'text_mm7ab1sw',
  },
]

// El estado general lo escribe el escenario: dice en qué anda, para poder mostrar el
// progreso en vivo en vez de un cartel fijo.
export const VALIDACION_POLIZA_COLUMN_ID = 'color_mm7ash2k'

export const ESTADO_VALIDACION = {
  sinValidar: 'Sin validar',
  valido: 'Válido',
  incorrecto: 'Incorrecto',
  revisado: 'Revisado manualmente',
}

export const ESTADO_GENERAL = {
  sinValidar: 'Sin validar',
  // Lo escribe la app al subir la póliza: es el pedido, igual que "Cotizar" en Estado
  // Cotización. El escenario lo toma, pasa a "Validando" y termina en uno de los dos
  // últimos.
  validar: 'Validar',
  validando: 'Validando',
  validos: 'Datos válidos',
  conDiferencias: 'Con diferencias',
}

// Todos los ids que hay que traer de la oportunidad para mostrar esto.
export const COLUMNAS_VALIDACION_POLIZA = [
  VALIDACION_POLIZA_COLUMN_ID,
  ...VALIDACIONES_POLIZA.flatMap((v) => [v.estadoColumnId, v.motivoColumnId]),
]

// Una validación frena la emisión mientras esté en "Incorrecto". "Revisado manualmente" no
// frena: es justamente la salida para cuando el dato de la póliza es el correcto y el que
// hay que corregir es el de la oportunidad, o cuando la diferencia es aceptable y alguien
// se hace cargo.
export function bloqueaEmision(validacion) {
  return validacion?.estado === ESTADO_VALIDACION.incorrecto
}

export function validacionesQueBloquean(validaciones) {
  return VALIDACIONES_POLIZA.filter((v) => bloqueaEmision(validaciones?.[v.key]))
}

// Mientras el escenario corre no tiene sentido dejar emitir ni mostrar un veredicto a
// medio hacer: los estados van cambiando de a uno.
// "Validar" cuenta como en curso: es el rato entre que la app lo pide y el escenario lo
// agarra. Si no, la pantalla quedaría quieta justo al principio, que es cuando la persona
// está mirando.
export function estaValidando(general) {
  return general === ESTADO_GENERAL.validar || general === ESTADO_GENERAL.validando
}

// Sin nada escrito todavía (pólizas anteriores a esta validación, o un escenario que no
// llegó a correr) no se bloquea nada: la app no puede exigir un dato que nunca se generó.
export function hayValidacion(validaciones, general) {
  if (general && general !== ESTADO_GENERAL.sinValidar) return true
  return VALIDACIONES_POLIZA.some((v) => {
    const estado = validaciones?.[v.key]?.estado
    return estado && estado !== ESTADO_VALIDACION.sinValidar
  })
}
