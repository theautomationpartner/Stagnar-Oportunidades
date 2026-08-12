import './Avatar.css'

const PALETTE = ['#0073ea', '#a25ddc', '#00c875', '#e2445c', '#fdab3d', '#037f4c', '#579bfc']

function colorFor(seed) {
  const sum = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return PALETTE[sum % PALETTE.length]
}

export default function Avatar({ label }) {
  const safeLabel = label && label !== '—' ? label : '?'
  return (
    <span className="avatar" style={{ background: colorFor(safeLabel) }}>
      {safeLabel}
    </span>
  )
}
