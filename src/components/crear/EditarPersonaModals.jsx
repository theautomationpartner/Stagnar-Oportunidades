// Popups de edición de datos de un Cliente / Lead (paso 1) — extraídos de
// CrearOportunidadForm.jsx. Comparten ~70% del código; se mantienen como 2 componentes
// para no alterar el comportamiento de cada uno.
import { useState } from 'react'
import { MdClear } from 'react-icons/md'
import { Modal, ModalContent, ModalFooter, TextField } from '@vibe/core'
import { CODIGO_PAIS_OPTIONS, ciError, fechaError, fieldStateClass, maxFechaNacimiento, stripCi, telefonoError } from '../../services/personaFields'
import { Required, RequiredDropdown } from './FormPrimitives'

// A pedido: popup para editar los datos del Contacto ya elegido directo desde acá — a
// diferencia del resto del form (que solo vive en esta Oportunidad hasta guardar), lo
// que se cambia acá escribe DE UNA en el Contacto real (ver handleSaveContacto en el
// componente principal). CI/Nombre/Apellido quedan afuera a propósito — son datos de
// identidad, no se tocan desde una Oportunidad puntual.
export function EditarContactoModal({ form, departamentoOptions, localidades, onSave, onClose, saving, error }) {
  const [fechaNacimiento, setFechaNacimiento] = useState(form.fechaNacimiento)
  const [codigoPais, setCodigoPais] = useState(form.codigoPais)
  const [telefono, setTelefono] = useState(form.telefono)
  const [departamentoId, setDepartamentoId] = useState(form.departamentoId)
  const [localidadId, setLocalidadId] = useState(form.localidadId)
  const [direccion, setDireccion] = useState(form.direccion)

  const selectedDepartamento = departamentoOptions.find((o) => o.value === departamentoId) ?? null
  const localidadOptions = localidades
    .filter((l) => !selectedDepartamento || l.departamento === selectedDepartamento.label)
    .map((l) => ({ value: l.id, label: l.name }))
  const selectedLocalidad = localidadOptions.find((o) => o.value === localidadId) ?? null

  const telefonoErr = telefonoError(telefono, codigoPais)
  const fechaErr = fechaError(fechaNacimiento)
  const canSave = !telefonoErr && !fechaErr && departamentoId && localidadId && direccion.trim()

  return (
    <Modal id="editar-contacto-modal" show onClose={onClose} size="medium">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">Editar cliente</h2>
        {error && <p className="crear-op__error">Error: {error}</p>}
        <div className="crear-op__fields--grid">
          <label className={`crear-op__field${fieldStateClass(fechaNacimiento, fechaErr)}`}>
            <span>Fecha Nacimiento <Required /></span>
            <div className="crear-op__date-wrap">
              <input
                type="date"
                value={fechaNacimiento}
                max={maxFechaNacimiento()}
                onChange={(e) => setFechaNacimiento(e.target.value)}
              />
            </div>
            {fechaErr && <span className="crear-op__field-error" role="alert">{fechaErr}</span>}
          </label>
          <label className="crear-op__field crear-op__field--full">
            <span>Teléfono <Required /></span>
            <div className="crear-op__phone">
              <div className="crear-op__phone-code">
                <RequiredDropdown
                  size="medium"
                  options={CODIGO_PAIS_OPTIONS}
                  value={CODIGO_PAIS_OPTIONS.find((o) => o.value === codigoPais) ?? null}
                  onChange={(option) => setCodigoPais(option?.value ?? '')}
                />
              </div>
              <TextField
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
          <label className="crear-op__field">
            <span>Departamento <Required /></span>
            <RequiredDropdown
              options={departamentoOptions}
              value={selectedDepartamento}
              placeholder="Escribe para buscar resultados"
              searchable
              onChange={(option) => {
                setDepartamentoId(option?.value ?? '')
                setLocalidadId('')
              }}
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
              onChange={(option) => setLocalidadId(option?.value ?? '')}
            />
          </label>
          <label className={`crear-op__field crear-op__field--full${fieldStateClass(direccion, null)}`}>
            <span>Dirección (calle y número) <Required /></span>
            <input
              type="text"
              value={direccion}
              placeholder="Ej: Av. Italia 1234 apto 5"
              onChange={(e) => setDireccion(e.target.value)}
            />
          </label>
        </div>
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose, disabled: saving }}
        primaryButton={{
          text: saving ? 'Guardando...' : 'Guardar',
          disabled: !canSave || saving,
          onClick: () => onSave({ fechaNacimiento, codigoPais, telefono, departamentoId, localidadId, direccion }),
        }}
      />
    </Modal>
  )
}

// Popup "Editar" para el perfil de un Lead recién leído con IA (ver
// handleCedulaLeadChange más abajo) — a diferencia de EditarContactoModal (que escribe
// DIRECTO a un Contacto real que ya existe en monday), acá todavía no hay ningún ítem
// creado: "Guardar" solo actualiza el `form` local, igual que cualquier campo tipeado a
// mano. Por eso también incluye Nombre/Apellido/CI (EditarContactoModal los deja
// afuera a propósito, son datos de identidad de un Contacto ya dado de alta) — acá son
// justo los campos que la IA pudo haber leído mal y hay que poder corregir.
export function EditarLeadModal({ form, departamentoOptions, localidades, onSave, onClose }) {
  const [nombre, setNombre] = useState(form.nombre)
  const [apellido, setApellido] = useState(form.apellido)
  const [ci, setCi] = useState(form.ci)
  const [fechaNacimiento, setFechaNacimiento] = useState(form.fechaNacimiento)
  const [departamentoId, setDepartamentoId] = useState(form.departamentoId)
  const [localidadId, setLocalidadId] = useState(form.localidadId)
  const [direccion, setDireccion] = useState(form.direccion)

  const selectedDepartamento = departamentoOptions.find((o) => o.value === departamentoId) ?? null
  const localidadOptions = localidades
    .filter((l) => !selectedDepartamento || l.departamento === selectedDepartamento.label)
    .map((l) => ({ value: l.id, label: l.name }))
  const selectedLocalidad = localidadOptions.find((o) => o.value === localidadId) ?? null

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
    localidadId &&
    direccion.trim()

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
          <label className={`crear-op__field${fieldStateClass(fechaNacimiento, fechaErr)}`}>
            <span>Fecha Nacimiento <Required /></span>
            <div className="crear-op__date-wrap">
              <input
                type="date"
                value={fechaNacimiento}
                max={maxFechaNacimiento()}
                onChange={(e) => setFechaNacimiento(e.target.value)}
              />
            </div>
            {fechaErr && <span className="crear-op__field-error" role="alert">{fechaErr}</span>}
          </label>
          <label className="crear-op__field">
            <span>Departamento <Required /></span>
            <RequiredDropdown
              options={departamentoOptions}
              value={selectedDepartamento}
              placeholder="Escribe para buscar resultados"
              searchable
              onChange={(option) => {
                setDepartamentoId(option?.value ?? '')
                setLocalidadId('')
              }}
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
              onChange={(option) => setLocalidadId(option?.value ?? '')}
            />
          </label>
          <label className={`crear-op__field crear-op__field--full${fieldStateClass(direccion, null)}`}>
            <span>Dirección (calle y número) <Required /></span>
            <input
              type="text"
              value={direccion}
              placeholder="Ej: Av. Italia 1234 apto 5"
              onChange={(e) => setDireccion(e.target.value)}
            />
          </label>
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
