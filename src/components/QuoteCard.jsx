import { useState } from 'react'
import {
  MdWarningAmber,
  MdRadioButtonChecked,
  MdRadioButtonUnchecked,
  MdListAlt,
  MdTune,
} from 'react-icons/md'
import { Button, IconButton, Dropdown, Checkbox, NumberField } from '@vibe/core'
import { formatMoney, CUOTA_COUNTS, toPercentString } from '../services/format'
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

// A pedido: tags que muestran qué parámetros ajustables se le agregaron a ESTA
// cotización puntual (no a toda la compañía) — uno por campo con override activo, con
// el valor ya aplicado. El "(%)" del label completo (ej. "Bonificación (%)") se saca acá
// porque el "%" ya va pegado al valor del tag. RC queda afuera a propósito — ese override
// se marca coloreando el RC que ya se mostraba en quote-card__meta, no como un tag más.
function overrideTags(fields, overrides) {
  return fields
    .filter((field) => field.key !== 'rc' && overrides[field.key] != null)
    .map((field) => {
      const value =
        field.kind === 'percent' || field.kind === 'percent-only'
          ? `${toPercentString(overrides[field.key])}%`
          : String(overrides[field.key])
      return { key: field.key, label: field.label.replace(/\s*\(%\)$/, ''), value }
    })
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

  const hasCustomOverrides = Object.keys(overrides).length > 0
  const accent = accentForCompania(raw.compania)
  // A pedido: los opcionales PORTO tildados (Granizo/Cristales/Coche Cortesía) se
  // marcan a vista general, sin tener que abrir "Ver más" — mismo lugar que los tags de
  // parámetros ajustados, pero en verde (son un dato real incluido en la cotización, no
  // un ajuste de prueba).
  const activeOpcionales = raw.compania === 'PORTO' ? PORTO_OPCIONALES.filter((opt) => raw[opt.field]) : []

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
    setForm(buildInitialForm(raw, {}, fields))
    onResetOverrides()
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
              icon={selected ? MdRadioButtonChecked : MdRadioButtonUnchecked}
              onClick={onToggleSelected}
              aria-label="Seleccionar opción"
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

      {/* A pedido: qué parámetros ajustables se le agregaron a esta cotización puntual
          (uno por campo con override activo) y qué opcionales PORTO están tildados, sin
          tener que abrir "Parámetros" — a diferencia de antes (apretados a la derecha,
          debajo de COSTO TOTAL) ahora van en su propio renglón a lo ancho: con 3
          tarjetas por fila (ver .opp-detail__quotes) no entra ancho como para meter 4
          tags de golpe apretados contra una columna angosta. Reemplaza al tag genérico
          "Parámetros propios" que tenía el title-row antes — quedaba redundante con
          esto (ya dice explícitamente QUÉ se ajustó, no solo que "algo" se ajustó).
          El div se renderiza SIEMPRE (con o sin tags, ver min-height en CSS) — mismo
          criterio que quote-card__meta-warning más abajo: sin esto, una tarjeta con un
          tag (ej. "Granizo") queda más alta que sus vecinas sin ninguno y los botones de
          abajo terminan a distinta altura entre tarjetas de un mismo renglón. */}
      <div className="quote-card__override-tags">
        {activeOpcionales.map((opt) => (
          <span key={opt.field} className="quote-card__opcional-tag">
            {opt.label}
          </span>
        ))}
        {overrideTags(fields, overrides).map((tag) => (
          <span key={tag.key} className="quote-card__override-tag">
            {tag.label}: {tag.value}
          </span>
        ))}
      </div>

      {/* Versión corta de la advertencia (ver quote.warning.full más abajo, adentro de
          "Parámetros") — este renglón se reserva SIEMPRE (con o sin advertencia, ver
          min-height en CSS) para que todas las tarjetas de un mismo renglón midan lo
          mismo: con advertencia, aparece el texto; sin ella, el espacio queda vacío pero
          ocupado igual. */}
      <div className="quote-card__meta-warning">
        {quote.warning && (
          <>
            <MdWarningAmber /> {quote.warning.short}
          </>
        )}
      </div>

      {/* A pedido: el Recargo de cada cuota (antes en "Datos fijos", adentro de
          Parámetros) se muestra acá arriba, en la misma tabla que cuotas/valor — con un
          encabezado que aclara qué es cada columna. La promo "N cuotas SIN RECARGO" pasa
          al final de la sección, no arriba de todo. */}
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
                      value={form[field.key]}
                      options={field.options}
                      onChange={(value) => handleFieldChange(field.key, value)}
                    />
                  ) : (
                    // NumberField nativo de @vibe/core — maneja number|null, el form
                    // sigue en string (mismo criterio que el resto de los campos), así
                    // que el ida y vuelta se adapta acá mismo.
                    <NumberField
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
