import { useEffect, useMemo, useState } from 'react'
import {
  MdOpenInNew,
  MdFileDownload,
  MdSend,
  MdArrowBack,
  MdAutorenew,
  MdWarningAmber,
} from 'react-icons/md'
import { Button, EmptyState, AttentionBox } from '@vibe/core'
import TopBar from './TopBar'
import QuoteCard from './QuoteCard'
import StatusBadge from './StatusBadge'
import Stepper from './Stepper'
import CotizarStepPanel from './CotizarStepPanel'
import ConfirmarStepPanel from './ConfirmarStepPanel'
import EmitirStepPanel from './EmitirStepPanel'
import WhatsAppSendModal from './WhatsAppSendModal'
import {
  fetchOpportunityDetail,
  setSimpleColumnValue,
  setDropdownColumnValue,
  setConnectedColumnValue,
  setSubitemCheckboxValue,
  uploadFileToColumn,
  clearFileColumn,
  fetchLatestUpdate,
} from '../services/mondayApi'
import { mapOpportunityItem } from '../services/opportunityMapper'
import { mapSubitemToRawQuote, groupQuotesByCompania } from '../services/quoteMapper'
import { computeQuote } from '../services/pricingEngine'
import { applyRecargoLookup } from '../services/recargoPanel'
import { COTIZAR_FIELDS, getMissingCotizarFields } from '../services/cotizarFields'
import { renderQuoteImageDataUrl } from '../services/whatsappImage'
import { COBERTURA_TABS, coberturaGroupOf } from '../services/coberturaGroups'
import './OpportunityDetail.css'

const ESTADO_OPORTUNIDAD_COLUMN_ID = 'deal_stage'
const ESTADO_COTIZACION_COLUMN_ID = 'color_mm51n7aa'
const ESTADO_ENVIO_COLUMN_ID = 'color_mm4wr1t4'
const ESTADO_CREACION_COLUMN_ID = 'color_mm5ejysv'
const POSEE_VEHICULO_COLUMN_ID = 'color_mm51n4j'
const ESTADO_LECTURA_COLUMN_ID = 'color_mm5rzrhk'
const INCLUIR_PROPUESTA_COLUMN_ID = 'boolean_mm4wjdnw'
const LIBRETA_CONDUCIR_COLUMN_ID = 'file_mm51jy06'
const CEDULA_COLUMN_ID = 'file_mm5pc008'
const POLIZA_COLUMN_ID = 'file_mm5bzdd4'
const PROPUESTA_ELEGIDA_COLUMN_ID = 'boolean_mm5bn41n'
// Opcionales de PORTO (Granizo/Cristales/Coche Cortesía) — ver handleToggleOpcional abajo
// y pricingEngine.js#buildIncluyeBullets.
const OPCIONAL_PORTO_COLUMN_IDS = {
  granizo: 'boolean_mm5fsr46',
  cristales: 'boolean_mm5fqazp',
  cocheCortesia: 'boolean_mm5fxd9x',
}
const POLL_INTERVAL_MS = 4000
// Prefijo que cada automatización debe agregar al principio del texto del Update que
// postea sobre el ítem cuando falla (configurar así del lado del robot de cotización y
// del escenario de Make.com de envío por WhatsApp) — ver fetchLatestUpdate en mondayApi.js.
const ERROR_UPDATE_TAG_COTIZAR = '[COTIZAR]'
const ERROR_UPDATE_TAG_ENVIO = '[ENVIO]'
const ERROR_UPDATE_TAG_CREAR_POLIZA = '[CREAR_POLIZA]'
const ERROR_UPDATE_TAG_LEER = '[LEER]'

