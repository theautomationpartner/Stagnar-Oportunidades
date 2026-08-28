// Popups de edición de datos de un Cliente / Lead (paso 1) — extraídos de
// CrearOportunidadForm.jsx. Los dos comparten los campos de Fecha de nacimiento,
// Departamento/Localidad y Dirección (UbicacionFields/FechaNacimientoField de abajo);
// se mantienen como 2 componentes porque su contrato es distinto a propósito:
// - EditarContactoModal escribe DIRECTO en el Contacto real de monday y NO permite
//   tocar Nombre/Apellido/CI (datos de identidad de un Contacto ya dado de alta).
// - EditarLeadModal solo actualiza el `form` local (todavía no hay ítem) e incluye
//   Nombre/Apellido/CI porque son justo los datos que la IA pudo leer mal.
// Las validaciones (telefonoError/fechaError/ciError y los canSave) son las mismas
// que había antes de la extracción.
import { useState } from 'react'
import { MdClear } from 'react-icons/md'
import { Modal, ModalContent, ModalFooter, TextField } from '@vibe/core'
import { CODIGO_PAIS_OPTIONS, ciError, emailError, fechaError, fieldStateClass, maxFechaNacimiento, stripCi, telefonoError } from '../../services/personaFields'
import { Required, RequiredDropdown, codigoPaisDropdownProps } from './FormPrimitives'

// Localidades filtradas por el departamento elegido (antes copiado en los 2 popups y en
// otros 2 lugares del formulario) — mismo criterio: sin departamento, todas.
export function useLocalidadOptions(departamentoOptions, localidades, departamentoId, localidadId) {
  const selectedDepartamento = departamentoOptions.find((o) => o.value === departamentoId) ?? null
  const localidadOptions = localidades
    .filter((l) => !selectedDepartamento || l.departamento === selectedDepartamento.label)
    .map((l) => ({ value: l.id, label: l.name }))
  const selectedLocalidad = localidadOptions.find((o) => o.value === localidadId) ?? null
  return { selectedDepartamento, localidadOptions, selectedLocalidad }
}

function FechaNacimientoField({ value, onChange }) {
  const fechaErr = fechaError(value)
  return (
    <label className={`crear-op__field${fieldStateClass(value, fechaErr)}`}>
      <span>Fecha Nacimiento <Required /></span>
      <div className="crear-op__date-wrap">
        <input type="date" value={value} max={maxFechaNacimiento()} onChange={(e) => onChange(e.target.value)} />
      </div>
      {fechaErr && <span className="crear-op__field-error" role="alert">{fechaErr}</span>}
    </label>
  )
}

function UbicacionFields({
  departamentoOptions,
  selectedDepartamento,
  localidadOptions,
  selectedLocalidad,
  onDepartamentoChange,
  onLocalidadChange,
  direccion,
  onDireccionChange,
}) {
  return (
    <>
      <label className="crear-op__field">
        <span>Departamento <Required /></span>
        <RequiredDropdown
          options={departamentoOptions}
          value={selectedDepartamento}
          placeholder="Escribe para buscar resultados"
          searchable
          onChange={(option) => onDepartamentoChange(option?.value ?? '')}
        />
      </label>
      <label className="crear-op__field">
        <span>Localidad <Required /></span>
        <RequiredDropdown
          options={localidadOptions}
          value={selectedLocalidad}
          placeholder={selectedDepartamento ? 'Escribe para buscar resultados' : 'Elegí primero un departamento'}
          disabled={!selectedDepartamento}
          searchable
          onChange={(option) => onLocalidadChange(option?.value ?? '')}
        />
      </label>
      <label className={`crear-op__field crear-op__field--full${fieldStateClass(direccion, null)}`}>
        <span>Dirección (calle y número)</span>
        <input
          type="text"
          value={direccion}
          placeholder="Ej: Av. Italia 1234 apto 5"
          onChange={(e) => onDireccionChange(e.target.value)}
        />
      </label>
    </>
  )
}

