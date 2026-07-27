import { Avatar as VibeAvatar } from '@vibe/core'

const PALETTE = ['#0073ea', '#a25ddc', '#00c875', '#e2445c', '#fdab3d', '#037f4c', '#579bfc']

function colorFor(seed) {
  const sum = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return PALETTE[sum % PALETTE.length]
}

// Migrado a @vibe/core: Avatar nativo en vez de un <span> a mano — mismo
// contrato de prop (label) para no tocar OpportunitiesTable.jsx.
export default function Avatar({ label }) {
  const safeLabel = label && label !== '—' ? label : '?'
  return <VibeAvatar text={safeLabel} customBackgroundColor={colorFor(safeLabel)} size="small" type="text" />
}
