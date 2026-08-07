import { useState } from 'react'
import {
  MdWarningAmber,
  MdVisibility,
  MdRadioButtonChecked,
  MdRadioButtonUnchecked,
  MdTune,
  MdRefresh,
  MdBusiness,
  MdClearAll,
} from 'react-icons/md'
import { Button, IconButton, Dropdown, Checkbox } from '@vibe/core'
import { formatMoney } from '../services/format'
import { accentForCompania } from '../services/companyColors'
import './QuoteCard.css'

const CUOTA_COUNTS = [3, 6, 8, 10]

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

// Datos "de tarifa" — vienen fijos de monday y no se editan por cotización: el
// Contado base, la Edad del subitem, el Deducible general y los recargos por cuota
// son parte de la tarifa cargada, no un parámetro que el vendedor deba tocar.
const FIXED_FIELDS = [
  { key: 'contado', label: 'Contado/Costo', kind: 'money' },
  { key: 'edad', label: 'Edad', kind: 'text' },
  { key: 'deducibleBase', label: 'Deducible', kind: 'text' },
  { key: 'recargo3', label: 'Recargo 3 Cuotas', kind: 'percent' },
  { key: 'recargo6', label: 'Recargo 6 Cuotas', kind: 'percent' },
  { key: 'recargo8', label: 'Recargo 8 Cuotas', kind: 'percent' },
  { key: 'recargo10', label: 'Recargo 10 Cuotas', kind: 'percent' },
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

function toPercentString(rawValue) {
  const n = parseFloat(rawValue)
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 100 * 10000) / 10000)
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

