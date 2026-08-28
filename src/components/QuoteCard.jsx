import { useState, memo } from 'react'
import {
  MdWarningAmber,
  MdRadioButtonChecked,
  MdRadioButtonUnchecked,
  MdListAlt,
  MdTune,
} from 'react-icons/md'
import { Button, IconButton, Dropdown, Checkbox, NumberField } from '@vibe/core'
import { formatMoney, CUOTA_COUNTS, toPercentString } from '../services/format'
import { isQuoteSelectable } from '../services/pricingEngine'
import { accentForCompania } from '../services/companyColors'
import './QuoteCard.css'

const BSE_DEDUCIBLE_OPTIONS = ['0.5', '1', '1.5', '2', '2.5', '3']
const BSE_EDAD_OPTIONS = ['No', '35 a 75', '56 a 75']
const SURA_DEDUCIBLE_OPTIONS = ['1', '1.3', '2']

// Opcionales de PORTO - TOTAL (Granizo/Cristales/Coche Cortesía): a diferencia de los
// "Parámetros ajustables" de abajo (locales hasta apretar "Aplicar"), estos checkboxes
// escriben directo en monday apenas se tildan (onToggleOpcional), porque es un dato real
// de la cotización, no un ajuste de prueba. Ver pricingEngine.js#buildIncluyeBullets.
const PORTO_OPCIONALES = [
  { field: 'granizo', label: 'Granizo' },
  { field: 'cocheCortesia', label: 'Coche Cortesía' },
  { field: 'cristales', label: 'Cristales' },
]

// Datos "de tarifa" — vienen fijos de monday y no se editan por cotización: el Contado
// base y el Deducible general son parte de la tarifa cargada, no un parámetro que el
// vendedor deba tocar. Los recargos por cuota se sacaron de acá (a pedido) y se muestran
// arriba, en la propia tabla de cuotas (ver quote-card__cuotas-table) — y Edad se sacó
// directamente, ya no se muestra.
const FIXED_FIELDS = [
  { key: 'contado', label: 'Contado/Costo', kind: 'money' },
  { key: 'deducibleBase', label: 'Deducible', kind: 'text' },
  { key: 'uso', label: 'Uso', kind: 'text' },
]

// Únicos campos editables por cotización: Bonificación/Descuento son palancas
// comerciales de verdad, RC es una selección de nivel de cobertura común a las 4
// compañías (columna dropdown_mm5954ma, opciones reales traídas por boardSchema.js —
// no impacta el cálculo de precio, es solo el nivel de RC que se le muestra al
// cliente), y el deducible/edad específico de cada compañía es otra selección de nivel
// de cobertura. Ver /logica-monday-vibe.md.
function fieldsForRaw(raw, rcOptions) {
  const common = [
    { key: 'bonif', label: 'Bonificación (%)', kind: 'number' },
    { key: 'descuento', label: 'Descuento (%)', kind: 'percent-only' },
    { key: 'rc', label: 'RC', kind: 'select', options: rcOptions },
  ]

  if (raw.compania === 'BSE') {
    common.push(
      { key: 'deducibleBSE', label: 'Deducible BSE', kind: 'select', options: BSE_DEDUCIBLE_OPTIONS },
      { key: 'edadBSE', label: 'Edad BSE', kind: 'select', options: BSE_EDAD_OPTIONS }
    )
  }
  if (raw.compania === 'SURA') {
    common.push({ key: 'deducibleSURA', label: 'Deducible SURA', kind: 'select', options: SURA_DEDUCIBLE_OPTIONS })
  }
  if (raw.compania === 'SANCOR') {
    common.push({ key: 'deducibleSancorUsd', label: 'Deducible SANCOR (USD)', kind: 'number' })
  }

  return common
}

function fromPercentString(value) {
  return Number(value) / 100
}

