import { MdEdit, MdLocationOn, MdPublic } from 'react-icons/md'
import { Button } from '@vibe/core'
import FileUploadField from '../FileUploadField'
import { formatShortDate } from '../../services/format'

// Ficha de solo lectura de la persona elegida/leída en el paso 1 de "Crear Oportunidad"
// (auditoría: antes estaba escrita 2 veces casi idénticas en CrearOportunidadForm.jsx —
// una para un Cliente/Lead existente y otra para el Lead recién leído con IA). Los
// estilos (.crear-op__ficha*) siguen en CrearOportunidadForm.css.
//
// MON-14: acá va solo el CLIENTE (a quien se le cotiza). El Teléfono y el Email ya no
// salen en esta ficha: son del Contacto, y se muestran y editan en su propia sección
// (ver ContactoFields) — repetirlos acá daba a entender que eran datos del cliente.
//
// - source: 'contacto' | 'lead' → tag "Cliente"/"Lead".
// - cedula: { file, uploading?, onChange } para el campo "Cédula de Identidad (frente)".
export default function PersonaFicha({
  form,
  selectedLocalidad,
  selectedDepartamento,
  source,
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
        {/* LOG-06: la ficha es de solo lectura, así que la Nacionalidad se muestra
            SIEMPRE (no solo cuando es extranjero) — es la única pista de que quedó en
            URUGUAY por defecto y hay que corregirla desde "Editar" si la persona es del
            exterior (la lectura con IA no lo puede deducir: un documento que no se pudo
            leer se ve igual que uno extranjero). */}
        <span className="crear-op__ficha-badge">
          <MdPublic />
          {form.extranjero === 'Si'
            ? `Extranjero · ${form.nacionalidad || 'Sin nacionalidad'}`
            : form.nacionalidad || 'Sin nacionalidad'}
        </span>
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
