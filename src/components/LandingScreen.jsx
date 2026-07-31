import { MdPersonAddAlt, MdSearch } from 'react-icons/md'
import { Button } from '@vibe/core'
import './LandingScreen.css'

export default function LandingScreen({ onCreateNew, onSearchExisting }) {
  return (
    <div className="landing">
      <h1 className="landing__title">Oportunidades</h1>
      <p className="landing__subtitle">Gestioná y creá nuevas oportunidades.</p>

      <div className="landing__cards">
        <div className="landing__card landing__card--primary">
          <div className="landing__card-icon landing__card-icon--primary">
            <MdPersonAddAlt />
          </div>
          <h2 className="landing__card-title">Crear nueva oportunidad</h2>
          <p className="landing__card-desc">
            Comenzá desde cero creando un cliente y una oportunidad nueva.
          </p>
          <Button kind="primary" onClick={onCreateNew}>
            Crear oportunidad desde cero
          </Button>
        </div>

        <div className="landing__card">
          <div className="landing__card-icon landing__card-icon--secondary">
            <MdSearch />
          </div>
          <h2 className="landing__card-title">Buscar oportunidad existente</h2>
          <p className="landing__card-desc">
            Buscá oportunidades ya creadas para continuar gestionándolas.
          </p>
          <Button kind="secondary" onClick={onSearchExisting}>
            Buscar oportunidades
          </Button>
        </div>
      </div>
    </div>
  )
}
