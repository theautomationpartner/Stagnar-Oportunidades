import { Modal, ModalContent, ModalFooter } from '@vibe/core'
import { MdClose, MdWarningAmber, MdSearch } from 'react-icons/md'
import './AlertModal.css'

// A pedido: mismo pop up para TODOS los avisos de error/advertencia de la app —
// ícono en círculo de color (rojo con X para error, amarillo con ⚠ para advertencia,
// celeste con lupa para un aviso neutro/informativo, mismo look que ya tenía el
// popup de "Cédula duplicada" en CrearOportunidadForm.jsx, del que sale este
// componente) + título + descripción, con una lista opcional de detalles (ej. campos
// faltantes) y 1 o 2 botones al pie.
const ICON_BY_TYPE = {
  error: MdClose,
  warning: MdWarningAmber,
  info: MdSearch,
}

export default function AlertModal({
  id,
  type = 'error',
  title,
  description,
  detailsTitle,
  detailsList,
  // 'negative' (default): texto rojo — la lista son ítems que faltan/fallan (ej.
  // "Campos pendientes"). 'neutral': texto normal — la lista son opciones válidas para
  // elegir (ej. "Modelos disponibles"), no errores.
  detailsTone = 'negative',
  // { text, onClick, danger? } — danger pinta el botón primario en rojo (ej.
  // "Reintentar" sobre un error real, no una simple confirmación).
  primaryButton,
  secondaryButton,
  onClose,
}) {
  const Icon = ICON_BY_TYPE[type] ?? ICON_BY_TYPE.info
  // Sin secondaryButton, el primario ocupa todo el ancho (ver mockup "Faltan datos
  // requeridos": un solo botón de punta a punta) — con los 2, quedan lado a lado como
  // ya hacía el popup de "Cédula duplicada".
  const primaryClassName = [primaryButton?.danger && 'alert-modal__btn--danger', !secondaryButton && 'alert-modal__btn--full']
    .filter(Boolean)
    .join(' ')

  return (
    <Modal id={id} show onClose={onClose} size="small">
      <ModalContent className={`alert-modal__content alert-modal__content--${type}`}>
        <span className="alert-modal__icon">
          <Icon />
        </span>
        <h2 className="alert-modal__title">{title}</h2>
        {description && <p className="alert-modal__desc">{description}</p>}
        {detailsList?.length > 0 && (
          <div className={`alert-modal__details alert-modal__details--${detailsTone}`}>
            {detailsTitle && <span className="alert-modal__details-title">{detailsTitle}</span>}
            <ul>
              {detailsList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <hr className="alert-modal__divider" />
      </ModalContent>
      <ModalFooter
        secondaryButton={secondaryButton}
        primaryButton={primaryButton && { ...primaryButton, className: primaryClassName || undefined }}
      />
    </Modal>
  )
}
