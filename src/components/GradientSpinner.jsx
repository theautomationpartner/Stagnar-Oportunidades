import './GradientSpinner.css'

// Spinner con el degradé verde de Stagnari — @vibe/core no trae un Loader con degradé
// (su SVG usa stroke:currentColor, un solo color), así que este es un SVG propio.
// Compartido entre LoadingScreen y los popups de "procesando" (CotizandoModal,
// WhatsAppSendModal, GuardandoOportunidadModal): es la única rueda de carga de la app.
//
// A pedido va en verde y no en el azul→verde de antes: sobre el disco blanco de la
// pantalla de carga, el arco se leía azul contra el fondo verde de marca. Los dos tonos
// son los mismos extremos del degradé del fondo (ver LoadingScreen.css).
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
          <stop offset="0%" stopColor="#00615e" />
          <stop offset="100%" stopColor="#009d97" />
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
