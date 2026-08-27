import { Suspense, lazy, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Loader } from '@vibe/core'
import { useHashRoute } from './hooks/useHashRoute'
import { AppProviders } from './context/AppContext'
import Sidebar from './components/Sidebar'
import PageHeader from './components/PageHeader'
import FilterPanel from './components/FilterPanel'
import OpportunitiesTable from './components/OpportunitiesTable'
// Auditoría: las 2 pantallas más pesadas (detalle ~1.300 líneas + sus 4 paneles, y el
// wizard de creación ~2.900 líneas) se cargan recién cuando se entra a ellas — el
// chunk inicial queda con landing + tabla + filtros.
const OpportunityDetail = lazy(() => import('./components/OpportunityDetail'))
import LandingScreen from './components/LandingScreen'
const CrearOportunidadForm = lazy(() => import('./components/CrearOportunidadForm'))
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

// A pedido: la tabla de Oportunidades pagina (10 por defecto, elegible entre estas 4
// opciones desde el propio pie de la tabla) en vez de mostrar las 500 cargadas de una
// — el fetch de arriba (ITEMS_FETCH_LIMIT) sigue trayendo TODO el tablero igual, esto
// es solo paginación de la vista/tabla (client-side, ver
// filteredOpportunities/pagedOpportunities más abajo), así que la búsqueda y los
// filtros siguen actuando sobre el universo completo, no solo sobre la página visible.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 10

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
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [route, go] = useHashRoute()
  // A pedido: el botón "Volver a Persona Seleccionada" de arriba de la Oportunidad (ver
  // OpportunityDetail.jsx) solo aparece cuando se llegó ahí apretando "Ir a esta
  // oportunidad" en el historial de Crear Oportunidad (paso 1) — no si se abrió desde la
  // tabla ni recién creada. Se apaga solo (ver handleOpportunityAction más abajo) en
  // cuanto se hace alguna acción adentro de la Oportunidad: en ese punto ya no tiene
  // sentido "volver" a terminar de crearla, la Oportunidad ya está en curso.
  const [openedFromCrearFlow, setOpenedFromCrearFlow] = useState(false)
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

  // A pedido: "una sola barra de búsqueda para todos los campos posibles" — marca/año
  // además de lo que ya cubría bienLinea1 (marca+modelo/año). Auditoría: el texto de
  // búsqueda de cada fila se arma UNA vez por carga (antes se concatenaba y pasaba a
  // minúsculas para las 500 filas en cada tecla), y el término se difiere
  // (useDeferredValue) para que el tipeo no espere al filtrado.
  const haystacks = useMemo(
    () =>
      new Map(
        opportunities.map((opp) => [
          opp,
          [opp.clienteNombre, opp.ci, opp.telefono, opp.bienLinea1, opp.companias, opp.marca, opp.anio]
            .join(' ')
            .toLowerCase(),
        ])
      ),
    [opportunities]
  )
  const deferredSearchTerm = useDeferredValue(searchTerm)

  const filteredOpportunities = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase()

    return opportunities.filter((opp) => {
      if (term && !haystacks.get(opp).includes(term)) return false

      if (filters.estadoCotizacion && opp.estadoCotizacion !== filters.estadoCotizacion) return false
      if (filters.tipoSujeto && opp.tipoSujeto !== filters.tipoSujeto) return false
      if (filters.estadoEnvio && opp.estadoEnvio !== filters.estadoEnvio) return false

      return true
    })
  }, [opportunities, haystacks, deferredSearchTerm, filters])

  // A pedido: vuelve a la página 1 en cuanto cambia la búsqueda, algún filtro, o la
  // cantidad por página — si no, se podía quedar en una página que ya no existe (ej.
  // estabas en la página 5 y el nuevo resultado filtrado solo tiene 2 páginas).
  useEffect(() => {
    setPage(1)
  }, [searchTerm, filters, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredOpportunities.length / pageSize))
  const pagedOpportunities = useMemo(
    () => filteredOpportunities.slice((page - 1) * pageSize, page * pageSize),
    [filteredOpportunities, page, pageSize]
  )

  // ---- Navegación (ver hooks/useHashRoute.js): la URL es la fuente de verdad de qué
  // pantalla se ve. / de antes se derivan de .
  const nav = {
    route,
    go,
    goHome: () => go('inicio'),
    goTable: () => go('oportunidades'),
    goCreate: () => go('crear'),
    openOpportunity: (id, step) => go('oportunidades', id, step),
  }
  const closeDetail = (seg) => {
    setOpenedFromCrearFlow(false)
    go(seg)
  }

  let main
  if (route.seg === 'oportunidades' && route.id) {
    main = (
      <Suspense fallback={<div className="app" style={{ padding: 40, textAlign: 'center' }}><Loader size={48} /></div>}>
        <OpportunityDetail
          key={route.id}
          opportunityId={route.id}
          urlStep={route.step}
          onStepChange={(step) => go('oportunidades', route.id, step, { replace: true })}
          onBack={() => closeDetail(openedFromCrearFlow ? 'crear' : 'oportunidades')}
          onGoToList={() => closeDetail('oportunidades')}
          showReturnToCrearFlow={openedFromCrearFlow}
          onOpportunityAction={() => setOpenedFromCrearFlow(false)}
          onGoHome={() => closeDetail('inicio')}
          schema={schema}
        />
      </Suspense>
    )
  } else if (route.seg === 'inicio') {
    main = <LandingScreen onCreateNew={nav.goCreate} onSearchExisting={nav.goTable} />
  } else if (route.seg === 'crear') {
    main = (
      <Suspense fallback={<div className="app" style={{ padding: 40, textAlign: 'center' }}><Loader size={48} /></div>}>
        <CrearOportunidadForm
          schema={schema}
          opportunities={opportunities}
          onCancel={nav.goHome}
          onVerOportunidades={nav.goTable}
          onHome={nav.goHome}
          onOpenOportunidad={(id) => {
            setOpenedFromCrearFlow(true)
            nav.openOpportunity(id)
          }}
          onCreated={(newItemId) => {
            setOpenedFromCrearFlow(false)
            nav.openOpportunity(newItemId)
          }}
        />
      </Suspense>
    )
  } else {
    main = (
      <div className="app">
        <PageHeader onCreateNew={nav.goCreate} onHome={nav.goHome} />
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
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={setPageSize}
          onOpenOpportunity={(id) => {
            setOpenedFromCrearFlow(false)
            nav.openOpportunity(id)
          }}
        />
      </div>
    )
  }

  // Un solo shell: la Sidebar se monta UNA vez (antes se escribía 4 veces, una por
  // vista, y se desmontaba/remontaba en cada cambio de pantalla).
  return (
    <AppProviders schema={schema} mondayUser={mondayUser} nav={nav}>
      <div className="app-shell">
        <Sidebar
          active={route.seg === 'oportunidades'}
          defaultExpanded={route.seg === 'inicio'}
          user={mondayUser}
          onNavigateOportunidades={() => closeDetail('oportunidades')}
        />
        <div className="app-shell__main">{main}</div>
      </div>
    </AppProviders>
  )
}
