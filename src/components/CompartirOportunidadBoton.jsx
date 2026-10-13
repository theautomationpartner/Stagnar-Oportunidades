// A pedido: "Copiar link de la oportunidad" — el mismo botón en cada fila de la tabla y en
// el encabezado del detalle (ver compartirOportunidad.js). Solo el ícono; el texto sale al
// pasar el mouse. Al copiar, el ícono pasa a ✓ unos segundos. Si el navegador no deja
// escribir en el portapapeles, se muestra el link seleccionado para copiarlo a mano.
import { useEffect, useRef, useState } from 'react'
import { IconButton, Modal, ModalContent, ModalFooter } from '@vibe/core'
import { MdCheck, MdLink } from 'react-icons/md'
import { copiarTexto, linkDeOportunidad } from '../services/compartirOportunidad'
import './CrearOportunidadForm.css'

export default function CompartirOportunidadBoton({ opportunityId, oppNumber, kind = 'tertiary', className }) {
  const [copiado, setCopiado] = useState(false)
  const [aMano, setAMano] = useState(null) // el link, si hay que copiarlo a mano
  const campoRef = useRef(null)

  useEffect(() => {
    if (!copiado) return undefined
    const t = setTimeout(() => setCopiado(false), 2500)
    return () => clearTimeout(t)
  }, [copiado])

  useEffect(() => {
    if (aMano) campoRef.current?.select()
  }, [aMano])

  const copiar = async (e) => {
    // En la tabla, que no abra la oportunidad (el clic de la fila).
    e?.stopPropagation?.()
    const link = linkDeOportunidad(opportunityId)
    if (await copiarTexto(link)) setCopiado(true)
    else setAMano(link)
  }

  return (
    <>
      <IconButton
        kind={kind}
        size="small"
        icon={copiado ? MdCheck : MdLink}
        ariaLabel={`Copiar link de la oportunidad${oppNumber ? ' ' + oppNumber : ''}`}
        tooltipContent={copiado ? 'Link copiado' : 'Copiar link de la oportunidad'}
        className={className}
        onClick={copiar}
      />
      <span aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {copiado ? 'Link de la oportunidad copiado' : ''}
      </span>
      {aMano && (
        <Modal id="compartir-oportunidad-modal" show onClose={() => setAMano(null)} size="medium">
          <ModalContent className="crear-op__editar-contacto-content">
            <h2 className="crear-op__editar-contacto-title">Link de la oportunidad</h2>
            <p className="crear-op__section-hint">
              El navegador no dejó copiarlo solo: copialo de acá (ya está seleccionado, Ctrl+C).
            </p>
            <input
              ref={campoRef}
              type="text"
              readOnly
              value={aMano}
              onFocus={(e) => e.target.select()}
              style={{ width: '100%', padding: '8px 10px', font: 'inherit', fontSize: 13 }}
            />
          </ModalContent>
          <ModalFooter primaryButton={{ text: 'Cerrar', onClick: () => setAMano(null) }} />
        </Modal>
      )}
    </>
  )
}
