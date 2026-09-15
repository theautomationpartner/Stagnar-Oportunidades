// LOG-17: la misma cotización, en texto plano listo para pegar en un WhatsApp — a veces
// el cliente pide "pasámelo escrito" (para reenviarlo, copiar un dato, o simplemente
// porque no abre la imagen). No recalcula NADA: sale de los mismos `opportunity`, `raw` y
// `quote` que la imagen (ver whatsappImage.js), en el orden del anexo del documento:
// vehículo → compañía y plan → deducible → costo total → formas de pago → INCLUYE
// (+ el cuadro de opcionales de LOG-18).
//
// El formato usa los marcadores de WhatsApp: *negrita* y viñetas con "•". A propósito no
// se arma con emojis ni cajas ASCII — en un chat real se ven distinto en cada teléfono.
import { formatMoney, CUOTA_COUNTS, modeloSinMarca } from './format'
import { coberturaGroupOf, coberturaParaMostrar, FAMILIA_LABEL, SUBTITULO_POR_FAMILIA } from './coberturaGroups'

// Mismo criterio que splitVehicleName en whatsappImage.js: el modelo de Autodata ya trae
// la marca adelante, no se repite.
function nombreVehiculo(opportunity) {
  const marca = (opportunity.marca || '').trim()
  const modelo = modeloSinMarca(marca, opportunity.modelo || opportunity.bienLinea1)
  return `${marca.toUpperCase()} ${modelo}`.trim() || '—'
}

function lineaOpcional(opc) {
  if (opc.contratado) return `• ${opc.label} (contratado)`
  if (!opc.precio) return `• ${opc.label} (consultar)`
  return `• ${opc.label}: ${opc.desde ? 'desde ' : '+ '}${formatMoney(opc.precio)}`
}

// La Responsabilidad Civil con sus límites, que es lo que al cliente le dice algo: "40"
// o "Nivel 4" solos no significan nada afuera de la compañía. Los límites salen de PANEL
// (ver pricingEngine.js#rcBullets); si ese nivel todavía no los tiene cargados, queda la
// línea de siempre en vez de un hueco.
function rcLineas(quote) {
  if (quote.rcDetalle?.length) return ['*Responsabilidad Civil*', ...quote.rcDetalle.map((l) => `• ${l}`)]
  return quote.rc ? [`RC: hasta ${quote.rc}`] : []
}

export function renderQuoteText(opportunity, raw, quote) {
  if (quote.blocked) return ''

  // El nombre real clasifica (las listas conocen "GLOBAL - anual", no "TOTAL - anual") y
  // lo que se muestra es la familia, igual que el título de la imagen (ver
  // whatsappImage.js#drawCoverTitle): "TOTAL" o "PARCIAL", no "TOTAL 2500" ni "4 EN 1".
  // Sin familia queda el nombre de la cobertura.
  const coberturaReal = raw.cobertura || raw.name || ''
  const familia = coberturaGroupOf(coberturaReal)
  const cobertura = FAMILIA_LABEL[familia]?.toUpperCase() || coberturaParaMostrar(raw)
  const subtitulo =
    SUBTITULO_POR_FAMILIA[familia] ?? (cobertura ? `Cobertura ${cobertura}.` : '')
  const anio = raw.anioVehiculo || opportunity.anio || ''
  const combustible = raw.combustibleVehiculo || opportunity.combustible || ''
  const uso = raw.uso || opportunity.uso || ''
  const ubicacion = [opportunity.zonaCirculacion, opportunity.departamento].filter(Boolean).join(', ')

  const bloques = []

  // 1) Vehículo
  const datosVehiculo = [anio && `Año ${anio}`, combustible, uso, ubicacion].filter(Boolean)
  bloques.push([`*${nombreVehiculo(opportunity)}*`, datosVehiculo.join(' · ')].filter(Boolean).join('\n'))

  // 2) Compañía y plan + 3) deducible (y RC, que va pegado al nivel de cobertura)
  const plan = [
    `*${raw.compania}${cobertura ? ` — ${cobertura}` : ''}*`,
    subtitulo,
    ...rcLineas(quote),
    quote.deducibleDisplay && quote.deducibleDisplay !== '—' && `Deducible: ${quote.deducibleDisplay}`,
  ].filter(Boolean)
  bloques.push(plan.join('\n'))

  // 4) Costo total, con la promo de cuotas sin recargo y su condición (LOG-16)
  const costo = [`*COSTO TOTAL: ${formatMoney(quote.total)}*`]
  if (quote.promo) {
    costo.push(`${quote.promo.count} cuotas SIN RECARGO de ${formatMoney(quote.promo.valor)}`)
    if (quote.promo.condicion) costo.push(`(${quote.promo.condicion})`)
  }
  bloques.push(costo.join('\n'))

  // 5) Formas de pago — solo las cuotas reales, con su recargo ya aplicado
  const cuotas = CUOTA_COUNTS.filter((n) => quote.cuotas?.[n]?.valor).map(
    (n) => `• ${n} cuotas de ${formatMoney(quote.cuotas[n].valor)}`
  )
  if (cuotas.length) bloques.push(['*FORMAS DE PAGO*', ...cuotas].join('\n'))

  // 6) INCLUYE
  if (quote.incluye?.length) {
    bloques.push(['*INCLUYE*', ...quote.incluye.map((item) => `• ${item}`)].join('\n'))
  }

  // 7) Opcionales aparte (LOG-18)
  if (quote.opcionales?.length) {
    bloques.push(['*OPCIONALES (SE COTIZAN APARTE)*', ...quote.opcionales.map(lineaOpcional)].join('\n'))
  }

  if (quote.warning) bloques.push(`⚠ ${quote.warning.full}`)

  return bloques.join('\n\n')
}
