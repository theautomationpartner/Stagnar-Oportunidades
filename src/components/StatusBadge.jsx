import './StatusBadge.css'

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
