// A pedido: en el paso 1, una oportunidad SIN cliente vinculado puede elegir uno que ya
// exista o crear uno nuevo. Dos solapas:
//   - Buscar: en monday (nombre, CI, RUT o celular, ver buscarClientesGestion) → Vincular.
//   - Crear: precargado con lo que ya tiene la oportunidad. El CI/RUT no puede ser de otro
//     cliente (si lo es, se ofrece vincular ese), y el contacto se busca por teléfono: si
//     ya existe se usa ese contacto en vez de crear uno repetido.
// No escribe nada: devuelve la elección y la escritura la hace quien llama.
//   onVincular(cliente)
//   onCrear({ tipo, nombre, apellido, documento, fechaNacimiento, codigoPais, telefono, contactoExistente })
import { useEffect, useState } from 'react'
import { AttentionBox, Button, Modal, ModalContent, ModalFooter } from '@vibe/core'
import { MdSearch } from 'react-icons/md'
import { buscarClientesGestion, findClientePorDocumento, findContactoByTelefono } from '../services/mondayApi'
import { documentoDelTipoCliente, fechaError, stripCi, telefonoError } from '../services/personaFields'
import { FechaTexto, RequiredDropdown } from './crear/FormPrimitives'
import './CrearOportunidadForm.css'
import './PillTabs.css'
import './VincularClienteModal.css'

const TIPOS = [
  { value: 'Particular', label: 'Particular' },
  { value: 'Empresa', label: 'Empresa' },
]

