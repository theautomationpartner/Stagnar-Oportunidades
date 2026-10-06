import { useEffect, useRef, useState, useMemo, memo } from 'react'
import {
  MdWarningAmber,
  MdRadioButtonChecked,
  MdRadioButtonUnchecked,
  MdRemove,
  MdAdd,
  MdEdit,
  MdListAlt,
  MdPayments,
  MdTune,
} from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import { Button, IconButton, Dropdown, Checkbox, NumberField } from '@vibe/core'
import { formatMoney, CUOTA_COUNTS, toPercentString } from '../services/format'
import { autoExtraOpciones, BONIF_MAX, esBse3x2, formatDeducible, isQuoteSelectable, opcionalesDeCompania } from '../services/pricingEngine'
import { accentForCompania, selectionForCompania } from '../services/companyColors'
import CompanyMark from './CompanyMark'
import CotizacionManualModal from './CotizacionManualModal'
import { coberturaGroupOf, coberturaParaMostrar, FAMILIA_LABEL } from '../services/coberturaGroups'
import { opcionesRc, rcEsEditable } from '../services/rcPorCompania'
import './QuoteCard.css'

const BSE_DEDUCIBLE_OPTIONS = ['0.5', '1', '1.5', '2', '2.5', '3']
const BSE_EDAD_OPTIONS = ['No', '35 a 75', '56 a 75']
const SURA_DEDUCIBLE_OPTIONS = ['1', '1.3', '2']

// Los opcionales (y las duraciones de "Auto extra") salen de pricingEngine, que es quien
// decide el precio y si esta cobertura puntual los ofrece — antes esta lista estaba
// copiada acá y podía decir algo distinto del cálculo. A diferencia de los "Parámetros
// ajustables" de abajo (locales), estos escriben directo en monday apenas se tocan
// (onToggleOpcional): son un dato real de la cotización, no un ajuste de prueba.

// Datos "de tarifa" — vienen fijos de monday y no se editan por cotización: el Contado
// base y el Deducible general son parte de la tarifa cargada, no un parámetro que el
// vendedor deba tocar. Los recargos por cuota van en la tabla "Cuotas y recargos" de
// este mismo panel (a pedido, el desglose de cuotas salió de la vista de la tarjeta) —
// y Edad se sacó directamente, ya no se muestra.
const FIXED_FIELDS = [
  { key: 'contado', label: 'Contado/Costo', kind: 'money' },
  { key: 'deducibleBase', label: 'Deducible', kind: 'deducible' },
  { key: 'uso', label: 'Uso', kind: 'text' },
]

// Únicos campos editables por cotización: Bonificación es la palanca comercial (LOG-11:
// antes eran dos, Bonificación y Descuento, que se multiplicaban entre sí), RC es una selección de nivel de cobertura común a las 4
// compañías (columna dropdown_mm5954ma, opciones reales traídas por boardSchema.js —
// no impacta el cálculo de precio, es solo el nivel de RC que se le muestra al
// cliente), y el deducible/edad específico de cada compañía es otra selección de nivel
// de cobertura. Ver /logica-monday-vibe.md.
// Reunión del 24/09: la Bonificación sale de "Parámetros" y queda a la vista en la
// tarjeta, debajo del costo (ver BONIF_FIELD). Sigue siendo un ajuste de pantalla: se
// guarda recién en "Confirmar".
const BONIF_FIELD = { key: 'bonif', label: 'Bonificación (%)', kind: 'number' }

// Solo BSE: bonificación por no siniestro y por flota (%). A diferencia de la comercial,
// son datos de la póliza que da el Banco de Seguros y se guardan en la cotización.
const BONIFICACIONES_ESPECIALES_BSE = [
  { key: 'bns', label: 'BNS — no siniestro (%)' },
  { key: 'flota', label: 'Flota (%)' },
]

// El detalle de cada zona de la bonificación de PORTO, al pasar el mouse.
const TEXTO_ESTADO_ZONA = {
  aprobado: 'Aprobada: el cliente tiene la bonificación del 30% en esta zona.',
  noAprobado: 'No aprobada: el cliente no tiene la bonificación en esta zona.',
  consultando: 'Consultando en el portal de PORTO…',
  sinRespuesta: 'El portal de PORTO no respondió para esta zona.',
}

function fieldsForRaw(raw, rcOptions) {
  const common = []

  // SURA no elige RC: se lo fija el plan (Total = US$ 1.000.000, Total Plus = US$
  // 1.500.000), así que ofrecerlo como desplegable invitaría a cambiar algo que la
  // compañía no deja cambiar. Se sigue viendo en la cotización, no se puede tocar.
  if (rcEsEditable(raw.compania)) {
    common.push({ key: 'rc', label: 'RC', kind: 'select', options: opcionesRc(raw.compania, rcOptions) })
  }

  if (raw.compania === 'BSE') {
    common.push(
      { key: 'deducibleBSE', label: 'Deducible BSE', kind: 'select', options: BSE_DEDUCIBLE_OPTIONS },
      { key: 'edadBSE', label: 'Edad BSE', kind: 'select', options: BSE_EDAD_OPTIONS }
    )
  }
  if (raw.compania === 'SURA') {
    common.push({ key: 'deducibleSURA', label: 'Deducible SURA', kind: 'select', options: SURA_DEDUCIBLE_OPTIONS })
  }
  // SANCOR no lleva selector de deducible: sus deducibles son fijos por cobertura y no se
  // negocian, así que poder escribirlos acá solo habilitaba mandarle al cliente un número
  // que la compañía no va a respetar. El valor se sigue viendo (ver deducibleDisplay), lo
  // que se sacó es la posibilidad de cambiarlo.

  return common
}

