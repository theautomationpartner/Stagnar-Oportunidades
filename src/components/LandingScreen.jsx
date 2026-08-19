import { MdNoteAdd, MdSearch, MdChevronRight } from 'react-icons/md'
import './LandingScreen.css'

export default function LandingScreen({ onCreateNew, onSearchExisting }) {
  return (
    <div className="landing">
      <div className="landing__cards">
        <button type="button" className="landing__card landing__card--primary" onClick={onCreateNew}>
          <span className="landing__card-icon landing__card-icon--primary">
            <MdNoteAdd />
          </span>
          <span className="landing__card-body">
            <span className="landing__card-title">Nueva oportunidad</span>
            <span className="landing__card-desc">Crear</span>
          </span>
          <MdChevronRight className="landing__card-chevron landing__card-chevron--primary" />
        </button>

        <button type="button" className="landing__card landing__card--secondary" onClick={onSearchExisting}>
          <span className="landing__card-icon landing__card-icon--secondary">
            <MdSearch />
          </span>
          <span className="landing__card-body">
            <span className="landing__card-title">Buscar oportunidad</span>
            <span className="landing__card-desc">Continuar una existente.</span>
          </span>
          <MdChevronRight className="landing__card-chevron landing__card-chevron--secondary" />
        </button>
      </div>
    </div>
  )
}
