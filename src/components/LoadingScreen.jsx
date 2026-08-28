import GradientSpinner from './GradientSpinner'
import './LoadingScreen.css'

// Pantalla de carga única para toda la app (auditoría): antes cada lugar armaba la suya
// — el fallback de Suspense en App.jsx usaba el Loader de @vibe/core sin color (se
// pintaba en negro, con stroke:currentColor) ni centrado vertical. Acá: spinner de
// marca (mismo GradientSpinner de los popups de "procesando"), centrado en el alto de
// la pantalla, título + mensaje descriptivo, y anunciado a lectores de pantalla.
export default function LoadingScreen({ title = 'Cargando...', message, compact = false }) {
  return (
    <div className={compact ? 'loading-screen loading-screen--compact' : 'loading-screen'} role="status" aria-live="polite">
      <GradientSpinner size={56} />
      <p className="loading-screen__title">{title}</p>
      {message && <p className="loading-screen__message">{message}</p>}
    </div>
  )
}
