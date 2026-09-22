// Mapea la respuesta cruda de la API de monday al modelo que consume la tabla de Oportunidades.
// Reglas documentadas en /logica-monday-vibe.md ("Vista: Tablero de Oportunidades").
// Los colores de estado NO se hardcodean: vienen de statusColors, leido en el momento
// desde la config real de las columnas (ver services/boardSchema.js).

import {
  VALIDACIONES_POLIZA,
  VALIDACION_POLIZA_COLUMN_ID,
  normalizarEstadoValidacion,
} from './validacionPoliza'
import { formatShortDate } from './format'
import { textOf, boardRelationDisplayOf } from './mondayColumns'

const DEFAULT_COLOR = { bg: '#c4c4c4', border: '#b0b0b0' }

function uniqueNonEmpty(values) {
  return [...new Set(values.filter(Boolean))]
}

function initialsOf(name) {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function mapOpportunityItem(item, statusColors = {}) {
  const cv = item.column_values
  const nombre = textOf(cv, 'text_mm51b055')
  const apellido = textOf(cv, 'text_mm51ez7e')
  const clienteNombre = [nombre, apellido].filter(Boolean).join(' ') || item.name

  const marca = textOf(cv, 'dropdown_mm51ykrd')
  const anio = textOf(cv, 'dropdown_mm51mdmq')
  const modelo = textOf(cv, 'text_mm54fb7m')
  const combustible = textOf(cv, 'dropdown_mm52jp01')
  const uso = textOf(cv, 'color_mm52ey1d')

  const bienLinea1 = [marca, modelo || anio].filter(Boolean).join(' ') || item.name
  const bienLinea2 = [combustible, uso].filter(Boolean).join(' · ')

  const coberturas = uniqueNonEmpty(
    (item.subitems ?? []).map((s) => textOf(s.column_values, 'dropdown_mm4w8n8p'))
  )
  const companias = uniqueNonEmpty(
    (item.subitems ?? []).map((s) => textOf(s.column_values, 'dropdown_mm51f4va'))
  )

  const estadoLabel = textOf(cv, 'deal_stage') || 'Sin estado'
  const estadoColor = statusColors.estadoOportunidad?.[estadoLabel] ?? DEFAULT_COLOR

  const ultimaCotizacion = formatShortDate(textOf(cv, 'date_mm52w0h8') || textOf(cv, 'date__1'))
  const recotizaciones = Number(textOf(cv, 'numeric_mm658a9j')) || 0
  const asignado = textOf(cv, 'deal_owner')
  // Además del nombre (text), el id de la persona asignada — para que el selector de
  // "Asignado" del detalle arranque marcado por id y no comparando nombres. Solo llega en
  // el detalle (ver PeopleValue en OPPORTUNITY_DETAIL_QUERY); en el listado queda null.
  const asignadoPersona = cv
    .find((c) => c.id === 'deal_owner')
    ?.persons_and_teams?.find((p) => p.kind === 'person')
  const asignadoId = asignadoPersona?.id != null ? String(asignadoPersona.id) : null

  const estadoCotizacion = textOf(cv, 'color_mm51n7aa')
  const estadoCotizacionColor = statusColors.estadoCotizacion?.[estadoCotizacion] ?? DEFAULT_COLOR
  // Mirror (lookup) de la "Situación" del Cliente vinculado — la color_mm51mm5v propia
  // de Oportunidades quedó obsoleta. En columnas mirror `text` puede venir null: se usa
  // display_value (pedido en ITEMS_QUERY con `... on MirrorValue`).
  const tipoSujeto = boardRelationDisplayOf(cv, 'lookup_mm6m64w7') || textOf(cv, 'lookup_mm6m64w7')
  const estadoEnvio = textOf(cv, 'color_mm4wr1t4')
  const estadoEnvioColor = statusColors.estadoEnvio?.[estadoEnvio] ?? DEFAULT_COLOR
  const estadoCreacion = textOf(cv, 'color_mm5ejysv')
  const estadoCreacionColor = statusColors.estadoCreacion?.[estadoCreacion] ?? DEFAULT_COLOR
  const poseeVehiculo = textOf(cv, 'color_mm51n4j')
  const estadoLectura = textOf(cv, 'color_mm5rzrhk')
  const estadoLecturaColor = statusColors.estadoLectura?.[estadoLectura] ?? DEFAULT_COLOR

  // A pedido: datos del ítem de Clientes vinculado (solo llegan en el detalle — ver
  // linked_items en OPPORTUNITY_DETAIL_QUERY; en el listado quedan vacíos). Domicilio
  // principal = Dirección + Localidad + Departamento DEL CLIENTE, distinto de
  // departamento/zonaCirculacion de arriba, que son de circulación del vehículo.
  const clienteItem = cv.find((c) => c.id === 'board_relation_mm4qg1n2')?.linked_items?.[0] ?? null
  const ccv = clienteItem?.column_values ?? []
  const clienteDireccion = textOf(ccv, 'long_text_mm6m7d8c')
  const clienteLocalidad = boardRelationDisplayOf(ccv, 'board_relation_mm65e7he')
  const clienteDepartamento = boardRelationDisplayOf(ccv, 'board_relation_mm657jse')
  const clienteSituacion = textOf(ccv, 'color_mm6570m0')

  // MON-14: el Contacto de esta oportunidad — con quien se habló y a quien se le mandó la
  // información. El Teléfono y el Email son SUYOS (ya no del Cliente: esas columnas se
  // borraron del tablero Clientes). Puede ser la misma persona que el Cliente o no.
  // Igual que el Cliente, solo llega en el detalle. Las oportunidades viejas (creadas
  // antes de MON-14) no tienen contacto vinculado y quedan en null.
  const contactoItem = cv.find((c) => c.id === 'board_relation_mm4t623x')?.linked_items?.[0] ?? null
  const cocv = contactoItem?.column_values ?? []
  const contactoEmail = textOf(cocv, 'contact_email')
  // El código de país solo viaja en el JSON de `value`, no en `text`.
  let contactoTelefono = ''
  try {
    const raw = cocv.find((c) => c.id === 'contact_phone')?.value
    contactoTelefono = raw ? JSON.parse(raw)?.phone || '' : ''
  } catch {
    // teléfono ilegible: se cae al de la oportunidad (abajo), que es la copia local
  }

  // LOG-21: el vehículo REALMENTE asegurado — el ítem de 🚘 Vehículos que crea el
  // escenario de póliza con lo que leyó del PDF, vinculado en "Bien Asegurado". Igual que
  // el Cliente de arriba, solo llega en el detalle. Es lo que se contrasta contra la
  // matrícula/chasis/motor que se leyeron de la Carta Automóvil al crear la oportunidad
  // (ver services/polizaCheck.js).
  const vehiculoItem = cv.find((c) => c.id === 'board_relation_mm4pngbs')?.linked_items?.[0] ?? null
  const vcv = vehiculoItem?.column_values ?? []
  const vehiculoAsegurado = vehiculoItem
    ? {
        id: vehiculoItem.id,
        nombre: vehiculoItem.name,
        matricula: textOf(vcv, 'text_mm4pj3gx'),
        chasis: textOf(vcv, 'text_mm4pwdp3'),
        motor: textOf(vcv, 'text_mm4pygkk'),
        marca: textOf(vcv, 'text_mm4pj57'),
        anio: textOf(vcv, 'numeric_mm4p20j9'),
      }
    : null

  return {
    id: item.id,
    oppNumber: `ID-${item.id}`,
    clienteNombre,
    clienteId: clienteItem?.id ?? null,
    clienteSituacion,
    // MON-14: datos del Contacto (a quien se le manda la info). `contactoTelefono` es el
    // número VIGENTE del contacto; `telefono` (más abajo) es la copia que quedó en la
    // oportunidad al cotizar — se mantienen los dos a propósito: la copia es el registro
    // de a qué número se cotizó, aunque el contacto después cambie de número.
    contactoId: contactoItem?.id ?? null,
    // linked_items solo viaja en el detalle; en el listado (CAMPOS_FILA) el nombre del
    // contacto llega como display_value de la conexión — alcanza para la tabla.
    contactoNombre: contactoItem?.name ?? boardRelationDisplayOf(cv, 'board_relation_mm4t623x'),
    contactoEmail,
    contactoTelefono,
    clienteDireccion,
    clienteLocalidad,
    clienteDepartamento,
    clienteDomicilio: [clienteDireccion, clienteLocalidad, clienteDepartamento].filter(Boolean).join(', '),
    ci: textOf(cv, 'numeric_mm51mb0s'),
    telefono: textOf(cv, 'phone_mm519m27'),
    marca,
    anio,
    modelo,
    combustible,
    uso,
    tipo: textOf(cv, 'dropdown_mm5jqdk'),
    tipoRiesgo: textOf(cv, 'color_mm5atxav'),
    edad: textOf(cv, 'numeric_mm527wpm'),
    fechaNacimiento: textOf(cv, 'date_mm516agw'),
    departamento: boardRelationDisplayOf(cv, 'board_relation_mm54tq30'),
    zonaCirculacion: boardRelationDisplayOf(cv, 'board_relation_mm5sqf8t'),
    // LOG-21: identificación del vehículo cotizado (la lee la Carta Automóvil al crear).
    matricula: textOf(cv, 'text_mm71dyf0'),
    chasis: textOf(cv, 'text_mm711jjs'),
    motor: textOf(cv, 'text_mm711cng'),
    vehiculoAsegurado,
    // LOG-13: forma de pago con la que se cierra (etiqueta de color_mm71kfpr).
    cuotasElegidas: textOf(cv, 'color_mm71kfpr'),
    // Validación de la póliza emitida: el veredicto de cada cosa con su motivo, tal cual
    // lo dejó el escenario (ver validacionPoliza.js). Agrupado acá y no suelto en nueve
    // campos, porque siempre se usan juntos.
    validacionPolizaEstado: textOf(cv, VALIDACION_POLIZA_COLUMN_ID),
    validacionesPoliza: Object.fromEntries(
      VALIDACIONES_POLIZA.map((v) => [
        v.key,
        {
          // normalizar: el tablero puede tener la etiqueta vieja "Revisado a mano" (ver
          // validacionPoliza.js) — acá se traduce para que el resto compare un solo nombre.
          estado: normalizarEstadoValidacion(textOf(cv, v.estadoColumnId)),
          motivo: textOf(cv, v.motivoColumnId),
        },
      ])
    ),
    libretaConducir: textOf(cv, 'file_mm51jy06'),
    cedula: textOf(cv, 'file_mm5pc008'),
    poliza: textOf(cv, 'file_mm5bzdd4'),
    bienLinea1,
    bienLinea2: bienLinea2 || (coberturas.length ? coberturas.join(' / ') : ''),
    companias: companias.length ? companias.join(', ') : '—',
    estadoLabel,
    estadoColor,
    estadoCotizacion,
    estadoCotizacionColor,
    tipoSujeto,
    estadoEnvio,
    estadoEnvioColor,
    estadoCreacion,
    estadoCreacionColor,
    poseeVehiculo,
    estadoLectura,
    estadoLecturaColor,
    ultimaCotizacion,
    recotizaciones,
    asignado,
    asignadoIniciales: initialsOf(asignado),
    asignadoId,
  }
}

export function mapOpportunities(items, statusColors = {}) {
  return items.map((item) => mapOpportunityItem(item, statusColors))
}
