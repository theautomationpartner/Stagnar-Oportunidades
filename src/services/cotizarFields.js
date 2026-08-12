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
