import { createContext, useContext } from 'react'

// Contextos globales (auditoría): `schema` (status/dropdowns/departamentos/localidades/
// panel de tarifas) viajaba hasta 5 niveles por props y `mondayUser` se pasaba a 4
// instancias distintas de Sidebar. Los componentes que ya reciben estos datos por prop
// siguen funcionando igual — el contexto es el camino para ir sacando props sin tener
// que tocar toda la cadena de una vez (ver useSchema/useMondayUser/useNav).
const SchemaContext = createContext(null)
const MondayUserContext = createContext(null)
const NavContext = createContext(null)

export function AppProviders({ schema, mondayUser, nav, children }) {
  return (
    <SchemaContext.Provider value={schema}>
      <MondayUserContext.Provider value={mondayUser}>
        <NavContext.Provider value={nav}>{children}</NavContext.Provider>
      </MondayUserContext.Provider>
    </SchemaContext.Provider>
  )
}

export const useSchema = () => useContext(SchemaContext)
export const useMondayUser = () => useContext(MondayUserContext)
// { route, go, goHome, goTable, goCreate, openOpportunity }
export const useNav = () => useContext(NavContext)
