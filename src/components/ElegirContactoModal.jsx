// A pedido (Duplicar oportunidad): el contacto se elige igual que el cliente — un popup
// con dos solapas, como VincularClienteModal:
//   - Buscar: arranca mostrando los contactos del cliente elegido; se puede buscar
//     cualquier otro por nombre, celular o email (ver buscarContactosCrmLibre).
//   - Crear: el popup de contacto nuevo de siempre (ContactoNuevoModal), que ya frena
//     un teléfono repetido (ofrece usar ese contacto) y un nombre repetido del cliente.
// No escribe nada: devuelve la elección y la escritura la hace quien llama.
//   onElegir(contacto)          — uno que ya existe ({ id, name, telefono, … })
//   onCrear(datos)              — los datos de ContactoNuevoModal, para crearlo después
import { useState } from 'react'
import { Button, Modal, ModalContent, ModalFooter } from '@vibe/core'
import { MdSearch } from 'react-icons/md'
import { buscarContactosCrmLibre } from '../services/mondayApi'
import { telefonoParaMostrar } from '../services/personaFields'
import ContactoNuevoModal from './ContactoNuevoModal'
import './CrearOportunidadForm.css'
import './PillTabs.css'
import './VincularClienteModal.css'

export default function ElegirContactoModal({ nombreCliente, contactosDelCliente = [], onElegir, onCrear, onClose }) {
  const [solapa, setSolapa] = useState('buscar')
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState(null) // null = todavía no se buscó
  const [buscando, setBuscando] = useState(false)

  const buscar = async () => {
    if (busqueda.trim().length < 2) return
    setBuscando(true)
    try {
      setResultados(await buscarContactosCrmLibre(busqueda.trim(), { limit: 20 }))
    } catch {
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }

  // Sin búsqueda, los del cliente; con búsqueda, lo que encontró.
  const idsDelCliente = new Set(contactosDelCliente.map((c) => String(c.id)))
  const lista = resultados ?? contactosDelCliente

  if (solapa === 'crear') {
    return (
      <ContactoNuevoModal
        nombreCliente={nombreCliente}
        mismoClienteInicial={!contactosDelCliente.length}
        inicial={{}}
        contactosDelCliente={contactosDelCliente}
        onElegirHomonimo={() => setSolapa('buscar')}
        onUsarExistente={onElegir}
        onGuardar={onCrear}
        onClose={() => setSolapa('buscar')}
      />
    )
  }

  return (
    <Modal id="elegir-contacto-modal" show onClose={onClose} size="large">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">Contacto de esta oportunidad</h2>
        <div className="pill-tabs vincular-cliente__solapas" role="tablist">
          {[
            ['buscar', 'Buscar un contacto existente'],
            ['crear', 'Crear un contacto nuevo'],
          ].map(([clave, texto]) => (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={solapa === clave}
              className={solapa === clave ? 'pill-tabs__tab pill-tabs__tab--active' : 'pill-tabs__tab'}
              onClick={() => setSolapa(clave)}
            >
              {texto}
            </button>
          ))}
        </div>

        <div className="vincular-cliente__buscar" onKeyDown={(e) => e.key === 'Enter' && buscar()}>
          <input
            className="vincular-cliente__input"
            type="text"
            placeholder="Nombre, celular o email"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setResultados(null)
            }}
          />
          <Button kind="secondary" size="medium" loading={buscando} disabled={busqueda.trim().length < 2} onClick={buscar}>
            <MdSearch /> Buscar
          </Button>
        </div>
        <p className="crear-op__section-hint">
          {resultados === null
            ? contactosDelCliente.length
              ? `Contactos de ${nombreCliente}:`
              : `${nombreCliente || 'El cliente'} no tiene contactos cargados. Buscá uno o creá uno nuevo.`
            : resultados.length
              ? 'Resultados:'
              : 'Sin resultados. Podés crearlo en «Crear un contacto nuevo».'}
        </p>
        <ul className="vincular-cliente__lista">
          {lista.map((c) => (
            <li key={c.id} className="vincular-cliente__fila">
              <div>
                <strong>{c.name}</strong>
                <span>
                  {[
                    c.telefono ? telefonoParaMostrar(c.telefono) : 'sin teléfono',
                    c.email,
                    idsDelCliente.has(String(c.id)) ? 'contacto de este cliente' : c.clienteNombre && `cliente: ${c.clienteNombre}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <Button kind="primary" size="small" onClick={() => onElegir(c)}>
                Elegir
              </Button>
            </li>
          ))}
        </ul>
      </ModalContent>
      <ModalFooter primaryButton={{ text: 'Cerrar', onClick: onClose }} />
    </Modal>
  )
}
