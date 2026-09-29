import { useState } from 'react'
import { AttentionBox, Modal, ModalContent, ModalFooter } from '@vibe/core'
import { Required } from './crear/FormPrimitives'
import { coberturaParaMostrar } from '../services/coberturaGroups'
import './CrearOportunidadForm.css'
import './CotizacionManualModal.css'

// Reunión del 24/09 — completar a mano una cotización que WINK trajo en 0 (no supo el
// valor, pero la aseguradora sí la cotiza: el vendedor lo saca del portal de la compañía).
// La compañía y la cobertura son las de la tarjeta; solo se cargan el costo y el deducible.
// El resto (opcionales, RC, bonificación) se ajusta después en la tarjeta.
export default function CotizacionManualModal({ raw, onGuardar, onClose }) {
  const [contado, setContado] = useState('')
  const [deducible, setDeducible] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const moneda = raw.compania === 'SANCOR' ? 'USD' : '$'
  // Acepta "42.960" (miles con punto) y "42960,50" (decimales con coma).
  const numero = (v) => Number(String(v).trim().replace(/\./g, '').replace(',', '.'))
  const contadoOk = contado.trim() !== '' && numero(contado) > 0
  const deducibleOk = deducible.trim() !== '' && numero(deducible) >= 0
  const puedeGuardar = contadoOk && deducibleOk && !guardando

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await onGuardar({ contado: numero(contado), deducible: numero(deducible) })
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  return (
    <Modal id="cotizacion-manual-modal" show onClose={onClose} size="small">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">Cargar costo a mano</h2>
        <p className="cotizacion-manual__ayuda">
          <strong>
            {raw.compania} · {coberturaParaMostrar(raw)}
          </strong>{' '}
          vino en 0 en la cotización automática. Cargá el costo y el deducible que da la compañía; opcionales, RC y
          bonificación se ajustan después en la tarjeta.
        </p>
        <div className="cotizacion-manual__campos">
          <label className="crear-op__field">
            <span>
              Costo contado ($) <Required />
            </span>
            <input
              className="cotizacion-manual__input"
              inputMode="decimal"
              placeholder="Ej: 42960"
              value={contado}
              onChange={(e) => setContado(e.target.value)}
            />
          </label>
          <label className="crear-op__field">
            <span>
              Deducible ({moneda}) <Required />
            </span>
            <input
              className="cotizacion-manual__input"
              inputMode="decimal"
              placeholder={raw.compania === 'SANCOR' ? 'Ej: 800' : 'Ej: 28000'}
              value={deducible}
              onChange={(e) => setDeducible(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <AttentionBox type="danger" className="cotizacion-manual__aviso">
            {error}
          </AttentionBox>
        )}
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose }}
        primaryButton={{
          text: guardando ? 'Guardando...' : 'Guardar costo',
          disabled: !puedeGuardar,
          onClick: guardar,
        }}
      />
    </Modal>
  )
}
