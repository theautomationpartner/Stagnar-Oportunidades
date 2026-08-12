import './GradientSpinner.css'

// Spinner con degradé azul→verde de marca — @vibe/core no trae un Loader con degradé
// (su SVG usa stroke:currentColor, un solo color), así que este es un SVG propio.
// Compartido entre CotizandoModal.jsx y WhatsAppSendModal.jsx (cualquier popup de
// "procesando" de varios pasos).
export default function GradientSpinner({ size = 48 }) {
  return (
    <svg
      className="gradient-spinner"
      viewBox="0 0 50 50"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="gradient-spinner-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0073ea" />
          <stop offset="100%" stopColor="#008581" />
        </linearGradient>
      </defs>
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="url(#gradient-spinner-gradient)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="90 40"
      />
    </svg>
  )
}
