// Definición única de los campos del paso "Cotizar", compartida entre el panel
// (CotizarStepPanel, que renderiza según "kind") y OpportunityDetail (que arma las
// mutations de guardado según "columnId"/"kind"). Ver /logica-monday-vibe.md.
//
// kind:
//  - 'text' / 'number' / 'date': columna simple, se edita con un input y se guarda
//    con change_simple_column_value.
//  - 'dropdown' / 'status': columna con opciones fijas configuradas en monday — se
//    edita con un Dropdown (@vibe/core) poblado con las opciones reales (optionsKey en el schema
//    traído por boardSchema.js), y se guarda con change_simple_column_value (label).
//  - 'connected': columna "conectada" (board_relation) — se edita con un Dropdown
//    poblado con los items reales del tablero vinculado (Departamentos o Localidades,
//    según `idKey`/`optionsKey`), y se guarda con change_column_value (JSON con
//    item_ids), no con change_simple_column_value.
//  - 'autodata': caso especial de "connected" solo para Modelo — a diferencia de
//    Departamento, el tablero vinculado (board_relation_mm5422v9, AUTODATA V1+V2) tiene
//    más de 15.000 ítems combinados, así que no se puede precargar: se busca en vivo por
//    texto (ver mondayApi.js#searchAutodataModelos). Se guarda igual que 'connected'
//    (change_column_value), pero el VALOR REAL para mostrar/validar sigue viviendo en
//    `text_mm54fb7m` (columnId de este field), no en la columna conectada — la
//    automatización de "Cotizar" lee la conexión, deja el nombre del modelo asentado en
//    ese texto, y vacía la conexión después (para no acumular conexiones de
//    board_relation). Ver CotizarStepPanel.jsx#AutodataModeloSelect.
import { matchOption } from './format'

export const COTIZAR_FIELDS = [
  { key: 'ci', label: 'CI', kind: 'number', columnId: 'numeric_mm51mb0s' },
  { key: 'anio', label: 'Año', kind: 'dropdown', columnId: 'dropdown_mm51mdmq', optionsKey: 'anios' },
  {
    key: 'modelo',
    label: 'Modelo',
    kind: 'autodata',
    columnId: 'text_mm54fb7m',
    connectedColumnId: 'board_relation_mm5422v9',
  },
  { key: 'marca', label: 'Marca', kind: 'dropdown', columnId: 'dropdown_mm51ykrd', optionsKey: 'marcas' },
  {
    key: 'combustible',
    label: 'Combustible',
    kind: 'dropdown',
    columnId: 'dropdown_mm52jp01',
    optionsKey: 'combustibles',
  },
  { key: 'uso', label: 'Uso', kind: 'status', columnId: 'color_mm52ey1d', optionsKey: 'uso' },
  { key: 'tipo', label: 'Tipo', kind: 'dropdown', columnId: 'dropdown_mm5jqdk', optionsKey: 'tipo' },
  { key: 'fechaNacimiento', label: 'Fecha de nacimiento', kind: 'date', columnId: 'date_mm516agw' },
  {
    key: 'departamento',
    label: 'Departamento',
    kind: 'connected',
    columnId: 'board_relation_mm54tq30',
    idKey: 'departamentoId',
    optionsKey: 'departamentos',
  },
  {
    key: 'zonaCirculacion',
    label: 'Localidad',
    kind: 'connected',
    columnId: 'board_relation_mm5sqf8t',
    idKey: 'localidadId',
    optionsKey: 'localidades',
  },
]

// Antes de dejar cotizar/recotizar (o guardar el formulario de edición), nos aseguramos
// de que ningún campo base quede vacío: la automatización de monday que genera los
// subitems depende de todos estos datos, y una cotización con datos a medias termina en
// un subitem incompleto o en un "Error" silencioso. `values` es cualquier objeto que
// tenga las mismas keys que COTIZAR_FIELDS — sirve tanto para el `opportunity` mapeado
// (que trae, ej., `departamento`/`zonaCirculacion` como nombre) como para el `form` en
// edición (que trae `departamentoId`/`localidadId`, ver `idKey`); para 'connected' se
// acepta cualquiera de los dos.
export function getMissingCotizarFields(values) {
  return COTIZAR_FIELDS.filter((f) => {
    const raw = f.kind === 'connected' ? values[f.idKey] ?? values[f.key] : values[f.key]
    return !String(raw ?? '').trim()
  })
}

// Las opciones reales de un campo, vengan como array plano (marcas/años/combustibles/
// tipo) o como {options, colorsByLabel} (los status, ver boardSchema.js).
function opcionesDe(schema, field) {
  const raw = schema?.[field.optionsKey]
  return Array.isArray(raw) ? raw : (raw?.options ?? [])
}

// LOG-09: no alcanza con que el campo esté cargado — tiene que tener un valor que EXISTA
// en el catálogo de esa columna. Si no, la cotización se dispara igual y el error recién
// aparece del otro lado, con el robot ya corriendo (varios minutos después) o, peor, con
// el dato entrando vacío en el portal.
//
// El caso típico: una ficha de Autodata con un Combustible que la columna de la
// Oportunidad no tiene (hoy, "EREV"). Al elegir ese modelo el valor no matchea y queda
// vacío, sin ninguna explicación de por qué no se puede avanzar.
//
// Solo aplica a las columnas con opciones fijas (dropdown/status): las conectadas ya se
// eligen de una lista real y no se pueden inventar. La comparación es la misma de la app
// (matchOption): ignora tildes, mayúsculas y espacios de más.
export function getInvalidCotizarFields(values, schema) {
  if (!schema || !values) return []
  return COTIZAR_FIELDS.filter((f) => {
    if (f.kind !== 'dropdown' && f.kind !== 'status') return false
    const opciones = opcionesDe(schema, f)
    // Sin catálogo cargado (el schema todavía no llegó) no se puede afirmar que un valor
    // sea inválido — se calla en vez de acusar en falso.
    if (!opciones.length) return false
    const valor = String(values[f.key] ?? '').trim()
    // Vacío no es "incompatible": eso ya lo reporta getMissingCotizarFields.
    if (!valor) return false
    return !matchOption(opciones, valor)
  })
}
