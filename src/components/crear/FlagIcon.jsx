// Banderas como SVG inline (simplificadas) para el selector de código de país — los
// emoji de banderas (🇺🇾) no se renderizan en Windows (Chrome/Edge los muestran como
// las letras "UY"), así que van dibujadas. Los países de CODIGO_PAIS_OPTIONS.
// Bandera de franjas iguales, horizontales ('h') o verticales ('v').
function franjas(sentido, colores) {
  const n = colores.length
  return (
    <>
      {colores.map((color, i) =>
        sentido === 'h' ? (
          <rect key={i} y={(14 / n) * i} width="20" height={14 / n} fill={color} />
        ) : (
          <rect key={i} x={(20 / n) * i} width={20 / n} height="14" fill={color} />
        )
      )}
    </>
  )
}

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
  // A pedido (validación por país): el resto de América Latina. Simplificadas igual que
  // las de arriba — a 20px alcanza con los colores y la disposición de las franjas.
  PE: franjas('v', ['#d91023', '#fff', '#d91023']),
  BO: franjas('h', ['#d52b1e', '#f9e300', '#007934']),
  CO: (
    <>
      <rect width="20" height="7" fill="#fcd116" />
      <rect y="7" width="20" height="3.5" fill="#003893" />
      <rect y="10.5" width="20" height="3.5" fill="#ce1126" />
    </>
  ),
  EC: (
    <>
      <rect width="20" height="7" fill="#ffd100" />
      <rect y="7" width="20" height="3.5" fill="#034ea2" />
      <rect y="10.5" width="20" height="3.5" fill="#ed1c24" />
      <circle cx="10" cy="7" r="1.6" fill="#8b5a2b" />
    </>
  ),
  VE: (
    <>
      {franjas('h', ['#ffcc00', '#00247d', '#cf142b'])}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <circle key={i} cx={10 + 3 * Math.cos(Math.PI * (1 - i / 7))} cy={7.6 - 2.4 * Math.sin(Math.PI * (1 - i / 7))} r="0.35" fill="#fff" />
      ))}
    </>
  ),
  MX: (
    <>
      {franjas('v', ['#006847', '#fff', '#ce1126'])}
      <circle cx="10" cy="7" r="1.5" fill="#8c6a2b" />
    </>
  ),
  CR: (
    <>
      <rect width="20" height="14" fill="#002b7f" />
      <rect y="2.33" width="20" height="9.33" fill="#fff" />
      <rect y="4.67" width="20" height="4.67" fill="#ce1126" />
    </>
  ),
  PA: (
    <>
      <rect width="20" height="14" fill="#fff" />
      <rect x="10" width="10" height="7" fill="#d21034" />
      <rect y="7" width="10" height="7" fill="#005293" />
      <circle cx="5" cy="3.5" r="1.3" fill="#005293" />
      <circle cx="15" cy="10.5" r="1.3" fill="#d21034" />
    </>
  ),
  GT: (
    <>
      {franjas('v', ['#4997d0', '#fff', '#4997d0'])}
      <circle cx="10" cy="7" r="1.5" fill="#6c9b3c" />
    </>
  ),
  SV: (
    <>
      {franjas('h', ['#0047ab', '#fff', '#0047ab'])}
      <circle cx="10" cy="7" r="1.3" fill="#e6c200" />
    </>
  ),
  HN: (
    <>
      {franjas('h', ['#0073cf', '#fff', '#0073cf'])}
      {[[7, 6], [13, 6], [10, 7], [7, 8], [13, 8]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="0.6" fill="#0073cf" />
      ))}
    </>
  ),
  NI: (
    <>
      {franjas('h', ['#0067c6', '#fff', '#0067c6'])}
      <circle cx="10" cy="7" r="1.3" fill="none" stroke="#c8a400" strokeWidth="0.5" />
    </>
  ),
  CU: (
    <>
      {franjas('h', ['#002a8f', '#fff', '#002a8f', '#fff', '#002a8f'])}
      <polygon points="0,0 9,7 0,14" fill="#cf142b" />
      <circle cx="3" cy="7" r="1" fill="#fff" />
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
