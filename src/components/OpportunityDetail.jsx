import { useEffect, useMemo, useRef, useState } from 'react'
import { MdSend, MdAutorenew, MdArrowBack, MdDownload } from 'react-icons/md'
import { Button, EmptyState, AttentionBox, Loader } from '@vibe/core'
import QuoteCard from './QuoteCard'
import StatusBadge from './StatusBadge'
import Stepper from './Stepper'
import CotizarStepPanel from './CotizarStepPanel'
import CotizandoModal from './CotizandoModal'
import ConfirmarStepPanel from './ConfirmarStepPanel'
import EmitirStepPanel from './EmitirStepPanel'
import WhatsAppSendModal from './WhatsAppSendModal'
import ErrorDetailBox from './ErrorDetailBox'
import ClientContextBar from './ClientContextBar'
import StepFooter from './StepFooter'
import LoadingScreen from './LoadingScreen'
import './PillTabs.css'
import {
  fetchOpportunityDetail,
  setSimpleColumnValue,
  setDropdownColumnValue,
  setConnectedColumnValue,
  setSubitemCheckboxValue,
  setSubitemColumnValue,
  uploadFileToColumn,
  clearFileColumn,
  fetchLatestUpdate,
  setContactoColumnValues,
  CONTACTO_DIRECCION_COLUMN_ID,
} from '../services/mondayApi'
import { mapOpportunityItem } from '../services/opportunityMapper'
import { textOf } from '../services/mondayColumns'
import { useSchema } from '../context/AppContext'
import { mapSubitemToRawQuote, groupQuotesByCompania } from '../services/quoteMapper'
import { renderQuoteText } from '../services/whatsappText'
import { buildQuotesCsv, descargarCsv, nombreArchivoCotizaciones } from '../services/quotesExport'
import { computeQuote, isQuoteSelectable } from '../services/pricingEngine'
import { applyRecargoLookup } from '../services/recargoPanel'
import { COTIZAR_FIELDS, getMissingCotizarFields } from '../services/cotizarFields'
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
// Columnas de los opcionales que se tildan por cotización (ver pricingEngine.js#OPCIONALES
// y handleToggleOpcional / handleAutoExtraChange más abajo).
// "Auto extra" no está acá porque no es un tilde sino una duración elegida — se escribe
// como estado, ver AUTO_EXTRA_COLUMN_ID.
const OPCIONAL_COLUMN_IDS = {
  granizo: 'boolean_mm5fsr46',
  cristales: 'boolean_mm5fqazp',
  usoRural: 'boolean_mm6z3j9j',
  suraTeLleva: 'boolean_mm6zhfhd',
  ap: 'boolean_mm6zzwq5',
}
const AUTO_EXTRA_COLUMN_ID = 'color_mm6zpx3j'
// LOG-13: la Bonificación (columna "Bonif" del subitem) se puede guardar de verdad desde
// el paso "Confirmar" — en "Comparar y enviar" sigue siendo un ajuste de prueba local.
const BONIF_COLUMN_ID = 'numeric_mm52ey7f'
const POLL_INTERVAL_MS = 4000
// Auditoría: cantidad de ticks seguidos fallidos tras la cual el polling se corta y
// avisa (antes giraba para siempre si la API de monday no respondía).
const POLL_MAX_FAILS = 3
// LOG-05: si el robot que cotiza muere a mitad de camino, "Estado Cotización" se queda
// pegado en "Cotizando" para siempre del lado de monday — sin este corte, el polling de
// abajo (y la pantalla) giraban sin parar, incluso reentrando después de haber
// abandonado la pestaña. No hay forma de saber desde acá si el proceso realmente sigue
// vivo (para eso el robot mismo tendría que respetar un estado de cancelación, ver
// MON-10) — este corte es solo la red de seguridad del lado del cliente: a los 5
// minutos sin resolverse, se da por muerto y se pasa a "Error" con "Reintentar".
const POLL_COTIZANDO_TIMEOUT_MS = 5 * 60 * 1000
// Prefijo que cada automatización debe agregar al principio del texto del Update que
// postea sobre el ítem cuando falla (configurar así del lado del robot de cotización y
// del escenario de Make.com de envío por WhatsApp) — ver fetchLatestUpdate en mondayApi.js.
const ERROR_UPDATE_TAG_COTIZAR = '[COTIZAR]'
const ERROR_UPDATE_TAG_ENVIO = '[ENVIO]'
const ERROR_UPDATE_TAG_CREAR_POLIZA = '[CREAR_POLIZA]'
const ERROR_UPDATE_TAG_LEER = '[LEER]'

