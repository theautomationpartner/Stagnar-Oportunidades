import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LoadingScreen from './components/LoadingScreen'
import { useHashRoute } from './hooks/useHashRoute'
import { AppProviders } from './context/AppContext'
import PageHeader from './components/PageHeader'
import FilterPanel from './components/FilterPanel'
import OpportunitiesTable from './components/OpportunitiesTable'
// Auditoría: las 2 pantallas más pesadas (detalle ~1.300 líneas + sus 4 paneles, y el
// wizard de creación ~2.900 líneas) se cargan recién cuando se entra a ellas — el
// chunk inicial queda con landing + tabla + filtros.
const OpportunityDetail = lazy(() => import('./components/OpportunityDetail'))
import LandingScreen from './components/LandingScreen'
import AccionBar from './components/AccionBar'
const CrearOportunidadForm = lazy(() => import('./components/CrearOportunidadForm'))
// Sección Clientes (gestión de contactos, relaciones y grupo económico) — mismo criterio
// de lazy que el detalle/wizard: se carga recién al entrar.
const ClientesSection = lazy(() => import('./components/ClientesSection'))
// Tabla del tablero Contactos. Va lazy por lo mismo que las otras secciones: no se abre
// en el camino normal de cotizar, y no tiene por qué pesar en el bundle inicial.
const ContactosSection = lazy(() => import('./components/ContactosSection'))
const ClienteGestion = lazy(() => import('./components/ClienteGestion'))
const GruposSection = lazy(() => import('./components/GruposSection'))
const GrupoDetalle = lazy(() => import('./components/GrupoDetalle'))
import {
  fetchOpportunitiesPage,
  fetchDepartamentos,
  fetchLocalidades,
  fetchCurrentMondayUser,
} from './services/mondayApi'
import { mapOpportunities } from './services/opportunityMapper'
import { fetchFilterAndStatusSchema } from './services/boardSchema'
import { fetchPanelData } from './services/recargoPanel'
import './App.css'

