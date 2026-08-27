// Borrador de "Crear Oportunidad" en localStorage — extraído de CrearOportunidadForm.jsx.


// A pedido: si eligen una persona en "Buscar Persona" y se van del formulario (Inicio,
// Ver Oportunidades) antes de terminar de cargar la Oportunidad, no hay que hacerlos
// buscar de nuevo al volver — se guarda ese resultado (y los datos personales que
// autocompletó) en localStorage por un rato corto nada más: pensado para "me fui un
// momento y vuelvo", no para autocompletar algo de hace rato con datos capaz ya viejos.
export const PERSISTED_SEARCH_KEY = 'stagnari:crear-op:buscar-persona'

export const PERSISTED_SEARCH_TTL_MS = 10 * 60 * 1000

export function loadPersistedSearch() {
  try {
    const raw = window.localStorage.getItem(PERSISTED_SEARCH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > PERSISTED_SEARCH_TTL_MS) {
      window.localStorage.removeItem(PERSISTED_SEARCH_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function savePersistedSearch(data) {
  try {
    window.localStorage.setItem(PERSISTED_SEARCH_KEY, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch {
    // localStorage lleno o deshabilitado (modo privado, etc.): no es crítico, el
    // formulario sigue funcionando igual, solo no se recuerda para la próxima.
  }
}

export function clearPersistedSearch() {
  try {
    window.localStorage.removeItem(PERSISTED_SEARCH_KEY)
  } catch {
    // sin efecto si ya no existía o localStorage no está disponible.
  }
}
