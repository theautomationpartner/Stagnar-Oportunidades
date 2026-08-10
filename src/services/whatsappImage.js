// Genera, en el navegador (canvas 2D, sin librerías), una imagen tipo tarjeta para
// enviar por WhatsApp — mismo contenido que la hoja "WHATS" del Excel de referencia:
// marca/modelo/año, circulación/uso/RC, deducible, costo total, promo de cuotas sin
// recargo, la tabla de cuotas 3/6/8/10x y los beneficios "INCLUYE" de la compañía.
// Devuelve un data URL PNG listo para previsualizar en un <img> o mandar a Make.com.
// Ver /logica-monday-vibe.md.
import { formatMoney } from './format'
import { BRAND_COLORS, brandMarkerForCompania } from './companyColors'

const WIDTH = 900
const CUOTA_COUNTS = [3, 6, 8, 10]
const INCLUYE_FONT = '16px Arial'
const INCLUYE_LINE_HEIGHT = 22
const INCLUYE_BULLET_INDENT = 20

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawWrappedLines(ctx, lines, x, y, lineHeight) {
  let cursorY = y
  for (const line of lines) {
    ctx.fillText(line, x, cursorY)
    cursorY += lineHeight
  }
  return cursorY
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  return drawWrappedLines(ctx, wrapLines(ctx, text, maxWidth), x, y, lineHeight)
}

// Canvas roundRect no es soportado en todos los navegadores por igual (Safari lo suma
// recién en 16.4) — path manual para no depender de eso.
function roundedRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function drawIncluye(ctx, incluye, y) {
  ctx.textAlign = 'left'
  ctx.fillStyle = BRAND_COLORS.gris
  ctx.font = 'bold 18px Arial'
  ctx.fillText('INCLUYE', 50, y)
  y += 30

  ctx.font = INCLUYE_FONT
  ctx.fillStyle = BRAND_COLORS.negro
  const maxWidth = WIDTH - 100 - INCLUYE_BULLET_INDENT
  for (const item of incluye) {
    ctx.fillText('•', 50, y)
    y = drawWrappedLines(ctx, wrapLines(ctx, item, maxWidth), 50 + INCLUYE_BULLET_INDENT, y, INCLUYE_LINE_HEIGHT)
  }
  return y
}

const FOOTER_HEIGHT = 50
// Alto de sobra para el canvas "de medición" (primera pasada) — solo tiene que ser más
// alto que cualquier cotización real pueda llegar a ocupar; no se ve, se descarta.
const MEASURE_CANVAS_HEIGHT = 3000

