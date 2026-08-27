import { MdEdit, MdLocationOn, MdSmartphone } from 'react-icons/md'
import { Button } from '@vibe/core'
import FileUploadField from '../FileUploadField'
import { formatShortDate } from '../../services/format'

// Ficha de solo lectura de la persona elegida/leída en el paso 1 de "Crear Oportunidad"
// (auditoría: antes estaba escrita 2 veces casi idénticas en CrearOportunidadForm.jsx —
// una para un Cliente/Lead existente y otra para el Lead recién leído con IA; la única
// diferencia real era el badge de teléfono y qué popup abre "Editar"). Los estilos
// (.crear-op__ficha*) siguen en CrearOportunidadForm.css.
//
// - source: 'contacto' | 'lead' → tag "Cliente"/"Lead".
// - showTelefono: la ficha del Lead leído con IA no lo muestra (la IA no lo devuelve,
//   se pide aparte con TelefonoField justo debajo).
// - cedula: { file, uploading?, onChange } para el campo "Cédula de Identidad (frente)".
export default function PersonaFicha({
  form,
  selectedLocalidad,
  selectedDepartamento,
  source,
  showTelefono = true,
  onEdit,
  cedula,
  children,
}) {
  const ubicacion =
    [form.direccion, selectedLocalidad?.label, selectedDepartamento?.label].filter(Boolean).join(', ') ||
    'Sin ubicación cargada'

  return (
    <div className="crear-op__ficha">
      <div className="crear-op__ficha-header">
        <div className="crear-op__ficha-heading">
          <h2 className="crear-op__ficha-name">{`${form.nombre} ${form.apellido}`.trim() || '—'}</h2>
          <span className="crear-op__ficha-address">
            <MdLocationOn />
            {ubicacion}
          </span>
        </div>
        {onEdit && (
          <Button kind="tertiary" onClick={onEdit}>
            <MdEdit /> Editar
          </Button>
        )}
      </div>
      <div className="crear-op__ficha-badges">
        <span className="crear-op__ficha-badge">CI: {form.ci || '—'}</span>
        <span className="crear-op__ficha-badge">
          Nacimiento: {form.fechaNacimiento ? formatShortDate(form.fechaNacimiento) : '—'}
        </span>
        {showTelefono && (
          <span className="crear-op__ficha-badge">
            <MdSmartphone />
            {form.telefono ? `${form.codigoPais} ${form.telefono}` : '—'}
          </span>
        )}
      </div>
      <span className={`crear-op__source-tag crear-op__source-tag--${source}`}>
        {source === 'contacto' ? 'Cliente' : 'Lead'}
      </span>

      {/* A pedido: la Cédula de Identidad se muestra acá mismo (antes quedaba invisible
          hasta el resumen del paso 3) — mismo componente de archivo que el resto de la
          app: si ya tiene una la muestra con su preview, si no deja subir una nueva. */}
      {cedula && (
        <FileUploadField
          label="Cédula de Identidad (frente)"
          file={cedula.file}
          uploading={cedula.uploading}
          required={false}
          onUpload={cedula.onChange}
          onDelete={() => cedula.onChange(null)}
        />
      )}
      {children}
    </div>
  )
}
