import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MdVisibility, MdAutorenew, MdArrowBack, MdContentCopy, MdPictureAsPdf } from 'react-icons/md'
import { Button, EmptyState, AttentionBox, IconButton, Loader } from '@vibe/core'
import QuoteCard from './QuoteCard'
import StatusBadge from './StatusBadge'
import Stepper from './Stepper'
import CotizarStepPanel from './CotizarStepPanel'
import CotizandoModal from './CotizandoModal'
import ConfirmarStepPanel from './ConfirmarStepPanel'
import EmitirStepPanel from './EmitirStepPanel'
import RequisitoPreviaPanel from './RequisitoPreviaPanel'
import WhatsAppSendModal from './WhatsAppSendModal'
import DuplicarOportunidad from './DuplicarOportunidad'
import VerCotizacionPdfModal from './VerCotizacionPdfModal'
import AsignadoSelect from './AsignadoSelect'
import ErrorDetailBox from './ErrorDetailBox'
import ClientContextBar from './ClientContextBar'
import StepFooter from './StepFooter'
import LoadingScreen from './LoadingScreen'
import './PillTabs.css'
import {
  fetchOpportunityDetail,
  setSimpleColumnValue,
  setBoardRelationItems,
  fetchColumnText,
  setItemName,
  renombrarCliente,
  guardarDatosCliente,
  crearCliente,
  createContactoCrm,
  vincularContactoACliente,
  setDropdownColumnValue,
  setConnectedColumnValue,
  setSubitemCheckboxValue,
  setSubitemColumnValue,
  setCostoManual,
  vaciarCostoManual,
  uploadFileToColumn,
  clearFileColumn,
  fetchLatestUpdate,
  setContactoColumnValues,
  setAsignado,
  fetchMondayUsers,
  CONTACTO_DIRECCION_COLUMN_ID,
  deleteItem,
  fetchOpportunityActivities,
  crearActividadRequisito,
  editarActividadRequisito,
  setActivityEstado,
  setActivityLink,
  reactivarActividad,
  crearActividadEnvio,
  ACTIVITY_COLUMN_IDS,
} from '../services/mondayApi'
import { mapOpportunityItem } from '../services/opportunityMapper'
import { textOf } from '../services/mondayColumns'
import { useSchema } from '../context/AppContext'
import { mapSubitemToRawQuote, groupQuotesByCompania } from '../services/quoteMapper'
import { renderQuoteText } from '../services/whatsappText'
import { esChunkCaido } from '../services/cargaDiferida'
import { computeQuote, isQuoteSelectable } from '../services/pricingEngine'
import { applyBonificacionPorDefecto, applyRecargoLookup } from '../services/recargoPanel'
import { ordenarRecomendado } from '../services/ordenRecomendado'
import { COTIZAR_FIELDS, getInvalidCotizarFields, getMissingCotizarFields } from '../services/cotizarFields'
import { COBERTURA_TABS, coberturaGroupOf } from '../services/coberturaGroups'

// A diferencia de las pantallas lazy de App.jsx, acá NO se usa importarConReintento: esa
// recarga la página sola, y en este punto la persona ya tiene propuestas seleccionadas y
// un popup por abrir. Se reintenta una vez por si fue un corte de red puntual y, si
// vuelve a fallar, el error sube para que handleOpenWhatsAppModal lo muestre con un botón
// de recargar — la decisión de perder la selección es de quien está usando la app, no
// nuestra. El por qué del 404 está explicado en cargaDiferida.js.
async function importarWhatsappImage() {
  try {
    return await import('../services/whatsappImage')
  } catch (err) {
    if (!esChunkCaido(err)) throw err
    return import('../services/whatsappImage')
  }
}

// renderQuoteText con red: una cotización que no se puede escribir queda con el texto
// vacío (el popup lo avisa) en vez de tumbar el envío de todas las demás.
function textoDeCotizacion(opportunity, raw, quote) {
  try {
    return renderQuoteText(opportunity, raw, quote)
  } catch (err) {
    console.error(`No se pudo armar el texto de la cotización ${raw?.id}`, err)
    return ''
  }
}

// A pedido: órdenes disponibles para las tarjetas de "Comparar y enviar" (ver
// ordenElegido y el selector arriba de la grilla). Las claves son las del mapa de
// comparadores en visibleQuoteEntries. "Enviadas" solo existe cuando hay cotizaciones ya
// enviadas por WhatsApp (incluirPropuesta).
// Reunión del 24/09: el orden por defecto es el "Recomendado" (ver ordenRecomendado.js).
const ORDEN_OPCIONES = [
  { key: 'recomendado', label: 'Recomendado' },
  { key: 'enviadas', label: 'Enviadas' },
  { key: 'precio-asc', label: 'Menor precio' },
  { key: 'precio-desc', label: 'Mayor precio' },
  { key: 'compania', label: 'Compañía' },
]

// Animación FLIP de la grilla de cotizaciones: cuando el ORDEN de las tarjetas cambia
// (cerrar Parámetros con una Bonificación nueva y descongelarse la lista, tocar el
// selector de orden), cada tarjeta se desliza de su posición vieja a la nueva en vez de
// teletransportarse. First-Last-Invert-Play a mano: en cada render se guarda el rect de
// cada tarjeta (por data-quote-id, ver QuoteCard) y, solo si la secuencia de ids cambió,
// se anima el delta. WAAPI y no una animación CSS: la regla global de
// prefers-reduced-motion (index.css) no alcanza a las animaciones por API, así que acá
// se consulta el media query a mano. Sin dependencias a propósito: tiene que correr en
// cada render para que los rects guardados nunca queden viejos (scroll mediante).
function useFlipDeTarjetas(contenedorRef, idsEnOrden) {
  const rectsPrevios = useRef(new Map())
  const ordenPrevio = useRef('')
  useLayoutEffect(() => {
    const clave = idsEnOrden.join(',')
    const cont = contenedorRef.current
    if (!cont) {
      rectsPrevios.current = new Map()
      ordenPrevio.current = ''
      return
    }
    const tarjetas = [...cont.querySelectorAll('[data-quote-id]')]
    const nuevos = new Map(tarjetas.map((el) => [el.dataset.quoteId, el.getBoundingClientRect()]))
    const cambioOrden = ordenPrevio.current !== '' && clave !== ordenPrevio.current
    const reducirMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (cambioOrden && !reducirMovimiento) {
      for (const el of tarjetas) {
        const antes = rectsPrevios.current.get(el.dataset.quoteId)
        if (!antes) continue
        const ahora = nuevos.get(el.dataset.quoteId)
        const dx = antes.left - ahora.left
        const dy = antes.top - ahora.top
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 340, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
        )
      }
    }
    rectsPrevios.current = nuevos
    ordenPrevio.current = clave
  })
}
import { nombreDeOportunidad } from '../services/nombreOportunidad'
import { ANIO_COTIZACION_COLUMN_ID, anioParaCotizar } from '../services/anioCotizacion'
import { zonasBonificacionPorto } from '../services/bonificacionPorto'
import { buildMondayPhone } from '../services/personaFields'
import {
  ESTADO_VALIDACION,
  ESTADO_GENERAL,
  VALIDACIONES_POLIZA,
  VALIDACION_POLIZA_COLUMN_ID,
  estaValidando,
} from '../services/validacionPoliza'
import { dispararEscenario } from '../services/makeEscenarios'
import { EDAD_COLUMN_ID, edadDesde } from '../services/edad'
import { useAuth } from '../auth/AuthContext'
import './OpportunityDetail.css'

