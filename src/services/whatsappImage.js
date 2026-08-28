// Genera, en el navegador (canvas 2D, sin librerías), la tarjeta de cotización que se
// envía por WhatsApp. Diseño según los bocetos de /ejemplo_cotizaciones (a pedido):
// header con logo Stagnari + logo de la aseguradora, título de cobertura, tarjeta del
// vehículo con el año (SIN logo de la marca del auto, a pedido), grilla de datos,
// banda de PRECIO ANUAL con las cuotas sin recargo, FORMAS DE PAGO en tarjetas,
// BENEFICIOS INCLUIDOS con tildes y pie con fecha + eslogan.
//
// Los NÚMEROS salen tal cual de `quote` (pricingEngine.computeQuote) — acá no se
// calcula nada: total, cuotas[n].valor, promo.{count,valor}, deducibleDisplay, rc,
// incluye, warning. Devuelve un data URL PNG listo para previsualizar o mandar a Make.
import { formatMoney, modeloSinMarca } from './format'
import { BRAND_COLORS } from './companyColors'
import { coberturaGroupOf } from './coberturaGroups'
import stagnariLogo from '../assets/stagnari-logo.png'
import stagnariLogoSimple from '../assets/stagnari-logo-simple.png'
import logoBse from '../assets/aseguradoras/bse.png'
import logoPorto from '../assets/aseguradoras/porto.png'
import logoSancor from '../assets/aseguradoras/sancor.png'
import logoSura from '../assets/aseguradoras/sura.webp'

const WIDTH = 900
const PAD = 36
const INNER = WIDTH - PAD * 2
const FONT = 'Arial, Helvetica, sans-serif'

// Paleta derivada del manual de marca (BRAND_COLORS): el verde es el único acento;
// los tintes son el mismo verde con alfa, el texto va en negro/gris del manual.
const C = {
  verde: BRAND_COLORS.verde,
  verdeOscuro: '#0a5f5c',
  tinte: '#e6f2f1',
  tinteSuave: '#f2f8f7',
  borde: '#d9e3e1',
  texto: '#1d2b29',
  gris: BRAND_COLORS.gris,
  blanco: BRAND_COLORS.blanco,
  crema: BRAND_COLORS.crema,
}

const INSURER_LOGOS = {
  BSE: logoBse,
  PORTO: logoPorto,
  SANCOR: logoSancor,
  SURA: logoSura,
}

// Subtítulo corto por familia de cobertura (ver coberturaGroups.js). Es texto
// descriptivo genérico, no una condición contractual — el detalle real va en
// "Beneficios incluidos" (quote.incluye) y en la advertencia (quote.warning).
const SUBTITLE_BY_GROUP = {
  GLOBAL: 'Cobertura completa del vehículo y responsabilidad civil.',
  TRIPLE: 'Responsabilidad civil, hurto e incendio.',
}

const imageCache = new Map()
function loadImage(src) {
  if (!src) return Promise.resolve(null)
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img)
        // Un logo que no carga no debe romper la cotización: se dibuja sin él.
        img.onerror = () => resolve(null)
        img.src = src
      })
    )
  }
  return imageCache.get(src)
}

