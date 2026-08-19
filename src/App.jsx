import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import PageHeader from './components/PageHeader'
import FilterPanel from './components/FilterPanel'
import OpportunitiesTable from './components/OpportunitiesTable'
import OpportunityDetail from './components/OpportunityDetail'
import LandingScreen from './components/LandingScreen'
import CrearOportunidadForm from './components/CrearOportunidadForm'
import { fetchOpportunities, fetchDepartamentos, fetchLocalidades, fetchCurrentMondayUser } from './services/mondayApi'
import { mapOpportunities } from './services/opportunityMapper'
import { fetchFilterAndStatusSchema } from './services/boardSchema'
import { fetchPanelData } from './services/recargoPanel'
import './App.css'

// Techo real de la API de monday para items_page en una sola página (ver
// fetchOpportunities en mondayApi.js) — con esto se trae el tablero completo de una,
// nada de "solo los primeros 10" (los filtros/búsqueda de FilterPanel son client-side
// sobre lo ya cargado, así que si no está cargado no aparece por más que matchee).
const ITEMS_FETCH_LIMIT = 500

// A pedido: la tabla de Oportunidades pagina de a 20 en vez de mostrar las 500
// cargadas de una — el fetch de arriba (ITEMS_FETCH_LIMIT) sigue trayendo TODO el
// tablero igual, esto es solo paginación de la vista/tabla (client-side, ver
// filteredOpportunities/pagedOpportunities más abajo), así que la búsqueda y los
// filtros siguen actuando sobre el universo completo, no solo sobre la página visible.
const PAGE_SIZE = 20

// A pedido: Marca/Año/Nombre/CI/Teléfono ya no tienen filtro propio (ver
// FilterPanel.jsx) — quedan cubiertos por la única barra de búsqueda de texto libre
// (ver el haystack en filteredOpportunities más abajo). Solo quedan acá los 3 "filtros
// básicos" que un texto libre no puede resolver por ser estados/categorías.
const EMPTY_FILTERS = {
  estadoCotizacion: '',
  tipoSujeto: '',
  estadoEnvio: '',
}

