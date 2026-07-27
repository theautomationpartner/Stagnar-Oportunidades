import './StatusBadge.css'

// Excepción deliberada a la migración a @vibe/core: el `Label` nativo solo
// acepta una paleta cerrada de colores con nombre (LabelColor), no un hex
// arbitrario — y acá el color viene de la config REAL y en vivo de la
// columna de estado en monday (cualquier color que el admin haya elegido),
// no de una paleta fija nuestra. Migrarlo perdería la fidelidad exacta al
// color configurado en monday, así que se mantiene este badge a medida.
export default function StatusBadge({ label, color }) {
  return (
    <span
      className="status-badge"
      style={{ color: color.bg, borderColor: color.border, background: `${color.bg}1a` }}
    >
      <span className="status-badge__dot" style={{ background: color.bg }} />
      {label}
    </span>
  )
}
