import { MdAdd, MdHome } from 'react-icons/md'
import { Button } from '@vibe/core'
import stagnariLogo from '../assets/stagnari-logo.png'
import './TopBar.css'

// onCreateNew/onHome son opcionales — solo la pantalla de la tabla de Oportunidades los
// pasa (a pedido, se subieron acá desde PageHeader.jsx, arriba del todo en el nav). En
// 'landing' y 'create' no se pasan: LandingScreen ya tiene sus propias tarjetas grandes
// para lo mismo, y CrearOportunidadForm ya tiene sus propios botones en su header.
export default function TopBar({ onCreateNew, onHome }) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <img className="topbar__logo-img" src={stagnariLogo} alt="Stagnari Seguros" />
      </div>

      <nav className="topbar__nav" aria-label="Secciones">
        <span className="topbar__nav-item topbar__nav-item--active">Oportunidades</span>
      </nav>

      <div className="topbar__actions">
        {onCreateNew && (
          <Button kind="primary" onClick={onCreateNew}>
            <MdAdd /> Nueva oportunidad
          </Button>
        )}
        {onHome && (
          <Button kind="secondary" onClick={onHome}>
            <MdHome /> Inicio
          </Button>
        )}
        <span className="topbar__avatar" title="Usuario">
          MC
        </span>
      </div>
    </header>
  )
}
