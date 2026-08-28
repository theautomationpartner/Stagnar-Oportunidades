// Primitivas de formulario del wizard "Crear Oportunidad" — extraídas de
// CrearOportunidadForm.jsx (auditoría). Los estilos siguen en CrearOportunidadForm.css.
import { useState } from 'react'
import { Dropdown, TextField } from '@vibe/core'
import { MdCall, MdClear, MdDescription, MdEdit } from 'react-icons/md'
import { CODIGO_PAIS_OPTIONS, emailError, telefonoError } from '../../services/personaFields'
import { matchesSearchQuery } from '../../services/format'

// A pedido: asterisco de obligatorio en rojo en TODOS los campos — antes era texto
// suelto (" *") sin ese color en los <label><span> armados a mano (Fecha Nacimiento,
// Teléfono, Departamento, Localidad, Año/Marca/Modelo/etc.), mientras que el TextField
// nativo de @vibe/core (Nombre/Apellido/CI) sí lo trae rojo de fábrica — quedaba
// inconsistente. Un solo componente en vez de repetir el span a mano en cada campo.
export function Required() {
  return <span className="crear-op__required">*</span>
}

// AutodataModeloPorAnioMarca y matchesSearchQuery se movieron a sus propios archivos
// compartidos (ver AutodataModeloPorAnioMarca.jsx y services/format.js) — CotizarStepPanel.jsx
// (edición del paso "Cotizar") ahora reusa exactamente lo mismo, en vez de tener su
// propia versión sin filtrar por Año/Marca.

// clearable={false} SIEMPRE acá — van 2 veces que se prueba activarlo (con la "x" nativa
// del Dropdown) y las 2 terminó en un dato bueno borrándose solo: la primera vez al
// clickear para reabrir y elegir otro valor, esta segunda con solo hacer click afuera
// (blur) después de elegir uno. En vez de perseguir un tercer caso raro de la librería,
// mejor no usar su "clearable" en absoluto — reelegir otra opción (click → abre el menú)
// ya cubre el 100% de los casos reales en un formulario donde todo es obligatorio.
//
// Además, en los campos con `searchable`: 1) filtra por palabra en cualquier lugar de la
// opción (no solo desde el principio, igual que Modelo — ver matchesSearchQuery) y 2) al
// apretar Enter, si hay algo tipeado, elige directo la primera opción que matchea (antes
// había que bajar con la flecha para resaltarla).
export function RequiredDropdown({ onChange, onClear, searchable, options, ...props }) {
  const [query, setQuery] = useState('')

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || !searchable || !query.trim()) return
    const match = (options ?? []).find((o) => matchesSearchQuery(o.label, query))
    if (match) {
      e.preventDefault()
      onChange(match)
      setQuery('')
    }
  }

  return (
    <div onKeyDown={handleKeyDown}>
      <Dropdown
        clearable={false}
        searchable={searchable}
        options={options}
        filterOption={searchable ? (option, inputValue) => matchesSearchQuery(option.label, inputValue) : undefined}
        onInputChange={searchable ? (input) => setQuery(input ?? '') : undefined}
        onChange={(option) => {
          setQuery('')
          onChange(option)
        }}
        onClear={onClear ?? (() => onChange(null))}
        {...props}
      />
    </div>
  )
}

// A pedido, estética tipo mockup: 2 tarjetas sueltas con ícono (documento/lápiz) en vez
// del control segmentado unido de antes — mismo componente para las 2 preguntas
// "¿Tenés la Cédula o Carta del vehículo?" (paso 3) y "¿Tenés la Cédula de Identidad de
// la persona?" (paso 1, Crear Lead) para que las 2 se vean iguales. Mismos valores reales
// ("Si"/"No") que ya usaba el toggle viejo, solo cambia el control visual.
export function DocumentChoiceToggle({
  value,
  onChange,
  yesLabel = 'Sí, tengo el documento',
  noLabel = 'No, ingresar manualmente',
}) {
  return (
    <div className="crear-op__risk-toggle">
      <button
        type="button"
        className={
          value === 'Si' ? 'crear-op__risk-option crear-op__risk-option--active' : 'crear-op__risk-option'
        }
        onClick={() => onChange('Si')}
      >
        <MdDescription className="crear-op__risk-option-icon" />
        {yesLabel}
      </button>
      <button
        type="button"
        className={
          value === 'No' ? 'crear-op__risk-option crear-op__risk-option--active' : 'crear-op__risk-option'
        }
        onClick={() => onChange('No')}
      >
        <MdEdit className="crear-op__risk-option-icon" />
        {noLabel}
      </button>
    </div>
  )
}