const ESTADO_OPORTUNIDAD_COLUMN_ID = 'deal_stage'
// Estados que ya pasaron el paso 3 (Confirmar) y caen dentro del paso 4 (Emitir) — el
// gate/pantalla de espera de Inspección/Autorización (ver RequisitoPreviaPanel) vive dentro
// de este paso, así que sus 2 estados transitorios cuentan como "Emitir" igual que
// "Cotizacion aceptada" y el ya despejado "Ganada - Póliza".
const EMITIR_ESTADOS = [
  'Cotizacion aceptada',
  'Ganada - Requiere Inspección',
  'Ganada - Requiere Autorización',
  'Ganada - Póliza',
]
// A qué Estado Oportunidad pasa el gate según el tipo de requisito elegido (ver
// handleElegirRequisito, RequisitoPreviaPanel).
const REQUISITO_A_ESTADO = {
  Inspección: 'Ganada - Requiere Inspección',
  Autorización: 'Ganada - Requiere Autorización',
}
const ESTADO_COTIZACION_COLUMN_ID = 'color_mm51n7aa'
// "4/11 · Cargando los datos del vehículo": lo escribe el actor de WINK en cada paso y se
// muestra en CotizandoModal. Se vacía al apretar Cotizar, para no mostrar el de la vez
// anterior mientras arranca el robot.
const AVANCE_COTIZACION_COLUMN_ID = 'text_mm7v1vg6'
const ESTADO_ENVIO_COLUMN_ID = 'color_mm4wr1t4'
const ESTADO_CREACION_COLUMN_ID = 'color_mm5ejysv'
const POSEE_VEHICULO_COLUMN_ID = 'color_mm51n4j'
const ESTADO_LECTURA_COLUMN_ID = 'color_mm5rzrhk'
const INCLUIR_PROPUESTA_COLUMN_ID = 'boolean_mm4wjdnw'
const LIBRETA_CONDUCIR_COLUMN_ID = 'file_mm51jy06'
const CEDULA_COLUMN_ID = 'file_mm5pc008'
const POLIZA_COLUMN_ID = 'file_mm5bzdd4'
// "Bien Asegurado": el ítem de 🚘 Vehículos que crea el escenario de validación con lo
// leído del PDF de la póliza (ver polizaCheck.js). Se desvincula al pedir una validación
// nueva (ver pedirValidacionPoliza).
const BIEN_ASEGURADO_COLUMN_ID = 'board_relation_mm4pngbs'
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
// Reunión del 24/09: bonificaciones especiales de BSE, guardadas en la cotización.
const BONIFICACION_ESPECIAL_COLUMN_IDS = { bns: 'numeric_mm7nrezs', flota: 'numeric_mm7nmnk0' }
// LOG-13: forma de pago elegida. Vive en la Oportunidad, no en el subitem — es una
// decisión de la venta, y así se puede filtrar por ella en el tablero.
const CUOTAS_ELEGIDAS_COLUMN_ID = 'color_mm71kfpr'
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
// Mismo problema en la emisión: si el escenario de Make falla sin llegar a escribir
// "Error" (la lectura de la póliza con IA, el parseo, un tipo de cliente inesperado), la
// oportunidad queda en "Creando" y el modal giraba para siempre. A diferencia de la
// cotización, acá NO se escribe "Error" en monday: el escenario podría seguir vivo, y
// pisarle el estado o invitar a concretar de nuevo podría crear la póliza dos veces.
// Solo se deja de esperar y se avisa.
const POLL_CREANDO_TIMEOUT_MS = 5 * 60 * 1000
// Prefijo que cada automatización debe agregar al principio del texto del Update que
// postea sobre el ítem cuando falla (configurar así del lado del robot de cotización y
// del escenario de Make.com de envío por WhatsApp) — ver fetchLatestUpdate en mondayApi.js.
//
// El Update es el RESPALDO: Cotizar y Crear póliza contestan su error en la respuesta del
// webhook (ver avisarAlEscenario), y si la hubo se usa esa. El Update queda para lo que no
// vuelve en ninguna respuesta: el robot de WINK que falla después de arrancar, entrar a
// una oportunidad que ya estaba en "Error", un timeout del proxy, y los errores del envío
// de WhatsApp en sí (los postea el escenario de envío sin responderlos).
const ERROR_UPDATE_TAG_COTIZAR = '[COTIZAR]'
const ERROR_UPDATE_TAG_ENVIO = '[ENVIO]'
const ERROR_UPDATE_TAG_CREAR_POLIZA = '[CREAR_POLIZA]'

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
  // A pedido (Duplicar oportunidad): abrir otra oportunidad (la copia recién creada).
  onOpenOpportunity,
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
  // Para dejar constancia de quién revisa una validación a mano (ver handleRevisarValidacion).
  const { usuario: usuarioSesion } = useAuth()
  const [activeStep, setActiveStep] = useState('cotizar')
  // Solapas "Total / Parcial / General" del paso "Comparar y enviar" — índice de
  // COBERTURA_TABS, no el texto (así matchea directo con TabList/Tab de @vibe/core). En
  // 0 arranca en Total (clave GLOBAL, a pedido la solapa que se ve primero al
  // entrar), no en
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
  // Mientras el envío está en vuelo, el polling de Estado Envío NO avanza de paso.
  //
  // El escenario de Make escribe "Enviado" al terminar cada ejecución, y un envío que se
  // partió en tandas por tamaño (ver repartirEnTandas en makeWebhook.js) son varias
  // ejecuciones: sin esto, la primera tanda dejaba "Enviado" en monday y el polling
  // saltaba a "Confirmar" mientras las demás todavía estaban saliendo — y si una fallaba,
  // la persona ya estaba en el paso siguiente con un envío a medias.
  //
  // En el caso normal (una sola tanda) no cambia nada perceptible: Make escribe "Enviado"
  // y responde casi al mismo tiempo, así que la bandera se baja justo cuando el polling
  // iba a encontrar el cambio igual.
  const envioEnCursoRef = useRef(false)
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
  // Último texto de avance del actor visto (AVANCE_COTIZACION_COLUMN_ID): cuando cambia,
  // el robot sigue vivo y también se reinicia el reloj.
  const ultimoAvanceRef = useRef('')
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
  // Falla al dejar registrada la actividad del envío. Va aparte de envioErrorDetail:
  // aquel es lo que informa Make sobre el envío en sí, y este es un problema nuestro con
  // monday DESPUÉS de que la cotización ya salió.
  const [actividadError, setActividadError] = useState(null)
  const [polizaErrorDetail, setPolizaErrorDetail] = useState(null)
  // Desde cuándo se espera la creación de la póliza (ver POLL_CREANDO_TIMEOUT_MS). Se
  // arranca cada vez que se prende ese seguimiento: al concretar, al reentrar con la
  // oportunidad en "Creando" o al apretar "Reintentar" tras un corte.
  const polizaPollStartRef = useRef(null)
  useEffect(() => {
    polizaPollStartRef.current = polizaPolling ? Date.now() : null
  }, [polizaPolling])

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

  // El error que contestó cada escenario en esta corrida, por nombre de escenario. Si el
  // polling ve "Error" y ya hay uno, se muestra ese y no se va a buscar el Update (ver
  // ERROR_UPDATE_TAG_*). Se limpia al disparar de nuevo y al cambiar de oportunidad.
  const errorRespondidoRef = useRef({})
  // Detalle de un "Error" que vio el polling: el que contestó el escenario si lo hubo, y
  // si no el último Update. Se vuelve a mirar después de ir a buscar el Update porque la
  // respuesta puede llegar justo mientras tanto, y en ese caso gana ella.
  const detalleDeError = async (escenario, tag) => {
    if (errorRespondidoRef.current[escenario]) return errorRespondidoRef.current[escenario]
    const delUpdate = await loadErrorUpdate(tag)
    return errorRespondidoRef.current[escenario] ?? delUpdate
  }

  useEffect(() => {
    let cancelled = false
    errorRespondidoRef.current = {}
    setLoading(true)
    setError(null)
    setPolling(false)
    setLecturaDismissed(false)
    setCotizarErrorDetail(null)
    setEnvioErrorDetail(null)
    setPolizaErrorDetail(null)

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
        } else if (EMITIR_ESTADOS.includes(estadoOportunidad)) {
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
  // La validación de la póliza corre DESPUÉS de crearla, cuando el polling de creación
  // ya se apagó. No lleva estado propio: se deriva de la columna que escribe el escenario,
  // así arranca sola cuando él la pone en "Validando" y se corta sola cuando la deja en
  // un estado terminal, sin que la app tenga que adivinar cuánto tarda.
  const validacionPolling = estaValidando(textOf(item?.column_values ?? [], VALIDACION_POLIZA_COLUMN_ID))
  const anyPolling = polling || sendPolling || polizaPolling || lecturaPolling || validacionPolling
  const pollFailsRef = useRef(0)
  const lastItemSigRef = useRef('')
  const stalledFlagsRef = useRef(null)
  // Cada tick pide fetchOpportunityDetail sin esperar a que termine el anterior
  // (setInterval de punta a punta) — si por un hiccup de red una respuesta VIEJA llega
  // después de una más nueva (ej. tick de los 4s tarda 6s, el de los 8s responde en 1s),
  // sin esto la vieja pisaba el estado recién puesto — es como "Enviado" volvía solo a
  // "Enviando" un instante después de mandar por WhatsApp. Un número de secuencia: si ya
  // arrancó un tick más nuevo para cuando esta respuesta vuelve, se descarta.
  const tickSeqRef = useRef(0)

  // A pedido: la consulta de la bonificación del 30% de PORTO sale junto con la
  // cotización — en el mismo momento en que se llama al escenario de Cotizar —, así al
  // terminar de cotizar ya se sabe si tiene bonificación. Se llama al escenario directo (su
  // webhook, por el proxy del servidor; ver api/_make/escenarios.js): él mismo pasa la
  // columna a "Consultando" y escribe el resultado por zona. Usa el CI de la oportunidad
  // (numeric_mm51mb0s, la copia del cliente), que Cotizar ya exige cargado. Va aparte y sin
  // frenar: si falla, se cotiza igual y las tarjetas no muestran zonas.
  const pedirBonificacionPorto = () => {
    dispararEscenario('bonificacion-porto', opportunityId).then((respuesta) => {
      if (respuesta?.error) console.warn('Bonificación PORTO:', respuesta.error)
    })
  }
  const [pollStalled, setPollStalled] = useState(false)
  // El tick del polling en curso, para poder adelantarlo cuando un escenario de Make
  // contesta que ya terminó (ver avisarAlEscenario) en vez de esperar al próximo
  // intervalo. null cuando no hay polling.
  const tickAhoraRef = useRef(null)
  const opportunityIdRef = useRef(opportunityId)
  opportunityIdRef.current = opportunityId

  // Dispara un escenario de Make (ver services/makeEscenarios.js) sin frenar la pantalla:
  // quien llama ya escribió la columna y prendió su polling, y esto solo sirve para
  // enterarse antes de cómo le fue. Sin respuesta útil no se hace nada y el polling
  // sigue; si la ficha ya es de otra oportunidad cuando contesta, tampoco.
  const avisarAlEscenario = (escenario, alResponder) => {
    const idPedido = opportunityId
    errorRespondidoRef.current[escenario] = null
    dispararEscenario(escenario, idPedido).then((respuesta) => {
      if (!respuesta || opportunityIdRef.current !== idPedido) return
      if (respuesta.error) errorRespondidoRef.current[escenario] = respuesta.error
      alResponder(respuesta)
    })
  }

  useEffect(() => {
    if (!anyPolling) return undefined
    let cancelled = false
    pollFailsRef.current = 0


    const tick = async () => {
      const miSeq = ++tickSeqRef.current
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
      if (miSeq !== tickSeqRef.current) return // llegó una respuesta más nueva primero — esta ya es vieja
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
        const avance = textOf(data.column_values, AVANCE_COTIZACION_COLUMN_ID)
        if (avance && avance !== ultimoAvanceRef.current) {
          ultimoAvanceRef.current = avance
          if (cotizarPollStartRef.current) cotizarPollStartRef.current = Date.now()
        }

        if (estadoCotizacion === 'Cotizado (Subitems)' && estadoOportunidad === 'Cotizacion Emitida') {
          setRawQuotes(raws)
          setSelectedIds(new Set(raws.filter((r) => r.incluirPropuesta).map((r) => r.id)))
          setPolling(false)
          setActiveStep('comparar')
          // La cotización (o recotización) terminó bien de verdad — recién acá se
          // completa la actividad de Cotización (ver marcarActividadInicial), no al
          // crear la oportunidad. Y le llega el turno a Seguimiento (En Proceso): desde
          // acá hasta que el cliente acepta es lo que hay que hacer.
          marcarActividadInicial('Cotización', 'Completado')
          marcarActividadInicial('Seguimiento', 'En Proceso')
        } else if (estadoCotizacion === 'Error') {
          setPolling(false)
          setMarkError(
            'La cotización automática terminó en estado "Error". Revisá la oportunidad en monday e intentá nuevamente.'
          )
          setCotizarErrorDetail(await detalleDeError('cotizar', ERROR_UPDATE_TAG_COTIZAR))
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
      // envioEnCursoRef: ver su declaración — con el envío partido en tandas, la primera
      // ya deja "Enviado" en monday y saltar acá sería adelantarse a las que faltan.
      if (sendPolling && !envioEnCursoRef.current) {
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
            setPolizaErrorDetail(await detalleDeError('crear-poliza', ERROR_UPDATE_TAG_CREAR_POLIZA))
          }
        } else if (
          polizaPollStartRef.current &&
          Date.now() - polizaPollStartRef.current > POLL_CREANDO_TIMEOUT_MS
        ) {
          // Ver POLL_CREANDO_TIMEOUT_MS: se deja de esperar, sin tocar monday.
          polizaPollStartRef.current = null
          setPolizaPolling(false)
          setPolizaErrorDetail(
            `La creación de la póliza lleva más de 5 minutos en "${estadoCreacion || 'Crear'}" sin terminar. ` +
              'Es posible que la automatización se haya interrumpido. Antes de volver a apretar ' +
              '"Concretar Oportunidad", revisá en monday si la póliza ya se creó, para no crearla dos veces.'
          )
        }
      }

      // --- Leer Cédula y Archivo Automóvil (color_mm5rzrhk): corta en "Leidos" o
      // "Error". Solo se prende cuando aplica (ver mount effect — Posee Vehículo === "Si").
      if (lecturaPolling) {
        const estadoLectura = textOf(data.column_values, ESTADO_LECTURA_COLUMN_ID)
        if (estadoLectura === 'Leidos' || estadoLectura === 'Error') {
          setLecturaPolling(false)
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

    tickAhoraRef.current = tick
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      if (tickAhoraRef.current === tick) tickAhoraRef.current = null
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [anyPolling, polling, sendPolling, polizaPolling, lecturaPolling, validacionPolling, opportunityId, schema])

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
      // Para editar los datos del cliente desde el paso Cotizar (EditarClienteModal).
      nacionalidades: schema?.nacionalidades ?? [],
    }),
    [schema]
  )

  const rcOptions = schema?.rc ?? []

  const opportunity = useMemo(
    () => (item ? mapOpportunityItem(item, statusColors) : null),
    [item, statusColors]
  )

  // Bonificación de PORTO por zona para las tarjetas de PORTO. Memorizada por sus valores:
  // QuoteCard es memo y el polling rehace `opportunity` cada pocos segundos.
  const bonifPorto = opportunity?.bonificacionPorto
  const zonasBonifPorto = useMemo(
    () => zonasBonificacionPorto(bonifPorto),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bonifPorto?.consulta, bonifPorto?.respuesta, bonifPorto?.montevideo, bonifPorto?.resto]
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
      // Textos de RC por nivel y los dos valores con los que se convierte UI a dólares.
      // Esta lista se arma campo por campo, así que lo que no se agregue acá no llega al
      // motor por más que PANEL lo devuelva: los límites de RC se veían bien en las
      // pruebas del motor y no aparecían en la app, justamente por faltar acá.
      rcLookup: schema?.rcLookup ?? {},
      valorUI: schema?.valorUI,
      valorDolar: schema?.valorDolar,
    }
    // Los recargos por cuota se aplican ACÁ y no al traer las cotizaciones: este memo
    // depende de `schema`, así que si PANEL llega después que el detalle (pasa siempre
    // que se entra por URL directa o se recarga la página: el detalle es un solo fetch y
    // el schema son cinco en paralelo) las cuotas se recalculan solas. Antes el recargo
    // se horneaba en el fetch con el schema todavía vacío y quedaba en 0 para siempre:
    // las cuotas se mostraban SIN recargo, más baratas que el precio real.
    const conRecargos = applyBonificacionPorDefecto(
      applyRecargoLookup(rawQuotes, schema?.recargoLookup ?? {}),
      schema?.bonificacionesPorCompania ?? {}
    )
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
  // LOG-09: mismo criterio que el panel — no alcanza con que estén cargados, el valor
  // tiene que existir en el catálogo de su columna (ver getInvalidCotizarFields).
  const canCotizar = opportunity
    ? getMissingCotizarFields(opportunity).length === 0 &&
      getInvalidCotizarFields(opportunity, dropdownOptions).length === 0
    : false

  // Solapa activa del paso "Comparar y enviar": "general" no filtra nada (como antes);
  // "GLOBAL"/"TRIPLE" solo dejan pasar las cotizaciones de esa familia de cobertura,
  // sin importar la compañía (ver coberturaGroups.js — las 2 familias ya cubren todas
  // las coberturas reales, no dependen de qué compañía sea).
  const activeCoberturaTab = COBERTURA_TABS[coberturaTabIndex]?.key ?? 'general'
  // A pedido: cómo se ordenan las tarjetas de la solapa activa (ver ORDEN_OPCIONES y el
  // selector arriba de la grilla). `null` = automático: "Enviadas" si la oportunidad ya
  // tiene cotizaciones enviadas por WhatsApp, si no el clásico menor precio (LOG-12). Es
  // derivado y no un useState con el default calculado una vez, porque las cotizaciones
  // llegan asincrónicas: al montar todavía no se sabe si hay enviadas.
  const [ordenElegido, setOrdenElegido] = useState(null)
  const hayEnviadas = useMemo(
    () => groups.some((g) => g.entries.some((e) => e.raw.incluirPropuesta)),
    [groups]
  )
  const ordenPedido = ordenElegido ?? 'recomendado'
  // Si el orden pedido es "enviadas" pero ya no hay ninguna (recotizar borra subitems),
  // se cae al default clásico — la opción tampoco se muestra en ese caso.
  const ordenActivo = ordenPedido === 'enviadas' && !hayEnviadas ? 'recomendado' : ordenPedido
  // Foto del orden de las tarjetas en el momento en que se abrió el primer panel (ver
  // visibleQuoteEntries).
  const [ordenCongelado, setOrdenCongelado] = useState(null)
  const ordenActualRef = useRef([])
  // Bug reportado: marcar un opcional (ej. Granizo en PORTO) sube el precio y la tarjeta
  // se corría de lugar en la grilla. Abrir CUALQUIER panel congela el orden — la tarjeta
  // que estás tocando no se te escapa de abajo del mouse aunque el precio cambie en vivo.
  //
  // A pedido, el descongelado ya no espera al cambio de solapa: al cerrarse el ÚLTIMO
  // panel abierto la grilla se reacomoda sola al orden elegido, y el traslado se anima
  // (ver useFlipDeTarjetas) — la tarjeta con la Bonificación nueva se desliza a su lugar
  // en vez de teletransportarse, que era lo desconcertante del salto seco. Se lleva el
  // conteo por id porque puede haber más de un panel abierto a la vez.
  const [conPanelAbierto, setConPanelAbierto] = useState(() => new Set())
  const handlePanelChange = (id, panel) => {
    setConPanelAbierto((prev) => {
      const next = new Set(prev)
      if (panel) next.add(id)
      else next.delete(id)
      return next
    })
    if (panel) setOrdenCongelado((prev) => prev ?? ordenActualRef.current)
  }
  useEffect(() => {
    if (conPanelAbierto.size === 0) setOrdenCongelado(null)
  }, [conPanelAbierto])
  const visibleQuoteEntries = useMemo(() => {
    const flat = groups.flatMap((g) => g.entries.map((e) => ({ ...e, compania: g.compania })))
    const deLaSolapa =
      activeCoberturaTab === 'general'
        ? flat
        : flat.filter((e) => coberturaGroupOf(e.raw.cobertura) === activeCoberturaTab)
    // LOG-12: antes salían en el orden en que la automatización creó los subitems (que no
    // significa nada para quien compara). El orden por defecto es el Recomendado (reunión
    // del 24/09, ver ordenRecomendado.js); también se puede por precio, al revés o agrupar
    // por compañía (alfabética, y por precio adentro de cada una) — ver ordenElegido. En
    // esos, las que no se pueden elegir (sin fórmula o COSTO TOTAL en 0, ver
    // isQuoteSelectable) van al final en cualquier
    // orden: si no, un total 0 encabezaría la lista.
    const total = (e) => Number(e.quote.total) || 0
    const comparar = {
      // Las ya enviadas por WhatsApp primero (por precio adentro de cada grupo).
      enviadas: (a, b) =>
        (b.raw.incluirPropuesta ? 1 : 0) - (a.raw.incluirPropuesta ? 1 : 0) || total(a) - total(b),
      'precio-asc': (a, b) => total(a) - total(b),
      'precio-desc': (a, b) => total(b) - total(a),
      compania: (a, b) => a.compania.localeCompare(b.compania, 'es') || total(a) - total(b),
    }[ordenActivo] ?? (() => 0)
    // El recomendado maneja por su cuenta las que no tienen costo: una principal sin
    // costo queda entre las primeras, no al final.
    const ordenadas = ordenActivo === 'recomendado' ? ordenarRecomendado(deLaSolapa) : [...deLaSolapa].sort((a, b) => {
      const aSel = isQuoteSelectable(a.quote)
      const bSel = isQuoteSelectable(b.quote)
      if (aSel !== bSel) return aSel ? -1 : 1
      return comparar(a, b)
    })
    // Con el orden congelado (ver handlePanelChange) manda la foto: los opcionales
    // cambian el precio en vivo y, sin esto, la tarjeta que estás tocando se te escapa de
    // lugar. Una tarjeta que no estaba en la foto (dato nuevo) va al final.
    if (!ordenCongelado) return ordenadas
    const posicion = new Map(ordenCongelado.map((id, i) => [id, i]))
    return ordenadas.sort(
      (a, b) => (posicion.get(a.raw.id) ?? Number.MAX_SAFE_INTEGER) - (posicion.get(b.raw.id) ?? Number.MAX_SAFE_INTEGER)
    )
  }, [groups, activeCoberturaTab, ordenCongelado, ordenActivo])

  useEffect(() => {
    ordenActualRef.current = visibleQuoteEntries.map((e) => e.raw.id)
  }, [visibleQuoteEntries])

  const quotesGridRef = useRef(null)
  useFlipDeTarjetas(
    quotesGridRef,
    visibleQuoteEntries.map((e) => e.raw.id)
  )

  // Se descongela al cambiar de solapa o de orden elegido: ahí la lista se rearma
  // entera a conciencia, no hay ninguna tarjeta "abajo del mouse" que pueda saltar, y
  // corresponde volver a mostrarlas en el orden pedido. El conteo de paneles se limpia
  // también: al cambiar de solapa las tarjetas se desmontan sin avisar su cierre, y un
  // id fantasma dejaría el orden congelado para siempre.
  useEffect(() => {
    setOrdenCongelado(null)
    setConPanelAbierto(new Set())
  }, [activeCoberturaTab, ordenActivo])

  // Y también cuando cambian las cotizaciones en sí (recotizar borra y vuelve a crear los
  // subitems): la foto vieja ya no describe nada. Un cambio de PRECIO no cuenta como
  // cambio acá — de eso se trata justamente el congelado.
  const idsDeCotizaciones = useMemo(
    () =>
      groups
        .flatMap((g) => g.entries.map((e) => e.raw.id))
        .sort()
        .join(','),
    [groups]
  )
  useEffect(() => {
    setOrdenCongelado(null)
    setConPanelAbierto(new Set())
  }, [idsDeCotizaciones])

  // Y al salir de "Comparar y enviar": las tarjetas se desmontan sin avisar el cierre de
  // sus paneles, y un id fantasma en el conteo dejaría el orden congelado al volver.
  useEffect(() => {
    if (activeStep !== 'comparar') {
      setOrdenCongelado(null)
      setConPanelAbierto(new Set())
    }
  }, [activeStep])

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
      // El AP de SURA ya no se guarda al revés ("AP sacado"): es un opcional más, en su
      // columna (ver quoteMapper.js).
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

  // LOG-13: con cuántas cuotas se cierra la venta. Va en la OPORTUNIDAD y no en el
  // subitem (a pedido): es una decisión de la venta, no un dato de la tarifa de cada
  // cotización. `label` vacío = destildar la opción elegida.
  const handleSetCuotas = async (label) => {
    onOpportunityAction?.()
    const anterior = opportunity?.cuotasElegidas ?? ''
    setItem((prev) => ({
      ...prev,
      column_values: prev.column_values.map((cv) =>
        cv.id === CUOTAS_ELEGIDAS_COLUMN_ID ? { ...cv, text: label } : cv
      ),
    }))
    try {
      await setSimpleColumnValue(opportunityId, CUOTAS_ELEGIDAS_COLUMN_ID, label)
    } catch (err) {
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) =>
          cv.id === CUOTAS_ELEGIDAS_COLUMN_ID ? { ...cv, text: anterior } : cv
        ),
      }))
      throw err
    }
  }

  // Reunión del 24/09: costo cargado a mano en una cotización que WINK trajo en 0 (ver
  // mondayApi.js#setCostoManual). Se escribe y se refleja en la tarjeta sin recargar.
  const handleCargarCostoManual = async (rawId, datos) => {
    onOpportunityAction?.()
    const raw = rawQuotes.find((r) => r.id === rawId)
    if (!raw) return
    await setCostoManual(rawId, raw.compania, datos)
    setRawQuotes((prev) =>
      prev.map((r) =>
        r.id !== rawId
          ? r
          : {
              ...r,
              costoManual: true,
              contado: String(datos.contado),
              deducibleBase: String(datos.deducible),
              ...(r.compania === 'SANCOR' ? { deducibleSancorUsd: String(datos.deducible) } : {}),
              ...(r.compania === 'BSE' ? { deducibleBSE: '1' } : {}),
              ...(r.compania === 'SURA' ? { deducibleSURA: '1' } : {}),
            }
      )
    )
  }

  // Vaciar una cotización completada manualmente (ver mondayApi.js#vaciarCostoManual):
  // vuelve a quedar sin costo, como la trajo WINK.
  const handleVaciarCostoManual = async (rawId) => {
    onOpportunityAction?.()
    const raw = rawQuotes.find((r) => r.id === rawId)
    if (!raw) return
    await vaciarCostoManual(rawId, raw.compania)
    setRawQuotes((prev) =>
      prev.map((r) =>
        r.id !== rawId
          ? r
          : {
              ...r,
              costoManual: false,
              contado: '0',
              deducibleBase: '0',
              ...(r.compania === 'SANCOR' ? { deducibleSancorUsd: '0' } : {}),
            }
      )
    )
  }

  // BNS / Flota de BSE: datos de la póliza que da el Banco de Seguros — se guardan en la
  // cotización apenas se cargan (como los opcionales), no quedan solo en pantalla.
  const handleBonificacionEspecialChange = async (rawId, field, valor) => {
    onOpportunityAction?.()
    const anterior = rawQuotes.find((r) => r.id === rawId)?.[field] ?? ''
    setRawQuotes((prev) => prev.map((r) => (r.id === rawId ? { ...r, [field]: valor } : r)))
    try {
      await setSubitemColumnValue(rawId, BONIFICACION_ESPECIAL_COLUMN_IDS[field], valor)
    } catch (err) {
      setRawQuotes((prev) => prev.map((r) => (r.id === rawId ? { ...r, [field]: anterior } : r)))
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
      // El robot cotiza con "Año a cotizar", así que ese campo tiene que estar bien ANTES
      // de largarlo: una vez marcado "Cotizar" ya no hay vuelta atrás, y un año vacío o
      // viejo se descubriría recién al mirar las primas, con las cotizaciones hechas.
      //
      // Se reescribe (las escrituras del alta y de la edición ya lo dejan bien; esto cubre
      // lo que no pasó por la app), se vuelve a leer para confirmar que quedó asentado, y
      // recién ahí se marca. Si algo de eso falla, no se cotiza y se avisa.
      const anioCotizacion = anioParaCotizar(opportunity?.anio)
      if (!anioCotizacion) {
        throw new Error(
          'La oportunidad no tiene un año de vehículo válido, así que no se puede saber con qué año cotizar. Completalo en "Editar" y volvé a intentar.'
        )
      }
      await setSimpleColumnValue(opportunityId, ANIO_COTIZACION_COLUMN_ID, anioCotizacion)
      const anioConfirmado = await fetchColumnText(opportunityId, ANIO_COTIZACION_COLUMN_ID)
      if (anioConfirmado.trim() !== anioCotizacion) {
        throw new Error(
          `No se pudo dejar el año a cotizar en ${anioCotizacion} (quedó "${anioConfirmado}"). No se cotizó, para que el robot no use un año equivocado.`
        )
      }
      // El robot también cotiza con la Edad (ver services/edad.js): se deja al día con la
      // fecha de nacimiento. Sin fecha no se escribe nada y el escenario avisa qué falta.
      const edad = edadDesde(opportunity?.fechaNacimiento)
      if (edad) await setSimpleColumnValue(opportunityId, EDAD_COLUMN_ID, String(edad))
      await setSimpleColumnValue(opportunityId, AVANCE_COTIZACION_COLUMN_ID, '')
      await setSimpleColumnValue(opportunityId, ESTADO_COTIZACION_COLUMN_ID, 'Cotizar')
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) => {
          if (cv.id === ESTADO_COTIZACION_COLUMN_ID) return { ...cv, text: 'Cotizar' }
          if (cv.id === AVANCE_COTIZACION_COLUMN_ID) return { ...cv, text: '' }
          return cv
        }),
      }))
      oldSubitemIdsRef.current = new Set(rawQuotes.map((r) => r.id))
      setCotizarProgress({})
      setCotizandoModalDismissed(false)
      cotizarPollStartRef.current = Date.now()
      cotizarProgresoVistoRef.current = 0
      setPolling(true)
      // El escenario contesta apenas larga el robot ("cotizando") o apenas ve que faltan
      // datos (con cuáles). Lo segundo se muestra ya, sin esperar a que el polling vea el
      // "Error" y vaya a buscar el Update. El final de la cotización lo sigue trayendo el
      // polling: lo escribe otro escenario, el que dispara Apify al terminar el robot.
      avisarAlEscenario('cotizar', ({ error }) => {
        if (!error) return
        setPolling(false)
        setMarkError('La cotización automática no se pudo iniciar.')
        setCotizarErrorDetail(error)
      })
      // A la par, la bonificación de PORTO (ver pedirBonificacionPorto).
      pedirBonificacionPorto()
      // Le llega el turno a Cotización: En Proceso mientras el robot corre (si venía
      // Completada de una vuelta anterior, vuelve acá) — recién se completa de nuevo si
      // ESTA corrida termina bien (ver el polling más abajo); si falla, queda en
      // Proceso para avisar más tarde, no hace falta nada extra acá para ese caso.
      marcarActividadInicial('Cotización', 'En Proceso', { refrescarFecha: true })
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
        // La bonificación precargada de PANEL solo vivía en pantalla: al elegir la
        // propuesta se guarda, porque con ella se emite y se valida la póliza (Make lee la
        // columna "Bonif" de la cotización elegida).
        const porDefecto = schema?.bonificacionesPorCompania?.[current?.compania]
        if (current && String(current.bonif ?? '').trim() === '' && porDefecto != null) {
          await setSubitemColumnValue(rawId, BONIF_COLUMN_ID, String(porDefecto))
          setRawQuotes((prev) => prev.map((r) => (r.id === rawId ? { ...r, bonif: String(porDefecto) } : r)))
        }
      }
    } catch (err) {
      setElegidaError(err.message)
    } finally {
      setSettingElegidaId(null)
    }
  }

  // Se llama ANTES de postear a Make, no después. El webhook de Make responde recién
  // cuando el escenario terminó —ya mandó el WhatsApp y ya dejó Estado Envío en
  // "Enviado"—, así que marcar "Enviando" al volver del POST pisaba ese estado final: la
  // oportunidad volvía sola a "Enviando" y el polling se quedaba esperando para siempre
  // un cambio que Make ya había hecho. Además la pantalla de avance recién aparecía
  // cuando el envío ya había terminado, que es justo cuando ya no sirve.
  //
  // Devuelve el estado que había, para poder volver atrás si el POST falla.
  const handleWhatsAppSendStart = async () => {
    onOpportunityAction?.()
    envioEnCursoRef.current = true
    setEnvioErrorDetail(null)
    setActividadError(null)
    const anterior = textOf(item?.column_values ?? [], ESTADO_ENVIO_COLUMN_ID)
    await setSimpleColumnValue(opportunityId, ESTADO_ENVIO_COLUMN_ID, 'Enviando')
    setItem((prev) => ({
      ...prev,
      column_values: prev.column_values.map((cv) =>
        cv.id === ESTADO_ENVIO_COLUMN_ID ? { ...cv, text: 'Enviando' } : cv
      ),
    }))
    setSendPolling(true)
    return anterior
  }

  // Se terminó de postear todo (haya salido bien o mal): a partir de acá el polling puede
  // volver a decidir según el Estado Envío que dejó Make. Lo llama el modal en su finally,
  // que es el único punto por el que pasan los dos desenlaces.
  const handleWhatsAppSendSettled = () => {
    envioEnCursoRef.current = false
  }

  // El POST no salió: dejar la oportunidad marcada como "Enviando" sería mentir sobre algo
  // que nunca arrancó, y el polling quedaría girando al pedo.
  const handleWhatsAppSendFailed = async (anterior) => {
    setSendPolling(false)
    setItem((prev) => ({
      ...prev,
      column_values: prev.column_values.map((cv) =>
        cv.id === ESTADO_ENVIO_COLUMN_ID ? { ...cv, text: anterior ?? '' } : cv
      ),
    }))
    try {
      await setSimpleColumnValue(opportunityId, ESTADO_ENVIO_COLUMN_ID, anterior ?? '')
    } catch (err) {
      console.warn('No se pudo restablecer Estado Envío', err)
    }
  }

  // Marca en monday las cotizaciones recién enviadas por WhatsApp como "Incluir Propuesta",
  // para que el paso Confirmar pueda listarlas como "enviadas" de forma persistente. Acá
  // (y no en el polling de Estado Envío) es donde ya se tiene el detalle de qué se mandó
  // (sentEntries trae el mismo `.texto` de cada tarjeta, ver openWhatsAppModalWith) —
  // para cuando llegue este punto, sendQuotesToWhatsApp ya esperó a que Make terminara
  // el escenario, así que el envío ya es un hecho confirmado, no falta esperar nada más.
  const handleWhatsAppSent = async (sentEntries) => {
    onOpportunityAction?.()
    // La función atrapa sus dos fallos y antes solo los escribía en la consola: si monday
    // empezaba a rechazar esto, la oportunidad se quedaba sin registro de lo que se mandó
    // y no se enteraba nadie.
    //
    // No frena el flujo a propósito. Para cuando corre esta línea el mensaje ya salió
    // (ver el comentario de arriba), así que presentarlo como un envío fallido sería
    // mentirle a quien ya vio llegar la cotización. Se avisa aparte, sin bloquear.
    crearActividadEnvio(
      opportunityId,
      opportunity?.asignadoId,
      opportunity?.clienteNombre,
      sentEntries.map((e) => e.texto)
    )
      .then(({ ok, fallos }) => {
        if (ok) return
        setActividadError(
          `La cotización se envió bien, pero monday no registró ${fallos.join(' ni ')}. Avisar al administrador del sistema.`
        )
      })
      .catch((err) => {
        // Por si falla armando el cuerpo, que queda fuera de los try de la función.
        console.warn('No se pudo registrar la actividad del envío', err)
        setActividadError(
          'La cotización se envió bien, pero no se pudo registrar la actividad. Avisar al administrador del sistema.'
        )
      })
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
  // Devuelve si el borrado salió bien: el error ya queda mostrado acá adentro
  // (docUploadError), pero quien encadena algo después (ver handleDeletePoliza)
  // necesita saber si seguir.
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
      return true
    } catch (err) {
      setDocUploadError((prev) => ({ ...prev, [columnId]: err.message }))
      return false
    } finally {
      setDeletingDoc((prev) => ({ ...prev, [columnId]: false }))
    }
  }

  // Paso 4: subir la póliza (file_mm5bzdd4) — a pedido, YA NO pasa la oportunidad a
  // "Concretada" sola (antes lo hacía apenas confirmaba la subida); eso se movió al
  // botón "Concretar Oportunidad" (ver handleConfirmarEmision más abajo), que es la
  // acción explícita que de verdad cierra la oportunidad.
  // Deja la validación como recién nacida: veredictos en "Sin validar", motivos vacíos y
  // el "Bien Asegurado" desvinculado — ese vínculo es el vehículo que el escenario
  // EXTRAJO del PDF anterior (matrícula/chasis/motor leídos de esa póliza), y dejarlo
  // haría que la comparación (ver polizaCheck.js) siga acusando diferencias contra una
  // póliza que ya no está. Lo único que difiere entre los dos usos es `estadoGeneral`:
  // 'Validar' cuando hay una póliza nueva (pedirValidacionPoliza — el escenario la toma),
  // 'Sin validar' cuando la póliza se ELIMINÓ (a pedido: los veredictos eran DE esa
  // póliza, y sin archivo no hay nada para pedir).
  const limpiarValidacionPoliza = async (estadoGeneral) => {
    const limpios = VALIDACIONES_POLIZA.flatMap((v) => [
      [v.estadoColumnId, ESTADO_VALIDACION.sinValidar],
      [v.motivoColumnId, ''],
    ])
    // La pantalla PRIMERO (optimista, como el resto de las escrituras del detalle): el
    // cambio se ve al instante en vez de esperar las ~10 escrituras a monday. Si alguna
    // falla, quien llama muestra el error y el poller reconcilia con lo que quedó.
    setItem((prev) => ({
      ...prev,
      column_values: prev.column_values.map((cv) => {
        const limpio = limpios.find(([columnId]) => columnId === cv.id)
        if (limpio) return { ...cv, text: limpio[1] }
        if (cv.id === VALIDACION_POLIZA_COLUMN_ID) return { ...cv, text: estadoGeneral }
        // El vehículo desvinculado también sale del estado local: sin esto, la pantalla
        // seguiría comparando contra el extraído viejo hasta el próximo refresco.
        if (cv.id === BIEN_ASEGURADO_COLUMN_ID) return { ...cv, text: '', linked_items: [] }
        return cv
      }),
    }))
    // Las limpiezas no dependen entre sí: van en PARALELO (antes eran una por una y el
    // borrado tardaba varios segundos). Lo único que espera a todas es el estado
    // general: si es el pedido ('Validar'), el escenario no puede llegar a leer una
    // mezcla de la corrida vieja y la nueva.
    await Promise.all([
      ...limpios.map(([columnId, valor]) => setSimpleColumnValue(opportunityId, columnId, valor)),
      setBoardRelationItems(opportunityId, BIEN_ASEGURADO_COLUMN_ID, []),
    ])
    await setSimpleColumnValue(opportunityId, VALIDACION_POLIZA_COLUMN_ID, estadoGeneral)
  }

  // El escenario no contesta errores propios: cuando responde, ya dejó los veredictos
  // escritos, así que alcanza con adelantar el tick para verlos.
  const pedirValidacionPoliza = async () => {
    await limpiarValidacionPoliza(ESTADO_GENERAL.validar)
    avisarAlEscenario('validar-poliza', () => tickAhoraRef.current?.())
  }

  // A pedido: eliminar la póliza también limpia la validación. Solo si el borrado salió
  // bien — si falló, la póliza sigue ahí y sus veredictos siguen valiendo. Un fallo de
  // la limpieza se muestra en el mismo lugar que los errores del archivo.
  const handleDeletePoliza = async () => {
    const borrada = await handleDeleteDocument(POLIZA_COLUMN_ID)
    if (!borrada) return
    try {
      await limpiarValidacionPoliza(ESTADO_GENERAL.sinValidar)
    } catch (err) {
      setDocUploadError((prev) => ({
        ...prev,
        [POLIZA_COLUMN_ID]: `La póliza se eliminó pero no se pudo limpiar la validación (${err.message}).`,
      }))
    }
  }

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

      // Con la póliza arriba se pide la validación: el escenario lee el PDF y contrasta
      // persona, vehículo, compañía y cotización. Va acá y no en "Concretar" a propósito
      // — validar sirve ANTES de crear la póliza en monday, para no crearla si los datos
      // no coinciden.
      //
      // Los veredictos anteriores se limpian junto con el pedido: son de la póliza que se
      // acaba de reemplazar, y dejarlos a la vista mientras corre la validación nueva
      // haría creer que ya se validó esta.
      await pedirValidacionPoliza()
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
  // A pedido: si una validación de la póliza da mal, se puede emitir igual marcándola
  // como revisada a mano. Pasa seguido que el dato correcto sea el de la póliza y el que
  // haya que corregir sea el de la oportunidad.
  //
  // Queda constancia de quién la pasó dentro del propio motivo: la escritura en monday va
  // con el usuario de la integración, así que el historial de la columna diría siempre lo
  // mismo. El motivo que dejó el escenario no se pisa, se le agrega.
  const [revisandoValidacion, setRevisandoValidacion] = useState(null)
  const handleRevisarValidacion = async (validacion) => {
    setRevisandoValidacion(validacion.key)
    try {
      const quien = usuarioSesion?.nombre || usuarioSesion?.email || 'un usuario de la app'
      const nota = `Revisado manualmente por ${quien} el ${new Date().toLocaleDateString('es-UY')}.`
      const motivoActual = opportunity?.validacionesPoliza?.[validacion.key]?.motivo ?? ''
      const motivoNuevo = motivoActual ? `${motivoActual} — ${nota}` : nota
      // crearLabelSiFalta: el tablero puede seguir con la etiqueta vieja "Revisado a
      // mano" (monday no deja renombrarlas por API, ver validacionPoliza.js) — sin esto,
      // la primera revisión real rebotaría con "label not found".
      await setSimpleColumnValue(opportunityId, validacion.estadoColumnId, ESTADO_VALIDACION.revisado, {
        crearLabelSiFalta: true,
      })
      await setSimpleColumnValue(opportunityId, validacion.motivoColumnId, motivoNuevo)
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) => {
          if (cv.id === validacion.estadoColumnId) return { ...cv, text: ESTADO_VALIDACION.revisado }
          if (cv.id === validacion.motivoColumnId) return { ...cv, text: motivoNuevo }
          return cv
        }),
      }))
      // A pedido: si con esta revisión ya no queda NINGÚN veredicto en rojo y el estado
      // general sigue en "Con diferencias", se promueve a "Datos válidos" — el general
      // también bloquea Concretar (ver EmitirStepPanel), y con todo revisado a mano su
      // única salida es esta. Cubre además el caso de una corrida vieja del escenario
      // que dejó la diferencia (típicamente el premio) solo en la nota, con los cuatro
      // veredictos en "Válido".
      const quedanRojas = VALIDACIONES_POLIZA.some(
        (v) =>
          v.key !== validacion.key &&
          opportunity?.validacionesPoliza?.[v.key]?.estado === ESTADO_VALIDACION.incorrecto
      )
      if (!quedanRojas && opportunity?.validacionPolizaEstado === ESTADO_GENERAL.conDiferencias) {
        await setSimpleColumnValue(opportunityId, VALIDACION_POLIZA_COLUMN_ID, ESTADO_GENERAL.validos)
        setItem((prev) => ({
          ...prev,
          column_values: prev.column_values.map((cv) =>
            cv.id === VALIDACION_POLIZA_COLUMN_ID ? { ...cv, text: ESTADO_GENERAL.validos } : cv
          ),
        }))
      }
    } catch (err) {
      console.warn('No se pudo marcar la validación como revisada', err)
    } finally {
      setRevisandoValidacion(null)
    }
  }

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
      // Un error (faltan datos del cliente o del vehículo) se muestra en el acto. Si sale
      // bien, se adelanta el tick para que "Creada" aparezca sin esperar el intervalo.
      avisarAlEscenario('crear-poliza', ({ error }) => {
        if (!error) {
          tickAhoraRef.current?.()
          return
        }
        setPolizaPolling(false)
        setPolizaErrorDetail(error)
      })
    } catch (err) {
      setConfirmarEmisionError(err.message)
    } finally {
      setConfirmandoEmision(false)
    }
  }

  // Gate/espera de Inspección-Autorización previo a cargar la póliza (ver
  // RequisitoPreviaPanel) — las actividades viven en otro tablero (Actividades), así que
  // se cargan aparte del resto del ítem, solo mientras hace falta (paso Emitir, todavía
  // sin llegar a "Ganada - Póliza"/"Concretada").
  const requisitoResuelto = ['Ganada - Póliza', 'Concretada'].includes(opportunity?.estadoLabel)
  const [actividades, setActividades] = useState([])
  const [actividadesLoading, setActividadesLoading] = useState(false)
  const [requisitoBusy, setRequisitoBusy] = useState(false)
  const [requisitoError, setRequisitoError] = useState(null)

  const recargarActividades = async () => {
    setActividadesLoading(true)
    try {
      const data = await fetchOpportunityActivities(opportunityId)
      setActividades(data)
    } catch (err) {
      setRequisitoError(err.message)
    } finally {
      setActividadesLoading(false)
    }
  }

  useEffect(() => {
    if (activeStep !== 'emitir' || requisitoResuelto) return
    recargarActividades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, opportunityId, requisitoResuelto])

  // Cotización/Seguimiento (creadas al alta, ver crearActividadesIniciales en
  // mondayApi.js) no viven en `actividades` de acá abajo (eso solo se carga en el paso
  // Emitir) — se resuelven con su propia consulta liviana. Silencioso si falla o no
  // encuentra nada: es un efecto secundario de cotizar/confirmar, no bloquea el flujo
  // principal (mismo criterio que crearActividadesIniciales).
  // `refrescarFecha`: solo para Cotización al (re)cotizar — esa Fecha SÍ tiene que
  // quedar en hoy en cada vuelta (ver reactivarActividad). Seguimiento ya tiene su
  // propia fecha planificada (+3 días desde el alta) y no hay que tocarla solo porque
  // le llegó el turno.
  const marcarActividadInicial = async (tipo, estado, { refrescarFecha = false } = {}) => {
    try {
      const lista = await fetchOpportunityActivities(opportunityId)
      const actividad = lista.find((a) => a.tipo === tipo)
      if (!actividad) return
      if (refrescarFecha) await reactivarActividad(actividad.id, estado)
      else await setActivityEstado(actividad.id, estado)
    } catch (err) {
      console.error(`No se pudo actualizar la actividad de ${tipo}:`, err)
    }
  }

  // Escribe Estado Oportunidad en monday Y en el estado local (evita repetir el mismo
  // patch de columna en cada handler de abajo).
  const patchEstadoOportunidad = async (nuevoEstado) => {
    await setSimpleColumnValue(opportunityId, ESTADO_OPORTUNIDAD_COLUMN_ID, nuevoEstado)
    setItem((prev) => ({
      ...prev,
      column_values: prev.column_values.map((cv) =>
        cv.id === ESTADO_OPORTUNIDAD_COLUMN_ID ? { ...cv, text: nuevoEstado } : cv
      ),
    }))
  }

  // Confirmar la selección del gate — `opcion`: 'ninguno' | 'Inspección' | 'Autorización'
  // | 'ambos' (a pedido: puede requerirse Inspección Y Autorización, siempre en ese orden,
  // marcadas juntas desde el inicio). `fecha` (YYYY-MM-DD) es la de la opción elegida; con
  // 'ambos', `fecha` es la visita y `fechaAutorizacion` cuándo se espera la respuesta.
  //
  // Sirve tanto para la primera elección como para "Cambiar" (ver RequisitoPreviaPanel):
  // por cada tipo se edita la actividad pendiente que ya hubiera (conserva el historial/
  // Updates del ítem), se crea la que falte, y se borra la que sobre. El cambio de UN tipo
  // al otro reconvierte la misma actividad en vez de borrar y crear, por el mismo motivo.
  const handleConfirmarRequisito = async (opcion, fecha, fechaAutorizacion) => {
    onOpportunityAction?.()
    setRequisitoBusy(true)
    setRequisitoError(null)
    const pendienteDe = (tipo) => actividades.find((a) => a.tipo === tipo && a.estado !== 'Completado')
    // Qué actividad tiene que quedar viva por tipo (y con qué fecha) según la opción.
    const deseadas = {
      Inspección: opcion === 'Inspección' || opcion === 'ambos' ? fecha : null,
      Autorización: opcion === 'Autorización' ? fecha : opcion === 'ambos' ? fechaAutorizacion : null,
    }
    // Si se llega a crear una actividad pero falla un paso siguiente, se borra acá mismo en
    // el catch — mismo criterio de "no dejar huérfanos" que el resto de la app (ver el
    // rollback de handleGuardar en CrearOportunidadForm.jsx). Sin esto, reintentar creaba
    // una segunda actividad duplicada porque nada detecta la que quedó a medias.
    const creadas = []
    try {
      const TIPOS = ['Inspección', 'Autorización']
      const tiposPendientes = TIPOS.filter((t) => pendienteDe(t))
      const tiposDeseados = TIPOS.filter((t) => deseadas[t])
      if (tiposPendientes.length === 1 && tiposDeseados.length === 1 && tiposPendientes[0] !== tiposDeseados[0]) {
        // Cambio de un tipo al otro: reconvierte la MISMA actividad (tipo, medio, fecha y
        // nombre) en vez de borrar y crear.
        await editarActividadRequisito(
          pendienteDe(tiposPendientes[0]).id,
          tiposDeseados[0],
          opportunity.clienteNombre,
          deseadas[tiposDeseados[0]]
        )
      } else {
        for (const tipo of TIPOS) {
          const pendiente = pendienteDe(tipo)
          const fechaDeseada = deseadas[tipo]
          if (fechaDeseada && pendiente) {
            await editarActividadRequisito(pendiente.id, tipo, opportunity.clienteNombre, fechaDeseada)
          } else if (fechaDeseada) {
            const creada = await crearActividadRequisito(
              opportunityId,
              opportunity.asignadoId,
              tipo,
              opportunity.clienteNombre,
              fechaDeseada
            )
            creadas.push(creada.id)
          } else if (pendiente) {
            await deleteItem(pendiente.id)
          }
        }
      }
      // Con las dos marcadas manda la Inspección: es SIEMPRE el primer bloqueo (el orden
      // Inspección → Autorización es regla del negocio).
      const nuevoEstado = deseadas.Inspección
        ? REQUISITO_A_ESTADO.Inspección
        : deseadas.Autorización
          ? REQUISITO_A_ESTADO.Autorización
          : 'Ganada - Póliza'
      await patchEstadoOportunidad(nuevoEstado)
      await recargarActividades()
    } catch (err) {
      for (const id of creadas) {
        try {
          await deleteItem(id)
        } catch {
          // No hay mucho más para hacer acá — el mensaje de abajo ya avisa del error
          // original; si tampoco se pudo deshacer, queda para revisar a mano en monday.
        }
      }
      setRequisitoError(err.message)
    } finally {
      setRequisitoBusy(false)
    }
  }

  // Al completar la actividad: Autorización siempre termina el trámite (pasa a "Ganada -
  // Póliza"). Inspección depende de lo que venga después: si ya hay una Autorización
  // pendiente (se marcaron las dos desde el inicio, opción 'ambos'), pasa DIRECTO a
  // esperarla sin volver al selector; si no, vuelve al gate por si además hace falta —
  // a pedido, puede venir Inspección y después Autorización, pero nunca al revés (ver
  // RequisitoPreviaPanel#inspeccionCompletada, que ya no vuelve a ofrecerla una vez hecha).
  const handleMarcarActividadCompletada = async (activity) => {
    if (!activity) return
    onOpportunityAction?.()
    setRequisitoBusy(true)
    setRequisitoError(null)
    try {
      await setActivityEstado(activity.id, 'Completado')
      const autorizacionPendiente = actividades.some(
        (a) => a.tipo === 'Autorización' && a.estado !== 'Completado' && a.id !== activity.id
      )
      const siguienteEstado =
        activity.tipo === 'Autorización'
          ? 'Ganada - Póliza'
          : autorizacionPendiente
            ? REQUISITO_A_ESTADO.Autorización
            : 'Cotizacion aceptada'
      await patchEstadoOportunidad(siguienteEstado)
      await recargarActividades()
    } catch (err) {
      setRequisitoError(err.message)
    } finally {
      setRequisitoBusy(false)
    }
  }

  // Archivo/Link opcionales de la actividad de Inspección/Autorización (ej. el informe
  // de la inspección, o el link al trámite de la compañía) — se cargan desde la pantalla
  // de espera, antes de marcarla completada. No tocan Estado Oportunidad, por eso van
  // separados del resto de los handlers de arriba.
  const [actividadArchivoUploading, setActividadArchivoUploading] = useState(false)
  const [actividadArchivoError, setActividadArchivoError] = useState(null)
  const handleUploadActividadArchivo = async (activityId, file) => {
    setActividadArchivoUploading(true)
    setActividadArchivoError(null)
    try {
      await uploadFileToColumn(activityId, ACTIVITY_COLUMN_IDS.archivo, file)
      await recargarActividades()
    } catch (err) {
      setActividadArchivoError(err.message)
    } finally {
      setActividadArchivoUploading(false)
    }
  }

  const [actividadLinkSaving, setActividadLinkSaving] = useState(false)
  const [actividadLinkError, setActividadLinkError] = useState(null)
  const handleGuardarActividadLink = async (activityId, url) => {
    setActividadLinkSaving(true)
    setActividadLinkError(null)
    try {
      await setActivityLink(activityId, url)
      await recargarActividades()
    } catch (err) {
      setActividadLinkError(err.message)
    } finally {
      setActividadLinkSaving(false)
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
      // El cliente aceptó una propuesta acá — es el momento en que se completa el
      // Seguimiento (ver marcarActividadInicial), no antes.
      marcarActividadInicial('Seguimiento', 'Completado')
    } catch (err) {
      setConfirmPaso3Error(err.message)
    } finally {
      setConfirmingPaso3(false)
    }
  }

  // A pedido: guardar los datos del CLIENTE (tablero Clientes) desde el paso Cotizar —
  // ver EditarClienteModal. Si cambia el nombre, se renombra el cliente (y su contacto
  // homónimo) y también la copia de esta oportunidad, igual que antes. Después se relee
  // la oportunidad para que la ficha muestre lo nuevo (domicilio, nombre).
  const handleSaveCliente = async (cambios) => {
    if (!opportunity?.clienteId) return
    onOpportunityAction?.()
    const { nombre, apellido, ...resto } = cambios
    if (nombre !== undefined) {
      await renombrarCliente(opportunity.clienteId, { nombre, apellido: apellido ?? '' })
      await setSimpleColumnValue(opportunityId, 'text_mm51b055', nombre)
      await setSimpleColumnValue(opportunityId, 'text_mm51ez7e', apellido ?? '')
      const nombreNuevo = nombreDeOportunidad({
        nombre: [nombre, apellido].filter(Boolean).join(' '),
        marca: opportunity.marca,
        modelo: opportunity.modelo,
        anio: opportunity.anio,
        matricula: opportunity.matricula,
        tipoRiesgo: opportunity.tipoRiesgo,
      })
      if (nombreNuevo !== item?.name) await setItemName(opportunityId, nombreNuevo).catch(() => {})
    }
    await guardarDatosCliente(opportunity.clienteId, resto)
    const data = await fetchOpportunityDetail(opportunityId)
    if (data) setItem(data)
  }

  // A pedido: "Duplicar oportunidad" — crea una nueva con el mismo vehículo y el
  // cliente/contacto/zona elegidos (ver DuplicarOportunidad), y la abre en el paso
  // Cotizar. Las dos quedan independientes.
  const [duplicando, setDuplicando] = useState(false)
  // A pedido: ver el PDF de la cotización (el más nuevo) en los pasos 1 y 2.
  const [viendoCotizacionPdf, setViendoCotizacionPdf] = useState(false)

  // A pedido (Enviar por WhatsApp): el teléfono que se quiso cargar ya era de otro
  // contacto y es la misma persona → ese contacto pasa a ser el de la oportunidad, y se
  // suma a los contactos del cliente (si ya estaba, no cambia nada ahí).
  const handleCambiarContactoEnvio = async (contacto) => {
    if (opportunity.clienteId) await vincularContactoACliente(contacto.id, opportunity.clienteId)
    await setConnectedColumnValue(opportunityId, 'board_relation_mm4t623x', [Number(contacto.id)])
    const data = await fetchOpportunityDetail(opportunityId).catch(() => null)
    if (data) setItem(data)
  }

  // A pedido: una oportunidad SIN cliente vinculado puede vincular uno existente o crear
  // uno nuevo desde el paso 1 (ver VincularClienteModal, que ya validó los repetidos).
  // La conexión se escribe del lado de la Oportunidad, igual que el alta.
  const OPORTUNIDAD_CLIENTE_COLUMN = 'board_relation_mm4qg1n2'
  const OPORTUNIDAD_CONTACTO_COLUMN = 'board_relation_mm4t623x'
  const handleVincularCliente = async (cliente) => {
    onOpportunityAction?.()
    await setConnectedColumnValue(opportunityId, OPORTUNIDAD_CLIENTE_COLUMN, [Number(cliente.id)])
    const data = await fetchOpportunityDetail(opportunityId)
    if (data) setItem(data)
  }
  // Crea el cliente y su contacto: si el teléfono ya era de un contacto, se usa ese
  // (vinculándolo al cliente nuevo) en vez de crear uno repetido. El contacto queda como
  // el de la oportunidad solo si la oportunidad todavía no tenía uno.
  const handleCrearCliente = async (datos) => {
    onOpportunityAction?.()
    const nuevo = await crearCliente(datos)
    let contactoId = null
    if (datos.contactoExistente) {
      await vincularContactoACliente(datos.contactoExistente.id, nuevo.id)
      contactoId = datos.contactoExistente.id
    } else if (datos.telefono) {
      const creado = await createContactoCrm({
        name: nuevo.name,
        phone: buildMondayPhone(datos.codigoPais, datos.telefono),
        clienteId: nuevo.id,
        existingContactIds: [],
      })
      contactoId = creado.id
    }
    await setConnectedColumnValue(opportunityId, OPORTUNIDAD_CLIENTE_COLUMN, [Number(nuevo.id)])
    if (contactoId && !opportunity?.contactoId) {
      await setConnectedColumnValue(opportunityId, OPORTUNIDAD_CONTACTO_COLUMN, [Number(contactoId)])
    }
    const data = await fetchOpportunityDetail(opportunityId)
    if (data) setItem(data)
  }

  const handleSaveCotizarFields = async (formValues) => {
    onOpportunityAction?.()
    // LOG-04: si la última cotización terminó en "Error", corregir un dato acá (ej. el
    // Modelo) dejaba el aviso rojo pegado en pantalla — el error real ya no aplica al
    // intento siguiente, así que se descarta apenas se guarda una corrección, en vez de
    // esperar a un nuevo intento de Cotizar para que se pise solo.
    setMarkError(null)
    setCotizarErrorDetail(null)

    // A pedido: el nombre del cliente se puede cambiar desde "Editar datos personales".
    // Va primero en la oportunidad (su copia propia: Nombre/Apellido) y después en el
    // cliente vinculado y su contacto homónimo (ver renombrarCliente). Una Empresa no
    // lleva apellido.
    const esEmpresa = opportunity.clienteTipo === 'Empresa'
    const nombreNuevoCliente = (formValues.nombre ?? opportunity.nombre ?? '').trim()
    const apellidoNuevoCliente = esEmpresa ? '' : (formValues.apellido ?? opportunity.apellido ?? '').trim()
    const cambiaNombre =
      nombreNuevoCliente !== (opportunity.nombre ?? '').trim() ||
      apellidoNuevoCliente !== (esEmpresa ? '' : (opportunity.apellido ?? '').trim())
    if (cambiaNombre) {
      await setSimpleColumnValue(opportunityId, 'text_mm51b055', nombreNuevoCliente)
      await setSimpleColumnValue(opportunityId, 'text_mm51ez7e', apellidoNuevoCliente)
      if (opportunity.clienteId) {
        await renombrarCliente(opportunity.clienteId, { nombre: nombreNuevoCliente, apellido: apellidoNuevoCliente })
      }
    }

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
      // Se recalcula con el año: si se corrige de 2027 a 2024, el año a cotizar tiene que
      // acompañar. Ver anioCotizacion.js.
      [ANIO_COTIZACION_COLUMN_ID]: anioParaCotizar(formValues.anio),
      // Muestra ya la elección nueva del buscador Autodata si se hizo una; si no, sigue
      // mostrando el texto real actual tal cual estaba.
      text_mm54fb7m: formValues.modeloSeleccion?.name ?? formValues.modelo,
      dropdown_mm51ykrd: formValues.marca,
      dropdown_mm52jp01: formValues.combustible,
      color_mm52ey1d: formValues.uso,
      dropdown_mm5jqdk: formValues.tipo,
      date_mm516agw: formValues.fechaNacimiento,
      text_mm51b055: nombreNuevoCliente,
      text_mm51ez7e: apellidoNuevoCliente,
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

    // El nombre del ítem se arma con estos mismos datos, así que se rehace acá: si no,
    // queda para siempre con el vehículo que tenía el día del alta (había ítems llamados
    // "…-PIAGGIO-2001-Porter Furgón" cuyas columnas ya decían NISSAN Qashqai 2024).
    // Va al final y aparte: es un dato de presentación, y si monday lo rechaza no tiene
    // sentido desandar los valores que sí se guardaron bien.
    const nombreNuevo = nombreDeOportunidad({
      nombre: cambiaNombre ? [nombreNuevoCliente, apellidoNuevoCliente].filter(Boolean).join(' ') : opportunity.clienteNombre,
      marca: textByColumnId.dropdown_mm51ykrd,
      modelo: textByColumnId.text_mm54fb7m,
      anio: textByColumnId.dropdown_mm51mdmq,
      matricula: opportunity.matricula,
      tipoRiesgo: opportunity.tipoRiesgo,
    })
    if (nombreNuevo !== item?.name) {
      try {
        await setItemName(opportunityId, nombreNuevo)
        setItem((prev) => ({ ...prev, name: nombreNuevo }))
      } catch (err) {
        console.warn('No se pudo renombrar la oportunidad', err)
      }
    }
  }

  // A pedido: reasignar la oportunidad a otra persona desde el detalle (deal_owner).
  // Optimista con vuelta atrás, igual que el resto de las escrituras de acá: se ve al
  // instante y, si monday la rechaza, vuelve a quien estaba y se avisa.
  const [asignadoError, setAsignadoError] = useState(null)
  const handleAsignadoChange = async (mondayUserId) => {
    if (!mondayUserId || mondayUserId === opportunity?.asignadoId) return
    onOpportunityAction?.()
    setAsignadoError(null)
    const anterior = item?.column_values.find((cv) => cv.id === 'deal_owner')
    // El nombre sale de la misma lista del selector (ya cacheada): sin él, la tabla y el
    // avatar mostrarían al anterior hasta el próximo refresco.
    const usuarios = await fetchMondayUsers().catch(() => [])
    const nombre = usuarios.find((u) => u.id === mondayUserId)?.name ?? ''
    const aplicar = (cvDealOwner) =>
      setItem((prev) => ({
        ...prev,
        column_values: prev.column_values.map((cv) => (cv.id === 'deal_owner' ? cvDealOwner : cv)),
      }))
    aplicar({
      ...(anterior ?? { id: 'deal_owner' }),
      text: nombre,
      persons_and_teams: [{ id: Number(mondayUserId), kind: 'person' }],
    })
    try {
      await setAsignado(opportunityId, mondayUserId)
    } catch (err) {
      if (anterior) aplicar(anterior)
      setAsignadoError(err.message)
    }
  }

  const [preparingWaImages, setPreparingWaImages] = useState(false)
  // Por qué no se pudo abrir el popup de envío. { mensaje, recargar } — `recargar` pide
  // mostrar el botón de recargar la página (ver esChunkCaido más abajo).
  const [prepararEnvioError, setPrepararEnvioError] = useState(null)

  const handleOpenWhatsAppModal = async () => {
    // Auditoría: antes el botón quedaba "muerto" (sin spinner ni disabled) mientras se
    // renderizaban N imágenes a canvas en serie. whatsappImage.js se importa recién acá
    // (import dinámico) — es el único uso y no tiene sentido cargarlo con la app entera.
    setPreparingWaImages(true)
    setPrepararEnvioError(null)
    try {
      const { renderQuoteImageDataUrl } = await importarWhatsappImage()
      await openWhatsAppModalWith(renderQuoteImageDataUrl)
    } catch (err) {
      // REPORTE: "había varias propuestas marcadas, apreté Enviar y no cargaba el popup;
      // recargué la página y anduvo". Antes acá no había catch: cualquier falla dejaba el
      // popup sin abrir, el spinner se apagaba solo (por el finally) y el botón quedaba
      // como si nunca lo hubieran tocado — sin una sola pista de qué había pasado. Ahora
      // el error se ve y, si es del tipo que se arregla recargando, se ofrece hacerlo.
      console.error('No se pudo preparar el envío por WhatsApp', err)
      setPrepararEnvioError(
        esChunkCaido(err)
          ? {
              recargar: true,
              mensaje:
                'Se publicó una versión nueva de la app mientras tenías esta pestaña abierta, así que faltó una parte que se carga recién al enviar. Recargá la página y volvé a intentar: no se pierde nada de lo que seleccionaste.',
            }
          : { recargar: false, mensaje: err?.message || 'Error desconocido al preparar las imágenes.' }
      )
    } finally {
      setPreparingWaImages(false)
    }
  }

  const openWhatsAppModalWith = async (renderQuoteImageDataUrl) => {
    const selectedEntries = groups
      .flatMap((g) => g.entries)
      .filter((e) => selectableSelectedIds.has(e.raw.id))
    // allSettled y no all: con varias propuestas marcadas, UNA sola que falle al
    // dibujarse hacía que no se abriera el popup para NINGUNA. Ahora la que falla queda
    // sin imagen (imageDataUrl: null) y el envío sigue siendo posible — el texto de esa
    // cotización se arma igual, y tanto el popup como el webhook ya toleran que falte la
    // imagen (ver sendQuotesToWhatsApp: solo adjunta las que existen).
    const renders = await Promise.allSettled(
      selectedEntries.map((e) => renderQuoteImageDataUrl(opportunity, e.raw, e.quote))
    )
    renders.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`No se pudo dibujar la cotización ${selectedEntries[i].raw.id}`, r.reason)
      }
    })
    const images = selectedEntries.map((e, i) => ({
      raw: e.raw,
      quote: e.quote,
      imageDataUrl: renders[i].status === 'fulfilled' ? renders[i].value : null,
      // LOG-17: la misma cotización en texto. Se arma siempre (es un string, no cuesta
      // nada al lado del canvas) — el formato se elige después, adentro del popup.
      // Por el mismo motivo que el allSettled de arriba: que una cotización no se pueda
      // escribir no puede impedir mandar las otras. El popup ya muestra un cartel cuando
      // `texto` viene vacío.
      texto: textoDeCotizacion(opportunity, e.raw, e.quote),
    }))
    const fallaron = images.filter((i) => !i.imageDataUrl).length
    if (fallaron) {
      setPrepararEnvioError({
        recargar: false,
        mensaje:
          fallaron === images.length
            ? 'No se pudo generar la imagen de ninguna de las cotizaciones. Podés mandarlas igual eligiendo el formato "Texto" en el popup.'
            : `No se pudo generar la imagen de ${fallaron} de las ${images.length} cotizaciones seleccionadas. Las demás se mandan normal; esas van solo con el texto.`,
      })
    }
    setWaModalImages(images)
  }

  const tieneElegida = rawQuotes.some((r) => r.propuestaElegida)
  const emitirDone = opportunity?.estadoLabel === 'Concretada'
  // El paso 2 se marca cumplido cuando la oportunidad ya avanzó a "Cotizacion Enviada"
  // (o a un estado posterior del mismo flujo) — no alcanza con tener cotizaciones
  // cargadas, hace falta que efectivamente ya se le hayan mandado al cliente.
  const compararDone = ['Cotizacion Enviada', ...EMITIR_ESTADOS, 'Concretada', 'No Concretada'].includes(
    opportunity?.estadoLabel
  )
  const confirmarDone = tieneElegida || emitirDone
  // El paso 4 se marca cumplido recién cuando la póliza ya quedó cargada y la
  // oportunidad pasó a "Concretada" — antes de eso, está "activo" desde que se acepta la
  // cotización (incluye el gate/espera de Inspección-Autorización, ver EMITIR_ESTADOS, o
  // ya se cargó la póliza pero el estado todavía no refrescó).
  const emitirActive =
    !emitirDone && (EMITIR_ESTADOS.includes(opportunity?.estadoLabel) || Boolean(opportunity?.poliza))

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

  // Abrir una oportunidad tenía DOS esperas seguidas y distintas: primero la pantalla
  // verde del fallback de Suspense mientras bajaba el chunk, y después una blanca acá
  // mientras llegaban los datos. Se veía como si algo hubiera fallado y volviera a
  // empezar.
  //
  // Es la misma pantalla y con el mismo texto que el fallback (ver App.jsx): así las dos
  // esperas se leen como una sola, sin parpadeo de título ni cambio de fondo.
  if (loading) {
    return (
      <LoadingScreen
        title="Abriendo la oportunidad"
        message="Estamos trayendo los datos del cliente y las cotizaciones desde monday."
      />
    )
  }

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

      {error && <div className="opp-detail__status opp-detail__status--error">Error: {error}</div>}

      {!error && opportunity && (
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
              {/* A pedido: el Asignado se cambia desde cualquiera de los 4 pasos. Va acá y
                  no en la barra del cliente porque esa barra no se muestra en Cotizar ni
                  en Emitir — y Cotizar es justo donde aterriza una oportunidad recién
                  creada. Además es un dato de la oportunidad, no del cliente. */}
              <label className="opp-detail__asignado">
                <span>Asignado</span>
                <AsignadoSelect value={opportunity.asignadoId} onChange={handleAsignadoChange} />
              </label>
              {/* A pedido: en los pasos 1 y 2, una vez cotizada (cuando ya está el PDF de la
                  cotización en monday). Mientras se cotiza de nuevo no se ofrece: el que hay
                  es el de la vuelta anterior. */}
              {(activeStep === 'cotizar' || activeStep === 'comparar') && opportunity.cotizacionPdf && !polling && (
                <Button
                  kind="secondary"
                  size="small"
                  leftIcon={MdPictureAsPdf}
                  className="opp-detail__recotizar-btn opp-detail__duplicar-btn"
                  onClick={() => setViendoCotizacionPdf(true)}
                >
                  Ver cotización (PDF)
                </Button>
              )}
              {/* A pedido: a la vista en los 4 pasos, pero lejos de "Editar" (que está en
                  la barra del cliente) para que no se confunda: no toca esta oportunidad. */}
              {/* Solo el ícono; "Duplicar oportunidad" sale al pasar el mouse (tooltip). */}
              <IconButton
                kind="secondary"
                size="small"
                icon={MdContentCopy}
                ariaLabel="Duplicar oportunidad"
                tooltipContent="Duplicar oportunidad"
                className="opp-detail__recotizar-btn opp-detail__duplicar-btn"
                onClick={() => setDuplicando(true)}
              />
            </div>
            {asignadoError && (
              <p className="opp-detail__asignado-error" role="alert">
                No se pudo cambiar el asignado: {asignadoError}
              </p>
            )}
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
                    <Button kind="secondary" leftIcon={MdAutorenew} className="opp-detail__recotizar-btn" onClick={() => setActiveStep('cotizar')}>
                      Recotizar
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
              onSaveCliente={opportunity.clienteId ? handleSaveCliente : undefined}
              onVincularCliente={opportunity.clienteId ? undefined : handleVincularCliente}
              onCrearCliente={handleCrearCliente}
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
                    como antes; "Total"/"Parcial" filtran sin importar la compañía. Sin
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

                {/* A pedido: ordenar las tarjetas de la solapa activa por precio (en las
                    dos direcciones) o agrupadas por compañía. Cambiar el orden
                    descongela la foto (ver ordenCongelado), igual que cambiar de solapa. */}
                <div className="opp-detail__orden">
                  <span id="opp-detail-orden-label" className="opp-detail__orden-label">
                    Ordenar por
                  </span>
                  <div role="group" aria-labelledby="opp-detail-orden-label" className="opp-detail__orden-botones">
                    {/* "Enviadas" solo aparece si hay cotizaciones ya enviadas — sin
                        envíos previos sería un botón que no ordena nada. */}
                    {ORDEN_OPCIONES.filter((o) => o.key !== 'enviadas' || hayEnviadas).map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        aria-pressed={ordenActivo === o.key}
                        className={
                          ordenActivo === o.key
                            ? 'opp-detail__orden-btn opp-detail__orden-btn--activo'
                            : 'opp-detail__orden-btn'
                        }
                        onClick={() => setOrdenElegido(o.key)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {visibleQuoteEntries.length === 0 ? (
                  <EmptyState
                    title="Sin cotizaciones en esta familia"
                    description="No hay cotizaciones de Total o Parcial (según corresponda) para esta oportunidad."
                  />
                ) : (
                  <div className="opp-detail__quotes" ref={quotesGridRef}>
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
                        onBonificacionEspecialChange={(field, valor) => handleBonificacionEspecialChange(raw.id, field, valor)}
                        onCargarCostoManual={(datos) => handleCargarCostoManual(raw.id, datos)}
                        onVaciarCostoManual={() => handleVaciarCostoManual(raw.id)}
                        onAutoExtraChange={(dias) => handleAutoExtraChange(raw.id, dias)}
                        onPanelChange={(panel) => handlePanelChange(raw.id, panel)}
                        rcOptions={rcOptions}
                        // Bonificación de PORTO por zona (solo esas tarjetas la muestran).
                        zonasBonifPorto={raw.compania === 'PORTO' ? zonasBonifPorto : null}
                        // Alto parejo: si en esta solapa hay alguna de PORTO con zonas, las
                        // demás reservan ese renglón.
                        reservarBonifPorto={
                          Boolean(zonasBonifPorto) && visibleQuoteEntries.some((e) => e.raw.compania === 'PORTO')
                        }
                        // Y si alguna lleva el botón de carga manual, todas reservan ese alto.
                        reservarRenglonManual={visibleQuoteEntries.some(
                          (e) => e.raw.costoManual || (!isQuoteSelectable(e.quote) && !(Number(e.raw.contado) > 0))
                        )}
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

              {/* Aviso, no error: el envío salió igual. Por eso es "warning" y no corta
                  el paso ni esconde el footer. */}
              {actividadError && (
                <AttentionBox type="warning" title="No quedó registrado el envío">
                  {actividadError}
                </AttentionBox>
              )}

              {/* Por qué no se abrió el popup de envío (o por qué se abrió incompleto).
                  Antes esto fallaba en silencio: el botón volvía a la normalidad y no
                  pasaba nada más. */}
              {prepararEnvioError && (
                <AttentionBox
                  type={prepararEnvioError.recargar ? 'warning' : 'danger'}
                  title={
                    prepararEnvioError.recargar
                      ? 'Hay que recargar la página para poder enviar'
                      : 'No se pudo preparar el envío'
                  }
                  onClose={() => setPrepararEnvioError(null)}
                >
                  {prepararEnvioError.mensaje}
                  {prepararEnvioError.recargar && (
                    <div className="opp-detail__recargar-accion">
                      <Button kind="primary" size="small" onClick={() => window.location.reload()}>
                        <MdAutorenew /> Recargar la página
                      </Button>
                    </div>
                  )}
                </AttentionBox>
              )}

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
                  <MdVisibility /> {preparingWaImages ? 'Preparando imágenes...' : 'Visualizar seleccionadas'}
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
              onSetCuotas={handleSetCuotas}
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

          {activeStep === 'emitir' && hasQuotes && !requisitoResuelto && (
            <RequisitoPreviaPanel
              estadoLabel={opportunity?.estadoLabel}
              actividades={actividades}
              loadingActividades={actividadesLoading}
              busy={requisitoBusy}
              error={requisitoError}
              onConfirmar={handleConfirmarRequisito}
              onMarcarCompletada={handleMarcarActividadCompletada}
              onBack={() => setActiveStep('confirmar')}
              onUploadArchivo={handleUploadActividadArchivo}
              archivoUploading={actividadArchivoUploading}
              archivoError={actividadArchivoError}
              onGuardarLink={handleGuardarActividadLink}
              linkSaving={actividadLinkSaving}
              linkError={actividadLinkError}
            />
          )}

          {activeStep === 'emitir' && hasQuotes && requisitoResuelto && (
            <EmitirStepPanel
              opportunity={opportunity}
              groups={groups}
              concretada={emitirDone}
              polizaFileName={opportunity.poliza}
              uploading={Boolean(uploadingDoc[POLIZA_COLUMN_ID])}
              deleting={Boolean(deletingDoc[POLIZA_COLUMN_ID])}
              error={docUploadError[POLIZA_COLUMN_ID]}
              onUploadPoliza={handleUploadPoliza}
              onDeletePoliza={handleDeletePoliza}
              estadoCreacion={opportunity.estadoCreacion}
              estadoCreacionColor={opportunity.estadoCreacionColor}
              polling={polizaPolling}
              errorDetail={polizaErrorDetail}
              onConfirmarEmision={handleConfirmarEmision}
              onRevisarValidacion={handleRevisarValidacion}
              revisandoValidacion={revisandoValidacion}
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

      {viendoCotizacionPdf && (
        <VerCotizacionPdfModal opportunityId={opportunityId} onClose={() => setViendoCotizacionPdf(false)} />
      )}
      {duplicando && (
        <DuplicarOportunidad
          opportunity={opportunity}
          departamentos={dropdownOptions.departamentos}
          localidades={dropdownOptions.localidades}
          onAbrir={(id) => {
            onOpportunityAction?.()
            setDuplicando(false)
            onOpenOpportunity?.(id)
          }}
          onClose={() => setDuplicando(false)}
        />
      )}
      {waModalImages && (
        <WhatsAppSendModal
          opportunity={opportunity}
          images={waModalImages}
          onClose={() => setWaModalImages(null)}
          onSendStart={handleWhatsAppSendStart}
          onSendFailed={handleWhatsAppSendFailed}
          onSendSettled={handleWhatsAppSendSettled}
          onSent={handleWhatsAppSent}
          onCambiarContacto={handleCambiarContactoEnvio}
          onContactoEditado={() =>
            fetchOpportunityDetail(opportunityId)
              .then((data) => data && setItem(data))
              .catch(() => {})
          }
          sendPolling={sendPolling}
          envioErrorDetail={envioErrorDetail}
        />
      )}

      <CotizandoModal
        show={polling && !cotizandoModalDismissed}
        recotizando={hasQuotes}
        progress={cotizarProgress}
        avance={opportunity?.avanceCotizacion}
        onClose={() => setCotizandoModalDismissed(true)}
        onCancelar={handleCancelarCotizacion}
        cancelando={cancelando}
      />
    </div>
  )
}