// ---------- helpers de dibujo ----------
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function card(ctx, x, y, w, h, { fill = C.blanco, stroke = C.borde, radius = 14 } = {}) {
  roundedRectPath(ctx, x, y, w, h, radius)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

function text(ctx, str, x, y, { size = 16, weight = '', color = C.texto, align = 'left', style = '' } = {}) {
  ctx.font = `${style} ${weight} ${size}px ${FONT}`.trim()
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(str, x, y)
}

function wrapLines(ctx, str, maxWidth, font) {
  ctx.font = font
  const words = String(str ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

function drawImageFit(ctx, img, x, y, maxW, maxH, align = 'left') {
  if (!img) return 0
  const ratio = img.naturalWidth / img.naturalHeight
  let w = maxH * ratio
  let h = maxH
  if (w > maxW) {
    w = maxW
    h = maxW / ratio
  }
  const dx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
  ctx.drawImage(img, dx, y + (maxH - h) / 2, w, h)
  return w
}

// Íconos simples en trazo verde (sin assets externos).
function iconCircleCheck(ctx, cx, cy, r, color = C.verde) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.45, cy)
  ctx.lineTo(cx - r * 0.1, cy + r * 0.38)
  ctx.lineTo(cx + r * 0.5, cy - r * 0.35)
  ctx.stroke()
}

function iconShield(ctx, cx, cy, size, { fill = C.verde, check = true } = {}) {
  const w = size
  const h = size * 1.15
  ctx.beginPath()
  ctx.moveTo(cx, cy - h / 2)
  ctx.lineTo(cx + w / 2, cy - h / 2 + h * 0.18)
  ctx.lineTo(cx + w / 2, cy + h * 0.05)
  ctx.quadraticCurveTo(cx + w / 2, cy + h * 0.38, cx, cy + h / 2)
  ctx.quadraticCurveTo(cx - w / 2, cy + h * 0.38, cx - w / 2, cy + h * 0.05)
  ctx.lineTo(cx - w / 2, cy - h / 2 + h * 0.18)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (check) {
    ctx.strokeStyle = C.blanco
    ctx.lineWidth = size * 0.11
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - size * 0.22, cy)
    ctx.lineTo(cx - size * 0.05, cy + size * 0.18)
    ctx.lineTo(cx + size * 0.26, cy - size * 0.18)
    ctx.stroke()
    ctx.lineCap = 'butt'
  }
}

function iconStar(ctx, cx, cy, r, color) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const px = cx + Math.cos(a) * rad
    const py = cy + Math.sin(a) * rad
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function iconPin(ctx, cx, cy, s) {
  ctx.strokeStyle = C.verde
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy - s * 0.15, s * 0.42, Math.PI * 0.8, Math.PI * 0.2, false)
  ctx.lineTo(cx, cy + s * 0.55)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy - s * 0.15, s * 0.14, 0, Math.PI * 2)
  ctx.stroke()
}

function iconCar(ctx, cx, cy, s, color = C.verde, lineWidth = 2) {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.5, cy + s * 0.15)
  ctx.lineTo(cx - s * 0.5, cy - s * 0.05)
  ctx.lineTo(cx - s * 0.3, cy - s * 0.1)
  ctx.lineTo(cx - s * 0.15, cy - s * 0.35)
  ctx.lineTo(cx + s * 0.2, cy - s * 0.35)
  ctx.lineTo(cx + s * 0.38, cy - s * 0.1)
  ctx.lineTo(cx + s * 0.5, cy - s * 0.05)
  ctx.lineTo(cx + s * 0.5, cy + s * 0.15)
  ctx.closePath()
  ctx.stroke()
  for (const wx of [cx - s * 0.28, cx + s * 0.28]) {
    ctx.beginPath()
    ctx.arc(wx, cy + s * 0.18, s * 0.11, 0, Math.PI * 2)
    ctx.fillStyle = C.blanco
    ctx.fill()
    ctx.stroke()
  }
}

function iconWallet(ctx, cx, cy, s) {
  ctx.strokeStyle = C.verde
  ctx.lineWidth = 2
  roundedRectPath(ctx, cx - s * 0.5, cy - s * 0.32, s, s * 0.64, 4)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx + s * 0.28, cy, s * 0.08, 0, Math.PI * 2)
  ctx.stroke()
}

function iconCard(ctx, cx, cy, s) {
  ctx.strokeStyle = C.verde
  ctx.lineWidth = 2
  roundedRectPath(ctx, cx - s * 0.5, cy - s * 0.32, s, s * 0.64, 4)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.5, cy - s * 0.1)
  ctx.lineTo(cx + s * 0.5, cy - s * 0.1)
  ctx.stroke()
}

function iconGift(ctx, cx, cy, s) {
  ctx.strokeStyle = C.verde
  ctx.lineWidth = 2
  ctx.strokeRect(cx - s * 0.45, cy - s * 0.15, s * 0.9, s * 0.6)
  ctx.strokeRect(cx - s * 0.5, cy - s * 0.35, s, s * 0.2)
  ctx.beginPath()
  ctx.moveTo(cx, cy - s * 0.35)
  ctx.lineTo(cx, cy + s * 0.45)
  ctx.stroke()
}

function iconCalendar(ctx, cx, cy, s) {
  ctx.strokeStyle = C.verde
  ctx.lineWidth = 2
  roundedRectPath(ctx, cx - s * 0.45, cy - s * 0.35, s * 0.9, s * 0.8, 3)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.45, cy - s * 0.12)
  ctx.lineTo(cx + s * 0.45, cy - s * 0.12)
  ctx.stroke()
}