export default function QuoteCard({
  raw,
  quote,
  selected,
  onToggleSelected,
  overrides,
  onApplyOverrides,
  onResetOverrides,
  onApplyToCompany,
  onClearCompany,
  onToggleOpcional,
  rcOptions,
}) {
  const [showDetail, setShowDetail] = useState(false)
  const [showParams, setShowParams] = useState(false)
  const fields = fieldsForRaw(raw, rcOptions)
  const [form, setForm] = useState(() => buildInitialForm(raw, overrides, fields))
  const [savingOpcional, setSavingOpcional] = useState(null)
  const [opcionalError, setOpcionalError] = useState(null)

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

  const handleFieldChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleToggleParams = () => {
    if (!showParams) setForm(buildInitialForm(raw, overrides, fields))
    setShowParams((v) => !v)
  }

  const handleApply = () => {
    const nextOverrides = {}
    for (const field of fields) {
      const formValue = form[field.key]
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

  const handleReset = () => {
    setForm(buildInitialForm(raw, {}, fields))
    onResetOverrides()
  }

  // Contraparte de "Aplicar a toda {compania}": saca los parámetros de prueba de todas
  // las cotizaciones de la compañía de una, no solo la de esta tarjeta — también resetea
  // el form local de esta tarjeta (si no, quedaría mostrando valores viejos hasta volver
  // a abrir/cerrar Parámetros).
  const handleClearCompany = () => {
    setForm(buildInitialForm(raw, {}, fields))
    onClearCompany()
  }

  // A diferencia de "Aplicar a esta cotización" (que solo guarda lo que cambió respecto
  // al dato real de ESTA tarjeta), acá el objetivo es dejar la MISMA configuración en
  // todas las coberturas de la compañía — así que se manda el valor tal cual está en el
  // formulario (salvo que esté vacío, que sigue significando "usar el dato real de cada
  // cotización"). Los campos son los mismos para todas las cotizaciones de una compañía
  // (fieldsForRaw depende solo de raw.compania, no de la cobertura), así que aplican 1 a 1.
  const handleApplyToCompany = () => {
    const companyOverrides = {}
    for (const field of fields) {
      const formValue = form[field.key]
      if (field.key === 'descuento') {
        if (formValue !== '0' && formValue !== '') companyOverrides.descuento = fromPercentString(formValue)
        continue
      }
      if (field.kind === 'percent') {
        if (formValue !== '') companyOverrides[field.key] = fromPercentString(formValue)
        continue
      }
      if (formValue !== '') companyOverrides[field.key] = formValue
    }
    onApplyToCompany(companyOverrides)
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

  return (
    <div
      className={selected ? 'quote-card quote-card--selected' : 'quote-card'}
      style={{ borderLeftColor: accent }}
    >
      <div className="quote-card__main">
        <div className="quote-card__title-row">
          <IconButton
            className="quote-card__radio"
            icon={selected ? MdRadioButtonChecked : MdRadioButtonUnchecked}
            onClick={onToggleSelected}
            aria-label="Seleccionar opción"
          />
          <span className="quote-card__company" style={{ color: accent }}>
            {raw.compania}
          </span>
          <span className="quote-card__title">{raw.cobertura || raw.name}</span>
          {hasCustomOverrides && <span className="quote-card__custom-tag">Parámetros propios</span>}
        </div>

        <div className="quote-card__meta">
          <div>
            <span className="quote-card__meta-label">Deducible</span>
            <span className="quote-card__meta-value">{quote.deducibleDisplay}</span>
          </div>
          <div>
            <span className="quote-card__meta-label">Uso</span>
            <span className="quote-card__meta-value">{raw.uso || '—'}</span>
          </div>
          <div>
            <span className="quote-card__meta-label">RC</span>
            <span className="quote-card__meta-value">{quote.rc || '—'}</span>
          </div>
        </div>
      </div>

      <div className="quote-card__cuotas">
        {quote.promo && (
          <span className="quote-card__cuotas-label">
            ➜ {quote.promo.count} cuotas SIN RECARGO de {formatMoney(quote.promo.valor)}
          </span>
        )}
        <table className="quote-card__cuotas-table">
          <tbody>
            {CUOTA_COUNTS.map((n) => (
              <tr key={n}>
                <td>{n}x</td>
                <td>{formatMoney(quote.cuotas[n].valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="quote-card__total">
        <span className="quote-card__total-label">COSTO TOTAL</span>
        <span className="quote-card__total-value">{formatMoney(quote.total)}</span>
        <div className="quote-card__total-actions">
          <Button
            kind="secondary"
            className={showParams ? 'quote-card__params-btn--active' : undefined}
            onClick={handleToggleParams}
          >
            <MdTune /> Parámetros
          </Button>
          <Button kind="secondary" onClick={() => setShowDetail((v) => !v)}>
            <MdVisibility /> Ver detalle
          </Button>
        </div>
      </div>

      {quote.warning && (
        <p className="quote-card__warning">
          <MdWarningAmber /> {quote.warning}
        </p>
      )}

      {showParams && (
        <div className="quote-card__params">
          <p className="quote-card__params-note">
            Datos fijos de tarifa ({raw.compania} · {raw.cobertura || raw.name}) y los parámetros que
            sí podés ajustar para esta cotización puntual.
          </p>

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
          <div className="quote-card__params-grid">
            {fields.map((field) => (
              <label className="quote-card__params-field" key={field.key}>
                <span>{field.label}</span>
                {field.kind === 'select' ? (
                  <FieldSelect
                    value={form[field.key]}
                    options={field.options}
                    onChange={(value) => handleFieldChange(field.key, value)}
                  />
                ) : (
                  <input
                    type="number"
                    value={form[field.key]}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  />
                )}
              </label>
            ))}
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

          <div className="quote-card__params-actions">
            <Button kind="primary" onClick={handleApply}>
              <MdRefresh /> Aplicar a esta cotización
            </Button>
            <Button kind="secondary" onClick={handleApplyToCompany}>
              <MdBusiness /> Aplicar a toda {raw.compania}
            </Button>
            <Button kind="secondary" onClick={handleClearCompany}>
              <MdClearAll /> Limpiar toda {raw.compania}
            </Button>
            <Button kind="secondary" onClick={handleReset} disabled={!hasCustomOverrides}>
              Restablecer
            </Button>
          </div>
        </div>
      )}

      {showDetail && (
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
