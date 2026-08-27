import { useCallback, useEffect, useState } from 'react'

// Router mínimo por hash, sin dependencias (auditoría: antes la navegación vivía solo en
// useState de App.jsx — F5 volvía siempre al Inicio, "atrás" del navegador salía de la
// app embebida y no había forma de compartir el link de una Oportunidad).
//
// Rutas:
//   #/                          Inicio (landing)
//   #/oportunidades             tabla
//   #/oportunidades/:id         detalle de una Oportunidad
//   #/oportunidades/:id/:step   detalle en un paso puntual (cotizar|comparar|confirmar|emitir)
//   #/crear                     wizard de creación
//
// Hash (no pathname) a propósito: la app corre embebida en un iframe de monday y en
// Vercel/Vite como SPA — el hash no requiere reglas de rewrite y no interfiere con la
// URL del host.
const parse = () => {
  const h = (window.location.hash || '#/').replace(/^#\/?/, '')
  const [seg = '', id = '', step = ''] = h.split('/').map((s) => decodeURIComponent(s))
  if (seg === 'oportunidades') return { seg, id: id || null, step: step || null }
  if (seg === 'crear') return { seg, id: null, step: null }
  return { seg: 'inicio', id: null, step: null }
}

export function useHashRoute() {
  const [route, setRoute] = useState(parse)

  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  // go('oportunidades', id, 'cotizar') — `replace` evita apilar entradas en el historial
  // (ej. al sincronizar el paso activo del detalle).
  const go = useCallback((seg, id, step, { replace = false } = {}) => {
    const parts = [seg === 'inicio' ? '' : seg, id, step].filter(Boolean).map(encodeURIComponent)
    const hash = '#/' + parts.join('/')
    if (hash === window.location.hash) return
    if (replace) {
      window.history.replaceState(null, '', hash)
      setRoute(parse())
    } else {
      window.location.hash = hash
    }
  }, [])

  return [route, go]
}