// ---------- secciones ----------
function drawHeader(ctx, logos) {
  const H = 100
  ctx.fillStyle = C.blanco
  ctx.fillRect(0, 0, WIDTH, H)
  drawImageFit(ctx, logos.stagnari, PAD, 22, 300, 56, 'left')
  ctx.strokeStyle = C.borde
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(WIDTH / 2, 26)
  ctx.lineTo(WIDTH / 2, H - 26)
  ctx.stroke()
  drawImageFit(ctx, logos.insurer, WIDTH - PAD, 22, 260, 56, 'right')
  ctx.fillStyle = C.verde
  ctx.fillRect(0, H, WIDTH, 6)
  return H + 6
}

function drawCoverTitle(ctx, raw, y) {
  const group = coberturaGroupOf(raw.cobertura)
  const title = (raw.cobertura || raw.name || 'COTIZACIÓN').toUpperCase()
  const subtitle = SUBTITLE_BY_GROUP[group] ?? `Cobertura ${raw.cobertura || ''}`.trim() + '.'

  // Escudo + título + subtítulo a la izquierda
  iconShield(ctx, PAD + 34, y + 44, 56)
  const titleFont = `bold 30px ${FONT}`
  const titleLines = wrapLines(ctx, title, INNER - 330, titleFont)
  let ty = y + 40
  for (const line of titleLines) {
    text(ctx, line, PAD + 84, ty, { size: 30, weight: 'bold', color: C.verdeOscuro })
    ty += 34
  }
  const subLines = wrapLines(ctx, subtitle, INNER - 330, `18px ${FONT}`)
  ty -= 6
  for (const line of subLines) {
    text(ctx, line, PAD + 84, ty + 22, { size: 18, color: C.texto })
    ty += 24
  }

  // Ilustración genérica (sin marcas): blob verde suave + auto en trazo
  const bx = WIDTH - PAD - 100
  const by = y + 50
  ctx.fillStyle = C.tinte
  ctx.beginPath()
  ctx.ellipse(bx, by, 100, 52, -0.15, 0, Math.PI * 2)
  ctx.fill()
  iconCar(ctx, bx, by, 150, C.verde, 3)

  return Math.max(ty + 20, y + 120)
}

function drawVehicleCard(ctx, opportunity, raw, quote, y) {
  const x = PAD
  const w = INNER
  const { title: vehTitle, detail: vehDetail } = splitVehicleName(opportunity)
  const anio = raw.anioVehiculo || opportunity.anio || '—'

  // Medir alto: nombre (bold) + descripción (gris) + grilla
  const nameFont = `bold 24px ${FONT}`
  const nameLines = wrapLines(ctx, vehTitle || '—', w - 260, nameFont)
  const detailLines = vehDetail ? wrapLines(ctx, vehDetail, w - 260, `17px ${FONT}`) : []
  const headH = 28 + nameLines.length * 30 + detailLines.length * 22 + 4
  const gridH = 3 * 44 + 16
  const h = headH + 16 + gridH + 8
  card(ctx, x, y, w, h, { radius: 16 })

  // Ícono auto en círculo + nombre + pill año
  ctx.fillStyle = C.tinteSuave
  ctx.beginPath()
  ctx.arc(x + 46, y + headH / 2 + 4, 30, 0, Math.PI * 2)
  ctx.fill()
  iconCar(ctx, x + 46, y + headH / 2 + 4, 40)
  let ny = y + 40
  for (const line of nameLines) {
    text(ctx, line, x + 92, ny, { size: 24, weight: 'bold' })
    ny += 30
  }
  for (const line of detailLines) {
    text(ctx, line, x + 92, ny - 6, { size: 17, color: C.gris })
    ny += 22
  }
  const pillW = 96
  roundedRectPath(ctx, x + w - 20 - pillW, y + 22, pillW, 40, 10)
  ctx.fillStyle = C.verdeOscuro
  ctx.fill()
  text(ctx, String(anio), x + w - 20 - pillW / 2, y + 49, { size: 22, weight: 'bold', color: C.blanco, align: 'center' })

  // Separador + grilla
  const gy = y + headH + 12
  ctx.strokeStyle = C.borde
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + 16, gy)
  ctx.lineTo(x + w - 16, gy)
  ctx.stroke()
  const colMid = x + w / 2
  ctx.beginPath()
  ctx.moveTo(colMid, gy + 14)
  ctx.lineTo(colMid, gy + gridH - 6)
  ctx.stroke()

  const localidad = [opportunity.zonaCirculacion, opportunity.departamento].filter(Boolean).join(' · ') || '—'
  const left = [
    { icon: iconPin, label: 'LOCALIDAD', value: localidad },
    { icon: iconCar, label: 'USO', value: raw.uso || opportunity.uso || '—' },
    { icon: iconCard, label: 'COMBUSTIBLE', value: raw.combustibleVehiculo || opportunity.combustible || '—' },
  ]
  const right = [
    { icon: (c, cx, cy, s) => strokeShield(c, cx, cy, s * 0.8), label: 'RC', value: quote.rc ? `Hasta ${quote.rc}` : '—' },
    { icon: iconWallet, label: 'DEDUCIBLE', value: quote.deducibleDisplay || '—' },
  ]
  const drawCol = (items, cx) => {
    let iy = gy + 26
    for (const it of items) {
      it.icon(ctx, cx + 16, iy + 6, 24)
      text(ctx, it.label, cx + 48, iy, { size: 13, color: C.gris })
      const valueLines = wrapLines(ctx, it.value, w / 2 - 80, `bold 18px ${FONT}`)
      text(ctx, valueLines[0], cx + 48, iy + 21, { size: 18, weight: 'bold' })
      iy += 44
    }
  }
  drawCol(left, x + 16)
  drawCol(right, colMid + 16)
  return y + h
}

