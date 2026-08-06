import { useEffect, useMemo, useState } from 'react'
import TopBar from './components/TopBar'
import PageHeader from './components/PageHeader'
import FilterPanel from './components/FilterPanel'
import OpportunitiesTable from './components/OpportunitiesTable'
import OpportunityDetail from './components/OpportunityDetail'
import LandingScreen from './components/LandingScreen'
import CrearOportunidadForm from './components/CrearOportunidadForm'
import { fetchOpportunities, fetchDepartamentos, fetchLocalidades } from './services/mondayApi'
import { mapOpportunities } from './services/opportunityMapper'
import { fetchFilterAndStatusSchema } from './services/boardSchema'
import { fetchPanelData } from './services/recargoPanel'
import './App.css'

// Techo real de la API de monday para items_page en una sola página (ver
// fetchOpportunities en mondayApi.js) — con esto se trae el tablero completo de una,
// nada de "solo los primeros 10" (los filtros/búsqueda de FilterPanel son client-side
// sobre lo ya cargado, así que si no está cargado no aparece por más que matchee).
const ITEMS_FETCH_LIMIT = 500

const EMPTY_FILTERS = {
  marca: '',
  anio: '',
  nombre: '',
  ci: '',
  telefono: '',
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
  const [openOpportunityId, setOpenOpportunityId] = useState(null)
  // Pantalla previa a la tabla: elegir entre crear una oportunidad nueva o ver las ya
  // existentes. 'landing' | 'table' | 'create' — se puede ir de una a otra directo,
  // sin pasar necesariamente por 'landing' de nuevo (botón "Nueva oportunidad" en la
  // tabla, y "Ver oportunidades existentes" desde el formulario de creación).
  const [view, setView] = useState('landing')

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
      marcas: schema?.marcas ?? [],
      anios: schema?.anios ?? [],
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
        const haystack = [opp.clienteNombre, opp.ci, opp.telefono, opp.bienLinea1, opp.companias]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(term)) return false
      }

      if (filters.marca && opp.marca !== filters.marca) return false
      if (filters.anio && opp.anio !== filters.anio) return false
      if (filters.estadoCotizacion && opp.estadoCotizacion !== filters.estadoCotizacion) return false
      if (filters.tipoSujeto && opp.tipoSujeto !== filters.tipoSujeto) return false
      if (filters.estadoEnvio && opp.estadoEnvio !== filters.estadoEnvio) return false

      if (filters.nombre && !opp.clienteNombre.toLowerCase().includes(filters.nombre.toLowerCase())) {
        return false
      }
      if (filters.ci && !opp.ci.includes(filters.ci)) return false
      if (filters.telefono && !opp.telefono.includes(filters.telefono)) return false

      return true
    })
  }, [opportunities, searchTerm, filters])

  if (openOpportunityId) {
    return (
      <OpportunityDetail
        opportunityId={openOpportunityId}
        onBack={() => setOpenOpportunityId(null)}
        schema={schema}
      />
    )
  }

  if (view === 'landing') {
    return (
      <div className="app">
        <TopBar />
        <LandingScreen onCreateNew={() => setView('create')} onSearchExisting={() => setView('table')} />
      </div>
    )
  }

  if (view === 'create') {
    return (
      <div className="app">
        <TopBar />
        <CrearOportunidadForm
          schema={schema}
          onCancel={() => setView('landing')}
          onVerOportunidades={() => setView('table')}
          onHome={() => setView('landing')}
          onCreated={(newItemId) => {
            setView('table')
            setOpenOpportunityId(newItemId)
          }}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <TopBar onCreateNew={() => setView('create')} onHome={() => setView('landing')} />
      <PageHeader />
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
        opportunities={filteredOpportunities}
        totalLoaded={opportunities.length}
        boardTotalCount={boardTotalCount}
        loading={loading}
        error={error}
        onOpenOpportunity={setOpenOpportunityId}
      />
    </div>
  )
}
