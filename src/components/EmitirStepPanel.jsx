import { MdCheckCircle } from 'react-icons/md'
import { formatMoney } from '../services/format'
import { accentForCompania } from '../services/companyColors'
import DocumentUploadRow from './DocumentUploadRow'
import './EmitirStepPanel.css'

// Resumen final de todos los datos con los que se cerró la oportunidad: cliente, bien
// asegurado y la propuesta que quedó elegida en el paso 3 — última revisión antes de
// cargar la póliza. No repite el checklist "falta/no falta" del paso 3 (ya se validó
// ahí); acá se listan los valores tal cual quedaron.
const CLIENTE_FIELDS = [
  { key: 'clienteNombre', label: 'Cliente' },
  { key: 'ci', label: 'CI' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'fechaNacimiento', label: 'Fecha de nacimiento' },
  { key: 'departamento', label: 'Departamento' },
]

const BIEN_FIELDS = [
  { key: 'marca', label: 'Marca' },
  { key: 'modelo', label: 'Modelo' },
  { key: 'anio', label: 'Año' },
  { key: 'combustible', label: 'Combustible' },
  { key: 'uso', label: 'Uso' },
]

export default function EmitirStepPanel({
  opportunity,
  groups,
  concretada,
  polizaFileName,
  uploading,
  deleting,
  error,
  onUploadPoliza,
  onDeletePoliza,
}) {
  const elegida = groups.flatMap((g) => g.entries).find((e) => e.raw.propuestaElegida)
  const accent = elegida ? accentForCompania(elegida.raw.compania) : null

  return (
    <div className="emitir-step">
      {concretada && (
        <div className="emitir-step__banner">
          <MdCheckCircle /> Póliza cargada — la oportunidad se marcó como <strong>Concretada</strong>.
        </div>
      )}

      <div className="emitir-step__section">
        <h2 className="emitir-step__title">Resumen final</h2>
        <p className="emitir-step__subtitle">
          Última revisión de los datos antes de cargar la póliza.
        </p>

        <div className="emitir-step__columns">
          <div className="emitir-step__column">
            <div className="emitir-step__subtitle-label">Cliente</div>
            <div className="emitir-step__grid">
              {CLIENTE_FIELDS.map((f) => (
                <div className="emitir-step__field" key={f.key}>
                  <span>{f.label}</span>
                  <strong>{opportunity[f.key] || '—'}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="emitir-step__column">
            <div className="emitir-step__subtitle-label">Bien asegurado</div>
            <div className="emitir-step__grid">
              {BIEN_FIELDS.map((f) => (
                <div className="emitir-step__field" key={f.key}>
                  <span>{f.label}</span>
                  <strong>{opportunity[f.key] || '—'}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {elegida && !elegida.quote.blocked && (
          <>
            <div className="emitir-step__subtitle-label">Propuesta elegida</div>
            <div className="emitir-step__chosen" style={{ borderLeftColor: accent }}>
              <div className="emitir-step__chosen-head">
                <span style={{ color: accent }}>{elegida.raw.compania}</span>
                <span>{elegida.raw.cobertura || elegida.raw.name}</span>
              </div>
              <div className="emitir-step__grid">
                <div className="emitir-step__field">
                  <span>Deducible</span>
                  <strong>{elegida.quote.deducibleDisplay}</strong>
                </div>
                <div className="emitir-step__field">
                  <span>3 cuotas</span>
                  <strong>{formatMoney(elegida.quote.cuotas[3].valor)}</strong>
                </div>
                <div className="emitir-step__field">
                  <span>6 cuotas</span>
                  <strong>{formatMoney(elegida.quote.cuotas[6].valor)}</strong>
                </div>
                <div className="emitir-step__field">
                  <span>8 cuotas</span>
                  <strong>{formatMoney(elegida.quote.cuotas[8].valor)}</strong>
                </div>
                <div className="emitir-step__field">
                  <span>10 cuotas</span>
                  <strong>{formatMoney(elegida.quote.cuotas[10].valor)}</strong>
                </div>
                <div className="emitir-step__field">
                  <span>Total</span>
                  <strong>{formatMoney(elegida.quote.total)}</strong>
                </div>
              </div>
            </div>
          </>
        )}

        {!elegida && (
          <p className="emitir-step__empty">
            Todavía no se eligió una propuesta en el paso 3 — se puede cargar la póliza igual,
            pero conviene volver a "Confirmar" y elegir una antes de emitir.
          </p>
        )}
      </div>

      <div className="emitir-step__section">
        <h2 className="emitir-step__title">Póliza</h2>
        <p className="emitir-step__subtitle">
          Subí el PDF (u otro archivo) de la póliza emitida por la compañía. Al cargarla, la
          oportunidad pasa automáticamente a "Concretada".
        </p>
        <DocumentUploadRow
          label="Póliza"
          fileName={polizaFileName}
          uploading={uploading}
          deleting={deleting}
          error={error}
          onUpload={onUploadPoliza}
          onDelete={onDeletePoliza}
        />
      </div>
    </div>
  )
}