// "PEUGEOT" + "PEUGEOT - 206 1.6 Presence Full, ABS Aut. 5p. (BRA)" (el modelo de
// Autodata ya trae la marca adelante) → título "PEUGEOT 206 1.6 Presence Full" y
// detalle "ABS Aut. 5p. (BRA)", como en el boceto. Solo presentación: no altera el
// dato guardado en monday.
function splitVehicleName(opportunity) {
  const marca = (opportunity.marca || '').trim()
  const modelo = modeloSinMarca(marca, opportunity.modelo || opportunity.bienLinea1)
  const [first, ...rest] = modelo.split(/,\s*/)
  return {
    title: `${marca.toUpperCase()} ${first}`.trim(),
    detail: rest.join(', '),
  }
}

function strokeShield(ctx, cx, cy, size) {
  const w = size
  const h = size * 1.15
  ctx.beginPath()
  ctx.moveTo(cx, cy - h / 2)
  ctx.lineTo(cx + w / 2, cy - h / 2 + h * 0.18)
  ctx.lineTo(cx + w / 2, cy + h * 0.05)
  ctx.quadraticCurveTo(cx + w / 2, cy + h * 0.38, cx, cy + h / 2)
  ctx.quadraticCurveTo(cx - w / 2, cy + h * 0.38, cx - w / 2, cy + h * 0.05)
  ctx.lineTo(cx - w / 2, cy - h / 2 + h * 0.18)
  ctx.closePath()
  ctx.strokeStyle = C.verde
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawPriceBand(ctx, quote, y) {
  const h = 120
  card(ctx, PAD, y, INNER, h, { fill: C.verdeOscuro, stroke: null, radius: 16 })
  text(ctx, 'PRECIO ANUAL', PAD + 28, y + 36, { size: 16, weight: 'bold', color: '#cfe6e4' })
  text(ctx, formatMoney(quote.total), PAD + 26, y + 92, { size: 52, weight: 'bold', color: C.blanco })

  // Separador vertical
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(PAD + 400, y + 24)
  ctx.lineTo(PAD + 400, y + h - 24)
  ctx.stroke()

  // Caja derecha: cuotas sin recargo (si hay promo) o leyenda de contado
  const bx = PAD + 440
  const bw = INNER - 440 - 20
  roundedRectPath(ctx, bx, y + 18, bw, h - 36, 12)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (quote.promo) {
    ctx.fillStyle = C.blanco
    ctx.beginPath()
    ctx.arc(bx, y + 30, 16, 0, Math.PI * 2)
    ctx.fill()
    iconStar(ctx, bx, y + 30, 9, C.verdeOscuro)
    ctx.font = `20px ${FONT}`
    const prefix = `${quote.promo.count} cuotas de `
    const amount = formatMoney(quote.promo.valor)
    ctx.font = `20px ${FONT}`
    const pw = ctx.measureText(prefix).width
    ctx.font = `bold 24px ${FONT}`
    const aw = ctx.measureText(amount).width
    const startX = bx + bw / 2 - (pw + aw) / 2
    text(ctx, prefix, startX, y + 56, { size: 20, color: C.blanco })
    text(ctx, amount, startX + pw, y + 56, { size: 24, weight: 'bold', color: C.blanco })
    text(ctx, 'SIN RECARGO', bx + bw / 2, y + 88, { size: 20, weight: 'bold', color: C.blanco, align: 'center' })
  } else {
    text(ctx, 'Precio de contado', bx + bw / 2, y + 62, { size: 20, weight: 'bold', color: C.blanco, align: 'center' })
    text(ctx, 'Consultá planes de pago', bx + bw / 2, y + 88, { size: 15, color: '#cfe6e4', align: 'center' })
  }
  return y + h
}

function drawPaymentOptions(ctx, quote, y) {
  iconCard(ctx, PAD + 12, y + 8, 22)
  text(ctx, 'FORMAS DE PAGO', PAD + 34, y + 14, { size: 16, weight: 'bold', color: C.verdeOscuro })
  y += 34

  // Cuotas: 3/6/8/10 (siempre) + la promo sin recargo (si su cantidad no está ya).
  const options = [3, 6, 8, 10].map((n) => ({ n, valor: quote.cuotas[n]?.valor, promo: false }))
  if (quote.promo && !options.some((o) => o.n === quote.promo.count)) {
    options.push({ n: quote.promo.count, valor: quote.promo.valor, promo: true })
  } else if (quote.promo) {
    const o = options.find((x) => x.n === quote.promo.count)
    o.promo = true
    o.valor = quote.promo.valor
  }
  options.sort((a, b) => a.n - b.n)

  const gap = 12
  const cw = (INNER - gap * (options.length - 1)) / options.length
  const ch = 96
  options.forEach((o, i) => {
    const x = PAD + i * (cw + gap)
    card(ctx, x, y, cw, ch, {
      fill: o.promo ? C.tinteSuave : C.blanco,
      stroke: o.promo ? C.verde : C.borde,
      radius: 12,
    })
    if (o.promo) {
      ctx.fillStyle = C.verde
      ctx.beginPath()
      ctx.arc(x + cw - 16, y + 16, 12, 0, Math.PI * 2)
      ctx.fill()
      iconStar(ctx, x + cw - 16, y + 16, 7, C.blanco)
    }
    text(ctx, `${o.n} cuotas`, x + cw / 2, y + 32, { size: 16, color: o.promo ? C.verdeOscuro : C.texto, align: 'center' })
    text(ctx, formatMoney(o.valor), x + cw / 2, y + 62, { size: 22, weight: 'bold', color: o.promo ? C.verdeOscuro : C.texto, align: 'center' })
    if (o.promo) {
      const pw = 104
      roundedRectPath(ctx, x + cw / 2 - pw / 2, y + 70, pw, 20, 10)
      ctx.fillStyle = C.verdeOscuro
      ctx.fill()
      text(ctx, 'SIN RECARGO', x + cw / 2, y + 84, { size: 11, weight: 'bold', color: C.blanco, align: 'center' })
    }
  })
  return y + ch
}

function drawBenefits(ctx, incluye, y) {
  const cols = Math.min(4, Math.max(1, incluye.length))
  const gap = 16
  const colW = (INNER - 32 - gap * (cols - 1)) / cols
  const itemFont = `15px ${FONT}`
  const lineH = 20
  const rows = []
  for (let i = 0; i < incluye.length; i += cols) rows.push(incluye.slice(i, i + cols))
  const rowHeights = rows.map((row) =>
    Math.max(...row.map((item) => wrapLines(ctx, item, colW - 36, itemFont).length)) * lineH + 18
  )
  const h = 52 + rowHeights.reduce((a, b) => a + b, 0) + 8
  card(ctx, PAD, y, INNER, h, { radius: 14 })
  iconGift(ctx, PAD + 30, y + 30, 24)
  text(ctx, 'BENEFICIOS INCLUIDOS', PAD + 54, y + 36, { size: 16, weight: 'bold', color: C.verdeOscuro })

  let ry = y + 56
  rows.forEach((row, ri) => {
    row.forEach((item, ci) => {
      const x = PAD + 16 + ci * (colW + gap)
      iconCircleCheck(ctx, x + 11, ry + 12, 10)
      const lines = wrapLines(ctx, item, colW - 36, itemFont)
      lines.forEach((line, li) => text(ctx, line, x + 30, ry + 17 + li * lineH, { size: 15 }))
      if (ci > 0) {
        ctx.strokeStyle = C.borde
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x - gap / 2, ry)
        ctx.lineTo(x - gap / 2, ry + rowHeights[ri] - 14)
        ctx.stroke()
      }
    })
    ry += rowHeights[ri]
  })
  return y + h
}