function fromPercentString(value) {
  return Number(value) / 100
}

function fixedFieldValue(field, raw) {
  if (field.kind === 'money') return formatMoney(Number(raw[field.key]) || 0)
  if (field.kind === 'percent') return `${toPercentString(raw[field.key])}%`
  // Con su moneda, como en el resto de la app (dólares en SANCOR, pesos en las demás).
  if (field.kind === 'deducible') return Number(raw[field.key]) > 0 ? formatDeducible(raw.compania, Number(raw[field.key])) : '—'
  return raw[field.key] || '—'
}

// Valor que se muestra en el input: el override activo si hay uno, si no el dato real
// del subitem (mismo default "que ya sabemos" para todos los campos).
function displayValue(field, raw, overrides) {
  if (field.kind === 'percent-only') {
    return overrides[field.key] != null ? toPercentString(overrides[field.key]) : '0'
  }
  if (field.kind === 'percent') {
    return overrides[field.key] != null ? toPercentString(overrides[field.key]) : toPercentString(raw[field.key])
  }
  return overrides[field.key] != null ? String(overrides[field.key]) : raw[field.key] ?? ''
}

function buildInitialForm(raw, overrides, fields) {
  const form = {}
  for (const field of fields) form[field.key] = displayValue(field, raw, overrides)
  return form
}

// A pedido: se muestran TODAS las etiquetas posibles para esta compañía (Bonificación,
// RC, y las específicas de cada una — Deducible/Edad BSE, Deducible SURA,
// Deducible SANCOR), no solo las que tengan un override activo — en gris mientras no
// tengan valor, coloreadas con el valor ya puesto apenas lo tienen (override, o el dato
// real que ya traía el subitem de monday). displayValue ya resuelve esa prioridad
// (override si hay, si no el valor real) — se reusa la misma acá que arma el form de
// "Parámetros ajustables", para que el tag muestre exactamente lo mismo que el campo
// editable correspondiente.
function hasTagValue(field, raw, overrides) {
  const display = displayValue(field, raw, overrides)
  if (!display) return false
  if ((field.kind === 'number' || field.kind === 'percent' || field.kind === 'percent-only') && Number(display) === 0) {
    return false
  }
  return true
}

function tagValueDisplay(field, raw, overrides) {
  const display = displayValue(field, raw, overrides)
  // A pedido: a "bonif" (kind 'number', no 'percent'/'percent-only' — se edita como
  // número entero de toda la vida, ver fieldsForRaw) le faltaba el "%" en esta
  // etiqueta, aunque su propio label ya dice "Bonificación (%)". `deducibleSancorUsd`
  // es el otro campo con kind 'number' — ese sí es un monto en USD, no un porcentaje.
  return field.kind === 'percent' || field.kind === 'percent-only' || field.key === 'bonif' ? `${display}%` : display
}

// Adaptador Dropdown <-> string plano, mismo patrón que en FilterPanel.jsx/
// CotizarStepPanel.jsx: Dropdown maneja {value,label} y el objeto entero
// como seleccionado, acá se convierte a/desde el string plano que ya usa
// el resto del formulario.
function FieldSelect({ value, options, onChange }) {
  // Identidades ESTABLES entre renders: el Dropdown compara el seleccionado contra las
  // opciones por referencia, y con objetos recreados en cada render "perdía" la
  // selección al abrirse.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dropdownOptions = useMemo(() => options.map((opt) => ({ value: opt, label: opt })), [JSON.stringify(options)])
  const selected = dropdownOptions.find((o) => o.value === value) ?? null
  return (
    <Dropdown
      options={dropdownOptions}
      value={selected}
      placeholder="Sin definir"
      size="small"
      // Bug reportado: con la X de borrar activa (y es true POR DEFECTO, no alcanza con
      // omitir la prop), el mismo click que ABRE el dropdown disparaba el clear y el
      // valor precargado (ej. el RC por defecto) se borraba solo. Sin X: para volver a
      // "Sin definir" está "Restablecer" (el único camino con semántica definida — ver
      // EXPLICITLY_CLEARABLE_KEYS en pricingEngine). Un change sin opción se ignora por
      // las dudas, mismo motivo.
      clearable={false}
      onChange={(option) => {
        if (option) onChange(option.value)
      }}
    />
  )
}

