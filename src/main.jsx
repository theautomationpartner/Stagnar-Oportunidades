import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@vibe/core'
import App from './App.jsx'
import './index.css'

// ThemeProvider envuelve toda la app para que los componentes nativos de
// @vibe/core (Button, Dropdown, etc. — ver FilterPanel.jsx) tomen el theming
// real de monday en vez de sus estilos por defecto sueltos.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)