function drawWarning(ctx, warning, y) {
  const lines = wrapLines(ctx, `⚠ ${warning.full}`, INNER - 48, `bold 15px ${FONT}`)
  const h = 24 + lines.length * 21 + 8
  card(ctx, PAD, y, INNER, h, { fill: C.crema, stroke: null, radius: 12 })
  lines.forEach((line, i) => text(ctx, line, PAD + 24, y + 30 + i * 21, { size: 15, weight: 'bold' }))
  return y + h
}

function drawFooter(ctx, y, logos) {
  // Banda clara con la fecha
  ctx.fillStyle = C.tinteSuave
  ctx.fillRect(0, y, WIDTH, 44)
  iconCalendar(ctx, PAD + 12, y + 22, 20)
  text(ctx, `Cotización generada el ${new Date().toLocaleDateString('es-UY')}`, PAD + 34, y + 28, { size: 15, color: C.texto })
  y += 44
  // Barra verde con isotipo + eslogan
  ctx.fillStyle = C.verdeOscuro
  ctx.fillRect(0, y, WIDTH, 60)
  ctx.fillStyle = C.blanco
  ctx.beginPath()
  ctx.arc(PAD + 22, y + 30, 20, 0, Math.PI * 2)
  ctx.fill()
  drawImageFit(ctx, logos.simple, PAD + 22, y + 12, 36, 36, 'center')
  text(ctx, 'Tu tranquilidad, nuestra prioridad. Siempre.', WIDTH / 2 + 20, y + 37, {
    size: 20,
    style: 'italic',
    color: C.blanco,
    align: 'center',
  })
  return y + 60
}

