// A pedido: "Duplicar oportunidad" se puede hacer desde el detalle y desde cada fila de la
// tabla de Oportunidades. Este componente es el flujo completo, el mismo en los dos
// lugares: el popup de elección (DuplicarOportunidadModal), la creación
// (duplicarOportunidad.js) y el aviso si algo secundario no salió.
//   - opportunity: la oportunidad ya mapeada (el detalle la tiene a mano).
//   - opportunityId: si no viene `opportunity` (desde la tabla), se trae su detalle
//     completo — la fila de la lista no tiene el vehículo, el contacto ni la zona.
//   onAbrir(id): abrir la oportunidad nueva. onClose: cerrar sin duplicar.
import { useEffect, useState } from 'react'
import { Modal, ModalContent, ModalFooter } from '@vibe/core'
import { fetchOpportunityDetail } from '../services/mondayApi'
import { mapOpportunityItem } from '../services/opportunityMapper'
import { duplicarOportunidad } from '../services/duplicarOportunidad'
import DuplicarOportunidadModal from './DuplicarOportunidadModal'
import AlertModal from './AlertModal'
import './CrearOportunidadForm.css'

export default function DuplicarOportunidad({ opportunity: dada, opportunityId, departamentos, localidades, onAbrir, onClose }) {
  const [opportunity, setOpportunity] = useState(dada ?? null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [aviso, setAviso] = useState(null) // { id, texto } si la copia salió con algo pendiente

  useEffect(() => {
    if (dada) return undefined
    let vivo = true
    fetchOpportunityDetail(opportunityId)
      .then((item) => {
        if (!vivo) return
        if (!item) throw new Error('No se encontró la oportunidad en monday.')
        setOpportunity(mapOpportunityItem(item))
      })
      .catch((err) => vivo && setErrorCarga(err.message))
    return () => {
      vivo = false
    }
  }, [dada, opportunityId])

  const duplicar = async (eleccion) => {
    const { id, avisos } = await duplicarOportunidad(opportunity, eleccion)
    // Si algo secundario no salió (la Carta del automóvil), se avisa antes de abrirla:
    // al abrir la nueva, la pantalla de atrás se desmonta y el aviso se perdería.
    if (avisos.length) setAviso({ id, texto: avisos.join(' ') })
    else onAbrir(id)
  }

  if (aviso) {
    return (
      <AlertModal
        id="duplicada-aviso"
        type="warning"
        title="La oportunidad se duplicó"
        description={`${aviso.texto} Podés subirla a mano en la oportunidad nueva.`}
        primaryButton={{ text: 'Abrir la oportunidad nueva', onClick: () => onAbrir(aviso.id) }}
        secondaryButton={{ text: 'Quedarme acá', onClick: onClose }}
        onClose={onClose}
      />
    )
  }

  if (!opportunity) {
    return (
      <Modal id="duplicar-oportunidad-cargando" show onClose={onClose} size="small">
        <ModalContent className="crear-op__editar-contacto-content">
          <h2 className="crear-op__editar-contacto-title">Duplicar oportunidad</h2>
          {errorCarga ? (
            <p className="crear-op__error" role="alert">
              No se pudieron traer los datos de la oportunidad: {errorCarga}
            </p>
          ) : (
            <p className="crear-op__section-hint">Trayendo los datos de la oportunidad…</p>
          )}
        </ModalContent>
        <ModalFooter primaryButton={{ text: 'Cerrar', onClick: onClose }} />
      </Modal>
    )
  }

  return (
    <DuplicarOportunidadModal
      opportunity={opportunity}
      departamentos={departamentos ?? []}
      localidades={localidades ?? []}
      onDuplicar={duplicar}
      onClose={onClose}
    />
  )
}