// A pedido: popup para editar los datos del Contacto ya elegido directo desde acá — a
// diferencia del resto del form (que solo vive en esta Oportunidad hasta guardar), lo
// que se cambia acá escribe DE UNA en el Contacto real (ver handleSaveContacto en el
// componente principal). CI/Nombre/Apellido quedan afuera a propósito — son datos de
// identidad, no se tocan desde una Oportunidad puntual.
export function EditarContactoModal({ form, departamentoOptions, localidades, onSave, onClose, saving, error }) {
  const [fechaNacimiento, setFechaNacimiento] = useState(form.fechaNacimiento)
  const [codigoPais, setCodigoPais] = useState(form.codigoPais)
  const [telefono, setTelefono] = useState(form.telefono)
  const [email, setEmail] = useState(form.email ?? '')
  const [departamentoId, setDepartamentoId] = useState(form.departamentoId)
  const [localidadId, setLocalidadId] = useState(form.localidadId)
  const [direccion, setDireccion] = useState(form.direccion)

  const { selectedDepartamento, localidadOptions, selectedLocalidad } = useLocalidadOptions(
    departamentoOptions,
    localidades,
    departamentoId,
    localidadId
  )

  const telefonoErr = telefonoError(telefono, codigoPais)
  const fechaErr = fechaError(fechaNacimiento)
  const emailErr = emailError(email)
  // Dirección opcional (a pedido: se pide en el paso 3 de la oportunidad).
  const canSave = !telefonoErr && !fechaErr && !emailErr && departamentoId && localidadId

  return (
    <Modal id="editar-contacto-modal" show onClose={onClose} size="medium">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">Editar cliente</h2>
        {error && <p className="crear-op__error" role="alert">Error: {error}</p>}
        <div className="crear-op__fields--grid">
          <FechaNacimientoField value={fechaNacimiento} onChange={setFechaNacimiento} />
          <label className="crear-op__field crear-op__field--full">
            <span>Teléfono <Required /></span>
            <div className="crear-op__phone">
              <div className="crear-op__phone-code">
                <RequiredDropdown
                  size="medium"
                  options={CODIGO_PAIS_OPTIONS}
                  value={CODIGO_PAIS_OPTIONS.find((o) => o.value === codigoPais) ?? null}
                  {...codigoPaisDropdownProps}
                  onChange={(option) => setCodigoPais(option?.value ?? '')}
                />
              </div>
              <TextField
                size="medium"
                wrapperClassName="crear-op__phone-number"
                placeholder="Ej: 099 123 456"
                value={telefono}
                onChange={setTelefono}
                icon={MdClear}
                onIconClick={() => setTelefono('')}
                validation={telefonoErr ? { status: 'error' } : telefono ? { status: 'success' } : undefined}
              />
            </div>
            {telefonoErr && <span className="crear-op__field-error" role="alert">{telefonoErr}</span>}
          </label>
          <label className="crear-op__field crear-op__field--full">
            <span>Email</span>
            <TextField
              size="medium"
              type="email"
              placeholder="Ej: nombre@dominio.com"
              value={email}
              onChange={setEmail}
              icon={MdClear}
              onIconClick={() => setEmail('')}
              validation={emailErr ? { status: 'error' } : email.trim() ? { status: 'success' } : undefined}
            />
            {emailErr && <span className="crear-op__field-error" role="alert">{emailErr}</span>}
          </label>
          <UbicacionFields
            departamentoOptions={departamentoOptions}
            selectedDepartamento={selectedDepartamento}
            localidadOptions={localidadOptions}
            selectedLocalidad={selectedLocalidad}
            onDepartamentoChange={(value) => {
              setDepartamentoId(value)
              setLocalidadId('')
            }}
            onLocalidadChange={setLocalidadId}
            direccion={direccion}
            onDireccionChange={setDireccion}
          />
        </div>
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose, disabled: saving }}
        primaryButton={{
          text: saving ? 'Guardando...' : 'Guardar',
          disabled: !canSave || saving,
          onClick: () => onSave({ fechaNacimiento, codigoPais, telefono, email, departamentoId, localidadId, direccion }),
        }}
      />
    </Modal>
  )
}

// Popup "Editar" para el perfil de un Lead recién leído con IA (ver
// handleCedulaLeadChange en el componente principal) — todavía no hay ningún ítem
// creado: "Guardar" solo actualiza el `form` local, igual que cualquier campo tipeado a
// mano. Incluye Nombre/Apellido/CI: son justo los campos que la IA pudo haber leído mal.
export function EditarLeadModal({ form, departamentoOptions, localidades, onSave, onClose }) {
  const [nombre, setNombre] = useState(form.nombre)
  const [apellido, setApellido] = useState(form.apellido)
  const [ci, setCi] = useState(form.ci)
  const [fechaNacimiento, setFechaNacimiento] = useState(form.fechaNacimiento)
  const [departamentoId, setDepartamentoId] = useState(form.departamentoId)
  const [localidadId, setLocalidadId] = useState(form.localidadId)
  const [direccion, setDireccion] = useState(form.direccion)

  const { selectedDepartamento, localidadOptions, selectedLocalidad } = useLocalidadOptions(
    departamentoOptions,
    localidades,
    departamentoId,
    localidadId
  )

  const ciErr = ciError(ci)
  const fechaErr = fechaError(fechaNacimiento)
  const canSave =
    nombre.trim() &&
    apellido.trim() &&
    ci.trim() &&
    !ciErr &&
    fechaNacimiento &&
    !fechaErr &&
    departamentoId &&
    localidadId

  return (
    <Modal id="editar-lead-modal" show onClose={onClose} size="medium">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">Editar datos personales</h2>
        <div className="crear-op__fields--grid">
          <label className="crear-op__field">
            <span>Nombre <Required /></span>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="crear-op__field">
            <span>Apellido <Required /></span>
            <input type="text" value={apellido} onChange={(e) => setApellido(e.target.value)} />
          </label>
          <label className={`crear-op__field${fieldStateClass(ci, ciErr)}`}>
            <span>CI <Required /></span>
            <input type="text" value={ci} onChange={(e) => setCi(e.target.value)} />
            {ciErr && <span className="crear-op__field-error" role="alert">{ciErr}</span>}
          </label>
          <FechaNacimientoField value={fechaNacimiento} onChange={setFechaNacimiento} />
          <UbicacionFields
            departamentoOptions={departamentoOptions}
            selectedDepartamento={selectedDepartamento}
            localidadOptions={localidadOptions}
            selectedLocalidad={selectedLocalidad}
            onDepartamentoChange={(value) => {
              setDepartamentoId(value)
              setLocalidadId('')
            }}
            onLocalidadChange={setLocalidadId}
            direccion={direccion}
            onDireccionChange={setDireccion}
          />
        </div>
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose }}
        primaryButton={{
          text: 'Guardar',
          disabled: !canSave,
          onClick: () =>
            onSave({ nombre, apellido, ci: stripCi(ci), fechaNacimiento, departamentoId, localidadId, direccion }),
        }}
      />
    </Modal>
  )
}