function fixedFieldValue(field, raw) {
  if (field.kind === 'money') return formatMoney(Number(raw[field.key]) || 0)
  if (field.kind === 'percent') return `${toPercentString(raw[field.key])}%`
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
// Descuento, RC, y las específicas de cada una — Deducible/Edad BSE, Deducible SURA,
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
  const dropdownOptions = options.map((opt) => ({ value: opt, label: opt }))
  const selected = dropdownOptions.find((o) => o.value === value) ?? null
  return (
    <Dropdown
      options={dropdownOptions}
      value={selected}
      placeholder="Sin definir"
      size="small"
      clearable
      onClear={() => onChange('')}
      onChange={(option) => onChange(option?.value ?? '')}
    />
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
  rcOptions,
}) {
  // A pedido, estética tipo mockup: 2 botones separados ("Parámetros"/"Coberturas") que
  // NO se pueden desplegar a la vez — un solo estado con el panel abierto (o ninguno) en
  // vez de 2 booleans independientes, así abrir uno cierra el otro solo por construcción
  // (nunca hay que acordarse de apagar el otro a mano).
  const [openPanel, setOpenPanel] = useState(null)
  const fields = fieldsForRaw(raw, rcOptions)
  const [form, setForm] = useState(() => buildInitialForm(raw, overrides, fields))
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

  const hasCustomOverrides = Object.keys(overrides).length > 0
  const accent = accentForCompania(raw.compania)

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

  // A pedido: sin botón "Aplicar" — cada cambio en un parámetro ajustable se aplica solo,
  // recalculando nextOverrides con el form ya actualizado (no el de la closure, que
  // todavía tiene el valor viejo del campo que se acaba de tocar).
  const applyFromForm = (formValues) => {
    const nextOverrides = {}
    for (const field of fields) {
      const formValue = formValues[field.key]
      if (field.key === 'descuento') {
        if (formValue !== '0' && formValue !== '') nextOverrides.descuento = fromPercentString(formValue)
        continue
      }
      if (field.kind === 'percent') {
        if (formValue !== toPercentString(raw[field.key])) nextOverrides[field.key] = fromPercentString(formValue)
        continue
      }
      if (formValue !== (raw[field.key] ?? '')) nextOverrides[field.key] = formValue
    }
    onApplyOverrides(nextOverrides)
  }

  const handleFieldChange = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      applyFromForm(next)
      return next
    })
  }

  // Al abrir "Parámetros" se refresca el form con los valores reales vigentes (mismo
  // motivo que antes: si se cerró con "Restablecer" pendiente o cambió algo por fuera,
  // no queremos mostrar un valor viejo de una apertura anterior).
  const handleToggleParams = () => {
    if (openPanel !== 'params') setForm(buildInitialForm(raw, overrides, fields))
    setOpenPanel((prev) => (prev === 'params' ? null : 'params'))
  }

  const handleToggleCoberturas = () => {
    setOpenPanel((prev) => (prev === 'coberturas' ? null : 'coberturas'))
  }

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
    setForm(buildInitialForm(raw, blankedOverrides, fields))
    setParamsResetKey((k) => k + 1)
    onApplyOverrides(blankedOverrides)
  }

  if (quote.blocked) {
    return (
      <div className="quote-card quote-card--blocked" style={{ borderLeftColor: accent }}>
        <div className="quote-card__title-row">
          <span className="quote-card__company" style={{ color: accent }}>
            {raw.compania}
          </span>
          <span className="quote-card__title">{raw.cobertura || raw.name}</span>
        </div>
        <p className="quote-card__blocked-msg">
          <MdWarningAmber /> {quote.blockedReason}
        </p>
      </div>
    )
  }

  // A pedido: COSTO TOTAL en 0 → tarjeta atenuada, no se puede seleccionar para enviar.
  const selectable = isQuoteSelectable(quote)
  return (
    <div
      className={[
        'quote-card',
        selected && selectable && 'quote-card--selected',
        !selectable && 'quote-card--unavailable',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ borderLeftColor: accent }}
      aria-disabled={!selectable || undefined}
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
            <span className="quote-card__company" style={{ color: accent }}>
              {raw.compania}
            </span>
            <span className="quote-card__title">{raw.cobertura || raw.name}</span>
          </div>
          <span className="quote-card__deducible-line">Deduc.: {quote.deducibleDisplay}</span>
        </div>

        <div className="quote-card__total">
          <span className="quote-card__total-label">COSTO TOTAL</span>
          <span className="quote-card__total-value">{formatMoney(quote.total)}</span>
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
      <div className="quote-card__meta-warning">
        {!selectable ? (
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

      {/* A pedido: cuotas y etiquetas ahora conviven en 2 columnas (Flexbox) adentro de
          un mismo wrapper, en vez de un renglón a lo ancho completo cada una — mejor
          aprovechamiento del ancho de la tarjeta. */}
      <div className="quote-card__body">
        {/* A pedido: el Recargo de cada cuota (antes en "Datos fijos", adentro de
            Parámetros) se muestra acá, en la misma tabla que cuotas/valor — con un
            encabezado que aclara qué es cada columna. La promo "N cuotas SIN RECARGO"
            va al final de la columna, no arriba de todo. */}
        <div className="quote-card__cuotas">
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
          {quote.promo && (
            <span className="quote-card__cuotas-label">
              ➜ {quote.promo.count} cuotas SIN RECARGO de {formatMoney(quote.promo.valor)}
            </span>
          )}
        </div>

        {/* A pedido: TODAS las etiquetas posibles para esta compañía (Bonificación,
            Descuento, RC, Deducible/Edad específicos, Opcionales PORTO), no solo las
            que tengan un valor cargado — en gris mientras no lo tengan, coloreadas con
            el valor puesto apenas lo tienen (override de "Parámetros ajustables", o el
            dato real que ya traía el subitem de monday), sin tener que abrir
            "Parámetros" para verlo. Columna propia al lado de la tabla de cuotas (antes
            renglón aparte a lo ancho completo). */}
        <div className="quote-card__override-tags">
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
          {raw.compania === 'PORTO' &&
            PORTO_OPCIONALES.map((opt) => {
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
      </div>

      {/* A pedido, estética tipo mockup: 2 botones separados en vez de un solo "Ver
          más" — Parámetros abre datos fijos + ajustables (+ opcionales PORTO si es
          PORTO), Coberturas abre el detalle del vehículo + "Incluye". Mutuamente
          excluyentes por construcción (ver openPanel/handleToggleParams/
          handleToggleCoberturas más arriba: un solo estado, no 2 booleans). */}
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
          onClick={handleToggleCoberturas}
        >
          <MdListAlt /> Coberturas
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
                <label className="quote-card__params-field" key={field.key}>
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

          {raw.compania === 'PORTO' && (
            <>
              <div className="quote-card__params-subtitle">Opcionales PORTO</div>
              <div className="quote-card__params-grid">
                {PORTO_OPCIONALES.map((opt) => (
                  <Checkbox
                    key={opt.field}
                    className="quote-card__params-field--checkbox"
                    label={opt.label}
                    checked={!!raw[opt.field]}
                    disabled={savingOpcional === opt.field}
                    onChange={(e) => handleToggleOpcional(opt.field, e.target.checked)}
                  />
                ))}
              </div>
              {opcionalError && <p className="quote-card__warning">{opcionalError}</p>}
            </>
          )}
        </div>
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
