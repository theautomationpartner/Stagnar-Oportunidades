import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@vibe/core'
import '@vibe/core/tokens'
import App from './App.jsx'
import AuthGate from './auth/AuthGate.jsx'
import './index.css'

// ThemeProvider envuelve toda la app para que los componentes nativos de
// @vibe/core (Button, Dropdown, etc. — ver FilterPanel.jsx) tomen el theming
// real de monday en vez de sus estilos por defecto sueltos.
//
// AuthGate va POR DENTRO de ThemeProvider (sus pantallas usan Button de @vibe/core) y POR
// FUERA de App: mientras no haya sesión completa, App no se monta, y por lo tanto no
// dispara ninguno de los fetch que hace al montarse. Ver el comentario de AuthGate.jsx
// sobre por qué no alcanza con taparla.
//
// Con AUTH_ENFORCE=off en el backend, AuthGate deja pasar de largo y la app arranca igual
// que antes: agregar esta línea no cambia nada hasta que la infraestructura esté lista.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </ThemeProvider>
  </StrictMode>
)