export default function App() {
  const [opportunities, setOpportunities] = useState([])
  const [boardTotalCount, setBoardTotalCount] = useState(0)
  const [schema, setSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [openOpportunityId, setOpenOpportunityId] = useState(null)
  // A pedido: el botón "Volver a Persona Seleccionada" de arriba de la Oportunidad (ver
  // OpportunityDetail.jsx) solo aparece cuando se llegó ahí apretando "Ir a esta
  // oportunidad" en el historial de Crear Oportunidad (paso 1) — no si se abrió desde la
  // tabla ni recién creada. Se apaga solo (ver handleOpportunityAction más abajo) en
  // cuanto se hace alguna acción adentro de la Oportunidad: en ese punto ya no tiene
  // sentido "volver" a terminar de crearla, la Oportunidad ya está en curso.
  const [openedFromCrearFlow, setOpenedFromCrearFlow] = useState(false)
  // Pantalla previa a la tabla: elegir entre crear una oportunidad nueva o ver las ya
  // existentes. 'landing' | 'table' | 'create' — se puede ir de una a otra directo,
  // sin pasar necesariamente por 'landing' de nuevo (botón "Nueva oportunidad" en la
  // tabla, y "Ver oportunidades existentes" desde el formulario de creación).
  const [view, setView] = useState('landing')
  // Nombre + avatar reales de quien está mirando la app (pie de Sidebar.jsx) — se pide
  // una sola vez acá arriba (en vez de en cada instancia de Sidebar, que se
  // monta/desmonta con cada cambio de pantalla) y se pasa como prop a las 4. Nunca
  // bloquea el resto de la app: queda en null (Sidebar cae a su fallback genérico) si
  // no hay contexto de monday disponible o si falla, ver fetchCurrentMondayUser.
  const [mondayUser, setMondayUser] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchCurrentMondayUser().then((user) => {
      if (!cancelled) setMondayUser(user)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetchOpportunities(ITEMS_FETCH_LIMIT),
      fetchFilterAndStatusSchema(),
      fetchDepartamentos(),
      fetchLocalidades(),
      fetchPanelData(),
    ])
      .then(([{ items, totalCount }, fetchedSchema, departamentos, localidades, panelData]) => {
        if (cancelled) return
        setSchema({ ...fetchedSchema, departamentos, localidades, ...panelData })
        setBoardTotalCount(totalCount)
        setOpportunities(
          mapOpportunities(items, {
            estadoOportunidad: fetchedSchema.estadoOportunidad.colorsByLabel,
            estadoCotizacion: fetchedSchema.estadoCotizacion.colorsByLabel,
          })
        )
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filterOptions = useMemo(
    () => ({
      estadosCotizacion: schema?.estadoCotizacion.options ?? [],
      tiposSujeto: schema?.tipoSujeto.options ?? [],
      estadosEnvio: schema?.estadoEnvio.options ?? [],
    }),
    [schema]
  )

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const filteredOpportunities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return opportunities.filter((opp) => {
      if (term) {
        // A pedido: "una sola barra de búsqueda para todos los campos posibles" — se
        // agregan acá marca/año (antes cada uno tenía su propio Dropdown, ver
        // FilterPanel.jsx) además de lo que ya cubría bienLinea1 (marca+modelo/año).
        const haystack = [
          opp.clienteNombre,
          opp.ci,
          opp.telefono,
          opp.bienLinea1,
          opp.companias,
          opp.marca,
          opp.anio,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(term)) return false
      }

      if (filters.estadoCotizacion && opp.estadoCotizacion !== filters.estadoCotizacion) return false
      if (filters.tipoSujeto && opp.tipoSujeto !== filters.tipoSujeto) return false
      if (filters.estadoEnvio && opp.estadoEnvio !== filters.estadoEnvio) return false

      return true
    })
  }, [opportunities, searchTerm, filters])

  // A pedido: vuelve a la página 1 en cuanto cambia la búsqueda o algún filtro — si no,
  // se podía quedar en una página que ya no existe (ej. estabas en la página 5 y el
  // nuevo resultado filtrado solo tiene 2 páginas).
  useEffect(() => {
    setPage(1)
  }, [searchTerm, filters])

  const totalPages = Math.max(1, Math.ceil(filteredOpportunities.length / PAGE_SIZE))
  const pagedOpportunities = useMemo(
    () => filteredOpportunities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredOpportunities, page]
  )

  if (openOpportunityId) {
    return (
      <div className="app-shell">
        <Sidebar
          user={mondayUser}
          onNavigateOportunidades={() => {
            setOpenOpportunityId(null)
            setOpenedFromCrearFlow(false)
            setView('table')
          }}
          onNavigateHome={() => {
            setOpenOpportunityId(null)
            setOpenedFromCrearFlow(false)
            setView('landing')
          }}
        />
        <div className="app-shell__main">
          <OpportunityDetail
            opportunityId={openOpportunityId}
            onBack={() => {
              setOpenOpportunityId(null)
              setOpenedFromCrearFlow(false)
            }}
            showReturnToCrearFlow={openedFromCrearFlow}
            onOpportunityAction={() => setOpenedFromCrearFlow(false)}
            schema={schema}
          />
        </div>
      </div>
    )
  }

  if (view === 'landing') {
    return (
      <div className="app-shell">
        <Sidebar
          defaultExpanded
          activeSection="inicio"
          user={mondayUser}
          onNavigateOportunidades={() => {
            setOpenOpportunityId(null)
            setOpenedFromCrearFlow(false)
            setView('table')
          }}
          onNavigateHome={() => {
            setOpenOpportunityId(null)
            setOpenedFromCrearFlow(false)
            setView('landing')
          }}
        />
        <div className="app-shell__main">
          <LandingScreen onCreateNew={() => setView('create')} onSearchExisting={() => setView('table')} />
        </div>
      </div>
    )
  }

  if (view === 'create') {
    return (
      <div className="app-shell">
        <Sidebar
          user={mondayUser}
          onNavigateOportunidades={() => {
            setOpenOpportunityId(null)
            setOpenedFromCrearFlow(false)
            setView('table')
          }}
          onNavigateHome={() => {
            setOpenOpportunityId(null)
            setOpenedFromCrearFlow(false)
            setView('landing')
          }}
        />
        <div className="app-shell__main">
          <CrearOportunidadForm
            schema={schema}
            opportunities={opportunities}
            onCancel={() => setView('landing')}
            onVerOportunidades={() => setView('table')}
            onHome={() => setView('landing')}
            onOpenOportunidad={(id) => {
              setOpenedFromCrearFlow(true)
              setOpenOpportunityId(id)
            }}
            onCreated={(newItemId) => {
              setOpenedFromCrearFlow(false)
              setView('table')
              setOpenOpportunityId(newItemId)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar user={mondayUser} onNavigateHome={() => setView('landing')} />
      <div className="app-shell__main">
        <div className="app">
          <PageHeader onCreateNew={() => setView('create')} />
          <FilterPanel
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            filters={filters}
            onFilterChange={handleFilterChange}
            filterOptions={filterOptions}
            onClear={() => {
              setSearchTerm('')
              setFilters(EMPTY_FILTERS)
            }}
          />
          <OpportunitiesTable
            opportunities={pagedOpportunities}
            totalFiltered={filteredOpportunities.length}
            totalLoaded={opportunities.length}
            boardTotalCount={boardTotalCount}
            loading={loading}
            error={error}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            onOpenOpportunity={(id) => {
              setOpenedFromCrearFlow(false)
              setOpenOpportunityId(id)
            }}
          />
        </div>
      </div>
    </div>
  )
}