const FOOTER_TOTAL = 44 + 60
const MEASURE_CANVAS_HEIGHT = 3000

function drawContent(ctx, opportunity, raw, quote, canvasHeight, logos) {
  ctx.fillStyle = C.blanco
  ctx.fillRect(0, 0, WIDTH, canvasHeight)
  let y = drawHeader(ctx, logos)
  y = drawCoverTitle(ctx, raw, y + 14)
  y = drawVehicleCard(ctx, opportunity, raw, quote, y + 6)
  y = drawPriceBand(ctx, quote, y + 18)
  y = drawPaymentOptions(ctx, quote, y + 22)
  if (quote.incluye?.length) y = drawBenefits(ctx, quote.incluye, y + 18)
  if (quote.warning) y = drawWarning(ctx, quote.warning, y + 16)
  return y + 22
}

// Dos pasadas: la primera sobre un canvas descartable para medir hasta dónde llega el
// contenido (el nombre del vehículo y los beneficios varían de alto), la segunda sobre
// el canvas del tamaño justo con el pie pegado al final.
export async function renderQuoteImageDataUrl(opportunity, raw, quote) {
  const key = (raw.compania || '').trim().toUpperCase()
  const [stagnari, simple, insurer] = await Promise.all([
    loadImage(stagnariLogo),
    loadImage(stagnariLogoSimple),
    loadImage(INSURER_LOGOS[key]),
  ])
  const logos = { stagnari, simple, insurer }

  const measureCanvas = document.createElement('canvas')
  measureCanvas.width = WIDTH
  measureCanvas.height = MEASURE_CANVAS_HEIGHT
  const contentBottom = drawContent(measureCanvas.getContext('2d'), opportunity, raw, quote, MEASURE_CANVAS_HEIGHT, logos)

  const height = Math.ceil(contentBottom) + FOOTER_TOTAL
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')
  drawContent(ctx, opportunity, raw, quote, height, logos)
  drawFooter(ctx, height - FOOTER_TOTAL, logos)

  return canvas.toDataURL('image/png')
}