// A pedido: título de sección con ícono en círculo de color al lado (mockup) en vez del
// texto solo — reusado por las 3 secciones tituladas del paso 1 (Datos personales/
// Contacto/Ubicación, ver más abajo).
export function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="crear-op__section-title-row">
      <span className="crear-op__section-icon">
        <Icon />
      </span>
      <h3 className="crear-op__section-title">{children}</h3>
    </div>
  )
}

// Fila de Teléfono, reusada tanto por el formulario manual ("No tengo la Cédula") como
// por el perfil leído con IA ("Sí" + lectura ok) — la IA no devuelve teléfono, así que
// en los 2 casos hay que pedirlo aparte.
export function TelefonoField({ form, handleChange, resetKey }) {
  return (
    <div className="crear-op__section">
      <SectionTitle icon={MdCall}>Contacto</SectionTitle>
      <div className="crear-op__fields--grid">
        <label className="crear-op__field crear-op__field--full">
          <span>Teléfono <Required /></span>
          <div className="crear-op__phone">
            <div className="crear-op__phone-code">
              <RequiredDropdown
                size="medium"
                options={CODIGO_PAIS_OPTIONS}
                value={CODIGO_PAIS_OPTIONS.find((o) => o.value === form.codigoPais) ?? null}
                onChange={(option) => handleChange('codigoPais', option?.value ?? '')}
              />
            </div>
            <TextField
              key={`telefono-${resetKey}`}
              wrapperClassName="crear-op__phone-number"
              placeholder="Ej: 099 123 456"
              value={form.telefono}
              onChange={(value) => handleChange('telefono', value)}
              icon={MdClear}
              onIconClick={() => handleChange('telefono', '')}
              validation={
                telefonoError(form.telefono, form.codigoPais)
                  ? { status: 'error' }
                  : form.telefono
                    ? { status: 'success' }
                    : undefined
              }
            />
          </div>
          {telefonoError(form.telefono, form.codigoPais) && (
            <span className="crear-op__field-error" role="alert">{telefonoError(form.telefono, form.codigoPais)}</span>
          )}
        </label>
        {/* A pedido: Email del Cliente/Lead (columna email_mm6539g3 de Clientes). Opcional,
            pero si se carga se valida el formato (ver emailError). */}
        <label className="crear-op__field crear-op__field--full">
          <span>Email</span>
          <TextField
            key={`email-${resetKey}`}
            type="email"
            placeholder="Ej: nombre@dominio.com"
            value={form.email ?? ''}
            onChange={(value) => handleChange('email', value)}
            icon={MdClear}
            onIconClick={() => handleChange('email', '')}
            validation={
              emailError(form.email) ? { status: 'error' } : form.email?.trim() ? { status: 'success' } : undefined
            }
          />
          {emailError(form.email) && (
            <span className="crear-op__field-error" role="alert">{emailError(form.email)}</span>
          )}
        </label>
      </div>
    </div>
  )
}

// Título grande de cada paso (círculo azul numerado + texto, sin subtítulo) — mismo
// número que ese paso muestra en el Stepper de arriba (ver STEPS), así que el título
// nunca queda desincronizado del contador si algún día cambia el orden/cantidad de
// pasos. `number` a mano (no `stepIndex + 1`) porque el llamado a este componente vive
// adentro de un `{stepIndex === N && (...)}` puntual, no en un .map — no hay de dónde
// sacar el índice ahí. aria-hidden en el círculo: es un adorno visual que repite un
// número que un lector de pantalla ya anuncia por otro lado (el Stepper es navegable
// con aria-selected, ver Stepper.jsx), no hace falta leerlo de nuevo acá.
export function StepHeading({ number, title, subtitle }) {
  return (
    <div className="crear-op__step-heading-wrap">
      <div className="crear-op__step-heading">
        <span className="crear-op__step-badge" aria-hidden="true">
          {number}
        </span>
        <span className="crear-op__step-title">{title}</span>
      </div>
      {subtitle && <p className="crear-op__step-subtitle">{subtitle}</p>}
    </div>
  )
}
