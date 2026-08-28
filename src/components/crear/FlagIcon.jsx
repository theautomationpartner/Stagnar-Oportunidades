// Banderas como SVG inline (simplificadas) para el selector de código de país — los
// emoji de banderas (🇺🇾) no se renderizan en Windows (Chrome/Edge los muestran como
// las letras "UY"), así que van dibujadas. Solo los 5 países de CODIGO_PAIS_OPTIONS.
const FLAGS = {
  UY: (
    <>
      <rect width="20" height="14" fill="#fff" />
      {[1, 3, 5, 7].map((i) => (
        <rect key={i} y={i * 1.556} width="20" height="1.556" fill="#0038a8" />
      ))}
      <rect width="9" height="7.8" fill="#fff" />
      <circle cx="4.5" cy="3.9" r="2.1" fill="#fcd116" />
    </>
  ),
  AR: (
    <>
      <rect width="20" height="14" fill="#74acdf" />
      <rect y="4.67" width="20" height="4.67" fill="#fff" />
      <circle cx="10" cy="7" r="1.5" fill="#f6b40e" />
    </>
  ),
  BR: (
    <>
      <rect width="20" height="14" fill="#009c3b" />
      <polygon points="10,1.6 18.4,7 10,12.4 1.6,7" fill="#ffdf00" />
      <circle cx="10" cy="7" r="3" fill="#002776" />
    </>
  ),
  PY: (
    <>
      <rect width="20" height="4.67" fill="#d52b1e" />
      <rect y="4.67" width="20" height="4.67" fill="#fff" />
      <rect y="9.33" width="20" height="4.67" fill="#0038a8" />
      <circle cx="10" cy="7" r="1.6" fill="none" stroke="#7a7a7a" strokeWidth="0.5" />
    </>
  ),
  CL: (
    <>
      <rect width="20" height="7" fill="#fff" />
      <rect y="7" width="20" height="7" fill="#d52b1e" />
      <rect width="7" height="7" fill="#0039a6" />
      <polygon
        points="3.5,1.3 4.1,3 5.9,3 4.4,4.1 5,5.8 3.5,4.7 2,5.8 2.6,4.1 1.1,3 2.9,3"
        fill="#fff"
      />
    </>
  ),
}

export default function FlagIcon({ iso, size = 20 }) {
  const content = FLAGS[iso]
  if (!content) return null
  return (
    <svg
      className="flag-icon"
      viewBox="0 0 20 14"
      width={size}
      height={(size * 14) / 20}
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  )
}