// Consulta con espera (debounce) y descarte de respuestas viejas: 'sin' | 'buscando' | 'listo'.
function useVerificacion(clave, consultar) {
  const [estado, setEstado] = useState({ fase: 'sin', resultado: null })
  useEffect(() => {
    if (!clave) {
      setEstado({ fase: 'sin', resultado: null })
      return undefined
    }
    let cancelado = false
    setEstado({ fase: 'buscando', resultado: null })
    const timer = setTimeout(() => {
      consultar()
        .then((r) => !cancelado && setEstado({ fase: 'listo', resultado: r ?? null }))
        // Si monday no responde no se traba el alta (mismo criterio que el alta).
        .catch(() => !cancelado && setEstado({ fase: 'listo', resultado: null }))
    }, 500)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return estado
}

export default function VincularClienteModal({ opportunity, onVincular, onCrear, onClose }) {
  const [solapa, setSolapa] = useState('buscar')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  // ---- Buscar ----
  const [busqueda, setBusqueda] = useState(opportunity.ci || '')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const buscar = async () => {
    if (busqueda.trim().length < 2) return
    setBuscando(true)
    try {
      setResultados(await buscarClientesGestion(busqueda.trim()))
    } catch {
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }

  // ---- Crear (precargado con lo que ya tiene la oportunidad) ----
  const [tipo, setTipo] = useState(opportunity.clienteTipo === 'Empresa' ? 'Empresa' : 'Particular')
  const esEmpresa = tipo === 'Empresa'
  const [nombre, setNombre] = useState(opportunity.nombre || '')
  const [apellido, setApellido] = useState(opportunity.apellido || '')
  const [doc, setDoc] = useState(opportunity.ci || '')
  const [fecha, setFecha] = useState(opportunity.fechaNacimiento || '')
  const [telefono, setTelefono] = useState(() => {
    // La copia de la oportunidad viene con el código de país adelante, con o sin el 0
    // ("59897…" o "598097…"): se pasa al formato local de siempre, "097…".
    const t = String(opportunity.contactoTelefono || opportunity.telefono || '').replace(/\D/g, '')
    return t.startsWith('598') ? '0' + t.slice(3).replace(/^0+/, '') : t
  })
  const codigoPais = '+598'
  const documento = documentoDelTipoCliente(tipo)
  const docLimpio = stripCi(doc)
  const docError = docLimpio ? documento.validar(docLimpio) : null
  const telError = telefono ? telefonoError(telefono, codigoPais) : null

  const docCheck = useVerificacion(docLimpio && !docError ? `${tipo}:${docLimpio}` : '', () =>
    findClientePorDocumento(docLimpio, { tipoCliente: tipo })
  )
  const telCheck = useVerificacion(telefono && !telError ? telefono : '', () => findContactoByTelefono(codigoPais, telefono))
  const docDuplicado = docCheck.fase === 'listo' ? docCheck.resultado?.cliente ?? null : null
  const contactoExistente = telCheck.fase === 'listo' ? telCheck.resultado?.contactoCrm ?? null : null

  const fechaErr = !esEmpresa && fecha ? fechaError(fecha) : null
  const puedeCrear =
    nombre.trim() &&
    (esEmpresa || apellido.trim()) &&
    docLimpio &&
    !docError &&
    docCheck.fase === 'listo' &&
    !docDuplicado &&
    !fechaErr &&
    !telError &&
    (!telefono || telCheck.fase === 'listo')

  const ejecutar = async (fn) => {
    setGuardando(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  const crear = () =>
    ejecutar(() =>
      onCrear({
        tipo,
        nombre: nombre.trim(),
        apellido: esEmpresa ? '' : apellido.trim(),
        documento: docLimpio,
        fechaNacimiento: esEmpresa ? '' : fecha,
        codigoPais,
        telefono: telefono.trim(),
        contactoExistente,
      })
    )

  return (
    <Modal id="vincular-cliente-modal" show onClose={onClose} size="large">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">Cliente de esta oportunidad</h2>
        <div className="pill-tabs vincular-cliente__solapas" role="tablist">
          {[
            ['buscar', 'Buscar un cliente existente'],
            ['crear', 'Crear un cliente nuevo'],
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
        {error && (
          <p className="crear-op__error" role="alert">
            Error: {error}
          </p>
        )}

        {solapa === 'buscar' ? (
          <>
            <div className="vincular-cliente__buscar" onKeyDown={(e) => e.key === 'Enter' && buscar()}>
              <input
                className="vincular-cliente__input"
                type="text"
                placeholder="Nombre, CI, RUT o celular"
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
            {resultados !== null && !resultados.length && (
              <p className="crear-op__section-hint">
                Sin resultados. Podés crearlo en «Crear un cliente nuevo».
              </p>
            )}
            <ul className="vincular-cliente__lista">
              {(resultados ?? []).map((c) => (
                <li key={c.id} className="vincular-cliente__fila">
                  <div>
                    <strong>{c.name}</strong>
                    <span>
                      {[c.tipo, c.tipo === 'Empresa' ? c.rut && `RUT ${c.rut}` : c.ci && `CI ${c.ci}`, c.estado]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <Button kind="primary" size="small" disabled={guardando} onClick={() => ejecutar(() => onVincular(c))}>
                    Vincular
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="crear-op__fields--grid">
            <label className="crear-op__field">
              <span>Tipo de cliente</span>
              <RequiredDropdown
                options={TIPOS}
                value={TIPOS.find((t) => t.value === tipo)}
                searchable={false}
                clearable={false}
                onChange={(o) => o && setTipo(o.value)}
              />
            </label>
            <label className="crear-op__field">
              <span>{esEmpresa ? 'Razón social' : 'Nombre'}</span>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
            {!esEmpresa && (
              <label className="crear-op__field">
                <span>Apellido</span>
                <input type="text" value={apellido} onChange={(e) => setApellido(e.target.value)} />
              </label>
            )}
            <label className="crear-op__field">
              <span>{documento.label}</span>
              <input type="text" placeholder={documento.placeholder} value={doc} onChange={(e) => setDoc(e.target.value)} />
              {docError && <span className="crear-op__field-error">{docError}</span>}
              {!docError && docCheck.fase === 'buscando' && (
                <span className="crear-op__section-hint">Verificando que no exista otro cliente con ese {documento.label}…</span>
              )}
            </label>
            {!esEmpresa && (
              <label className="crear-op__field">
                <span>Fecha de nacimiento</span>
                <div className="crear-op__date-wrap">
                  <FechaTexto ariaLabel="Fecha de nacimiento" value={fecha} onChange={setFecha} />
                </div>
                {fechaErr && <span className="crear-op__field-error">{fechaErr}</span>}
              </label>
            )}
            <label className="crear-op__field">
              <span>Celular del contacto</span>
              <input type="tel" placeholder="Ej: 099 123 456" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              {telError && <span className="crear-op__field-error">{telError}</span>}
              {!telError && telCheck.fase === 'buscando' && <span className="crear-op__section-hint">Buscando ese teléfono en Contactos…</span>}
            </label>

            {docDuplicado && (
              <AttentionBox type="warning" className="crear-op__field--full">
                Ya existe un cliente con ese {documento.label}: <strong>{docDuplicado.name}</strong>. No se puede crear otro.{' '}
                <Button kind="tertiary" size="small" disabled={guardando} onClick={() => ejecutar(() => onVincular(docDuplicado))}>
                  Vincular ese cliente
                </Button>
              </AttentionBox>
            )}
            {contactoExistente && (
              <AttentionBox type="primary" className="crear-op__field--full">
                Ese teléfono ya es del contacto <strong>{contactoExistente.name}</strong>
                {contactoExistente.clienteNombre ? ` (cliente: ${contactoExistente.clienteNombre})` : ''}: se va a usar ese
                contacto en vez de crear uno repetido.
              </AttentionBox>
            )}
          </div>
        )}
      </ModalContent>
      {solapa === 'crear' ? (
        <ModalFooter
          secondaryButton={{ text: 'Cancelar', onClick: onClose, disabled: guardando }}
          primaryButton={{ text: guardando ? 'Creando...' : 'Crear y vincular', disabled: guardando || !puedeCrear, onClick: crear }}
        />
      ) : (
        <ModalFooter primaryButton={{ text: 'Cerrar', onClick: onClose, disabled: guardando }} />
      )}
    </Modal>
  )
}
