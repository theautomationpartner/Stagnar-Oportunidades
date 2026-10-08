// A pedido: antes de escribir en monday los datos de un cliente o contacto desde el flujo
// de oportunidades, se pide confirmar. Esos datos no son de la oportunidad: son de la
// ficha (tablero Clientes o Contactos) y el cambio se ve en todo el sistema. Solo si se
// confirma se guarda; "Cancelar" vuelve al popup de edición sin perder lo cargado.
//   entidad: 'cliente' | 'contacto'
import AlertModal from './AlertModal'

const TABLERO = { cliente: 'Clientes', contacto: 'Contactos' }

export default function ConfirmarCambioModal({ entidad = 'contacto', nombre, onConfirmar, onCancelar }) {
  const de = entidad === 'cliente' ? 'del cliente' : 'del contacto'
  return (
    <AlertModal
      id="confirmar-cambio-modal"
      type="warning"
      title={`Atención: estás modificando los datos ${de}${nombre ? ` ${nombre}` : ''}`}
      description={`El cambio se guarda en la base de datos (tablero ${TABLERO[entidad]}) y afecta a este ${entidad} en todo el sistema, no solo en esta oportunidad. ¿Querés continuar?`}
      primaryButton={{ text: 'Sí, guardar', onClick: onConfirmar }}
      secondaryButton={{ text: 'Cancelar', onClick: onCancelar }}
      onClose={onCancelar}
    />
  )
}
