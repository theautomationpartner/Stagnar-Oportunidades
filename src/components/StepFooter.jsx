import { Button } from '@vibe/core'
import { MdArrowBack } from 'react-icons/md'
import './StepFooter.css'

// Barra de navegación compartida por los 4 pasos de una Oportunidad (Cotizar/Comparar y
// enviar/Confirmar/Emitir) — a pedido, antes cada paso tenía su propia versión, todas
// distintas entre sí: Cotizar no era sticky (solo un borde arriba, al final del
// contenido); Confirmar era una tarjeta flotante con esquinas redondeadas separada del
// borde (bottom:16px); Emitir ni siquiera tenía un footer propio, el botón vivía
// adentro de un FileUploadField; Comparar y enviar era la única ya pegada de punta a
// punta abajo del todo. Ahora los 4 usan este mismo componente. Mismo criterio que
// .crear-op__footer (CrearOportunidadForm.css, "Agregar Oportunidad"): position:sticky
// (no fixed, para que respete el padding de página cuando se llega al final de verdad
// en vez de taparlo) + "Volver" siempre a la izquierda, para poder ir y venir entre
// pasos sin tener que subir a tocar el Stepper. `extraLeft` es contenido opcional al
// lado de "Volver" (ej. el contador de opciones seleccionadas en Comparar y enviar).
export default function StepFooter({ onBack, backLabel = 'Volver', backDisabled = false, extraLeft, children }) {
  return (
    <div className="step-footer">
      <div className="step-footer__left">
        {onBack && (
          <Button kind="secondary" className="step-footer__back" onClick={onBack} disabled={backDisabled}>
            <MdArrowBack /> {backLabel}
          </Button>
        )}
        {extraLeft}
      </div>
      <div className="step-footer__right">{children}</div>
    </div>
  )
}
