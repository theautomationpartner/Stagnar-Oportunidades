import { useState } from 'react'
import { AttentionBox, Modal, ModalContent, ModalFooter } from '@vibe/core'
import { Required } from './crear/FormPrimitives'
import { coberturaParaMostrar } from '../services/coberturaGroups'
import { deducibleFijoDeCobertura, formatDeducible } from '../services/pricingEngine'
import './CrearOportunidadForm.css'
import './CotizacionManualModal.css'

// Reunión del 24/09 — completar a mano una cotización que WINK trajo en 0 (no supo el
// valor, pero la aseguradora sí la cotiza: el vendedor lo saca del portal de la compañía).
// La compañía y la cobertura son las de la tarjeta; solo se cargan el costo y el deducible.
// El resto (opcionales, RC, bonificación) se ajusta después en la tarjeta.
//
// Una ya cargada a mano (raw.costoManual) se puede volver a editar: el popup arranca con
// los valores guardados. Si la cobertura fija su deducible (SANCOR, ver
// deducibleFijoDeCobertura) no se pide: se muestra y se guarda ese.
// También se puede vaciar (onVaciar): vuelve a quedar sin costo, como la trajo WINK. Pide
// confirmación antes, porque borra lo cargado.

// Solo números, punto y coma: los campos no aceptan letras.
const soloMonto = (v) => v.replace(/[^\d.,]/g, '')

export default function CotizacionManualModal({ raw, onGuardar, onVaciar, onClose }) {
  const editando = Boolean(raw.costoManual)
  const deducibleFijo = deducibleFijoDeCobertura(raw)
  const deducibleGuardado = raw.compania === 'SANCOR' ? raw.deducibleSancorUsd || raw.deducibleBase : raw.deducibleBase
  const [contado, setContado] = useState(editando && Number(raw.contado) > 0 ? String(raw.contado) : '')
  const [deducible, setDeducible] = useState(
    deducibleFijo != null ? String(deducibleFijo) : editando && deducibleGuardado ? String(deducibleGuardado) : ''
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false)

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

  const vaciar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await onVaciar()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  return (
    <Modal id="cotizacion-manual-modal" show onClose={onClose} size="small">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">
          {editando ? 'Editar cotización completada manualmente' : 'Completar cotización manualmente'}
        </h2>
        <p className="cotizacion-manual__ayuda">
          <strong>
            {raw.compania} · {coberturaParaMostrar(raw)}
          </strong>
          {editando
            ? ': el costo y el deducible se completaron manualmente. Corregilos si hace falta.'
            : ' vino sin costo en la cotización automática (WINK no lo trajo). Cargá el que da la compañía en su portal y la tarjeta queda lista para enviar.'}{' '}
          Opcionales, RC y bonificación se ajustan después en la tarjeta.
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
              onChange={(e) => setContado(soloMonto(e.target.value))}
            />
          </label>
          {deducibleFijo != null ? (
            <div className="crear-op__field">
              <span>Deducible ({moneda})</span>
              <span className="cotizacion-manual__fijo">
                <strong>{formatDeducible(raw.compania, deducibleFijo)}</strong>&nbsp;— lo fija la cobertura
              </span>
            </div>
          ) : (
            <label className="crear-op__field">
              <span>
                Deducible ({moneda}) <Required />
              </span>
              <input
                className="cotizacion-manual__input"
                inputMode="decimal"
                placeholder={raw.compania === 'SANCOR' ? 'Ej: 800' : 'Ej: 28000'}
                value={deducible}
                onChange={(e) => setDeducible(soloMonto(e.target.value))}
              />
            </label>
          )}
        </div>
        {editando && onVaciar && (
          <div className="cotizacion-manual__vaciar">
            {confirmandoVaciar ? (
              <>
                <span>El costo y el deducible vuelven a 0 y la tarjeta queda sin costo, como la trajo WINK.</span>
                <span className="cotizacion-manual__vaciar-acciones">
                  <button type="button" className="cotizacion-manual__link" disabled={guardando} onClick={() => setConfirmandoVaciar(false)}>
                    No
                  </button>
                  <button type="button" className="cotizacion-manual__vaciar-si" disabled={guardando} onClick={vaciar}>
                    {guardando ? 'Vaciando...' : 'Sí, vaciar'}
                  </button>
                </span>
              </>
            ) : (
              <button type="button" className="cotizacion-manual__link cotizacion-manual__link--peligro" onClick={() => setConfirmandoVaciar(true)}>
                Vaciar cotización (volver a 0)
              </button>
            )}
          </div>
        )}
        {error && (
          <AttentionBox type="danger" className="cotizacion-manual__aviso">
            {error}
          </AttentionBox>
        )}
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose }}
        primaryButton={{
          text: guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Guardar cotización',
          disabled: !puedeGuardar,
          onClick: guardar,
        }}
      />
    </Modal>
  )
}