export default function OpportunityDetail({
  opportunityId,
  onBack,
  // Auditoría: salida SIEMPRE visible a la tabla de Oportunidades (antes, entrando desde
  // la tabla no había ningún botón de salida en pantalla — solo el ícono del Sidebar).
  onGoToList,
  schema: schemaProp,
  showReturnToCrearFlow = false,
  onOpportunityAction,
  onGoHome,
  // Router (ver useHashRoute): paso pedido en la URL (#/oportunidades/:id/:step) y
  // callback para reflejar el paso activo en la URL. Si urlStep viene, pisa el paso
  // que se deriva de deal_stage al montar (solo la primera vez).
  urlStep = null,
  onStepChange,
}) {
  // `schema` por prop (compatibilidad) o del contexto global (ver AppContext).
  const ctxSchema = useSchema()
  const schema = schemaProp ?? ctxSchema
  const [item, setItem] = useState(null)
  const [rawQuotes, setRawQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [overridesByQuoteId, setOverridesByQuoteId] = useState({})
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [activeStep, setActiveStep] = useState('cotizar')
  // Solapas "GLOBAL / TRIPLE / General" del paso "Comparar y enviar" — índice de
  // COBERTURA_TABS, no el texto (así matchea directo con TabList/Tab de @vibe/core). En
  // 0 arranca en GLOBAL (a pedido, la solapa que se ve primero al entrar), no en
  // "General" — ver el orden del array en coberturaGroups.js.
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
  // A pedido: progreso en vivo por compañía mientras se cotiza/recotiza (ver
  // CotizandoModal) — {compania: cantidad de subitems ya creados}, se actualiza en cada
  // tick del polling de abajo (antes se calculaba mid-poll y se descartaba, solo se
  // usaba una vez llegado al estado terminal).
  const [cotizarProgress, setCotizarProgress] = useState({})
  // LOG-05: desde cuándo (Date.now()) este navegador viene polleando "Cotizando" sin
  // corte — se pisa cada vez que arranca un polling de cotización nuevo (fresco o
  // reanudado al reentrar, ver handleMarcarParaCotizar y el mount effect). No mide
  // desde que el ROBOT arrancó (esa hora no la tenemos), así que si ya venía colgado de
  // antes el corte tarda un poco más en llegar — igual corta, no queda girando para
  // siempre.
  const cotizarPollStartRef = useRef(null)
  // Cantidad de subitems nuevos ya vistos en esta cotización — sirve para detectar
  // progreso entre ticks y reiniciar el reloj de arriba (ver el tick del polling).
  const cotizarProgresoVistoRef = useRef(0)
  // A pedido: en un RECOTIZAR, el primer paso de la automatización es BORRAR todas las
  // cotizaciones anteriores y recién después crear las nuevas desde cero — sin esto, los
  // subitems viejos (todavía sin borrar en el momento de un tick) se contarían como si
  // ya fueran progreso de la tanda nueva, mostrando compañías "completas" un instante
  // antes de que esos mismos subitems desaparezcan. Se guarda el set de ids YA
  // existentes justo antes de arrancar (ver handleMarcarParaCotizar) — useRef porque
  // el tick del polling (más abajo) lo necesita estable entre renders, no como estado
  // que dispare un re-render propio.
  const oldSubitemIdsRef = useRef(new Set())
  // Cerrar CotizandoModal es solo visual (mismo criterio que WhatsAppSendModal) — no
  // corta el polling de fondo. Se reinicia a false cada vez que arranca una cotización
  // nueva (ver handleMarcarParaCotizar), así vuelve a aparecer aunque se haya cerrado
  // en un intento anterior.
  const [cotizandoModalDismissed, setCotizandoModalDismissed] = useState(false)
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
      const text = update?.text_body?.trim()
      if (!text) return null
      // A pedido: se muestra el texto tal cual quedó en monday, sin el prefijo que usa
      // fetchLatestUpdate para filtrar por Update (ej. "[COTIZAR]") — ese tag es un
      // detalle interno nuestro, no algo que la persona que lee el error necesite ver.
      return (text.startsWith(tag) ? text.slice(tag.length) : text).trim()
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
        const raws = mapped
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

        const VALID_STEPS = ['cotizar', 'comparar', 'confirmar', 'emitir']
        if (urlStep && VALID_STEPS.includes(urlStep) && (urlStep === 'cotizar' || raws.length > 0)) {
          setActiveStep(urlStep)
        } else if (estadoOportunidad === 'Nueva') {
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
          cotizarPollStartRef.current = Date.now()
          cotizarProgresoVistoRef.current = 0
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

  // Auditoría: antes había 4 useEffect de polling independientes (cotización, envío,
  // póliza, lectura), cada uno con su propio setInterval, su propio
  // fetchOpportunityDetail COMPLETO cada POLL_INTERVAL_MS y su propio par de listeners
  // de foco — con 2 o más activos a la vez (ej. envío + póliza al reabrir) se pedía el
  // mismo ítem 2-4 veces por ciclo y se hacía setItem (re-render de todas las
  // QuoteCards) otras tantas. Ahora hay UN solo ciclo mientras cualquiera de los 4
  // flags esté prendido: un fetch por tick, y cada rama aplica exactamente la misma
  // lógica de corte/avance que tenía antes (los flags polling/sendPolling/
  // polizaPolling/lecturaPolling se mantienen tal cual, el resto del componente no
  // cambia). Además:
  // - setItem solo si el ítem realmente cambió (firma de column_values + subitems), así
  //   un tick "sin novedades" no re-renderiza nada.
  // - contador de fallos consecutivos: a los POLL_MAX_FAILS se corta y se avisa
  //   (pollStalled, ver AttentionBox arriba del todo) con "Reintentar", en vez de girar
  //   para siempre si la API de monday dejó de responder.
  const anyPolling = polling || sendPolling || polizaPolling || lecturaPolling
  const pollFailsRef = useRef(0)
  const lastItemSigRef = useRef('')
  const stalledFlagsRef = useRef(null)
  const [pollStalled, setPollStalled] = useState(false)

  useEffect(() => {
    if (!anyPolling) return undefined
    let cancelled = false
    pollFailsRef.current = 0


    const tick = async () => {
      let data
      try {
        data = await fetchOpportunityDetail(opportunityId)
      } catch {
        // hiccup de red puntual: seguimos intentando en el próximo tick — salvo que ya
        // sean POLL_MAX_FAILS seguidos, ahí cortamos y avisamos.
        pollFailsRef.current += 1
        if (!cancelled && pollFailsRef.current >= POLL_MAX_FAILS) {
          stalledFlagsRef.current = { polling, sendPolling, polizaPolling, lecturaPolling }
          setPolling(false)
          setSendPolling(false)
          setPolizaPolling(false)
          setLecturaPolling(false)
          setPollStalled(true)
        }
        return
      }
      if (cancelled || !data) return
      pollFailsRef.current = 0

      const sig =
        JSON.stringify(data.column_values) +
        JSON.stringify((data.subitems ?? []).map((sub) => sub.column_values))
      if (sig !== lastItemSigRef.current) {
        lastItemSigRef.current = sig
        setItem(data)
      }

      // --- Estado Cotización (color_mm51n7aa): apenas "Cotizado (Subitems)" Y
      // "Estado Oportunidad" (deal_stage) === "Cotizacion Emitida" (las dos, no
      // alcanza con una sola — el robot las setea juntas al terminar), corta y avanza
      // a "Comparar y enviar".
      if (polling) {
        const estadoCotizacion = textOf(data.column_values, ESTADO_COTIZACION_COLUMN_ID)
        const estadoOportunidad = textOf(data.column_values, ESTADO_OPORTUNIDAD_COLUMN_ID)
        const mapped = (data.subitems ?? []).map(mapSubitemToRawQuote)
        const raws = mapped

        // Progreso en vivo por compañía (ver CotizandoModal) — se actualiza en CADA
        // tick. Se excluyen los subitems que YA existían antes de arrancar
        // (oldSubitemIdsRef): en un recotizar la automatización primero borra todo lo
        // viejo y recién después crea lo nuevo.
        const newRaws = raws.filter((r) => !oldSubitemIdsRef.current.has(r.id))
        const progressByCompania = {}
        for (const { compania, quotes } of groupQuotesByCompania(newRaws)) {
          progressByCompania[compania] = quotes.length
        }
        setCotizarProgress(progressByCompania)

        // LOG-05: el corte por tiempo mide inactividad, no duración total — mientras el
        // robot siga creando subitems se reinicia el reloj, así una cotización lenta pero
        // viva nunca se da por muerta.
        if (newRaws.length > cotizarProgresoVistoRef.current) {
          cotizarProgresoVistoRef.current = newRaws.length
          if (cotizarPollStartRef.current) cotizarPollStartRef.current = Date.now()
        }

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
        } else if (
          estadoCotizacion === 'Cotizando' &&
          cotizarPollStartRef.current &&
          Date.now() - cotizarPollStartRef.current > POLL_COTIZANDO_TIMEOUT_MS
        ) {
          // LOG-05: sigue en "Cotizando" después de POLL_COTIZANDO_TIMEOUT_MS — se da por
          // muerto del lado del cliente (ver el comentario de la constante) y se pasa a
          // "Error" con la misma UI que un error real del robot, en vez de seguir
          // girando para siempre.
          cotizarPollStartRef.current = null
          setPolling(false)
          setMarkError(
            'La cotización no respondió a tiempo — es posible que el proceso se haya interrumpido. Podés reintentar.'
          )
          try {
            await setSimpleColumnValue(opportunityId, ESTADO_COTIZACION_COLUMN_ID, 'Error')
            setItem((prev) => ({
              ...prev,
              column_values: prev.column_values.map((cv) =>
                cv.id === ESTADO_COTIZACION_COLUMN_ID ? { ...cv, text: 'Error' } : cv
              ),
            }))
          } catch {
            // Si ni este chequeo se pudo escribir, igual el polling ya se cortó de este
            // lado — el próximo tick no lo va a reintentar.
          }
        }
      }

      // --- Estado Envio (color_mm4wr1t4): corta en "Enviado" o "Error". El paso activo
      // pasa a "Confirmar" recién acá, cuando "Enviado" se confirma de verdad.
      if (sendPolling) {
        const estadoEnvio = textOf(data.column_values, ESTADO_ENVIO_COLUMN_ID)
        if (estadoEnvio === 'Enviado' || estadoEnvio === 'Error') {
          setSendPolling(false)
          if (estadoEnvio === 'Error') {
            setEnvioErrorDetail(await loadErrorUpdate(ERROR_UPDATE_TAG_ENVIO))
          } else {
            setActiveStep('confirmar')
          }
        }
      }

      // --- Crear Poliza (color_mm5ejysv): corta en "Creada" o "Error".
      if (polizaPolling) {
        const estadoCreacion = textOf(data.column_values, ESTADO_CREACION_COLUMN_ID)
        if (estadoCreacion === 'Creada' || estadoCreacion === 'Error') {
          setPolizaPolling(false)
          if (estadoCreacion === 'Error') {
            setPolizaErrorDetail(await loadErrorUpdate(ERROR_UPDATE_TAG_CREAR_POLIZA))
          }
        }
      }

      // --- Leer Cédula y Archivo Automóvil (color_mm5rzrhk): corta en "Leidos" o
      // "Error". Solo se prende cuando aplica (ver mount effect — Posee Vehículo === "Si").
      if (lecturaPolling) {
        const estadoLectura = textOf(data.column_values, ESTADO_LECTURA_COLUMN_ID)
        if (estadoLectura === 'Leidos' || estadoLectura === 'Error') {
          setLecturaPolling(false)
          if (estadoLectura === 'Error') {
            setLecturaErrorDetail(await loadErrorUpdate(ERROR_UPDATE_TAG_LEER))
          }
        }
      }
    }

    // Los navegadores frenan drásticamente los setInterval de una pestaña en segundo
    // plano — al recuperar foco/visibilidad forzamos un tick inmediato.
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
  }, [anyPolling, polling, sendPolling, polizaPolling, lecturaPolling, opportunityId, schema])

  // Refleja el paso activo en la URL (solo después de cargar, para no pisar el paso
  // pedido en la URL con el 'cotizar' inicial del useState).
  useEffect(() => {
    if (!loading && !error) onStepChange?.(activeStep)
  }, [activeStep, loading, error])

  // Y al revés: si cambia el paso en la URL con el detalle ya montado (atrás/adelante
  // del navegador, o un link pegado a mano), se sigue — mismos límites que al montar
  // (cualquier paso distinto de Cotizar necesita cotizaciones cargadas).
  useEffect(() => {
    if (loading || error || !urlStep || urlStep === activeStep) return
    const valid = ['cotizar', 'comparar', 'confirmar', 'emitir'].includes(urlStep)
    if (valid && (urlStep === 'cotizar' || rawQuotes.length > 0)) setActiveStep(urlStep)
  }, [urlStep])

  // "Reintentar" del aviso de polling cortado: vuelve a prender exactamente los flags
  // que estaban activos cuando se cortó.
  const handleRetryPolling = () => {
    const flags = stalledFlagsRef.current ?? {}
    setPollStalled(false)
    if (flags.polling) {
      // El reloj del corte por tiempo (LOG-05) arranca de nuevo acá: si se reusara el de
      // antes del corte por red, el timeout podría saltar en el primer tick del
      // reintento y mandar la oportunidad a "Error" sin haberle dado tiempo.
      cotizarPollStartRef.current = Date.now()
      cotizarProgresoVistoRef.current = 0
      setPolling(true)
    }
    if (flags.sendPolling) setSendPolling(true)
    if (flags.polizaPolling) setPolizaPolling(true)
    if (flags.lecturaPolling) setLecturaPolling(true)
  }

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
      preciosOpcionales: schema?.preciosOpcionales ?? {},
    }
    // Los recargos por cuota se aplican ACÁ y no al traer las cotizaciones: este memo
    // depende de `schema`, así que si PANEL llega después que el detalle (pasa siempre
    // que se entra por URL directa o se recarga la página: el detalle es un solo fetch y
    // el schema son cinco en paralelo) las cuotas se recalculan solas. Antes el recargo
    // se horneaba en el fetch con el schema todavía vacío y quedaba en 0 para siempre:
    // las cuotas se mostraban SIN recargo, más baratas que el precio real.
    const conRecargos = applyRecargoLookup(rawQuotes, schema?.recargoLookup ?? {})
    const withQuotes = conRecargos.map((raw) => {
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
  // Tarjetas con el panel de "Parámetros" abierto y, mientras haya alguna, la foto del
  // orden en el que estaban al abrir el primero (ver visibleQuoteEntries).
  const [tarjetasEditando, setTarjetasEditando] = useState(() => new Set())
  const [ordenCongelado, setOrdenCongelado] = useState(null)
  const ordenActualRef = useRef([])
  const handlePanelChange = (rawId, panel) => {
    setTarjetasEditando((prev) => {
      const next = new Set(prev)
      if (panel === 'params') next.add(rawId)
      else next.delete(rawId)
      return next
    })
  }
  const visibleQuoteEntries = useMemo(() => {
    const flat = groups.flatMap((g) => g.entries.map((e) => ({ ...e, compania: g.compania })))
    const deLaSolapa =
      activeCoberturaTab === 'general'
        ? flat
        : flat.filter((e) => coberturaGroupOf(e.raw.cobertura) === activeCoberturaTab)
    // LOG-12: antes salían en el orden en que la automatización creó los subitems (que no
    // significa nada para quien compara). Ahora, de la más barata a la más cara dentro de
    // la solapa. Las que no se pueden elegir (sin fórmula o COSTO TOTAL en 0, ver
    // isQuoteSelectable) van al final: si no, un total 0 encabezaría la lista.
    const total = (e) => Number(e.quote.total) || 0
    const ordenadas = [...deLaSolapa].sort((a, b) => {
      const aSel = isQuoteSelectable(a.quote)
      const bSel = isQuoteSelectable(b.quote)
      if (aSel !== bSel) return aSel ? -1 : 1
      return total(a) - total(b)
    })
    // A pedido: con un panel de parámetros abierto el orden queda congelado. Los
    // opcionales cambian el precio en vivo, así que sin esto la tarjeta que estás
    // editando se te escapa de lugar en medio de la edición. Al cerrar el panel se
    // reordena. Una tarjeta que no estaba en la foto congelada (dato nuevo) va al final.
    if (!ordenCongelado) return ordenadas
    const posicion = new Map(ordenCongelado.map((id, i) => [id, i]))
    return ordenadas.sort(
      (a, b) => (posicion.get(a.raw.id) ?? Number.MAX_SAFE_INTEGER) - (posicion.get(b.raw.id) ?? Number.MAX_SAFE_INTEGER)
    )
  }, [groups, activeCoberturaTab, ordenCongelado])

  useEffect(() => {
    ordenActualRef.current = visibleQuoteEntries.map((e) => e.raw.id)
  }, [visibleQuoteEntries])

  useEffect(() => {
    if (tarjetasEditando.size > 0) setOrdenCongelado((prev) => prev ?? ordenActualRef.current)
    else setOrdenCongelado(null)
  }, [tarjetasEditando])

  // A pedido: solo cuentan (y se envían) las seleccionadas que además son
  // seleccionables (COSTO TOTAL > 0 y con fórmula) — una marcada en monday con total 0
  // queda fuera aunque tenga el tilde de "incluir".
  const selectableSelectedIds = useMemo(
    () =>
      new Set(
        groups
          .flatMap((g) => g.entries)
          .filter((e) => selectedIds.has(e.raw.id) && isQuoteSelectable(e.quote))
          .map((e) => e.raw.id)
      ),
    [groups, selectedIds]
  )

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
    onOpportunityAction?.()
    // Optimista + rollback (auditoría): antes un fallo de red dejaba el checkbox
    // desincronizado en silencio (promesa rechazada sin capturar).
    setRawQuotes((prev) => prev.map((r) => (r.id === rawId ? { ...r, [field]: checked } : r)))
    try {
      await setSubitemCheckboxValue(rawId, OPCIONAL_COLUMN_IDS[field], checked)
    } catch (err) {
      setRawQuotes((prev) => prev.map((r) => (r.id === rawId ? { ...r, [field]: !checked } : r)))
      setElegidaError(err.message)
    }
  }

  // LOG-13: la Bonificación que se ajusta en el paso "Confirmar" NO es la prueba local
  // de "Comparar y enviar" (overridesByQuoteId, que se pierde al recargar): acá ya se
  // está cerrando la venta, así que se escribe en el subitem real y queda para quien
  // emite la póliza. Al guardarla se borra el override local de esa cotización — si no,
  // el ajuste de prueba seguiría tapando el valor recién guardado y las 2 pantallas
  // mostrarían números distintos.
  const handleSetBonif = async (rawId, bonif) => {
    onOpportunityAction?.()
    const anterior = rawQuotes.find((r) => r.id === rawId)?.bonif ?? ''
    setRawQuotes((prev) => prev.map((r) => (r.id === rawId ? { ...r, bonif } : r)))
    setOverridesByQuoteId((prev) => {
      if (prev[rawId]?.bonif == null) return prev
      const { bonif: _descartado, ...resto } = prev[rawId]
      return { ...prev, [rawId]: resto }
    })
    try {
      await setSubitemColumnValue(rawId, BONIF_COLUMN_ID, bonif)
    } catch (err) {
      setRawQuotes((prev) => prev.map((r) => (r.id === rawId ? { ...r, bonif: anterior } : r)))
      throw err
    }
  }

  // "Auto extra" es la única opción con duración (7/15/30 días) en vez de un tilde: se
  // guarda como estado en el subitem. `dias` vacío = sin auto extra.
  const handleAutoExtraChange = async (rawId, dias) => {
    onOpportunityAction?.()
    const anterior = rawQuotes.find((r) => r.id === rawId)?.autoExtra ?? ''
    setRawQuotes((prev) => prev.map((r) => (r.id === rawId ? { ...r, autoExtra: dias } : r)))
    try {
      await setSubitemColumnValue(rawId, AUTO_EXTRA_COLUMN_ID, dias ? { label: dias } : {})
    } catch (err) {
      setRawQuotes((prev) => prev.map((r) => (r.id === rawId ? { ...r, autoExtra: anterior } : r)))
      setElegidaError(err.message)
    }
  }

  // LOG-20: cancelar una cotización en curso. La app no puede frenar al robot —corre
  // afuera, en Apify—, así que lo único que hace es dejar escrito "Cancelada" en el estado
  // y dejar de esperar. Del otro lado, cuando la corrida termina, Make lee ese estado y
  // descarta los resultados en vez de escribirlos (MON-10). Para el usuario el efecto es
  // el mismo: no aparecen cotizaciones de algo que canceló.
  const [cancelando, setCancelando] = useState(false)
  const handleCancelarCotizacion = async () => {
    onOpportunityAction?.()
    setCancelando(true)
    setMarkError(null)
    try {
      await setSimpleColumnValue(opportunityId, ESTADO_COTIZACION_COLUMN_ID, 'Cancelada')
      cotizarPollStartRef.current = null
      cotizarProgresoVistoRef.current = 0
      setPolling(false)
      setCotizarProgress({})
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) =>
          cv.id === ESTADO_COTIZACION_COLUMN_ID ? { ...cv, text: 'Cancelada' } : cv
        ),
      }))
    } catch (err) {
      setMarkError(err.message)
    } finally {
      setCancelando(false)
    }
  }

  const handleMarcarParaCotizar = async () => {
    onOpportunityAction?.()
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
      oldSubitemIdsRef.current = new Set(rawQuotes.map((r) => r.id))
      setCotizarProgress({})
      setCotizandoModalDismissed(false)
      cotizarPollStartRef.current = Date.now()
      cotizarProgresoVistoRef.current = 0
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
    onOpportunityAction?.()
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
    onOpportunityAction?.()
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
    // A pedido: el paso pasa a "Confirmar" recién cuando el polling de abajo confirma
    // que Estado Envío llegó de verdad a "Enviado" — no acá (apenas se acepta el envío,
    // "Enviando" todavía). Antes se cambiaba de una en este punto y el modal de
    // WhatsApp (que se queda abierto tapando la pantalla hasta el estado terminal) lo
    // disimulaba, pero si se cerraba a mano antes de tiempo se veía "Confirmar" con el
    // envío todavía en curso.
  }

  // Sube Libreta de Conducir/Carta Automóvil y Cédula (paso 3, columnas "file" de la
  // oportunidad) directo a monday. El check visual del paso 3 depende de que el `text`
  // de la columna deje de estar vacío, así que actualizamos el `item` en memoria con el
  // nombre del archivo apenas la mutation confirma el upload (sin esperar a un refetch).
  const handleUploadDocument = async (columnId, file) => {
    onOpportunityAction?.()
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
    onOpportunityAction?.()
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

  // Paso 4: subir la póliza (file_mm5bzdd4) — a pedido, YA NO pasa la oportunidad a
  // "Concretada" sola (antes lo hacía apenas confirmaba la subida); eso se movió al
  // botón "Concretar Oportunidad" (ver handleConfirmarEmision más abajo), que es la
  // acción explícita que de verdad cierra la oportunidad.
  const handleUploadPoliza = async (file) => {
    onOpportunityAction?.()
    setUploadingDoc((prev) => ({ ...prev, [POLIZA_COLUMN_ID]: true }))
    setDocUploadError((prev) => ({ ...prev, [POLIZA_COLUMN_ID]: null }))
    try {
      // A pedido: que nunca quede más de 1 archivo cargado en Póliza — add_file_to_column
      // (uploadFileToColumn) SUMA el archivo a la columna en vez de reemplazar el que ya
      // hubiera, así que si ya había uno se limpia primero (mismo helper que usa
      // "Eliminar", clearFileColumn) antes de subir el nuevo.
      // La API no permite "subir y después borrar la vieja" de forma atómica (clear
      // borra la columna entera), así que si el clear salió bien pero la subida falla,
      // la póliza anterior YA no está: se refleja en pantalla (antes seguía mostrando
      // el nombre del archivo viejo como si existiera) y el error lo dice claro.
      let previousCleared = false
      if (opportunity.poliza) {
        await clearFileColumn(opportunityId, POLIZA_COLUMN_ID)
        previousCleared = true
      }
      try {
        await uploadFileToColumn(opportunityId, POLIZA_COLUMN_ID, file)
      } catch (err) {
        if (previousCleared) {
          setItem((prev) => ({
            ...prev,
            column_values: prev.column_values.map((cv) =>
              cv.id === POLIZA_COLUMN_ID ? { ...cv, text: '' } : cv
            ),
          }))
          throw new Error(
            `Se quitó la póliza anterior pero no se pudo subir la nueva (${err.message}). Volvé a subirla.`
          )
        }
        throw err
      }
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) =>
          cv.id === POLIZA_COLUMN_ID ? { ...cv, text: file.name } : cv
        ),
      }))
    } catch (err) {
      setDocUploadError((prev) => ({ ...prev, [POLIZA_COLUMN_ID]: err.message }))
    } finally {
      setUploadingDoc((prev) => ({ ...prev, [POLIZA_COLUMN_ID]: false }))
    }
  }

  // Botón "Concretar Oportunidad": dispara la automatización que crea/emite la póliza
  // (color_mm5ejysv, "Crear Poliza") poniéndola en "Crear" — mismo mecanismo que
  // "Cotizar" sobre Estado Cotización, prende el polling en vivo de esa columna. A
  // pedido: el paso a "Concretada" (deal_stage) NO lo escribe la app acá — queda en
  // manos de la automatización real de monday, el polling de acá abajo ya refresca el
  // ítem completo en cada tick (ver el useEffect de polizaPolling) y va a reflejar solo
  // cuando de verdad haya pasado en monday, no antes.
  const handleConfirmarEmision = async () => {
    onOpportunityAction?.()
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
  // Paso 3: Dirección del Cliente/Lead (a pedido, se pide acá y no al crear). Escribe
  // en el ítem de Clientes y vuelve a leer la oportunidad para refrescar linked_items.
  const [savingDireccion, setSavingDireccion] = useState(false)
  const [direccionError, setDireccionError] = useState(null)
  const handleSaveDireccion = async (direccion) => {
    if (!opportunity?.clienteId) return
    onOpportunityAction?.()
    setSavingDireccion(true)
    setDireccionError(null)
    try {
      await setContactoColumnValues(opportunity.clienteId, {
        [CONTACTO_DIRECCION_COLUMN_ID]: { text: direccion.trim() },
      })
      const data = await fetchOpportunityDetail(opportunityId)
      if (data) setItem(data)
    } catch (err) {
      setDireccionError(err.message)
    } finally {
      setSavingDireccion(false)
    }
  }

  const handleConfirmarPaso3 = async () => {
    onOpportunityAction?.()
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
    onOpportunityAction?.()
    // LOG-04: si la última cotización terminó en "Error", corregir un dato acá (ej. el
    // Modelo) dejaba el aviso rojo pegado en pantalla — el error real ya no aplica al
    // intento siguiente, así que se descarta apenas se guarda una corrección, en vez de
    // esperar a un nuevo intento de Cotizar para que se pise solo.
    setMarkError(null)
    setCotizarErrorDetail(null)
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
    // buscador — se guarda como conexión (igual que Departamento) Y como texto, los dos
    // juntos acá mismo. Antes solo se dejaba armada la conexión, a la espera de que la
    // automatización de "Cotizar" terminara de asentar el texto real de
    // `text_mm54fb7m` (y vaciar la conexión) — pero si se edita el Modelo sin volver a
    // cotizar/recotizar enseguida, ese texto quedaba desactualizado en monday
    // indefinidamente (bug reportado). Como acá ya se sabe el nombre elegido, no hace
    // falta esperar a ninguna automatización para escribirlo.
    if (formValues.modeloSeleccion) {
      const modeloField = COTIZAR_FIELDS.find((f) => f.key === 'modelo')
      await setConnectedColumnValue(opportunityId, modeloField.connectedColumnId, [
        Number(formValues.modeloSeleccion.id),
      ])
      await setSimpleColumnValue(opportunityId, modeloField.columnId, formValues.modeloSeleccion.name)
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

  // LOG-19: la planilla sale de `groups`, o sea de lo mismo que se está viendo en
  // pantalla (con los ajustes de "Parámetros" ya aplicados), pero sin filtrar por solapa
  // ni por selección: el punto es poder cotejar TODAS las opciones contra los portales.
  const handleDescargarPlanilla = () => {
    const entries = groups.flatMap((g) => g.entries)
    descargarCsv(nombreArchivoCotizaciones(opportunity), buildQuotesCsv(opportunity, entries))
  }

  const [preparingWaImages, setPreparingWaImages] = useState(false)
  const handleOpenWhatsAppModal = async () => {
    // Auditoría: antes el botón quedaba "muerto" (sin spinner ni disabled) mientras se
    // renderizaban N imágenes a canvas en serie. whatsappImage.js se importa recién acá
    // (import dinámico) — es el único uso y no tiene sentido cargarlo con la app entera.
    setPreparingWaImages(true)
    try {
      const { renderQuoteImageDataUrl } = await import('../services/whatsappImage')
      await openWhatsAppModalWith(renderQuoteImageDataUrl)
    } finally {
      setPreparingWaImages(false)
    }
  }
  const openWhatsAppModalWith = async (renderQuoteImageDataUrl) => {
    const selectedEntries = groups
      .flatMap((g) => g.entries)
      .filter((e) => selectableSelectedIds.has(e.raw.id))
    const images = await Promise.all(
      selectedEntries.map(async (e) => ({
        raw: e.raw,
        quote: e.quote,
        imageDataUrl: await renderQuoteImageDataUrl(opportunity, e.raw, e.quote),
        // LOG-17: la misma cotización en texto. Se arma siempre (es un string, no cuesta
        // nada al lado del canvas) — el formato se elige después, adentro del popup.
        texto: renderQuoteText(opportunity, e.raw, e.quote),
      }))
    )
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

  // clickable: false mientras el gate de lectura está activo — los paneles de abajo
  // ignoran activeStep en ese caso (ver el render condicional más abajo), así que dejar
  // los pasos clickeables ahí llevaría a un click que no hace nada visible.
  const steps = [
    {
      key: 'cotizar',
      label: 'Cotizar',
      // A pedido: subtítulo propio por paso (antes uno solo, fijo, repetido en los 4)
      // — qué se hace concretamente en ESE paso, no una bajada genérica de toda la
      // pantalla.
      subtitle: 'Generá cotizaciones automáticas con las aseguradoras para esta Oportunidad.',
      status: hasQuotes ? 'done' : 'active',
      clickable: !lecturaGateActive,
    },
    {
      key: 'comparar',
      label: 'Comparar y enviar',
      subtitle: 'Compará las cotizaciones disponibles y enviá las seleccionadas al cliente por WhatsApp.',
      status: compararDone ? 'done' : hasQuotes ? 'active' : 'pending',
      clickable: !lecturaGateActive,
    },
    {
      key: 'confirmar',
      label: 'Confirmar',
      subtitle: 'Confirmá la propuesta que eligió el cliente y la documentación del asegurado.',
      status: confirmarDone ? 'done' : hasQuotes ? 'active' : 'pending',
      clickable: !lecturaGateActive,
    },
    {
      key: 'emitir',
      label: 'Emitir · cargar PDF',
      subtitle: 'Subí la póliza final emitida por la aseguradora y cerrá la oportunidad.',
      status: emitirDone ? 'done' : emitirActive ? 'active' : 'pending',
      clickable: !lecturaGateActive,
    },
  ]
  const activeStepIndex = steps.findIndex((s) => s.key === activeStep)

  return (
    <div className="app">
      <div className="opp-detail__breadcrumb">
        {/* A pedido: solo aparece cuando se entró a esta Oportunidad apretando "Ir a
            esta oportunidad" (historial del Cliente/Lead en Crear Oportunidad, paso 1)
            — `showReturnToCrearFlow` lo prende App.jsx solo en ese camino, no si se
            abrió desde la tabla o recién creada. Se apaga solo (ver
            `onOpportunityAction`, App.jsx) en cuanto se hace alguna acción real adentro
            de la Oportunidad — ya no tendría sentido "volver" a terminar de cargarla,
            quedó en curso. Mismo `onBack` que ya usa el footer de Cotizar (ver
            CotizarStepPanel.jsx), acá visible arriba en cualquiera de los 4 pasos. */}
        <div className="opp-detail__breadcrumb-actions">
          {onGoToList && (
            <Button kind="tertiary" className="opp-detail__back-btn" onClick={onGoToList}>
              <MdArrowBack /> Oportunidades
            </Button>
          )}
          {showReturnToCrearFlow && (
            <Button kind="tertiary" className="opp-detail__back-btn" onClick={onBack}>
              <MdArrowBack /> Volver a Crear Oportunidad
            </Button>
          )}
        </div>
        {!loading && !error && opportunity && (
          <Stepper steps={steps} activeKey={activeStep} onSelect={setActiveStep} />
        )}
      </div>

      {pollStalled && (
        <div className="opp-detail__poll-stalled" role="alert">
          <AttentionBox type="warning">
            <div className="opp-detail__lectura-gate-row">
              <span>
                No pudimos actualizar el estado de la oportunidad (monday no responde). Lo que
                estaba en curso sigue corriendo del lado de monday.
              </span>
              <span className="opp-detail__poll-stalled-actions">
                <Button kind="secondary" onClick={() => setPollStalled(false)}>
                  Cerrar
                </Button>
                <Button kind="primary" onClick={handleRetryPolling}>
                  Reintentar
                </Button>
              </span>
            </div>
          </AttentionBox>
        </div>
      )}

      {loading && (
        <LoadingScreen
          compact
          title="Cargando la oportunidad"
          message="Estamos trayendo los datos del cliente, el vehículo y las cotizaciones desde monday."
        />
      )}
      {error && <div className="opp-detail__status opp-detail__status--error">Error: {error}</div>}

      {!loading && !error && opportunity && (
        <>
          {/* A pedido: título dinámico por paso (antes "Cotizaciones" fijo sin importar
              en qué paso estuvieras) — con el número a la izquierda del nombre, en un
              globo azul igual al círculo del paso activo en el Stepper de arriba
              (mismo color, mismo "globo" — ver .stepper__circle--active en
              Stepper.css). */}
          <div className="opp-detail__header">
            <div className="opp-detail__title-row">
              <span className="opp-detail__title-badge">{activeStepIndex + 1}</span>
              <h1 className="opp-detail__title">{steps[activeStepIndex]?.label}</h1>
            </div>
            <p className="opp-detail__subtitle">{steps[activeStepIndex]?.subtitle}</p>
          </div>

          {/* A pedido: mismo ClientFicha que el paso "Cotizar" (antes esta tarjeta era
              una versión más simple, con menos datos) en Comparar/Confirmar — así se ve
              igual en toda la oportunidad, no solo en "Cotizar". "Editar" manda al paso
              "Cotizar" (ahí vive la edición real, ver CotizarStepPanel). "Recotizar"
              sigue disponible en Comparar/Confirmar mientras ya haya cotizaciones. En
              "Emitir" esta tarjeta NO se muestra (a pedido, evitar duplicarla) — ese
              paso ya tiene su propia ClientFicha de solo lectura en "Resumen final"
              (ver EmitirStepPanel.jsx), con la propuesta elegida adentro. */}
          {activeStep !== 'cotizar' && activeStep !== 'emitir' && (
            <div className="opp-detail__client-card">
              <ClientContextBar
                opportunity={opportunity}
                onEdit={() => setActiveStep('cotizar')}
                tag={opportunity.oppNumber}
                actions={
                  (activeStep === 'comparar' || activeStep === 'confirmar') && hasQuotes ? (
                    <Button kind="secondary" className="opp-detail__recotizar-btn" onClick={() => setActiveStep('cotizar')}>
                      <MdAutorenew /> Recotizar
                    </Button>
                  ) : null
                }
              />
            </div>
          )}

          {lecturaGateActive ? (
            <div className="opp-detail__lectura-gate">
              <div className="opp-detail__lectura-gate-estado">
                <span>Estado de lectura:</span>
                <StatusBadge label={opportunity.estadoLectura} color={opportunity.estadoLecturaColor} />
              </div>
              {(opportunity.estadoLectura === 'Leer' || opportunity.estadoLectura === 'Leyendo') && (
                <AttentionBox type="warning" icon={false}>
                  {/* A pedido: mismo arreglo que el AttentionBox de "Cotizando..." en
                      CotizarStepPanel.jsx (ver su comentario) — Loader + texto envueltos
                      en un span propio con flex, en vez de sueltos como hijos directos. */}
                  <span className="opp-detail__lectura-gate-polling-text">
                    <Loader size={13} className="opp-detail__envio-spinner" />
                    {opportunity.estadoLectura === 'Leer'
                      ? 'En cola para leer Cédula y Carta Automóvil...'
                      : 'Leyendo Cédula y Carta Automóvil...'}{' '}
                    esto puede tardar unos segundos. La pantalla se va a actualizar sola apenas
                    esté lista.
                  </span>
                </AttentionBox>
              )}
              {opportunity.estadoLectura === 'Error' && (
                <AttentionBox type="negative">
                  <div className="opp-detail__lectura-gate-row">
                    <span>No se pudieron leer los documentos automáticamente.</span>
                    <Button kind="secondary" onClick={() => setLecturaDismissed(true)}>
                      Continuar de todas formas
                    </Button>
                  </div>
                </AttentionBox>
              )}
              {opportunity.estadoLectura === 'Error' && (
                <ErrorDetailBox detail={lecturaErrorDetail} className="opp-detail__error-detail-spacing" />
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
              onGoToComparar={() => setActiveStep('comparar')}
              onBack={onBack}
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
                <div className="pill-tabs opp-detail__cobertura-tabs" role="tablist">
                  {COBERTURA_TABS.map((tab, index) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={coberturaTabIndex === index}
                      className={
                        coberturaTabIndex === index
                          ? 'pill-tabs__tab pill-tabs__tab--active opp-detail__cobertura-tab'
                          : 'pill-tabs__tab opp-detail__cobertura-tab'
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
                    {visibleQuoteEntries.map(({ raw, quote }) => (
                      <QuoteCard
                        key={raw.id}
                        raw={raw}
                        quote={quote}
                        selected={selectedIds.has(raw.id)}
                        onToggleSelected={() => toggleSelected(raw.id)}
                        overrides={overridesByQuoteId[raw.id] ?? {}}
                        onApplyOverrides={(values) => handleApplyQuoteOverrides(raw.id, values)}
                        onResetOverrides={() => handleResetQuoteOverrides(raw.id)}
                        onToggleOpcional={(field, checked) => handleToggleOpcional(raw.id, field, checked)}
                        onAutoExtraChange={(dias) => handleAutoExtraChange(raw.id, dias)}
                        onPanelChange={(panel) => handlePanelChange(raw.id, panel)}
                        rcOptions={rcOptions}
                      />
                    ))}
                  </div>
                )}
              </div>

              <ErrorDetailBox
                detail={envioErrorDetail}
                title="Detalle del error de envío (último update en la oportunidad):"
                className="opp-detail__error-detail-spacing"
              />

              {/* A pedido: mismo footer pegado abajo del todo que los otros 3 pasos de
                  la Oportunidad (ver StepFooter) — "Volver" a la izquierda vuelve a
                  Cotizar, el contador de seleccionadas + estado de envío quedan al
                  lado (extraLeft) en vez de competir por el lugar de "el siguiente
                  paso", que ahora es siempre a la derecha. */}
              <StepFooter
                onBack={() => setActiveStep('cotizar')}
                extraLeft={
                  <div className="opp-detail__footer-status">
                    <span>{selectableSelectedIds.size} opciones seleccionadas</span>
                    {opportunity.estadoEnvio && (
                      <span className="opp-detail__envio-status">
                        {sendPolling && (
                          <Loader size={13} className="opp-detail__envio-spinner" />
                        )}
                        <StatusBadge label={opportunity.estadoEnvio} color={opportunity.estadoEnvioColor} />
                      </span>
                    )}
                  </div>
                }
              >
                {/* A pedido: se puede pasar a "Confirmar" sin haber enviado nada por
                    WhatsApp — útil cuando el cliente ya eligió la propuesta por otro
                    medio (llamada, presencial) y no hace falta mandarle nada más. */}
                {/* LOG-19: baja TODAS las cotizaciones de la oportunidad (no solo las
                    seleccionadas ni las de la solapa activa) con los parámetros con los
                    que se calculó cada una, para cotejarlas a mano contra los portales. */}
                <Button kind="tertiary" onClick={handleDescargarPlanilla}>
                  <MdDownload /> Descargar detalle
                </Button>
                <Button kind="secondary" onClick={() => setActiveStep('confirmar')}>
                  Continuar sin enviar
                </Button>
                <Button
                  kind="primary"
                  color="positive"
                  onClick={handleOpenWhatsAppModal}
                  disabled={selectableSelectedIds.size === 0 || preparingWaImages}
                  loading={preparingWaImages}
                >
                  <MdSend /> {preparingWaImages ? 'Preparando imágenes...' : 'Enviar seleccionadas por WhatsApp'}
                </Button>
              </StepFooter>
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
              // LOG-13: mismos handlers que usa la tarjeta del paso anterior — los
              // opcionales ya escribían en monday, la Bonificación ahora también.
              onSetBonif={handleSetBonif}
              onToggleOpcional={handleToggleOpcional}
              onAutoExtraChange={handleAutoExtraChange}
              documentos={[
                {
                  key: 'libretaConducir',
                  label: 'Libreta de Conducir / Carta Automóvil',
                  columnId: LIBRETA_CONDUCIR_COLUMN_ID,
                  fileName: opportunity.libretaConducir,
                },
                {
                  key: 'cedula',
                  label: 'Cédula de Identidad (frente)',
                  columnId: CEDULA_COLUMN_ID,
                  fileName: opportunity.cedula,
                },
              ]}
              uploadingDoc={uploadingDoc}
              deletingDoc={deletingDoc}
              docUploadError={docUploadError}
              onUploadDocument={handleUploadDocument}
              onDeleteDocument={handleDeleteDocument}
              onSaveDireccion={handleSaveDireccion}
              savingDireccion={savingDireccion}
              direccionError={direccionError}
              confirming={confirmingPaso3}
              confirmError={confirmPaso3Error}
              onConfirmar={handleConfirmarPaso3}
              onBack={() => setActiveStep('comparar')}
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
              onBack={() => setActiveStep('confirmar')}
              onGoHome={onGoHome}
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

      <CotizandoModal
        show={polling && !cotizandoModalDismissed}
        recotizando={hasQuotes}
        progress={cotizarProgress}
        onClose={() => setCotizandoModalDismissed(true)}
        onCancelar={handleCancelarCotizacion}
        cancelando={cancelando}
      />
    </div>
  )
}