// Dibuja todo el contenido variable (vehículo, cuotas, incluye, warning) y devuelve la
// posición Y final — el contenido no tiene un alto fijo: el nombre del vehículo puede
// ocupar 1 o varias líneas (wrapText) y el bloque INCLUYE varía de 2 a 10+ líneas según
// compañía/cobertura, así que no se puede calcular el alto del canvas de antemano con una
// fórmula fija (eso rompía el pie de página: quedaba en una posición fija que a veces
// caía ARRIBA del contenido real y lo tapaba). En cambio, `renderQuoteImageDataUrl` llama
// a esto una vez sobre un canvas descartable bien alto para medir hasta dónde llega el
// contenido, y una segunda vez sobre el canvas real con el alto ya ajustado.
function drawContent(ctx, opportunity, raw, quote, canvasHeight) {
  // A pedido: la imagen usa 100% los colores del manual de marca (ver BRAND_COLORS) en
  // vez de un color libre por compañía — el verde es siempre el de encabezado/acento
  // principal; la compañía se marca con un detalle sutil (ver "pill" más abajo), no
  // tiñendo toda la tarjeta de un color distinto por compañía.
  const marker = brandMarkerForCompania(raw.compania)
  const markerTextColor = marker === BRAND_COLORS.crema ? BRAND_COLORS.negro : BRAND_COLORS.blanco

  // Fondo
  ctx.fillStyle = BRAND_COLORS.blanco
  ctx.fillRect(0, 0, WIDTH, canvasHeight)

  // Header de marca
  ctx.fillStyle = BRAND_COLORS.verde
  ctx.fillRect(0, 0, WIDTH, 100)
  ctx.fillStyle = BRAND_COLORS.blanco
  ctx.font = 'bold 34px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('STAGNARI SEGUROS', WIDTH / 2, 62)

  let y = 150
  ctx.textAlign = 'left'

  // Compañía (pill sutil, color de marca por compañía) + Cobertura (negro, sin acento)
  const companyLabel = raw.compania || ''
  ctx.font = 'bold 16px Arial'
  const pillPaddingX = 14
  const pillHeight = 32
  const pillWidth = companyLabel ? ctx.measureText(companyLabel).width + pillPaddingX * 2 : 0
  if (companyLabel) {
    roundedRectPath(ctx, 50, y, pillWidth, pillHeight, pillHeight / 2)
    ctx.fillStyle = marker
    ctx.fill()
    ctx.fillStyle = markerTextColor
    ctx.textAlign = 'center'
    ctx.fillText(companyLabel, 50 + pillWidth / 2, y + pillHeight / 2 + 5)
    ctx.textAlign = 'left'
  }
  ctx.fillStyle = BRAND_COLORS.negro
  ctx.font = 'bold 28px Arial'
  ctx.fillText(raw.cobertura || raw.name, 50 + pillWidth + (companyLabel ? 14 : 0), y + pillHeight - 6)
  y += pillHeight + 34

  // Vehículo
  ctx.fillStyle = BRAND_COLORS.negro
  ctx.font = 'bold 26px Arial'
  y = wrapText(ctx, opportunity.bienLinea1, 50, y, WIDTH - 100, 32) + 6
  ctx.font = '20px Arial'
  ctx.fillStyle = BRAND_COLORS.gris
  ctx.fillText(`Año: ${raw.anioVehiculo || opportunity.anio || '—'}`, 50, y)
  y += 45

  // Localidad / Uso / RC
  ctx.font = '20px Arial'
  ctx.fillStyle = BRAND_COLORS.gris
  ctx.fillText(`Localidad: ${opportunity.zonaCirculacion || opportunity.departamento || '—'}`, 50, y)
  y += 32
  ctx.fillText(`Uso: ${raw.uso || '—'}      RC: ${quote.rc || '—'}`, 50, y)
  y += 32
  ctx.fillText(`Deducible: ${quote.deducibleDisplay}`, 50, y)
  y += 50

  // Línea separadora
  ctx.strokeStyle = `${BRAND_COLORS.gris}40`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(50, y)
  ctx.lineTo(WIDTH - 50, y)
  ctx.stroke()
  y += 50

  // Costo total
  ctx.textAlign = 'center'
  ctx.fillStyle = BRAND_COLORS.gris
  ctx.font = '20px Arial'
  ctx.fillText('COSTO TOTAL', WIDTH / 2, y)
  y += 55
  ctx.fillStyle = BRAND_COLORS.negro
  ctx.font = 'bold 58px Arial'
  ctx.fillText(formatMoney(quote.total), WIDTH / 2, y)
  y += 50

  // Promo cuotas sin recargo
  if (quote.promo) {
    const boxHeight = 60
    ctx.fillStyle = `${BRAND_COLORS.verde}1a`
    ctx.fillRect(50, y, WIDTH - 100, boxHeight)
    ctx.fillStyle = BRAND_COLORS.verde
    ctx.font = 'bold 22px Arial'
    ctx.fillText(
      `➜ ${quote.promo.count} cuotas SIN RECARGO de ${formatMoney(quote.promo.valor)} c/u`,
      WIDTH / 2,
      y + boxHeight / 2 + 8
    )
    y += boxHeight + 40
  } else {
    y += 20
  }

  // Tabla de cuotas
  ctx.textAlign = 'left'
  const col1 = 90
  const col2 = WIDTH / 2 - 40
  const col3 = WIDTH - 260
  ctx.fillStyle = BRAND_COLORS.gris
  ctx.font = 'bold 18px Arial'
  ctx.fillText('CUOTAS', col1, y)
  ctx.fillText('POR CUOTA', col2, y)
  ctx.fillText('TOTAL', col3, y)
  y += 12
  ctx.strokeStyle = `${BRAND_COLORS.gris}40`
  ctx.beginPath()
  ctx.moveTo(50, y)
  ctx.lineTo(WIDTH - 50, y)
  ctx.stroke()
  y += 38

  ctx.font = '22px Arial'
  for (const n of CUOTA_COUNTS) {
    ctx.fillStyle = BRAND_COLORS.negro
    ctx.fillText(`${n}x`, col1, y)
    ctx.fillText(formatMoney(quote.cuotas[n].valor), col2, y)
    ctx.fillText(formatMoney(quote.cuotas[n].total), col3, y)
    y += 40
  }

  if (quote.incluye.length > 0) {
    y += 20
    y = drawIncluye(ctx, quote.incluye, y)
  }

  if (quote.warning) {
    y += 20
    ctx.font = 'bold 16px Arial'
    // La versión completa (con compañía + requisito puntual) — la corta es solo para la
    // tarjeta de la app antes de desplegar "Ver más", acá conviene el detalle entero.
    const warnLines = wrapLines(ctx, `⚠ ${quote.warning.full}`, WIDTH - 140)
    const warnHeight = 20 + warnLines.length * 22 + 16
    ctx.fillStyle = BRAND_COLORS.crema
    ctx.fillRect(50, y, WIDTH - 100, warnHeight)
    ctx.fillStyle = BRAND_COLORS.negro
    ctx.textAlign = 'center'
    drawWrappedLines(ctx, warnLines, WIDTH / 2, y + 28, 22)
    ctx.textAlign = 'left'
    y += warnHeight + 20
  }

  return y
}

// Dos pasadas: la primera dibuja sobre un canvas descartable bien alto solo para saber
// dónde termina el contenido real (`drawContent` devuelve esa posición Y); la segunda
// dibuja de nuevo, ya sobre el canvas del tamaño justo, con el pie de página pegado
// después del último contenido — así nunca se superponen, sea cual sea el largo del
// nombre del vehículo o la cantidad de viñetas de INCLUYE.
export function renderQuoteImageDataUrl(opportunity, raw, quote) {
  const measureCanvas = document.createElement('canvas')
  measureCanvas.width = WIDTH
  measureCanvas.height = MEASURE_CANVAS_HEIGHT
  const measureCtx = measureCanvas.getContext('2d')
  const contentBottom = drawContent(measureCtx, opportunity, raw, quote, MEASURE_CANVAS_HEIGHT)

  const height = Math.ceil(contentBottom) + FOOTER_HEIGHT
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')
  drawContent(ctx, opportunity, raw, quote, height)

  ctx.textAlign = 'center'
  ctx.fillStyle = BRAND_COLORS.gris
  ctx.font = '14px Arial'
  ctx.fillText(
    `Cotización generada el ${new Date().toLocaleDateString('es-UY')} · STAGNARI SEGUROS`,
    WIDTH / 2,
    height - 20
  )

  return canvas.toDataURL('image/png')
}
