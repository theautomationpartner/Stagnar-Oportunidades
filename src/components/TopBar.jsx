import stagnariLogo from '../assets/stagnari-logo.png'
import './TopBar.css'

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <img className="topbar__logo-img" src={stagnariLogo} alt="Stagnari Seguros" />
      </div>

      <nav className="topbar__nav" aria-label="Secciones">
        <span className="topbar__nav-item topbar__nav-item--active">Oportunidades</span>
      </nav>

      <div className="topbar__actions">
        <span className="topbar__avatar" title="Usuario">
          MC
        </span>
      </div>
    </header>
  )
}