// A pedido: la app arranca con las 10 oportunidades más nuevas y el resto se pide a
// medida que se necesita —al pasar de página o al buscar—, en vez de bajar el tablero
// entero (500 ítems) antes de mostrar la primera pantalla.
//
// Esto mueve la búsqueda y los filtros de estado AL SERVIDOR (ver
// buildOpportunitiesQueryParams en mondayApi.js): si el filtrado siguiera siendo local,
// buscar solo miraría las filas ya traídas y una oportunidad vieja no aparecería nunca.
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
  // Cursor de la API: por dónde sigue la lista. null = no hay más para traer.
  const [cursor, setCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // Sube de número cada vez que la lista se arma de cero (otra búsqueda, otro filtro):
  // lo que venga de una tanda anterior se descarta en vez de mezclarse.
  const generacionRef = useRef(0)
  const trayendoMasRef = useRef(false)
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
      fetchOpportunitiesPage({ limit: DEFAULT_PAGE_SIZE }),
      fetchFilterAndStatusSchema(),
      fetchDepartamentos(),
      fetchLocalidades(),
      fetchPanelData(),
    ])
      .then(([primeraPagina, fetchedSchema, departamentos, localidades, panelData]) => {
        if (cancelled) return
        setSchema({ ...fetchedSchema, departamentos, localidades, ...panelData })
        setBoardTotalCount(primeraPagina.totalCount)
        setCursor(primeraPagina.cursor)
        setOpportunities(
          mapOpportunities(primeraPagina.items, {
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

  // La búsqueda y los estados los resuelve el servidor (ver mondayApi.js). Acá queda
  // solo lo que la API no sabe filtrar: "Tipo de Sujeto" es una columna mirror y la
  // rechaza. Y cuando hay término de búsqueda, los estados también se terminan de
  // filtrar acá, porque la API no permite mezclar un "o" con un "y" en la misma consulta.
  const hayBusqueda = searchTerm.trim() !== ''
  const filteredOpportunities = useMemo(
    () =>
      opportunities.filter((opp) => {
        if (filters.tipoSujeto && opp.tipoSujeto !== filters.tipoSujeto) return false
        if (hayBusqueda) {
          if (filters.estadoCotizacion && opp.estadoCotizacion !== filters.estadoCotizacion) return false
          if (filters.estadoEnvio && opp.estadoEnvio !== filters.estadoEnvio) return false
        }
        return true
      }),
    [opportunities, filters, hayBusqueda]
  )

  // Trae la lista de cero con la búsqueda y los filtros actuales. Se usa al buscar, al
  // cambiar un filtro y al volver a la tabla.
  const cargarPrimeraPagina = useCallback(async () => {
    if (!schema) return
    generacionRef.current += 1
    trayendoMasRef.current = false
    setLoadingMore(true)
    try {
      const pagina = await fetchOpportunitiesPage({ limit: pageSize, search: searchTerm, filtros: filters })
      setBoardTotalCount(pagina.totalCount)
      setCursor(pagina.cursor)
      setOpportunities(
        mapOpportunities(pagina.items, {
          estadoOportunidad: schema.estadoOportunidad.colorsByLabel,
          estadoCotizacion: schema.estadoCotizacion.colorsByLabel,
        })
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }, [schema, pageSize, searchTerm, filters])

  // Buscar o cambiar un filtro reinicia la lista: la consulta al servidor es otra. El
  // primer render no cuenta — esa carga ya la hizo el efecto de arranque.
  const primeraCargaHechaRef = useRef(false)
  useEffect(() => {
    if (!schema) return undefined
    if (!primeraCargaHechaRef.current) {
      primeraCargaHechaRef.current = true
      return undefined
    }
    setPage(1)
    cargarPrimeraPagina()
    return undefined
  }, [searchTerm, filters, schema, cargarPrimeraPagina])

  // Pedir la página siguiente ES pedir más datos: si para la página que se quiere ver no
  // alcanzan las filas traídas y todavía queda cursor, se traen ahí nomás.
  //
  // El "ya estoy trayendo" va en una ref y no en el estado a propósito: con loadingMore
  // entre las dependencias, prenderlo volvía a correr el efecto, la limpieza marcaba la
  // respuesta como vieja y las filas nuevas se descartaban — se pedía la página 2 y
  // seguían viéndose 10. Y la generación descarta lo que llegue tarde de una búsqueda
  // anterior, que es el otro riesgo de traer en varias tandas.
  useEffect(() => {
    const necesarias = page * pageSize
    if (!cursor || trayendoMasRef.current || opportunities.length >= necesarias || !schema) return undefined
    const generacion = generacionRef.current
    trayendoMasRef.current = true
    setLoadingMore(true)
    fetchOpportunitiesPage({ limit: Math.max(pageSize, necesarias - opportunities.length), cursor })
      .then((pagina) => {
        if (generacion !== generacionRef.current) return
        setCursor(pagina.cursor)
        setOpportunities((prev) => [
          ...prev,
          ...mapOpportunities(pagina.items, {
            estadoOportunidad: schema.estadoOportunidad.colorsByLabel,
            estadoCotizacion: schema.estadoCotizacion.colorsByLabel,
          }),
        ])
      })
      .catch((err) => {
        if (generacion === generacionRef.current) setError(err.message)
      })
      .finally(() => {
        trayendoMasRef.current = false
        setLoadingMore(false)
      })
    return undefined
  }, [page, pageSize, cursor, opportunities.length, schema])

  // Con cursor todavía queda al menos una página más, aunque no sepamos cuántas filas
  // trae: se habilita una página extra para que "siguiente" no quede muerto.
  const totalPages = Math.max(1, Math.ceil(filteredOpportunities.length / pageSize) + (cursor ? 1 : 0))
  const pagedOpportunities = useMemo(
    () => filteredOpportunities.slice((page - 1) * pageSize, page * pageSize),
    [filteredOpportunities, page, pageSize]
  )

  // Recarga solo la lista de oportunidades (no el schema ni los catálogos). Bug
  // reportado: la tabla se pedía UNA vez al abrir la app, así que una oportunidad recién
  // creada (o un cambio de estado hecho en el detalle) no aparecía al volver a la tabla
  // hasta recargar la página. Se llama al crear y cada vez que se entra a la tabla.
  const reloadOpportunities = async () => {
    // Vuelve a la primera página: lo recién creado o recién cambiado es lo más nuevo, y
    // la lista viene ordenada justamente por eso.
    setPage(1)
    await cargarPrimeraPagina()
  }
  const isTableRoute = route.seg === 'oportunidades' && !route.id
  const tableVisitsRef = useRef(0)
  useEffect(() => {
    if (!isTableRoute || !schema) return
    // La primera vez la lista ya viene del load inicial; de ahí en más se refresca.
    tableVisitsRef.current += 1
    if (tableVisitsRef.current > 1) reloadOpportunities()
  }, [isTableRoute, schema])

  // ---- Navegación (ver hooks/useHashRoute.js): la URL es la fuente de verdad de qué
  // pantalla se ve; view/openOpportunityId de antes se derivan de route.
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
      <Suspense fallback={<LoadingScreen title="Abriendo la oportunidad" message="Estamos trayendo los datos del cliente y las cotizaciones desde monday." />}>
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
  } else if (route.seg === 'clientes' && route.id) {
    main = (
      <Suspense fallback={<LoadingScreen title="Abriendo el cliente" message="Estamos trayendo sus contactos, relaciones y grupo económico desde monday." />}>
        <ClienteGestion
          key={route.id}
          clienteId={route.id}
          onBack={() => go('clientes')}
          onOpenCliente={(id) => go('clientes', id)}
        />
      </Suspense>
    )
  } else if (route.seg === 'clientes') {
    main = (
      <Suspense fallback={<LoadingScreen title="Cargando clientes" message="Un momento, estamos trayendo la lista de clientes desde monday." />}>
        <ClientesSection
          onOpenCliente={(id) => go('clientes', id)}
          onIrAGrupos={() => go('grupos')}
          onIrAContactos={() => go('contactos')}
        />
      </Suspense>
    )
  } else if (route.seg === 'contactos') {
    main = (
      <Suspense fallback={<LoadingScreen title="Cargando contactos" message="Un momento, estamos trayendo la lista de contactos desde monday." />}>
        <ContactosSection onIrAClientes={() => go('clientes')} onIrAGrupos={() => go('grupos')} />
      </Suspense>
    )
  } else if (route.seg === 'grupos' && route.id) {
    main = (
      <Suspense fallback={<LoadingScreen title="Abriendo el grupo" message="Estamos trayendo sus miembros desde monday." />}>
        <GrupoDetalle
          key={route.id}
          grupoId={route.id}
          onBack={() => go('grupos')}
          onOpenCliente={(id) => go('clientes', id)}
        />
      </Suspense>
    )
  } else if (route.seg === 'grupos') {
    main = (
      <Suspense fallback={<LoadingScreen title="Cargando grupos económicos" message="Estamos trayendo los grupos y sus miembros desde monday." />}>
        <GruposSection
          onOpenGrupo={(id) => go('grupos', id)}
          onIrAClientes={() => go('clientes')}
          onIrAContactos={() => go('contactos')}
        />
      </Suspense>
    )
  } else if (route.seg === 'inicio') {
    main = <LandingScreen onCreateNew={nav.goCreate} onSearchExisting={nav.goTable} onClientes={() => go('clientes')} />
  } else if (route.seg === 'crear') {
    main = (
      <Suspense fallback={<LoadingScreen title="Preparando el formulario" message="Un momento, estamos cargando el asistente para crear la oportunidad." />}>
        <CrearOportunidadForm
          schema={schema}
          opportunities={opportunities}
          onCancel={nav.goHome}
          onOpenOportunidad={(id) => {
            setOpenedFromCrearFlow(true)
            nav.openOpportunity(id)
          }}
          onCreated={(newItemId) => {
            setOpenedFromCrearFlow(false)
            // La lista se refresca en segundo plano para que la nueva ya esté al volver.
            reloadOpportunities()
            nav.openOpportunity(newItemId)
          }}
        />
      </Suspense>
    )
  } else {
    main = (
      <div className="app">
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
          opportunities={pagedOpportunities}
          totalFiltered={filteredOpportunities.length}
          hayBusqueda={hayBusqueda}
          boardTotalCount={boardTotalCount}
          // Bug reportado: ir a una página cuyas filas todavía se están trayendo (el
          // efecto del cursor recién las pide ahí) mostraba "Sin oportunidades" en vez
          // de cargando — parecía vacía hasta volver y entrar de nuevo. Si la página
          // visible no tiene filas y hay una tanda en camino, es una carga, no un vacío.
          loading={loading || (loadingMore && pagedOpportunities.length === 0)}
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

  // A pedido, sin barra lateral: con una sola sección ("Oportunidades") no navegaba
  // nada que no navegue ya cada pantalla, y solo robaba ancho. Lo que vivía ahí se mudó:
  // el logo y quién está en el sistema van en la pantalla principal (ver LandingScreen),
  // igual que "Cerrar sesión". En su lugar, arriba de cada sección va la barra de
  // "¿Qué querés hacer?" (ver AccionBar): cambia de tarea desde cualquier pantalla,
  // avisando antes qué pasa con los datos.
  const enDetalle =
    (route.seg === 'oportunidades' || route.seg === 'clientes' || route.seg === 'grupos') && Boolean(route.id)
  return (
    <AppProviders schema={schema} mondayUser={mondayUser} nav={nav}>
      <div className="app-shell">
        {route.seg !== 'inicio' && (
          <AccionBar
            accionActual={
              route.seg === 'crear'
                ? 'crear'
                : route.seg === 'clientes' || route.seg === 'grupos'
                  ? 'clientes'
                  : 'consultar'
            }
            enDetalle={enDetalle}
            onIrAInicio={nav.goHome}
            onCambiar={(accion) => {
              setOpenedFromCrearFlow(false)
              if (accion === 'crear') nav.goCreate()
              else if (accion === 'clientes') go('clientes')
              else nav.goTable()
            }}
          />
        )}
        <div className="app-shell__main">{main}</div>
      </div>
    </AppProviders>
  )
}
