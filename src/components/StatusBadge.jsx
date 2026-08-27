import './StatusBadge.css'

// Excepción deliberada a la migración a @vibe/core: el `Label` nativo solo
// acepta una paleta cerrada de colores con nombre (LabelColor), no un hex
// arbitrario — y acá el color viene de la config REAL y en vivo de la
// columna de estado en monday (cualquier color que el admin haya elegido),
// no de una paleta fija nuestra. Migrarlo perdería la fidelidad exacta al
// color configurado en monday, así que se mantiene este badge a medida.
//
// Auditoría WCAG 1.4.1/1.4.3: el color de monday se conserva tal cual en el punto, el
// borde y el fondo tintado (donde no compromete legibilidad), pero el TEXTO ya no se
// pinta con ese mismo hex — un estado amarillo o verde claro configurado en monday
// dejaba el texto por debajo de 2:1. El texto va siempre en --text-dark, así el
// estado se sigue distinguiendo por color (punto/borde) y a la vez se lee.
export default function StatusBadge({ label, color }) {
  return (
    <span
      className="status-badge"
      style={{ borderColor: color.border, background: `${color.bg}1a` }}
    >
      <span className="status-badge__dot" style={{ background: color.bg }} aria-hidden="true" />
      {label}
    </span>
  )
}