// Un porcentaje que se guarda en monday al salir del campo o con Enter — no en cada
// tecla, que serían tantas escrituras como dígitos. Si falla, vuelve al valor anterior
// y lo dice.
function BonificacionEspecial({ label, valor, onGuardar }) {
  const [borrador, setBorrador] = useState(String(valor ?? ''))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  // Si el valor guardado cambia por fuera (recarga del detalle), el campo lo acompaña.
  useEffect(() => {
    setBorrador(String(valor ?? ''))
  }, [valor])
  const guardar = async () => {
    const limpio = borrador.trim()
    if (limpio === String(valor ?? '').trim()) return
    const n = Number(limpio)
    if (limpio !== '' && (!Number.isFinite(n) || n < 0 || n >= 100)) {
      setError('Tiene que ser un porcentaje entre 0 y 99.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(limpio)
    } catch (err) {
      setBorrador(String(valor ?? ''))
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }
  return (
    <label className="quote-card__params-field">
      <span>{label}</span>
      <input
        className="quote-card__bonif-especial"
        type="number"
        min="0"
        max="99"
        step="0.1"
        value={borrador}
        disabled={guardando}
        placeholder="0"
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {error && <span className="quote-card__warning">{error}</span>}
    </label>
  )
}

function QuoteCard({
  raw,
  quote,
  selected,
  onToggleSelected,
  overrides,
  onApplyOverrides,
  onResetOverrides,
  onToggleOpcional,
  onAutoExtraChange,
  onBonificacionEspecialChange,
  onCargarCostoManual,
  onVaciarCostoManual,
  onPanelChange,
  rcOptions,
  zonasBonifPorto = null,
  reservarBonifPorto = false,
  reservarRenglonManual = false,
}) {
  // A pedido, estética tipo mockup: 2 botones separados ("Parámetros"/"Coberturas") que
  // NO se pueden desplegar a la vez — un solo estado con el panel abierto (o ninguno) en
  // vez de 2 booleans independientes, así abrir uno cierra el otro solo por construcción
  // (nunca hay que acordarse de apagar el otro a mano).
  const [openPanel, setOpenPanel] = useState(null)
  const fields = fieldsForRaw(raw, rcOptions)
  // La Bonificación va aparte en pantalla (debajo del costo) pero se aplica con los mismos
  // overrides que el resto de los parámetros ajustables.
  const ajustables = [BONIF_FIELD, ...fields]
  const [form, setForm] = useState(() => buildInitialForm(raw, overrides, ajustables))
  const [savingOpcional, setSavingOpcional] = useState(null)
  const [opcionalError, setOpcionalError] = useState(null)
  // A pedido: bug reportado — "Restablecer" no volvía a mostrar el Deducible (BSE/SURA,
  // kind 'select') en el campo, aunque el override sí se borraba de verdad (el propio
  // botón "Restablecer" quedaba deshabilitado después, y el "Deduc.:" de arriba sí
  // volvía al real). El Dropdown de @vibe/core no resincroniza solo con un cambio de
  // prop `value` — mismo problema ya visto con TextField en otro lado de la app
  // (CrearOportunidadForm.jsx#textFieldsResetKey), mismo arreglo: forzar un remount
  // real del control cambiándole el `key` cuando se resetea.
  const [paramsResetKey, setParamsResetKey] = useState(0)
  const [cargandoCosto, setCargandoCosto] = useState(false)

  const hasCustomOverrides = Object.keys(overrides).length > 0
  const accent = accentForCompania(raw.compania)
  const seleccion = selectionForCompania(raw.compania)
  // EST-01/EST-03: la familia de cobertura ("Total"/"Parcial") como chip propio.
  // Es el segundo eje por el que se distinguen dos tarjetas de un vistazo: el color dice
  // de qué compañía es, el chip dice de qué tipo de cobertura. Puede ser null (cobertura
  // que no cae en ninguna familia — solo aparece en la solapa "General").
  const familiaKey = coberturaGroupOf(raw.cobertura)

  // Qué opcionales ofrece esta cotización lo decide pricingEngine (la misma regla que
  // define el precio), no la tarjeta: así no se muestran controles que no harían nada —
  // ej. PORTO TRIPLE no ofrece ninguno, y SURA TOTAL PLUS ya los trae todos incluidos.
  const opcionalesDeLaCompania = opcionalesDeCompania(raw)
  const autoExtraDias = autoExtraOpciones(raw)

  const handleToggleOpcional = async (field, checked) => {
    setSavingOpcional(field)
    setOpcionalError(null)
    try {
      await onToggleOpcional(field, checked)
    } catch (err) {
      setOpcionalError(err.message)
    } finally {
      setSavingOpcional(null)
    }
  }

  const handleAutoExtraChange = async (dias) => {
    setSavingOpcional('autoExtra')
    setOpcionalError(null)
    try {
      await onAutoExtraChange(dias)
    } catch (err) {
      setOpcionalError(err.message)
    } finally {
      setSavingOpcional(null)
    }
  }

  // A pedido: sin botón "Aplicar" — cada cambio en un parámetro ajustable se aplica solo,
  // recalculando nextOverrides con el form ya actualizado (por eso handleFieldChange arma
  // `next` explícito y se lo pasa: el form de la closure todavía tiene el valor viejo).
  const applyFromForm = (formValues) => {
    const nextOverrides = {}
    for (const field of ajustables) {
      const formValue = formValues[field.key]
      if (field.kind === 'percent') {
        if (formValue !== toPercentString(raw[field.key])) nextOverrides[field.key] = fromPercentString(formValue)
        continue
      }
      if (formValue !== (raw[field.key] ?? '')) nextOverrides[field.key] = formValue
    }
    onApplyOverrides(nextOverrides)
  }

  // applyFromForm va FUERA del updater de setForm: adentro es un efecto secundario en
  // medio de un update — StrictMode corre el updater dos veces, y encima termina siendo
  // un setState del padre (onApplyOverrides) mientras React renderiza este componente
  // (era el warning "Cannot update a component while rendering a different component").
  const handleFieldChange = (key, value) => {
    const next = { ...form, [key]: value }
    setForm(next)
    applyFromForm(next)
  }

  // Al abrir "Parámetros" se refresca el form con los valores reales vigentes (mismo
  // motivo que antes: si se cerró con "Restablecer" pendiente o cambió algo por fuera,
  // no queremos mostrar un valor viejo de una apertura anterior).
  // onPanelChange se llama FUERA del updater de setOpenPanel: adentro es un efecto
  // secundario en medio de un update (React lo corre dos veces en StrictMode, y encima
  // termina siendo un setState del padre mientras se renderiza este componente).
  const handleToggleParams = () => {
    const siguiente = openPanel === 'params' ? null : 'params'
    if (siguiente === 'params') setForm(buildInitialForm(raw, overrides, ajustables))
    setOpenPanel(siguiente)
    avisarCongelado(siguiente, editandoBonif)
  }

  // Coberturas y Cuotas no tienen form que refrescar: solo abren o cierran su panel.
  const handleTogglePanel = (panel) => {
    const siguiente = openPanel === panel ? null : panel
    setOpenPanel(siguiente)
    avisarCongelado(siguiente, editandoBonif)
  }

  // Bug reportado: al tocar la bonificación la tarjeta cambia de precio y se reordena
  // mientras la estás editando. Editarla congela el orden igual que un panel abierto
  // (ver handlePanelChange en OpportunityDetail); se descongela recién con un clic
  // fuera de la tarjeta. El padre lleva un solo "abierto sí/no" por tarjeta, así que
  // se le avisa combinando panel abierto + bonificación en edición.
  const tarjetaRef = useRef(null)
  const [editandoBonif, setEditandoBonif] = useState(false)
  const avisarCongelado = (panel, editando) => onPanelChange?.(panel ?? (editando ? 'bonif' : null))
  const empezarEdicionBonif = () => {
    if (editandoBonif) return
    setEditandoBonif(true)
    avisarCongelado(openPanel, true)
  }
  useEffect(() => {
    if (!editandoBonif) return undefined
    const alTocarAfuera = (e) => {
      if (tarjetaRef.current?.contains(e.target)) return
      setEditandoBonif(false)
      avisarCongelado(openPanel, false)
    }
    document.addEventListener('pointerdown', alTocarAfuera)
    document.addEventListener('focusin', alTocarAfuera)
    return () => {
      document.removeEventListener('pointerdown', alTocarAfuera)
      document.removeEventListener('focusin', alTocarAfuera)
    }
  })

  const handleReset = () => {
    // A pedido: el Deducible (BSE/SURA) vuelve a "Sin definir" al restablecer, no al
    // valor real del subitem — a diferencia de Bonificación/Descuento/RC (palancas
    // comerciales con un valor real que sí tiene sentido recuperar), acá el dato "real"
    // suele ser un default de monday sin significado (ej. "1"), así que restablecer
    // debe dejarlo en blanco para elegirlo de nuevo, no reaparecer solo. Por eso NO se
    // usa onResetOverrides (borra TODO, cae de vuelta al real) — se deja un override
    // explícito vacío solo para estas 2 claves (ver EXPLICITLY_CLEARABLE_KEYS en
    // pricingEngine.js, es lo único que respeta un override "" en vez de ignorarlo).
    const blankedOverrides = {}
    for (const field of fields) {
      if (field.key.startsWith('deducible')) blankedOverrides[field.key] = ''
    }
    setForm(buildInitialForm(raw, blankedOverrides, ajustables))
    setParamsResetKey((k) => k + 1)
    onApplyOverrides(blankedOverrides)
  }

  if (quote.blocked) {
    return (
      <div className="quote-card quote-card--blocked" data-quote-id={raw.id} style={{ borderLeftColor: accent }}>
        <div className="quote-card__title-row">
          <CompanyMark compania={raw.compania} />
          <span className="quote-card__title">{coberturaParaMostrar(raw)}</span>
        </div>
        <p className="quote-card__blocked-msg">
          <MdWarningAmber /> {quote.blockedReason}
        </p>
      </div>
    )
  }

  // A pedido: COSTO TOTAL en 0 → tarjeta atenuada, no se puede seleccionar para enviar.
  const selectable = isQuoteSelectable(quote)
  // Bonificación a la vista (debajo del costo): el valor puesto, el precio que tendría sin
  // ella (para mostrarlo tachado) y si de verdad se está aplicando — SANCOR la ignora con
  // el titular fuera de edad (ver pricingEngine.js#bonificacionAplicable).
  const bonifActual = Number(displayValue(BONIF_FIELD, raw, overrides)) || 0
  const efectivo = quote.efectivo ?? {}
  const precioSinBonif = Math.round(
    (Number(efectivo.contadoCalculado) || 0) * (efectivo.factorBonificacionesEspeciales ?? 1) +
      (Number(efectivo.adicionales) || 0)
  )
  const bonifNoAplica = bonifActual > 0 && !(efectivo.bonifAplicada > 0)
  const cambiarBonif = (valor) => handleFieldChange('bonif', String(Math.min(BONIF_MAX, Math.max(0, valor))))
  // Reunión del 24/09: si vino en 0 es que WINK no supo el valor — solo esas se pueden
  // completar a mano (ver CotizacionManualModal).
  const sinCostoDeWink = !selectable && !(Number(raw.contado) > 0)
  // A pedido: el BSE 3x2 solo lleva BNS (en Parámetros) — ni la bonificación comercial de
  // la tarjeta ni la de flota (ver pricingEngine.js#esBse3x2, que tampoco las calcula).
  const soloBns = esBse3x2(raw)
  const bonificacionesEspeciales = soloBns
    ? BONIFICACIONES_ESPECIALES_BSE.filter((b) => b.key === 'bns')
    : BONIFICACIONES_ESPECIALES_BSE
  return (
    <div
      className={[
        'quote-card',
        selected && selectable && 'quote-card--selected',
        !selectable && 'quote-card--unavailable',
        reservarRenglonManual && 'quote-card--reserva-manual',
      ]
        .filter(Boolean)
        .join(' ')}
      /* Para la animación FLIP de la grilla (ver useFlipDeTarjetas en OpportunityDetail):
         identifica esta tarjeta entre un render y el siguiente para animar su traslado. */
      data-quote-id={raw.id}
      ref={tarjetaRef}
      /* A pedido, la selección se pinta con el tono de la compañía (ver
         selectionForCompania): las variables las consume .quote-card--selected. */
      style={{
        borderLeftColor: accent,
        '--seleccion-bg': seleccion.bg,
        '--seleccion-bd': seleccion.border,
        '--seleccion-fg': seleccion.fg,
      }}
      // Con "Cargar costo a mano" adentro no se marca entera como deshabilitada: esa acción
      // sí está disponible (el radio sigue deshabilitado por su cuenta).
      aria-disabled={(!selectable && !(sinCostoDeWink && onCargarCostoManual)) || undefined}
    >
      {/* A pedido, estética tipo mockup: layout vertical (título+deducible a la
          izquierda, COSTO TOTAL a la derecha, arriba de todo) en vez de las 3 columnas
          lado a lado de antes — con 3 tarjetas por renglón (ver .opp-detail__quotes) no
          entraba ancho para eso. Uso/RC ya no van sueltos acá arriba: Uso pasó a "Datos
          fijos" (adentro de Parámetros) y RC ya se editaba solo adentro de "Parámetros
          ajustables" (ver overrides.rc), así que mostrarlo acá arriba era redundante. */}
      <div className="quote-card__header">
        <div className="quote-card__header-main">
          <div className="quote-card__title-row">
            <IconButton
              className="quote-card__radio"
              icon={selected && selectable ? MdRadioButtonChecked : MdRadioButtonUnchecked}
              onClick={selectable ? onToggleSelected : undefined}
              disabled={!selectable}
              aria-label={selectable ? 'Seleccionar opción' : 'No seleccionable: sin costo total'}
            />
            {/* Mismo indicador de "ya se envió por WhatsApp" que la tarjeta del paso 3
                (ver confirmar-step__card-wa): con el orden "Enviadas" delante, sin esta
                marca no se vería POR QUÉ una tarjeta está primera. */}
            {raw.incluirPropuesta && (
              <span className="quote-card__wa" title="Ya se envió por WhatsApp">
                <FaWhatsapp />
              </span>
            )}
            {/* A pedido: logotipo oficial sobre blanco + recuadro con el color exacto de
                la marca (ver CompanyMark), en lugar del globito con el nombre escrito. */}
            <CompanyMark compania={raw.compania} />
            <span className="quote-card__title">{coberturaParaMostrar(raw)}</span>
          </div>
          {/* EST-01: el chip de familia va acá, en el mismo renglón del deducible (que se
              dibuja siempre), y no arriba junto al título — ese renglón envuelve cuando
              no entra y una tarjeta con una línea de más rompe la altura pareja de todo
              el renglón de tarjetas. */}
          <div className="quote-card__meta-line">
            {familiaKey && (
              <span className={`quote-card__familia quote-card__familia--${familiaKey.toLowerCase()}`}>
                {FAMILIA_LABEL[familiaKey]}
              </span>
            )}
            <span className="quote-card__deducible-line">Deduc.: {quote.deducibleDisplay}</span>
          </div>
        </div>

        <div className="quote-card__total">
          <span className="quote-card__total-label">COSTO TOTAL</span>
          {/* El precio sin la bonificación comercial, tachado: que se vea de un vistazo
              cuánto está descontando. Solo cuando de verdad descuenta algo. */}
          {/* A pedido (alto parejo): el renglón del tachado se reserva siempre, aunque no
              haya bonificación — si no, el precio y todo lo de abajo quedaba 18px más
              arriba que en las tarjetas vecinas. */}
          <span
            className={precioSinBonif > quote.total ? 'quote-card__total-antes' : 'quote-card__total-antes quote-card__reservado'}
            aria-hidden={precioSinBonif > quote.total ? undefined : true}
          >
            {formatMoney(precioSinBonif > quote.total ? precioSinBonif : quote.total)}
          </span>
          <span className="quote-card__total-value">{formatMoney(quote.total)}</span>
          {/* Reunión del 24/09: la Bonificación a la vista y editable, sin abrir
              Parámetros. Arranca en la de PANEL para la compañía (ver
              recargoPanel.js#applyBonificacionPorDefecto). */}
          {!soloBns && (
          <div
            className={bonifNoAplica ? 'quote-card__bonif quote-card__bonif--no-aplica' : 'quote-card__bonif'}
            title={bonifNoAplica ? quote.warning?.full : 'Bonificación comercial sobre el contado'}
            onPointerDownCapture={empezarEdicionBonif}
            onFocusCapture={empezarEdicionBonif}
          >
            <span className="quote-card__bonif-label">{bonifNoAplica ? 'No aplica' : 'Bonif.'}</span>
            {/* A pedido: los botones a los costados — bajar a la izquierda, subir a la
                derecha —, redondos y separados del número para que el de bajar no se lea
                como un signo menos. */}
            <button
              type="button"
              className="quote-card__bonif-paso"
              aria-label="Bajar bonificación"
              disabled={bonifActual <= 0}
              onClick={() => cambiarBonif(bonifActual - 1)}
            >
              <MdRemove aria-hidden="true" />
            </button>
            <input
              key={`bonif-${paramsResetKey}`}
              className="quote-card__bonif-input"
              type="number"
              inputMode="decimal"
              min="0"
              max={BONIF_MAX}
              aria-label="Bonificación (%)"
              value={displayValue(BONIF_FIELD, raw, overrides)}
              // Sin signo menos ni más del tope: una bonificación negativa es un recargo y
              // una de 100 % deja la tarjeta sin costo.
              onKeyDown={(e) => (e.key === '-' || e.key === 'e') && e.preventDefault()}
              onChange={(e) => {
                const valor = e.target.value.replace('-', '')
                handleFieldChange('bonif', valor === '' ? '' : String(Math.min(BONIF_MAX, Number(valor))))
              }}
            />
            <span className="quote-card__bonif-pct">%</span>
            <button
              type="button"
              className="quote-card__bonif-paso"
              aria-label="Subir bonificación"
              disabled={bonifActual >= BONIF_MAX}
              onClick={() => cambiarBonif(bonifActual + 1)}
            >
              <MdAdd aria-hidden="true" />
            </button>
          </div>
          )}
          {/* Sin control de bonificación (BSE 3x2) se reserva su lugar, por el alto parejo. */}
          {soloBns && <div className="quote-card__bonif quote-card__reservado" aria-hidden="true">Bonif.</div>}
        </div>
      </div>

      {/* Versión corta de la advertencia (ver quote.warning.full más abajo, adentro de
          "Parámetros") — este renglón se reserva SIEMPRE (con o sin advertencia, ver
          min-height en CSS) para que todas las tarjetas de un mismo renglón midan lo
          mismo: con advertencia, aparece el texto; sin ella, el espacio queda vacío pero
          ocupado igual. */}
      {/* Renglón SIEMPRE reservado (min-height en CSS) para que todas las tarjetas del
          renglón midan lo mismo: acá va la advertencia corta o, si la cotización no es
          seleccionable, el aviso de "sin costo total" — nunca una línea extra. */}
      <div
        className={
          (sinCostoDeWink || raw.costoManual) && onCargarCostoManual
            ? 'quote-card__meta-warning quote-card__meta-warning--manual'
            : 'quote-card__meta-warning'
        }
      >
        {raw.costoManual && selectable && onCargarCostoManual ? (
          // A pedido: el reeditar de una completada manualmente es un botón que se lee como
          // botón (antes era una etiqueta más entre RC, Deducible, etc.).
          <>
            {quote.warning ? (
              <span className="quote-card__sin-costo">
                <MdWarningAmber /> {quote.warning.short}
              </span>
            ) : (
              <span className="quote-card__manual-nota">Completada manualmente</span>
            )}
            <button type="button" className="quote-card__reeditar" onClick={() => setCargandoCosto(true)}>
              <MdEdit aria-hidden="true" /> Editar carga manual
            </button>
          </>
        ) : sinCostoDeWink && onCargarCostoManual ? (
          // A pedido ("no se entiende el botón"): un botón de verdad, sin atenuar como el
          // resto de la tarjeta, que dice qué pasó y qué hace.
          <>
            <span className="quote-card__sin-costo">
              <MdWarningAmber /> Sin costo de WINK
            </span>
            <button type="button" className="quote-card__completar" onClick={() => setCargandoCosto(true)}>
              <MdEdit aria-hidden="true" /> Completar manualmente
            </button>
          </>
        ) : !selectable ? (
          <>
            <MdWarningAmber /> Sin costo total — no se puede seleccionar
          </>
        ) : (
          quote.warning && (
            <>
              <MdWarningAmber /> {quote.warning.short}
            </>
          )
        )}
      </div>

      {/* Problema de carga del RC (ver pricingEngine.js#rcInfo). Es un aviso PARA EL
          VENDEDOR y no viaja en la cotización: dice que lo que está por mandar sale
          incompleto y qué hay que arreglar en PANEL. Va abajo de la advertencia comercial
          y con otro color, para que no se confunda con algo que el cliente vaya a leer. */}
      {quote.rcProblema && (
        <p className="quote-card__rc-problema" title={quote.rcProblema.full}>
          <MdWarningAmber /> {quote.rcProblema.short}
        </p>
      )}

      {/* A pedido, tarjeta restructurada: ni el desglose de cuotas ni la promo de "SIN
          RECARGO" van a la vista — el cliente recibe todo entero en la imagen de
          WhatsApp ("Formas de pago" + la banda de promo), y para consultar el desglose
          acá está "Cuotas y recargos" adentro de Parámetros. Lo que queda en la tarjeta
          son las ETIQUETAS a lo ancho completo: todas las posibles para esta compañía
          (Bonificación, Descuento, RC, Deducible/Edad específicos, Opcionales PORTO) —
          gris mientras no tengan valor, coloreadas con el valor puesto apenas lo tienen
          (override de "Parámetros ajustables", o el dato real del subitem). */}
      {/* A pedido: en las de PORTO, si el cliente tiene la bonificación del 30% según su CI,
          por zona — verde aprobada, rojo no aprobada (ver services/bonificacionPorto.js).
          Solo informa: el precio no cambia. */}
      {/* Alto parejo: si alguna tarjeta de la solapa muestra las zonas de PORTO, las demás
          reservan ese renglón vacío (reservarBonifPorto, lo decide OpportunityDetail). */}
      {!zonasBonifPorto && reservarBonifPorto && <div className="quote-card__bonif-porto" aria-hidden="true" />}
      {zonasBonifPorto && (
        <div className="quote-card__bonif-porto" aria-label="Bonificación PORTO 30% por zona">
          <span className="quote-card__bonif-porto-titulo">Bonif. 30%</span>
          {zonasBonifPorto.map((z) => (
            <span
              key={z.key}
              className={`quote-card__zona quote-card__zona--${z.estado ?? 'sinRespuesta'}`}
              title={TEXTO_ESTADO_ZONA[z.estado ?? 'sinRespuesta']}
            >
              {/* Con ✓/✗ además del color, para que se lea aunque no se distingan. */}
              {z.estado === 'aprobado' ? '✓ ' : z.estado === 'noAprobado' ? '✗ ' : ''}
              {z.label}
              {z.estado === 'consultando' ? ' · consultando…' : ''}
              {z.estado === 'sinRespuesta' || !z.estado ? ' · sin respuesta' : ''}
            </span>
          ))}
        </div>
      )}

      <div className="quote-card__override-tags">
        {/* Cotización con costo y deducible cargados a mano: solo la marca. Se edita con
            "Editar carga manual", arriba. */}
        {raw.costoManual && (
          <span className="quote-card__tag quote-card__tag--manual" title="Costo y deducible completados manualmente">
            Manual
          </span>
        )}
        {fields.map((field) => {
          const active = hasTagValue(field, raw, overrides)
          const label = field.label.replace(/\s*\(%\)$/, '')
          return (
            <span
              key={field.key}
              className={active ? 'quote-card__tag quote-card__tag--active' : 'quote-card__tag quote-card__tag--empty'}
            >
              {active ? `${label}: ${tagValueDisplay(field, raw, overrides)}` : label}
            </span>
          )
        })}
        {opcionalesDeLaCompania.map((opt) => {
            const active = Boolean(raw[opt.field])
            return (
              <span
                key={opt.field}
                className={active ? 'quote-card__tag quote-card__tag--active' : 'quote-card__tag quote-card__tag--empty'}
              >
                {opt.label}
              </span>
            )
          })}
      </div>

      {/* A pedido, estética tipo mockup: botones separados en vez de un solo "Ver
          más" — Parámetros abre datos fijos + ajustables (+ opcionales PORTO si es
          PORTO), Coberturas abre el detalle del vehículo + "Incluye", y Cuotas (reunión
          del 24/09) la tabla de cuotas y recargos, que antes vivía adentro de
          Parámetros y la recargaba. Mutuamente excluyentes por construcción (ver
          openPanel/handleToggleParams/handleTogglePanel más arriba: un solo estado). */}
      <div className="quote-card__actions">
        <Button
          kind="secondary"
          className={
            openPanel === 'params' ? 'quote-card__action-btn quote-card__action-btn--active' : 'quote-card__action-btn'
          }
          onClick={handleToggleParams}
        >
          <MdTune /> Parámetros
        </Button>
        <Button
          kind="secondary"
          className={
            openPanel === 'coberturas'
              ? 'quote-card__action-btn quote-card__action-btn--active'
              : 'quote-card__action-btn'
          }
          onClick={() => handleTogglePanel('coberturas')}
        >
          <MdListAlt /> Coberturas
        </Button>
        <Button
          kind="secondary"
          className={
            openPanel === 'cuotas' ? 'quote-card__action-btn quote-card__action-btn--active' : 'quote-card__action-btn'
          }
          onClick={() => handleTogglePanel('cuotas')}
        >
          <MdPayments /> Cuotas
        </Button>
      </div>

      {openPanel === 'params' && (
        <div className="quote-card__params">
          {/* Versión completa de la advertencia (ver quote.warning.short más arriba, que
              es la que siempre se ve) — acá el detalle: compañía y requisito puntual. */}
          {quote.warning && (
            <p className="quote-card__warning quote-card__warning--full">
              <MdWarningAmber /> {quote.warning.full}
            </p>
          )}

          {quote.rcProblema && (
            <p className="quote-card__warning quote-card__warning--full quote-card__warning--interno">
              <MdWarningAmber /> {quote.rcProblema.full}
            </p>
          )}

          <div className="quote-card__params-subtitle">Datos fijos (no editables)</div>
          <div className="quote-card__params-fixed">
            {FIXED_FIELDS.map((field) => (
              <div className="quote-card__params-fixed-field" key={field.key}>
                <span>{field.label}</span>
                <strong>{fixedFieldValue(field, raw)}</strong>
              </div>
            ))}
          </div>

          <div className="quote-card__params-subtitle">Parámetros ajustables</div>
          {/* A pedido: "Restablecer" (más chico, azul) va al lado de la grilla de campos
              — alineado con los inputs, no con el subtítulo de arriba. */}
          <div className="quote-card__params-adjustable-row">
            <div className="quote-card__params-grid">
              {fields.map((field) => (
                <label
                  className={
                    // A pedido, RC más ancho: sus etiquetas ("US$ 1.000.000",
                    // "Nivel 4"…) son las más largas del panel — fila completa.
                    field.key === 'rc'
                      ? 'quote-card__params-field quote-card__params-field--ancho'
                      : 'quote-card__params-field'
                  }
                  key={field.key}
                >
                  <span>{field.label}</span>
                  {field.kind === 'select' ? (
                    <FieldSelect
                      key={`${field.key}-${paramsResetKey}`}
                      value={form[field.key]}
                      options={field.options}
                      onChange={(value) => handleFieldChange(field.key, value)}
                    />
                  ) : (
                    // NumberField nativo de @vibe/core — maneja number|null, el form
                    // sigue en string (mismo criterio que el resto de los campos), así
                    // que el ida y vuelta se adapta acá mismo.
                    <NumberField
                      key={`${field.key}-${paramsResetKey}`}
                      size="small"
                      value={form[field.key] === '' ? null : Number(form[field.key])}
                      onChange={(value) => handleFieldChange(field.key, value == null ? '' : String(value))}
                    />
                  )}
                </label>
              ))}
            </div>
            <Button
              kind="primary"
              size="small"
              className="quote-card__reset-btn"
              onClick={handleReset}
              disabled={!hasCustomOverrides}
            >
              Restablecer
            </Button>
          </div>

          {raw.compania === 'BSE' && onBonificacionEspecialChange && (
            <>
              <div className="quote-card__params-subtitle">{soloBns ? 'Bonificación BSE' : 'Bonificaciones especiales BSE'}</div>
              <div className="quote-card__params-grid">
                {bonificacionesEspeciales.map((b) => (
                  <BonificacionEspecial
                    key={b.key}
                    label={b.label}
                    valor={raw[b.key] ?? ''}
                    onGuardar={(valor) => onBonificacionEspecialChange(b.key, valor)}
                  />
                ))}
              </div>
            </>
          )}

          {opcionalesDeLaCompania.length > 0 && (
            <>
              <div className="quote-card__params-subtitle">Opcionales {raw.compania}</div>
              {/* Los tildes van juntos en una línea y Auto extra (que tiene etiqueta y
                  selector, y por eso es más alto) en su propia fila: mezclados en la
                  grilla, la fila de Auto extra quedaba más alta y los tildes desparejos. */}
              <div className="quote-card__opcionales-checks">
                {opcionalesDeLaCompania.map((opt) => (
                  <Checkbox
                    key={opt.field}
                    label={opt.label}
                    checked={!!raw[opt.field]}
                    disabled={savingOpcional === opt.field}
                    onChange={(e) => handleToggleOpcional(opt.field, e.target.checked)}
                  />
                ))}
              </div>
              {autoExtraDias.length > 0 && (
                <div className="quote-card__opcionales-extra">
                  <label className="quote-card__params-field">
                    <span>Auto extra</span>
                    <Dropdown
                      size="small"
                      options={autoExtraDias.map((d) => ({ value: d, label: d }))}
                      value={raw.autoExtra ? { value: raw.autoExtra, label: raw.autoExtra } : null}
                      placeholder="Sin auto extra"
                      clearable
                      onClear={() => handleAutoExtraChange('')}
                      onChange={(option) => handleAutoExtraChange(option?.value ?? '')}
                    />
                  </label>
                </div>
              )}
              {opcionalError && <p className="quote-card__warning">{opcionalError}</p>}
            </>
          )}
        </div>
      )}

      {/* El desglose que antes vivía a la vista en la tarjeta (a pedido salió de ahí): al
          cliente le llega entero en la imagen de WhatsApp, y acá queda para consultarlo
          sin ensuciar la tarjeta ni los Parámetros. */}
      {openPanel === 'cuotas' && (
        <div className="quote-card__params">
          <div className="quote-card__params-subtitle">Cuotas y recargos</div>
          <table className="quote-card__cuotas-table">
            <thead>
              <tr>
                <th>Cuotas</th>
                <th>Valor cuota</th>
                <th>Recargo</th>
              </tr>
            </thead>
            <tbody>
              {CUOTA_COUNTS.map((n) => (
                <tr key={n}>
                  <td>{n}x</td>
                  <td>{formatMoney(quote.cuotas[n].valor)}</td>
                  <td>{toPercentString(raw[`recargo${n}`])}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cargandoCosto && (
        <CotizacionManualModal
          raw={raw}
          onGuardar={async (datos) => {
            await onCargarCostoManual(datos)
            setCargandoCosto(false)
          }}
          onVaciar={
            onVaciarCostoManual &&
            (async () => {
              await onVaciarCostoManual()
              setCargandoCosto(false)
            })
          }
          onClose={() => setCargandoCosto(false)}
        />
      )}

      {openPanel === 'coberturas' && (
        <div className="quote-card__detail">
          {/* Compañía/Cobertura ya se muestran arriba (título de la tarjeta) — a pedido,
              acá no se repiten. */}
          <div className="quote-card__detail-facts">
            <div>
              <strong>Año vehículo:</strong> {raw.anioVehiculo || '—'}
            </div>
            <div>
              <strong>Contado base (sin ajustes):</strong> {formatMoney(Number(raw.contado))}
            </div>
          </div>
          {/* LOG-18: cuadro propio, separado de "Incluye" — antes los opcionales eran
              una viñeta más ahí adentro ("OPCIONAL: … + $N") y se leían como si vinieran
              con la cobertura. Los que están contratados llevan tilde (ya están sumados
              en el COSTO TOTAL de arriba); los que no, el precio al que se agregarían. */}
          {quote.opcionales?.length > 0 && (
            <div className="quote-card__opcionales">
              <strong>Opcionales:</strong>
              <ul>
                {quote.opcionales.map((opt, i) => (
                  <li key={i} className={opt.contratado ? 'quote-card__opcional--contratado' : undefined}>
                    <span className="quote-card__opcional-label">{opt.label}</span>
                    <span className="quote-card__opcional-precio">
                      {opt.contratado
                        ? 'contratado'
                        : opt.precio
                          ? `${opt.desde ? 'desde ' : '+ '}${formatMoney(opt.precio)}`
                          : 'consultar'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {quote.incluye.length > 0 && (
            <div className="quote-card__incluye">
              <strong>Incluye:</strong>
              {/* A pedido: en columnas (aprovecha el ancho de la tarjeta) en vez de una
                  viñeta por renglón — con compañías que traen 10+ ítems, eso solo hacía
                  la tarjeta entera innecesariamente alta. */}
              <ul>
                {quote.incluye.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Auditoría: memoizada — el polling del detalle refresca el ítem cada 4s y sin esto
// se re-renderizaban hasta 19 tarjetas por tick aunque no cambiara nada.
export default memo(QuoteCard)