export default function OpportunityDetail({ opportunityId, onBack, schema }) {
  const [item, setItem] = useState(null)
  const [rawQuotes, setRawQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [overridesByQuoteId, setOverridesByQuoteId] = useState({})
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [activeStep, setActiveStep] = useState('cotizar')
  // Solapas "General / GLOBAL / TRIPLE" del paso "Comparar y enviar" — índice de
  // COBERTURA_TABS, no el texto (así matchea directo con TabList/Tab de @vibe/core).
  const [coberturaTabIndex, setCoberturaTabIndex] = useState(0)
  const [marking, setMarking] = useState(false)
  const [markError, setMarkError] = useState(null)
  const [waModalImages, setWaModalImages] = useState(null)
  const [polling, setPolling] = useState(false)
  const [settingElegidaId, setSettingElegidaId] = useState(null)
  const [elegidaError, setElegidaError] = useState(null)
  const [uploadingDoc, setUploadingDoc] = useState({})
  const [deletingDoc, setDeletingDoc] = useState({})
  const [docUploadError, setDocUploadError] = useState({})
  const [confirmingPaso3, setConfirmingPaso3] = useState(false)
  const [confirmPaso3Error, setConfirmPaso3Error] = useState(null)
  const [sendPolling, setSendPolling] = useState(false)
  const [polizaPolling, setPolizaPolling] = useState(false)
  const [confirmandoEmision, setConfirmandoEmision] = useState(false)
  const [confirmarEmisionError, setConfirmarEmisionError] = useState(null)
  const [lecturaPolling, setLecturaPolling] = useState(false)
  const [lecturaDismissed, setLecturaDismissed] = useState(false)
  const [cotizarErrorDetail, setCotizarErrorDetail] = useState(null)
  const [envioErrorDetail, setEnvioErrorDetail] = useState(null)
  const [polizaErrorDetail, setPolizaErrorDetail] = useState(null)
  const [lecturaErrorDetail, setLecturaErrorDetail] = useState(null)

  // El robot que genera la cotización (o el escenario de Make.com que la envía) postea
  // el detalle del error como un Update nativo de monday sobre el ítem cuando algo falla
  // — se trae acá el texto del más reciente para mostrarlo junto al estado "Error". `tag`
  // filtra por el prefijo que cada automatización agrega a su propio Update (ver
  // ERROR_UPDATE_TAG_*) para que un error de cotización no tape/mezcle uno de envío o
  // viceversa cuando los dos existen sobre el mismo ítem.
  const loadErrorUpdate = async (tag) => {
    try {
      const update = await fetchLatestUpdate(opportunityId, tag)
      return update?.text_body?.trim() || null
    } catch {
      return null
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setPolling(false)
    setLecturaDismissed(false)
    setCotizarErrorDetail(null)
    setEnvioErrorDetail(null)
    setPolizaErrorDetail(null)
    setLecturaErrorDetail(null)

    fetchOpportunityDetail(opportunityId)
      .then(async (data) => {
        if (cancelled || !data) return
        setItem(data)
        const mapped = (data.subitems ?? []).map(mapSubitemToRawQuote)
        const raws = applyRecargoLookup(mapped, schema?.recargoLookup ?? {})
        setRawQuotes(raws)
        setSelectedIds(new Set(raws.filter((r) => r.incluirPropuesta).map((r) => r.id)))

        const estadoOportunidad = data.column_values.find(
          (cv) => cv.id === ESTADO_OPORTUNIDAD_COLUMN_ID
        )?.text?.trim()
        const estadoCotizacion = data.column_values.find(
          (cv) => cv.id === ESTADO_COTIZACION_COLUMN_ID
        )?.text?.trim()
        const estadoEnvio = data.column_values.find(
          (cv) => cv.id === ESTADO_ENVIO_COLUMN_ID
        )?.text?.trim()
        const estadoCreacion = data.column_values.find(
          (cv) => cv.id === ESTADO_CREACION_COLUMN_ID
        )?.text?.trim()
        // El gate de "Leer Cédula y Archivo Automóvil" solo aplica cuando la oportunidad
        // "Posee Vehículo" (si no, esos documentos se piden directo en el paso 3
        // Confirmar, sin pasar por ninguna lectura automática).
        const poseeVehiculo = data.column_values.find(
          (cv) => cv.id === POSEE_VEHICULO_COLUMN_ID
        )?.text?.trim()
        const estadoLectura = data.column_values.find(
          (cv) => cv.id === ESTADO_LECTURA_COLUMN_ID
        )?.text?.trim()

        if (estadoOportunidad === 'Nueva') {
          setActiveStep('cotizar')
        } else if (estadoOportunidad === 'Cotizacion Enviada') {
          setActiveStep(raws.length > 0 ? 'confirmar' : 'cotizar')
        } else if (estadoOportunidad === 'Cotizacion aceptada') {
          setActiveStep(raws.length > 0 ? 'emitir' : 'cotizar')
        } else {
          setActiveStep(raws.length > 0 ? 'comparar' : 'cotizar')
        }

        // Si se dejó la pantalla a mitad de una cotización automática en curso, retomamos
        // el polling en vivo al volver a entrar en vez de mostrar un estado congelado.
        if (raws.length === 0 && estadoCotizacion === 'Cotizando') {
          setPolling(true)
        }
        // Mismo criterio para un envío por WhatsApp que quedó "Enviando" a mitad de camino.
        if (estadoEnvio === 'Enviando') {
          setSendPolling(true)
        }
        // Mismo criterio para una creación de póliza que quedó "Creando" a mitad de camino.
        if (estadoCreacion === 'Creando') {
          setPolizaPolling(true)
        }
        // Mismo criterio para una lectura de Cédula/Archivo Automóvil que quedó
        // "Leer" (en cola, todavía no la tomó el robot) o "Leyendo" (en curso) a mitad
        // de camino — solo si aplica (Posee Vehículo === "Si"). Ojo: si acá solo se
        // contemplara "Leyendo", entrar a la oportunidad mientras todavía está en
        // "Leer" nunca prendería el polling, y la pantalla se quedaría congelada sin
        // enterarse jamás de que después pasó a "Leidos".
        if (poseeVehiculo === 'Si' && (estadoLectura === 'Leer' || estadoLectura === 'Leyendo')) {
          setLecturaPolling(true)
        }
        // Si la oportunidad ya está sentada en "Error" al entrar (no solo al detectarlo
        // durante el polling), traemos igual el detalle del último Update.
        if (estadoCotizacion === 'Error') {
          const detail = await loadErrorUpdate(ERROR_UPDATE_TAG_COTIZAR)
          if (!cancelled) setCotizarErrorDetail(detail)
        }
        if (estadoEnvio === 'Error') {
          const detail = await loadErrorUpdate(ERROR_UPDATE_TAG_ENVIO)
          if (!cancelled) setEnvioErrorDetail(detail)
        }
        if (estadoCreacion === 'Error') {
          const detail = await loadErrorUpdate(ERROR_UPDATE_TAG_CREAR_POLIZA)
          if (!cancelled) setPolizaErrorDetail(detail)
        }
        if (poseeVehiculo === 'Si' && estadoLectura === 'Error') {
          const detail = await loadErrorUpdate(ERROR_UPDATE_TAG_LEER)
          if (!cancelled) setLecturaErrorDetail(detail)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [opportunityId])

  // Refleja en vivo los cambios de color_mm51n7aa (Estado Cotización) mientras monday
  // procesa la cotización automática: reconsulta cada POLL_INTERVAL_MS y, apenas
  // "Estado Cotización" === "Cotizado (Subitems)" Y "Estado Oportunidad" (deal_stage)
  // === "Cotizacion Emitida" (las dos, no alcanza con una sola — el robot las setea
  // juntas al terminar), corta el polling y avanza a "Comparar y enviar".
  useEffect(() => {
    if (!polling) return undefined
    let cancelled = false

    const tick = async () => {
      try {
        const data = await fetchOpportunityDetail(opportunityId)
        if (cancelled || !data) return
        setItem(data)

        const estadoCotizacion = data.column_values.find(
          (cv) => cv.id === ESTADO_COTIZACION_COLUMN_ID
        )?.text?.trim()
        const estadoOportunidad = data.column_values.find(
          (cv) => cv.id === ESTADO_OPORTUNIDAD_COLUMN_ID
        )?.text?.trim()
        const mapped = (data.subitems ?? []).map(mapSubitemToRawQuote)
        const raws = applyRecargoLookup(mapped, schema?.recargoLookup ?? {})

        if (estadoCotizacion === 'Cotizado (Subitems)' && estadoOportunidad === 'Cotizacion Emitida') {
          setRawQuotes(raws)
          setSelectedIds(new Set(raws.filter((r) => r.incluirPropuesta).map((r) => r.id)))
          setPolling(false)
          setActiveStep('comparar')
        } else if (estadoCotizacion === 'Error') {
          setPolling(false)
          setMarkError(
            'La cotización automática terminó en estado "Error". Revisá la oportunidad en monday e intentá nuevamente.'
          )
          setCotizarErrorDetail(await loadErrorUpdate(ERROR_UPDATE_TAG_COTIZAR))
        }
      } catch {
        // hiccup de red puntual: seguimos intentando en el próximo tick
      }
    }

    // Los navegadores frenan drásticamente los setInterval de una pestaña en segundo
    // plano (o minimizada) — si el usuario cambia de pestaña mientras espera, el
    // polling puede tardar mucho más de POLL_INTERVAL_MS en volver a correr. Al
    // recuperar el foco/visibilidad forzamos un tick inmediato para no depender de
    // que el navegador decida retomar el intervalo por su cuenta.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)

    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [polling, opportunityId, schema])

  // Refleja en vivo los cambios de color_mm4wr1t4 (Estado Envio) mientras Make.com
  // procesa el envío por WhatsApp: reconsulta cada POLL_INTERVAL_MS y corta el polling
  // apenas llega a un estado terminal ("Enviado" o "Error").
  useEffect(() => {
    if (!sendPolling) return undefined
    let cancelled = false

    const tick = async () => {
      try {
        const data = await fetchOpportunityDetail(opportunityId)
        if (cancelled || !data) return
        setItem(data)

        const estadoEnvio = data.column_values.find(
          (cv) => cv.id === ESTADO_ENVIO_COLUMN_ID
        )?.text?.trim()

        if (estadoEnvio === 'Enviado' || estadoEnvio === 'Error') {
          setSendPolling(false)
          if (estadoEnvio === 'Error') setEnvioErrorDetail(await loadErrorUpdate(ERROR_UPDATE_TAG_ENVIO))
        }
      } catch {
        // hiccup de red puntual: seguimos intentando en el próximo tick
      }
    }

    // Mismo fix que en el polling de "Estado Cotización": recuperar foco/visibilidad
    // fuerza un tick inmediato en vez de esperar a que el navegador retome el
    // setInterval frenado por estar la pestaña en segundo plano.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)

    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [sendPolling, opportunityId])

  // Refleja en vivo los cambios de color_mm5ejysv (Crear Poliza) mientras se procesa la
  // emisión de la póliza tras confirmarla: reconsulta cada POLL_INTERVAL_MS y corta el
  // polling apenas llega a un estado terminal ("Creada" o "Error").
  useEffect(() => {
    if (!polizaPolling) return undefined
    let cancelled = false

    const tick = async () => {
      try {
        const data = await fetchOpportunityDetail(opportunityId)
        if (cancelled || !data) return
        setItem(data)

        const estadoCreacion = data.column_values.find(
          (cv) => cv.id === ESTADO_CREACION_COLUMN_ID
        )?.text?.trim()

        if (estadoCreacion === 'Creada' || estadoCreacion === 'Error') {
          setPolizaPolling(false)
          if (estadoCreacion === 'Error') {
            setPolizaErrorDetail(await loadErrorUpdate(ERROR_UPDATE_TAG_CREAR_POLIZA))
          }
        }
      } catch {
        // hiccup de red puntual: seguimos intentando en el próximo tick
      }
    }

    // Mismo fix que en los otros dos polling: recuperar foco/visibilidad fuerza un tick
    // inmediato en vez de esperar a que el navegador retome el setInterval frenado por
    // estar la pestaña en segundo plano.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)

    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [polizaPolling, opportunityId])

  // Refleja en vivo los cambios de color_mm5rzrhk (Leer Cédula y Archivo Automóvil)
  // mientras se procesa la lectura automática de esos documentos: reconsulta cada
  // POLL_INTERVAL_MS y corta el polling apenas llega a un estado terminal ("Leidos" o
  // "Error"). Solo se prende cuando aplica (ver mount effect — Posee Vehículo === "Si").
  useEffect(() => {
    if (!lecturaPolling) return undefined
    let cancelled = false

    const tick = async () => {
      try {
        const data = await fetchOpportunityDetail(opportunityId)
        if (cancelled || !data) return
        setItem(data)

        const estadoLectura = data.column_values.find(
          (cv) => cv.id === ESTADO_LECTURA_COLUMN_ID
        )?.text?.trim()

        if (estadoLectura === 'Leidos' || estadoLectura === 'Error') {
          setLecturaPolling(false)
          if (estadoLectura === 'Error') {
            setLecturaErrorDetail(await loadErrorUpdate(ERROR_UPDATE_TAG_LEER))
          }
        }
      } catch {
        // hiccup de red puntual: seguimos intentando en el próximo tick
      }
    }

    // Mismo fix que en los otros polling: recuperar foco/visibilidad fuerza un tick
    // inmediato en vez de esperar a que el navegador retome el setInterval frenado por
    // estar la pestaña en segundo plano.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)

    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [lecturaPolling, opportunityId])

  const statusColors = useMemo(
    () => ({
      estadoOportunidad: schema?.estadoOportunidad?.colorsByLabel ?? {},
      estadoCotizacion: schema?.estadoCotizacion?.colorsByLabel ?? {},
      estadoEnvio: schema?.estadoEnvio?.colorsByLabel ?? {},
      estadoCreacion: schema?.estadoCreacion?.colorsByLabel ?? {},
      estadoLectura: schema?.estadoLectura?.colorsByLabel ?? {},
    }),
    [schema]
  )

  const dropdownOptions = useMemo(
    () => ({
      anios: schema?.anios ?? [],
      marcas: schema?.marcas ?? [],
      combustibles: schema?.combustibles ?? [],
      uso: schema?.uso?.options ?? [],
      tipo: schema?.tipo ?? [],
      // A diferencia de los de arriba (listas de strings), estos dos son listas de
      // {id, name} — los campos "connected" del paso Cotizar (Departamento, Zona de
      // circulación/Localidad) los necesitan así para armar la conexión real.
      departamentos: schema?.departamentos ?? [],
      localidades: schema?.localidades ?? [],
    }),
    [schema]
  )

  const rcOptions = schema?.rc ?? []

  const opportunity = useMemo(
    () => (item ? mapOpportunityItem(item, statusColors) : null),
    [item, statusColors]
  )

  const groups = useMemo(() => {
    // Uso y Año Vehículo ya no se leen del subitem (se sacaron esas columnas por
    // duplicar datos que ya vienen de la oportunidad) — se inyectan acá para no tener
    // que tocar QuoteCard/whatsappImage.js, que siguen leyendo raw.uso/raw.anioVehiculo.
    const panelContext = {
      incluyeLookup: schema?.incluyeLookup ?? {},
      repuestosOriginalesMinYear: schema?.repuestosOriginalesMinYear,
      reposicion0kmMinYear: schema?.reposicion0kmMinYear,
      serviciosIlimitadosPortoMinYear: schema?.serviciosIlimitadosPortoMinYear,
      preciosOpcionalesPorto: schema?.preciosOpcionalesPorto ?? {},
    }
    const withQuotes = rawQuotes.map((raw) => {
      const effectiveRaw = { ...raw, uso: opportunity?.uso ?? '', anioVehiculo: opportunity?.anio ?? '' }
      return {
        raw: effectiveRaw,
        quote: computeQuote(effectiveRaw, overridesByQuoteId[raw.id] ?? {}, panelContext),
      }
    })
    return groupQuotesByCompania(rawQuotes).map((g) => ({
      ...g,
      entries: withQuotes.filter((e) => e.raw.compania === g.compania),
    }))
  }, [rawQuotes, overridesByQuoteId, opportunity, schema])

  const hasQuotes = rawQuotes.length > 0
  // A pedido: el botón "Cotizar" (paso 1, cuando todavía no hay ninguna cotización) vive
  // en la tarjeta de cliente, no en CotizarStepPanel — mismo criterio de "faltan campos"
  // que ese panel usa para su propio banner de advertencia.
  const canCotizar = opportunity ? getMissingCotizarFields(opportunity).length === 0 : false

  // Solapa activa del paso "Comparar y enviar": "general" no filtra nada (como antes);
  // "GLOBAL"/"TRIPLE" solo dejan pasar las cotizaciones de esa familia de cobertura,
  // sin importar la compañía (ver coberturaGroups.js — las 2 familias ya cubren todas
  // las coberturas reales, no dependen de qué compañía sea).
  const activeCoberturaTab = COBERTURA_TABS[coberturaTabIndex]?.key ?? 'general'
  const visibleQuoteEntries = useMemo(() => {
    const flat = groups.flatMap((g) => g.entries.map((e) => ({ ...e, compania: g.compania })))
    if (activeCoberturaTab === 'general') return flat
    return flat.filter((e) => coberturaGroupOf(e.raw.cobertura) === activeCoberturaTab)
  }, [groups, activeCoberturaTab])

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleApplyQuoteOverrides = (quoteId, values) => {
    setOverridesByQuoteId((prev) => ({ ...prev, [quoteId]: values }))
  }

  const handleResetQuoteOverrides = (quoteId) => {
    setOverridesByQuoteId((prev) => {
      const next = { ...prev }
      delete next[quoteId]
      return next
    })
  }

  // Opcionales de PORTO (Granizo/Cristales/Coche Cortesía): a diferencia de Bonificación/
  // Descuento/RC (parámetros de prueba locales, ver overridesByQuoteId), esto es un dato
  // real de la cotización — si el cliente ya tiene o quiere el opcional — así que se
  // escribe directo en monday al tildar/destildar, igual que "Propuesta elegida".
  const handleToggleOpcional = async (rawId, field, checked) => {
    await setSubitemCheckboxValue(rawId, OPCIONAL_PORTO_COLUMN_IDS[field], checked)
    setRawQuotes((prev) => prev.map((r) => (r.id === rawId ? { ...r, [field]: checked } : r)))
  }

  // "Aplicar a toda [Compañía]": la misma configuración de parámetros (Bonificación,
  // Descuento, deducible/edad específico) se replica en todas las cotizaciones de esa
  // compañía, no solo en la tarjeta desde la que se apretó el botón.
  const handleApplyCompanyOverrides = (compania, values) => {
    setOverridesByQuoteId((prev) => {
      const next = { ...prev }
      for (const raw of rawQuotes) {
        if (raw.compania === compania) next[raw.id] = values
      }
      return next
    })
  }

  // Contraparte de "Aplicar a toda [Compañía]": saca los parámetros de prueba de TODAS
  // las cotizaciones de esa compañía de una, en vez de tener que abrir tarjeta por
  // tarjeta y apretar "Restablecer" en cada una.
  const handleClearCompanyOverrides = (compania) => {
    setOverridesByQuoteId((prev) => {
      const next = { ...prev }
      for (const raw of rawQuotes) {
        if (raw.compania === compania) delete next[raw.id]
      }
      return next
    })
  }

  const handleMarcarParaCotizar = async () => {
    setMarking(true)
    setMarkError(null)
    setCotizarErrorDetail(null)
    try {
      await setSimpleColumnValue(opportunityId, ESTADO_COTIZACION_COLUMN_ID, 'Cotizar')
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) =>
          cv.id === ESTADO_COTIZACION_COLUMN_ID ? { ...cv, text: 'Cotizar' } : cv
        ),
      }))
      setPolling(true)
    } catch (err) {
      setMarkError(err.message)
    } finally {
      setMarking(false)
    }
  }

  // "Propuesta elegida" es de único valor por oportunidad: si había otra marcada, la
  // desmarcamos en monday antes de marcar la nueva, para no dejar dos subitems en true.
  const handleSetElegida = async (rawId) => {
    setSettingElegidaId(rawId)
    setElegidaError(null)
    try {
      const current = rawQuotes.find((r) => r.id === rawId)
      if (current?.propuestaElegida) {
        // Ya estaba elegida: clickear de nuevo la destilda (toggle off), no vuelve a marcarla.
        await setSubitemCheckboxValue(rawId, PROPUESTA_ELEGIDA_COLUMN_ID, false)
        setRawQuotes((prev) =>
          prev.map((r) => (r.id === rawId ? { ...r, propuestaElegida: false } : r))
        )
      } else {
        const previous = rawQuotes.find((r) => r.propuestaElegida && r.id !== rawId)
        if (previous) {
          await setSubitemCheckboxValue(previous.id, PROPUESTA_ELEGIDA_COLUMN_ID, false)
        }
        await setSubitemCheckboxValue(rawId, PROPUESTA_ELEGIDA_COLUMN_ID, true)
        setRawQuotes((prev) => prev.map((r) => ({ ...r, propuestaElegida: r.id === rawId })))
      }
    } catch (err) {
      setElegidaError(err.message)
    } finally {
      setSettingElegidaId(null)
    }
  }

  // Marca en monday las cotizaciones recién enviadas por WhatsApp como "Incluir Propuesta",
  // para que el paso Confirmar pueda listarlas como "enviadas" de forma persistente.
  const handleWhatsAppSent = async (sentEntries) => {
    const idsToMark = sentEntries.map((e) => e.raw.id).filter((id) => {
      const raw = rawQuotes.find((r) => r.id === id)
      return raw && !raw.incluirPropuesta
    })
    if (idsToMark.length > 0) {
      await Promise.all(
        idsToMark.map((id) => setSubitemCheckboxValue(id, INCLUIR_PROPUESTA_COLUMN_ID, true))
      )
      setRawQuotes((prev) =>
        prev.map((r) => (idsToMark.includes(r.id) ? { ...r, incluirPropuesta: true } : r))
      )
    }

    // El envío en sí lo procesa el escenario de Make.com (ver services/makeWebhook.js);
    // acá solo dejamos registrado en monday que arrancó ("Enviando") y prendemos el
    // polling en vivo de color_mm4wr1t4 para reflejar cuando Make lo marque
    // Enviado/Error — mismo patrón que "Cotizar" con Estado Cotización.
    setEnvioErrorDetail(null)
    await setSimpleColumnValue(opportunityId, ESTADO_ENVIO_COLUMN_ID, 'Enviando')
    setItem((prev) => ({
      ...prev,
      column_values: prev.column_values.map((cv) =>
        cv.id === ESTADO_ENVIO_COLUMN_ID ? { ...cv, text: 'Enviando' } : cv
      ),
    }))
    setSendPolling(true)
    // A pedido: al cerrarse el mensaje de éxito del modal de WhatsApp (a mano o solo a
    // los 2 segundos), se pasa directo al paso 3 (Confirmar) en vez de dejar a quien lo
    // manda en el paso 2 (Comparar y enviar).
    setActiveStep('confirmar')
  }

  // Sube Libreta de Conducir/Carta Automóvil y Cédula (paso 3, columnas "file" de la
  // oportunidad) directo a monday. El check visual del paso 3 depende de que el `text`
  // de la columna deje de estar vacío, así que actualizamos el `item` en memoria con el
  // nombre del archivo apenas la mutation confirma el upload (sin esperar a un refetch).
  const handleUploadDocument = async (columnId, file) => {
    setUploadingDoc((prev) => ({ ...prev, [columnId]: true }))
    setDocUploadError((prev) => ({ ...prev, [columnId]: null }))
    try {
      await uploadFileToColumn(opportunityId, columnId, file)
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) =>
          cv.id === columnId ? { ...cv, text: file.name } : cv
        ),
      }))
    } catch (err) {
      setDocUploadError((prev) => ({ ...prev, [columnId]: err.message }))
    } finally {
      setUploadingDoc((prev) => ({ ...prev, [columnId]: false }))
    }
  }

  // Botón "Eliminar" de cualquier columna file (Libreta/Cédula en paso 3, Póliza en paso
  // 4): update_assets_on_item con "files: []" vacía la columna (ver mondayApi.js —
  // change_simple_column_value no soporta columnas file). Genérico por columnId, igual
  // que handleUploadDocument.
  const handleDeleteDocument = async (columnId) => {
    setDeletingDoc((prev) => ({ ...prev, [columnId]: true }))
    setDocUploadError((prev) => ({ ...prev, [columnId]: null }))
    try {
      await clearFileColumn(opportunityId, columnId)
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) => (cv.id === columnId ? { ...cv, text: '' } : cv)),
      }))
    } catch (err) {
      setDocUploadError((prev) => ({ ...prev, [columnId]: err.message }))
    } finally {
      setDeletingDoc((prev) => ({ ...prev, [columnId]: false }))
    }
  }

  // Paso 4: subir la póliza (file_mm5bzdd4) cierra el flujo — a pedido, una vez que la
  // mutation de subida confirma, la oportunidad pasa directo a "Concretada" (mismo
  // helper setSimpleColumnValue que ya usa "Cotizar", apuntando a Estado Oportunidad en
  // vez de Estado Cotización).
  const handleUploadPoliza = async (file) => {
    setUploadingDoc((prev) => ({ ...prev, [POLIZA_COLUMN_ID]: true }))
    setDocUploadError((prev) => ({ ...prev, [POLIZA_COLUMN_ID]: null }))
    try {
      await uploadFileToColumn(opportunityId, POLIZA_COLUMN_ID, file)
      await setSimpleColumnValue(opportunityId, ESTADO_OPORTUNIDAD_COLUMN_ID, 'Concretada')
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) => {
          if (cv.id === POLIZA_COLUMN_ID) return { ...cv, text: file.name }
          if (cv.id === ESTADO_OPORTUNIDAD_COLUMN_ID) return { ...cv, text: 'Concretada' }
          return cv
        }),
      }))
    } catch (err) {
      setDocUploadError((prev) => ({ ...prev, [POLIZA_COLUMN_ID]: err.message }))
    } finally {
      setUploadingDoc((prev) => ({ ...prev, [POLIZA_COLUMN_ID]: false }))
    }
  }

  // Botón "Confirmar emisión de póliza": dispara la automatización que crea/emite la
  // póliza (color_mm5ejysv, "Crear Poliza") poniéndola en "Crear" — mismo mecanismo que
  // "Cotizar" sobre Estado Cotización — y prende el polling en vivo de esa columna.
  const handleConfirmarEmision = async () => {
    setConfirmandoEmision(true)
    setConfirmarEmisionError(null)
    setPolizaErrorDetail(null)
    try {
      await setSimpleColumnValue(opportunityId, ESTADO_CREACION_COLUMN_ID, 'Crear')
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) =>
          cv.id === ESTADO_CREACION_COLUMN_ID ? { ...cv, text: 'Crear' } : cv
        ),
      }))
      setPolizaPolling(true)
    } catch (err) {
      setConfirmarEmisionError(err.message)
    } finally {
      setConfirmandoEmision(false)
    }
  }

  // Botón "Confirmar" del paso 3: la validación de datos/documentación ya la hizo
  // ConfirmarStepPanel antes de llamar a esto — acá solo queda dejar registrado en
  // monday que la cotización fue aceptada (mismo estado real "Cotizacion aceptada" que
  // ya hace aterrizar directo en el paso 4 al reabrir la oportunidad) y avanzar la UI.
  const handleConfirmarPaso3 = async () => {
    setConfirmingPaso3(true)
    setConfirmPaso3Error(null)
    try {
      await setSimpleColumnValue(opportunityId, ESTADO_OPORTUNIDAD_COLUMN_ID, 'Cotizacion aceptada')
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) =>
          cv.id === ESTADO_OPORTUNIDAD_COLUMN_ID ? { ...cv, text: 'Cotizacion aceptada' } : cv
        ),
      }))
      setActiveStep('emitir')
    } catch (err) {
      setConfirmPaso3Error(err.message)
    } finally {
      setConfirmingPaso3(false)
    }
  }

  const handleSaveCotizarFields = async (formValues) => {
    for (const field of COTIZAR_FIELDS) {
      if (field.kind === 'connected' || field.kind === 'autodata') continue
      const newValue = formValues[field.key] ?? ''
      const oldValue = opportunity[field.key] ?? ''
      if (newValue === oldValue) continue
      // Las columnas "dropdown" (a diferencia de "status"/"number"/"date") no se pueden
      // escribir con un string pelado vía change_simple_column_value: si el label es
      // puramente numérico (Año, ej. "2006"), monday lo confunde con el ID interno del
      // label en vez de buscarlo por nombre y el valor queda vacío en silencio. Ver
      // dropdownColumnValue en mondayApi.js.
      if (field.kind === 'dropdown') {
        await setDropdownColumnValue(opportunityId, field.columnId, newValue)
      } else {
        await setSimpleColumnValue(opportunityId, field.columnId, newValue)
      }
    }

    // Campos "connected" (Departamento, Zona de circulación/Localidad): cada uno se
    // guarda como conexión (change_column_value con item_ids), no como texto — solo si
    // realmente cambió respecto al que ya tenía la oportunidad (matcheado por nombre
    // contra la lista real, ya que `opportunity[field.key]` guarda el nombre, no el id).
    const connectedNameByColumnId = {}
    for (const field of COTIZAR_FIELDS) {
      if (field.kind !== 'connected') continue
      const options = dropdownOptions[field.optionsKey] ?? []
      const currentId = options.find((o) => o.name === opportunity[field.key])?.id ?? ''
      const newId = formValues[field.idKey] ?? ''
      if (newId !== currentId) {
        await setConnectedColumnValue(opportunityId, field.columnId, newId ? [Number(newId)] : [])
      }
      connectedNameByColumnId[field.columnId] = options.find((o) => o.id === newId)?.name ?? ''
    }

    // Modelo (Autodata): solo se escribe si en esta edición se eligió uno nuevo del
    // buscador — se guarda como conexión (igual que Departamento), no como texto. El
    // texto real de `text_mm54fb7m` lo termina asentando la automatización de
    // "Cotizar" (que además vacía esta conexión) — acá solo dejamos la elección hecha.
    if (formValues.modeloSeleccion) {
      const modeloField = COTIZAR_FIELDS.find((f) => f.key === 'modelo')
      await setConnectedColumnValue(opportunityId, modeloField.connectedColumnId, [
        Number(formValues.modeloSeleccion.id),
      ])
    }

    const textByColumnId = {
      numeric_mm51mb0s: formValues.ci,
      dropdown_mm51mdmq: formValues.anio,
      // Muestra ya la elección nueva del buscador Autodata si se hizo una; si no, sigue
      // mostrando el texto real actual tal cual estaba.
      text_mm54fb7m: formValues.modeloSeleccion?.name ?? formValues.modelo,
      dropdown_mm51ykrd: formValues.marca,
      dropdown_mm52jp01: formValues.combustible,
      color_mm52ey1d: formValues.uso,
      dropdown_mm5jqdk: formValues.tipo,
      date_mm516agw: formValues.fechaNacimiento,
    }

    setItem((prev) => ({
      ...prev,
      column_values: prev.column_values.map((cv) => {
        if (cv.id in textByColumnId) return { ...cv, text: textByColumnId[cv.id] }
        // Los "connected" son board_relation: el mapper lee `display_value`, no `text`
        // (ver opportunityMapper.js#boardRelationDisplayOf) — hay que actualizar ese
        // campo para que el optimistic update se vea reflejado.
        if (cv.id in connectedNameByColumnId) return { ...cv, display_value: connectedNameByColumnId[cv.id] }
        return cv
      }),
    }))
  }

  const handleOpenWhatsAppModal = () => {
    const selectedEntries = groups
      .flatMap((g) => g.entries)
      .filter((e) => selectedIds.has(e.raw.id))
    const images = selectedEntries.map((e) => ({
      raw: e.raw,
      quote: e.quote,
      imageDataUrl: renderQuoteImageDataUrl(opportunity, e.raw, e.quote),
    }))
    setWaModalImages(images)
  }

  const tieneElegida = rawQuotes.some((r) => r.propuestaElegida)
  const emitirDone = opportunity?.estadoLabel === 'Concretada'
  // El paso 2 se marca cumplido cuando la oportunidad ya avanzó a "Cotizacion Enviada"
  // (o a un estado posterior del mismo flujo) — no alcanza con tener cotizaciones
  // cargadas, hace falta que efectivamente ya se le hayan mandado al cliente.
  const compararDone = ['Cotizacion Enviada', 'Cotizacion aceptada', 'Concretada', 'No Concretada'].includes(
    opportunity?.estadoLabel
  )
  const confirmarDone = tieneElegida || emitirDone
  // El paso 4 se marca cumplido recién cuando la póliza ya quedó cargada y la
  // oportunidad pasó a "Concretada" — antes de eso, está "activo" apenas se acepta la
  // cotización (o ya se cargó la póliza pero el estado todavía no refrescó).
  const emitirActive =
    !emitirDone && (opportunity?.estadoLabel === 'Cotizacion aceptada' || Boolean(opportunity?.poliza))

  // Gate previo al paso 1: solo aplica si la oportunidad "Posee Vehículo" (si no, esos
  // documentos se piden directo en el paso 3 Confirmar, sin lectura automática de por
  // medio). Cubre "Leer" (en cola) y "Leyendo" (en curso) — no se puede saltear ninguno
  // de los dos a mano; en "Error" sí se puede continuar igual (por si la lectura
  // automática falló y hay que cargar los datos a mano).
  const lecturaGateActive =
    opportunity?.poseeVehiculo === 'Si' &&
    (opportunity?.estadoLectura === 'Leer' ||
      opportunity?.estadoLectura === 'Leyendo' ||
      opportunity?.estadoLectura === 'Error') &&
    !lecturaDismissed

  const steps = [
    { key: 'cotizar', label: 'Cotizar', status: hasQuotes ? 'done' : 'active', clickable: true },
    {
      key: 'comparar',
      label: 'Comparar y enviar',
      status: compararDone ? 'done' : hasQuotes ? 'active' : 'pending',
      clickable: true,
    },
    {
      key: 'confirmar',
      label: 'Confirmar',
      status: confirmarDone ? 'done' : hasQuotes ? 'active' : 'pending',
      clickable: true,
    },
    {
      key: 'emitir',
      label: 'Emitir · cargar PDF',
      status: emitirDone ? 'done' : emitirActive ? 'active' : 'pending',
      clickable: true,
    },
  ]

  return (
    <div className="app">
      <TopBar />

      <div className="opp-detail__breadcrumb">
        <Button kind="tertiary" className="opp-detail__back-btn" onClick={onBack}>
          <MdArrowBack /> Volver a Oportunidades
        </Button>
        {!loading && !error && opportunity && !lecturaGateActive && (
          <Stepper steps={steps} activeKey={activeStep} onSelect={setActiveStep} />
        )}
        {!loading && !error && opportunity && (
          <Button kind="secondary" className="opp-detail__ver-monday-btn">
            <MdOpenInNew /> Ver en Monday
          </Button>
        )}
      </div>

      {loading && (
        <div className="opp-detail__status">
          <span className="opp-detail__loading-spinner" aria-hidden="true" />
          Cargando cotizaciones...
        </div>
      )}
      {error && <div className="opp-detail__status opp-detail__status--error">Error: {error}</div>}

      {!loading && !error && opportunity && (
        <>
          <div className="opp-detail__header">
            <h1 className="opp-detail__title">Cotizaciones</h1>
            <p className="opp-detail__subtitle">
              Cotizá, comparalá y enviá las mejores opciones a tu cliente.
            </p>
          </div>

          <div className="opp-detail__client-card">
            <div className="opp-detail__client-card-main">
              <div className="opp-detail__client-avatar">{opportunity.clienteNombre.slice(0, 2).toUpperCase()}</div>
              <div className="opp-detail__client-info">
                <span className="opp-detail__client-name">{opportunity.clienteNombre}</span>
                <span className="opp-detail__client-meta">
                  {opportunity.bienLinea1} {opportunity.bienLinea2 && `· ${opportunity.bienLinea2}`}
                </span>
                {opportunity.ci && <span className="opp-detail__client-meta">CI {opportunity.ci}</span>}
              </div>

              {/* A pedido: en vez de la aclaración de "Parámetros", acá va la lista de
                  datos de la oportunidad (Edad, Combustible, Teléfono — antes en el
                  panel lateral eliminado), en una sola línea para no sumar alto; el
                  botón "Recotizar" sigue al lado, en el mismo renglón que
                  Nombre/Bien/CI. En el paso "Confirmar" (antes tenía su propio botón
                  "Recotizar" más abajo, junto a la sección "Datos del cliente" que se
                  eliminó) solo se sube el botón, sin la lista de datos. */}
              {(activeStep === 'comparar' || activeStep === 'confirmar') && hasQuotes && (
                <div
                  className={
                    activeStep === 'comparar'
                      ? 'opp-detail__client-card-note'
                      : 'opp-detail__client-card-note opp-detail__client-card-note--btn-only'
                  }
                >
                  {activeStep === 'comparar' && (
                    <span className="opp-detail__client-card-data">
                      <span>Edad: {opportunity.edad ? `${opportunity.edad} años` : '—'}</span>
                      <span>Combustible: {opportunity.combustible || '—'}</span>
                      <span>Teléfono: {opportunity.telefono || '—'}</span>
                    </span>
                  )}
                  <Button kind="secondary" className="opp-detail__recotizar-btn" onClick={() => setActiveStep('cotizar')}>
                    <MdAutorenew /> Recotizar
                  </Button>
                </div>
              )}

              {/* A pedido: el botón "Cotizar" (y su aclaración) vive acá, al lado de los
                  datos del cliente, en vez de en un banner aparte más abajo (ver
                  CotizarStepPanel — ese banner se sacó de ahí). */}
              {activeStep === 'cotizar' && !hasQuotes && !polling && (
                <div className="opp-detail__client-card-note opp-detail__client-card-note--tight">
                  <span>Todavía no se generó ninguna cotización para esta oportunidad.</span>
                  <Button kind="primary" onClick={handleMarcarParaCotizar} disabled={marking || !canCotizar}>
                    <MdSend /> {marking ? 'Marcando...' : 'Cotizar'}
                  </Button>
                  {markError && <span className="opp-detail__client-card-note-error">Error: {markError}</span>}
                </div>
              )}
            </div>
          </div>

          {lecturaGateActive ? (
            <div className="opp-detail__lectura-gate">
              <div className="opp-detail__lectura-gate-estado">
                <span>Estado de lectura:</span>
                <StatusBadge label={opportunity.estadoLectura} color={opportunity.estadoLecturaColor} />
              </div>
              {(opportunity.estadoLectura === 'Leer' || opportunity.estadoLectura === 'Leyendo') && (
                <AttentionBox type="warning" icon={false}>
                  <span className="opp-detail__envio-spinner" aria-hidden="true" />
                  {opportunity.estadoLectura === 'Leer'
                    ? 'En cola para leer Cédula y Carta Automóvil...'
                    : 'Leyendo Cédula y Carta Automóvil...'}{' '}
                  esto puede tardar unos segundos. La pantalla se va a actualizar sola apenas
                  esté lista.
                </AttentionBox>
              )}
              {opportunity.estadoLectura === 'Error' && (
                <AttentionBox type="negative">
                  <div className="opp-detail__lectura-gate-row">
                    <span>
                      <MdWarningAmber /> No se pudieron leer los documentos automáticamente.
                    </span>
                    <Button kind="secondary" onClick={() => setLecturaDismissed(true)}>
                      Continuar de todas formas
                    </Button>
                  </div>
                </AttentionBox>
              )}
              {opportunity.estadoLectura === 'Error' && lecturaErrorDetail && (
                <div className="opp-detail__error-detail">
                  <strong>Detalle del error (último update en la oportunidad):</strong>
                  <pre>{lecturaErrorDetail}</pre>
                </div>
              )}
            </div>
          ) : (
            <>
              {activeStep === 'cotizar' && (
            <CotizarStepPanel
              opportunity={opportunity}
              hasQuotes={hasQuotes}
              onMarcarParaCotizar={handleMarcarParaCotizar}
              marking={marking}
              markError={markError}
              dropdownOptions={dropdownOptions}
              onSave={handleSaveCotizarFields}
              estadoCotizacion={opportunity.estadoCotizacion}
              estadoCotizacionColor={opportunity.estadoCotizacionColor}
              polling={polling}
              errorDetail={cotizarErrorDetail}
            />
          )}

          {activeStep === 'comparar' && !hasQuotes && (
            <div className="opp-detail__no-quotes">
              <EmptyState
                title="Todavía no hay nada para comparar"
                description='No hay ninguna cotización cargada para esta oportunidad — no hay nada para comparar o enviar.'
                mainAction={{ text: 'Ir al paso 1 (Cotizar)', onClick: () => setActiveStep('cotizar') }}
              />
            </div>
          )}

          {activeStep === 'comparar' && hasQuotes && (
            <>
              <div className="opp-detail__body">
                {/* Solapas por familia de cobertura (a pedido) — "General" muestra todo,
                    como antes; "GLOBAL"/"TRIPLE" filtran sin importar la compañía. Sin
                    solapas/acordeón POR COMPAÑÍA: todas las cotizaciones de la solapa
                    activa van en una sola grilla de a 2 por renglón, con la compañía de
                    cada una mostrada adentro de su propia tarjeta (ver QuoteCard).
                    Control segmentado a mano (en vez de Tab/TabList de @vibe/core, cuyos
                    estilos internos vienen de clases hasheadas inyectadas en runtime, no
                    hay hook confiable para "1/3 del ancho cada una" + look propio) —
                    mismo criterio que los botones-pill de Stepper.jsx. */}
                <div className="opp-detail__cobertura-tabs" role="tablist">
                  {COBERTURA_TABS.map((tab, index) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={coberturaTabIndex === index}
                      className={
                        coberturaTabIndex === index
                          ? 'opp-detail__cobertura-tab opp-detail__cobertura-tab--active'
                          : 'opp-detail__cobertura-tab'
                      }
                      onClick={() => setCoberturaTabIndex(index)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {visibleQuoteEntries.length === 0 ? (
                  <EmptyState
                    title="Sin cotizaciones en esta familia"
                    description="No hay cotizaciones con cobertura GLOBAL o TRIPLE (según corresponda) para esta oportunidad."
                  />
                ) : (
                  <div className="opp-detail__quotes">
                    {visibleQuoteEntries.map(({ raw, quote, compania }) => (
                      <QuoteCard
                        key={raw.id}
                        raw={raw}
                        quote={quote}
                        selected={selectedIds.has(raw.id)}
                        onToggleSelected={() => toggleSelected(raw.id)}
                        overrides={overridesByQuoteId[raw.id] ?? {}}
                        onApplyOverrides={(values) => handleApplyQuoteOverrides(raw.id, values)}
                        onResetOverrides={() => handleResetQuoteOverrides(raw.id)}
                        onApplyToCompany={(values) => handleApplyCompanyOverrides(compania, values)}
                        onClearCompany={() => handleClearCompanyOverrides(compania)}
                        onToggleOpcional={(field, checked) => handleToggleOpcional(raw.id, field, checked)}
                        rcOptions={rcOptions}
                      />
                    ))}
                  </div>
                )}
              </div>

              {envioErrorDetail && (
                <div className="opp-detail__error-detail">
                  <strong>Detalle del error de envío (último update en la oportunidad):</strong>
                  <pre>{envioErrorDetail}</pre>
                </div>
              )}

              <div className="opp-detail__footer">
                <div className="opp-detail__footer-status">
                  <span>{selectedIds.size} opciones seleccionadas</span>
                  {opportunity.estadoEnvio && (
                    <span className="opp-detail__envio-status">
                      {sendPolling && (
                        <span className="opp-detail__envio-spinner" aria-hidden="true" />
                      )}
                      <StatusBadge label={opportunity.estadoEnvio} color={opportunity.estadoEnvioColor} />
                    </span>
                  )}
                </div>
                <div className="opp-detail__footer-actions">
                  <Button kind="secondary">
                    <MdFileDownload /> Descargar comparativo
                  </Button>
                  <Button
                    kind="primary"
                    color="positive"
                    onClick={handleOpenWhatsAppModal}
                    disabled={selectedIds.size === 0}
                  >
                    <MdSend /> Enviar seleccionadas por WhatsApp
                  </Button>
                </div>
              </div>
            </>
          )}

          {activeStep === 'confirmar' && !hasQuotes && (
            <div className="opp-detail__no-quotes">
              <EmptyState
                title="Todavía no hay nada que confirmar"
                description="No hay ninguna cotización cargada para esta oportunidad."
                mainAction={{ text: 'Ir al paso 1 (Cotizar)', onClick: () => setActiveStep('cotizar') }}
              />
            </div>
          )}

          {activeStep === 'confirmar' && hasQuotes && (
            <ConfirmarStepPanel
              opportunity={opportunity}
              groups={groups}
              onSetElegida={handleSetElegida}
              settingElegidaId={settingElegidaId}
              elegidaError={elegidaError}
              documentos={[
                {
                  key: 'libretaConducir',
                  label: 'Libreta de Conducir / Carta Automóvil',
                  columnId: LIBRETA_CONDUCIR_COLUMN_ID,
                  fileName: opportunity.libretaConducir,
                },
                {
                  key: 'cedula',
                  label: 'Cédula de Identidad',
                  columnId: CEDULA_COLUMN_ID,
                  fileName: opportunity.cedula,
                },
              ]}
              uploadingDoc={uploadingDoc}
              deletingDoc={deletingDoc}
              docUploadError={docUploadError}
              onUploadDocument={handleUploadDocument}
              onDeleteDocument={handleDeleteDocument}
              confirming={confirmingPaso3}
              confirmError={confirmPaso3Error}
              onConfirmar={handleConfirmarPaso3}
            />
          )}

          {activeStep === 'emitir' && !hasQuotes && (
            <div className="opp-detail__no-quotes">
              <EmptyState
                title="Todavía no hay nada que emitir"
                description="No hay ninguna cotización cargada para esta oportunidad."
                mainAction={{ text: 'Ir al paso 1 (Cotizar)', onClick: () => setActiveStep('cotizar') }}
              />
            </div>
          )}

          {activeStep === 'emitir' && hasQuotes && (
            <EmitirStepPanel
              opportunity={opportunity}
              groups={groups}
              concretada={emitirDone}
              polizaFileName={opportunity.poliza}
              uploading={Boolean(uploadingDoc[POLIZA_COLUMN_ID])}
              deleting={Boolean(deletingDoc[POLIZA_COLUMN_ID])}
              error={docUploadError[POLIZA_COLUMN_ID]}
              onUploadPoliza={handleUploadPoliza}
              onDeletePoliza={() => handleDeleteDocument(POLIZA_COLUMN_ID)}
              estadoCreacion={opportunity.estadoCreacion}
              estadoCreacionColor={opportunity.estadoCreacionColor}
              polling={polizaPolling}
              errorDetail={polizaErrorDetail}
              onConfirmarEmision={handleConfirmarEmision}
              confirmandoEmision={confirmandoEmision}
              confirmarEmisionError={confirmarEmisionError}
            />
          )}
            </>
          )}
        </>
      )}

      {waModalImages && (
        <WhatsAppSendModal
          opportunity={opportunity}
          images={waModalImages}
          onClose={() => setWaModalImages(null)}
          onSent={handleWhatsAppSent}
          sendPolling={sendPolling}
          envioErrorDetail={envioErrorDetail}
        />
      )}
    </div>
  )
}
