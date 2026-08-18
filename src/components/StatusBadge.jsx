import './StatusBadge.css'

// Excepción deliberada a la migración a @vibe/core: el `Label` nativo solo
// acepta una paleta cerrada de colores con nombre (LabelColor), no un hex
// arbitrario — y acá el color viene de la config REAL y en vivo de la
// columna de estado en monday (cualquier color que el admin haya elegido),
// no de una paleta fija nuestra. Migrarlo perdería la fidelidad exacta al
// color configurado en monday, así que se mantiene este badge a medida.

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16))
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function relativeLuminance([r, g, b]) {
  const linear = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

// Contraste contra un fondo ~blanco (el badge lo tiñe con el mismo color al 10% de
// opacidad, ver `background` más abajo — queda tan claro que blanco puro es una base
// de cálculo válida y, si algo, un poco conservadora).
function contrastAgainstWhite(rgb) {
  return 1.05 / (relativeLuminance(rgb) + 0.05)
}

// A pedido (auditoría UI/UX): algunos colores de estado que monday permite elegir (ej.
// verdes/amarillos tipo "mint", pensados como acento de un punto/borde, no como texto)
// no llegan al contraste mínimo 4.5:1 de WCAG AA usados directo como color de texto
// sobre blanco. Como el color es dinámico (lo define quien administre el tablero, no
// esta app), en vez de una lista fija de excepciones se oscurece progresivamente hacia
// negro — sin cambiar de matiz — hasta que sí lo cumple. El punto/dot de al lado sigue
// mostrando el color real de monday sin tocar, esto solo ajusta el TEXTO.
function readableTextColor(hex) {
  const rgb = hexToRgb(hex)
  if (contrastAgainstWhite(rgb) >= 4.5) return hex
  let [r, g, b] = rgb
  for (let i = 0; i < 20 && contrastAgainstWhite([r, g, b]) < 4.5; i += 1) {
    r *= 0.9
    g *= 0.9
    b *= 0.9
  }
  return rgbToHex([r, g, b])
}

export default function StatusBadge({ label, color }) {
  const textColor = readableTextColor(color.bg)
  return (
    <span
      className="status-badge"
      style={{ color: textColor, borderColor: color.border, background: `${color.bg}1a` }}
    >
      <span className="status-badge__dot" style={{ background: color.bg }} />
      {label}
    </span>
  )
}
