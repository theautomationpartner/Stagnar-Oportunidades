// Fuente ÚNICA de "qué datos tienen que estar cargados" en cada etapa de una
// Oportunidad (auditoría: antes había 3 listas independientes — cotizarFields.js para
// Cotizar, CHECKLIST_FIELDS en ConfirmarStepPanel y CLIENTE/BIEN/DOCS_FIELDS en
// EmitirStepPanel — que divergían sin que nadie lo notara).
//
// IMPORTANTE: las exigencias por etapa se mantienen EXACTAMENTE como estaban (es lógica
// de negocio acordada): Cotizar pide los 10 campos de la automatización; Confirmar
// chequea 6 datos + documentos + propuesta elegida; Emitir chequea 5 datos del cliente
// (domicilio es opcional) + 5 del bien + 2 documentos. Lo que cambia es que las
// etiquetas y las keys viven en un solo lugar y `getMissing(opportunity, stage)` es la
// única función que decide qué falta.
import { COTIZAR_FIELDS, getMissingCotizarFields } from './cotizarFields'

const labelOf = (key) => COTIZAR_FIELDS.find((f) => f.key === key)?.label

// Documentos del asegurado — mismos nombres de campo que usa opportunityMapper.
export const DOCUMENTOS = [
  { key: 'libretaConducir', label: 'Libreta de Conducir / Carta Automóvil' },
  { key: 'cedula', label: 'Cédula de Identidad' },
]

export const REQUIRED_BY_STAGE = {
  // Paso 1 — lo que necesita la automatización de cotización (ver cotizarFields.js).
  cotizar: COTIZAR_FIELDS.map(({ key, label }) => ({ key, label })),

  // Paso 3 — "Confirmar": subconjunto de datos que se verifican antes de aceptar la
  // cotización (a pedido, sin bloquear la pantalla: se avisa al confirmar).
  confirmar: [
    { key: 'ci', label: labelOf('ci') },
    { key: 'modelo', label: labelOf('modelo') },
    { key: 'anio', label: labelOf('anio') },
    { key: 'marca', label: labelOf('marca') },
    { key: 'combustible', label: labelOf('combustible') },
    { key: 'fechaNacimiento', label: labelOf('fechaNacimiento') },
  ],

  // Paso 4 — "Emitir": última revisión antes de cargar la póliza / concretar.
  emitir: [
    { key: 'clienteNombre', label: 'Cliente' },
    { key: 'ci', label: labelOf('ci') },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'fechaNacimiento', label: labelOf('fechaNacimiento') },
    { key: 'departamento', label: labelOf('departamento') },
    // Domicilio principal del Cliente/Lead: se muestra pero no bloquea la emisión —
    // los clientes cargados antes de que existiera esa columna no lo tienen.
    { key: 'clienteDomicilio', label: 'Domicilio', optional: true },
    { key: 'marca', label: labelOf('marca') },
    { key: 'modelo', label: labelOf('modelo') },
    { key: 'anio', label: labelOf('anio') },
    { key: 'combustible', label: labelOf('combustible') },
    { key: 'uso', label: labelOf('uso') },
    ...DOCUMENTOS,
  ],
}

// Devuelve los campos (key + label) que faltan para la etapa dada. Para 'cotizar'
// delega en getMissingCotizarFields (que además entiende los `idKey` de los campos
// conectados cuando se le pasa el form en edición).
export function getMissing(opportunity, stage) {
  if (stage === 'cotizar') return getMissingCotizarFields(opportunity)
  return REQUIRED_BY_STAGE[stage].filter((f) => !f.optional && !opportunity?.[f.key])
}

export function getMissingLabels(opportunity, stage) {
  return getMissing(opportunity, stage).map((f) => f.label)
}
