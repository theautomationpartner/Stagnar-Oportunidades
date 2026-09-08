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
import { coberturaGroupOf, SUBTITULO_POR_FAMILIA } from './coberturaGroups'

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

export function renderQuoteText(opportunity, raw, quote) {
  if (quote.blocked) return ''

  const cobertura = raw.cobertura || raw.name || ''
  const subtitulo =
    SUBTITULO_POR_FAMILIA[coberturaGroupOf(cobertura)] ?? (cobertura ? `Cobertura ${cobertura}.` : '')
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
    quote.rc && `RC: hasta ${quote.rc}`,
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
