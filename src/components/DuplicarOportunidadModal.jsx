// A pedido: "Duplicar oportunidad". Antes de crear nada se elige con quién va la copia:
//   - Vehículo: FIJO, el de la original (solo lectura — no se puede cambiar acá).
//   - Cliente: el mismo de la original, u otro (buscarlo o crearlo, ver VincularClienteModal).
//   - Contacto: igual que el cliente — se muestra el elegido y "Cambiar contacto" abre
//     un popup para buscarlo o crearlo (ver ElegirContactoModal), validando repetidos.
//   - Datos con los que se cotiza: a pedido, NO se muestran ni se editan acá — salen del
//     cliente elegido (nombre, apellido si es particular, CI/RUT y fecha de nacimiento;
//     la del conductor si es empresa, ver más abajo). El teléfono NO se copia.
//   - Zona de circulación: departamento y localidad.
// No escribe nada: "Duplicar" le pasa la elección a onDuplicar (ver duplicarOportunidad.js).
import { useEffect, useState } from 'react'
import { AttentionBox, Button, Modal, ModalContent, ModalFooter } from '@vibe/core'
import { MdDirectionsCar, MdLock } from 'react-icons/md'
import { fetchClienteGestion, fetchContactosCrm } from '../services/mondayApi'
import { matchOption, modeloSinMarca } from '../services/format'
import { stripCi, telefonoParaMostrar } from '../services/personaFields'
import { RequiredDropdown } from './crear/FormPrimitives'
import { useLocalidadOptions } from './crear/EditarPersonaModals'
import VincularClienteModal from './VincularClienteModal'
import ElegirContactoModal from './ElegirContactoModal'
import './CrearOportunidadForm.css'
import './DuplicarOportunidadModal.css'

function idPorNombre(lista, nombre) {
  const real = matchOption(lista.map((o) => o.name), nombre)
  return lista.find((o) => o.name === real)?.id ?? ''
}

export default function DuplicarOportunidadModal({ opportunity, departamentos, localidades, onDuplicar, onClose }) {
  // ---- Cliente ----
  // { id, name, tipo } de uno que existe, o null si se eligió crear uno (clienteNuevo).
  const [cliente, setCliente] = useState(
    opportunity.clienteId
      ? { id: String(opportunity.clienteId), name: opportunity.clienteNombre, tipo: opportunity.clienteTipo }
      : null
  )
  const [clienteNuevo, setClienteNuevo] = useState(null)
  const [eligiendoCliente, setEligiendoCliente] = useState(false)

  // ---- Contacto ----
  // contacto: uno que ya existe ({ id, name, telefono }); contactoNuevo: los datos de uno
  // a crear al duplicar. Como mucho uno de los dos.
  const [contactos, setContactos] = useState(null) // los del cliente elegido; null = cargando
  const [contacto, setContacto] = useState(null)
  const [contactoNuevo, setContactoNuevo] = useState(null)
  const [eligiendoContacto, setEligiendoContacto] = useState(false)
  const [nombreClienteFicha, setNombreClienteFicha] = useState('')

  // ---- Datos con los que se cotiza (del cliente elegido) ----
  // { tipo, nombre, apellido, documento, fechaNacimiento } del cliente elegido; null
  // mientras se trae su ficha. La fecha de una empresa (la del conductor) no está en el
  // cliente: se arrastra de la original solo si el cliente es el mismo.
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    setContactoNuevo(null)
    setContacto(null)
    if (!cliente) {
      setContactos([])
      return undefined
    }
    let vivo = true
    setContactos(null)
    setDatos(null)
    fetchClienteGestion(cliente.id)
      .then(async (ficha) => {
        const lista = ficha?.contactos?.length ? await fetchContactosCrm(ficha.contactos.map((c) => c.id)) : []
        if (!vivo) return
        setNombreClienteFicha(ficha?.name ?? cliente.name)
        const esEmp = (ficha?.tipo || cliente.tipo) === 'Empresa'
        const mismo = String(cliente.id) === String(opportunity.clienteId ?? '')
        setDatos({
          tipo: esEmp ? 'Empresa' : 'Particular',
          nombre: esEmp ? ficha?.razonSocial || ficha?.nombre || ficha?.name || '' : ficha?.nombre || '',
          apellido: esEmp ? '' : ficha?.apellido || '',
          documento: (esEmp ? ficha?.rut : ficha?.ci) || '',
          documentoDelCliente: (esEmp ? ficha?.rut : ficha?.ci) || '',
          fechaNacimiento: (esEmp ? '' : ficha?.fechaNacimiento) || (mismo ? opportunity.fechaNacimiento || '' : ''),
        })
        setContactos(lista)
        // El de la original si es de este cliente; si no, el primero.
        setContacto(lista.find((c) => String(c.id) === String(opportunity.contactoId ?? '')) ?? lista[0] ?? null)
      })
      .catch(() => {
        if (!vivo) return
        setContactos([])
        setDatos({ tipo: cliente.tipo === 'Empresa' ? 'Empresa' : 'Particular', nombre: '', apellido: '', documento: '', fechaNacimiento: '' })
      })
    return () => {
      vivo = false
    }
  }, [cliente, opportunity.contactoId])
  const contactoEsDelCliente = Boolean(contacto && (contactos ?? []).some((c) => String(c.id) === String(contacto.id)))

  // ---- Zona de circulación ----
  const [departamentoId, setDepartamentoId] = useState(() => idPorNombre(departamentos, opportunity.departamento))
  const [localidadId, setLocalidadId] = useState(() => idPorNombre(localidades, opportunity.zonaCirculacion))
  const departamentoOptions = departamentos.map((d) => ({ value: d.id, label: d.name }))
  const { selectedDepartamento, localidadOptions, selectedLocalidad } = useLocalidadOptions(
    departamentoOptions,
    localidades,
    departamentoId,
    localidadId
  )

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const hayCliente = Boolean(cliente || clienteNuevo)
  const esEmpresa = datos?.tipo === 'Empresa'
  const docLimpio = stripCi(String(datos?.documento ?? ''))
  // Sin edición acá, alcanza con tener los datos del cliente ya traídos.
  const datosOk = Boolean(datos)
  const puedeDuplicar =
    hayCliente && datosOk && departamentoId && localidadId && (clienteNuevo || contactos !== null) && !guardando

  const duplicar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await onDuplicar({
        cliente: clienteNuevo ? null : cliente,
        clienteNuevo,
        contacto,
        contactoNuevo,
        datosCotizar: {
          tipo: datos.tipo,
          nombre: datos.nombre.trim(),
          apellido: esEmpresa ? '' : (datos.apellido ?? '').trim(),
          documento: docLimpio,
          fechaNacimiento: datos.fechaNacimiento || '',
        },
        departamentoId,
        localidadId,
      })
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  const vehiculo = [opportunity.marca, modeloSinMarca(opportunity.marca, opportunity.modelo), opportunity.anio && `(${opportunity.anio})`].filter(Boolean).join(' ')
  const vehiculoDetalle = [opportunity.combustible, opportunity.tipo, opportunity.uso, opportunity.matricula && `Matrícula ${opportunity.matricula}`]
    .filter(Boolean)
    .join(' · ')

  // Popups encima: elegir/crear cliente y contacto nuevo.
  if (eligiendoCliente) {
    return (
      <VincularClienteModal
        opportunity={{}}
        pedirTelefono={false}
        onClose={() => setEligiendoCliente(false)}
        onVincular={(c) => {
          setClienteNuevo(null)
          setCliente({ id: String(c.id), name: c.name, tipo: c.tipo })
          setEligiendoCliente(false)
        }}
        onCrear={(nuevo) => {
          setCliente(null)
          setClienteNuevo(nuevo)
          // Para el popup de contacto: el cliente nuevo todavía no tiene contactos.
          setNombreClienteFicha(nuevo.tipo === 'Empresa' ? nuevo.nombre : `${nuevo.nombre} ${nuevo.apellido}`.trim())
          setDatos({
            tipo: nuevo.tipo === 'Empresa' ? 'Empresa' : 'Particular',
            nombre: nuevo.nombre ?? '',
            apellido: nuevo.tipo === 'Empresa' ? '' : nuevo.apellido ?? '',
            documento: nuevo.documento ?? '',
            // Ya verificado como libre al crearlo (ver VincularClienteModal).
            documentoDelCliente: nuevo.documento ?? '',
            fechaNacimiento: nuevo.fechaNacimiento ?? '',
          })
          setEligiendoCliente(false)
        }}
      />
    )
  }
  if (eligiendoContacto) {
    return (
      <ElegirContactoModal
        nombreCliente={nombreClienteFicha || cliente?.name}
        contactosDelCliente={contactos ?? []}
        onClose={() => setEligiendoContacto(false)}
        onElegir={(c) => {
          setContactoNuevo(null)
          setContacto(c)
          setEligiendoContacto(false)
        }}
        onCrear={(datos) => {
          setContacto(null)
          setContactoNuevo(datos)
          setEligiendoContacto(false)
        }}
      />
    )
  }

  return (
    <Modal id="duplicar-oportunidad-modal" show onClose={guardando ? undefined : onClose} size="large">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">Duplicar oportunidad</h2>
        <p className="crear-op__section-hint">
          Se crea una oportunidad nueva, independiente de esta, con el mismo vehículo. Elegí el cliente, el contacto y la
          zona de circulación; después sigue el flujo normal de cotización.
        </p>
        {error && (
          <AttentionBox type="negative" title="No se pudo duplicar" className="duplicar-op__aviso">
            {error}
          </AttentionBox>
        )}

        <section className="duplicar-op__bloque duplicar-op__vehiculo">
          <span className="duplicar-op__titulo">
            <MdDirectionsCar aria-hidden="true" /> Vehículo <MdLock aria-hidden="true" className="duplicar-op__candado" />
          </span>
          <strong>{vehiculo || 'Sin vehículo cargado'}</strong>
          {vehiculoDetalle && <span className="duplicar-op__detalle">{vehiculoDetalle}</span>}
          <span className="duplicar-op__detalle">Se copia tal cual (y la Carta del automóvil, si tiene): no se puede cambiar acá.</span>
        </section>

        <section className="duplicar-op__bloque">
          <span className="duplicar-op__titulo">Cliente</span>
          <div className="duplicar-op__fila">
            <div>
              {clienteNuevo ? (
                <>
                  <strong>
                    {clienteNuevo.tipo === 'Empresa' ? clienteNuevo.nombre : `${clienteNuevo.nombre} ${clienteNuevo.apellido}`}
                  </strong>
                  <span className="crear-op__etiqueta-nuevo">Nuevo</span>
                  <span className="duplicar-op__detalle">Se crea al duplicar.</span>
                </>
              ) : cliente ? (
                <>
                  <strong>{cliente.name}</strong>
                  {String(cliente.id) === String(opportunity.clienteId ?? '') && (
                    <span className="duplicar-op__detalle">El mismo de esta oportunidad.</span>
                  )}
                </>
              ) : (
                <span className="duplicar-op__detalle">Sin cliente elegido.</span>
              )}
            </div>
            <Button kind="secondary" size="small" className="duplicar-op__cambiar" onClick={() => setEligiendoCliente(true)} disabled={guardando}>
              {hayCliente ? 'Cambiar cliente' : 'Elegir o crear cliente'}
            </Button>
          </div>
        </section>

        <section className="duplicar-op__bloque">
          <span className="duplicar-op__titulo">Contacto</span>
          {hayCliente ? (
            <div className="duplicar-op__fila">
              <div>
                {contactos === null ? (
                  <span className="duplicar-op__detalle">Buscando los contactos del cliente…</span>
                ) : contactoNuevo ? (
                  <>
                    <strong>{contactoNuevo.mismoCliente ? nombreClienteFicha || cliente?.name : contactoNuevo.nombre}</strong>
                    <span className="crear-op__etiqueta-nuevo">Nuevo</span>
                    <span className="duplicar-op__detalle">
                      {[contactoNuevo.telefono && `${contactoNuevo.codigoPais} ${contactoNuevo.telefono}`, contactoNuevo.email].filter(Boolean).join(' · ')} — se crea al duplicar.
                    </span>
                  </>
                ) : contacto ? (
                  <>
                    <strong>{contacto.name}</strong>
                    <span className="duplicar-op__detalle">
                      {[
                        contacto.telefono ? telefonoParaMostrar(contacto.telefono) : 'sin teléfono',
                        contactoEsDelCliente ? null : 'se suma a los contactos del cliente',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </>
                ) : (
                  <span className="duplicar-op__detalle">Sin contacto elegido.</span>
                )}
              </div>
              <Button kind="secondary" size="small" className="duplicar-op__cambiar" onClick={() => setEligiendoContacto(true)} disabled={contactos === null || guardando}>
                {contacto || contactoNuevo ? 'Cambiar contacto' : 'Elegir o crear contacto'}
              </Button>
            </div>
          ) : (
            <span className="duplicar-op__detalle">Elegí primero el cliente.</span>
          )}
        </section>

        <section className="duplicar-op__bloque">
          <span className="duplicar-op__titulo">Zona de circulación</span>
          <div className="crear-op__fields--grid">
            <label className="crear-op__field">
              <span>Departamento</span>
              <RequiredDropdown
                options={departamentoOptions}
                value={selectedDepartamento}
                placeholder="Escribe para buscar resultados"
                searchable
                onChange={(o) => {
                  setDepartamentoId(o?.value ?? '')
                  setLocalidadId('')
                }}
              />
            </label>
            <label className="crear-op__field">
              <span>Localidad</span>
              <RequiredDropdown
                options={localidadOptions}
                value={selectedLocalidad}
                placeholder={selectedDepartamento ? 'Escribe para buscar resultados' : 'Elegí primero un departamento'}
                disabled={!selectedDepartamento}
                searchable
                onChange={(o) => setLocalidadId(o?.value ?? '')}
              />
            </label>
          </div>
        </section>
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose, disabled: guardando }}
        primaryButton={{
          text: guardando ? 'Duplicando...' : 'Duplicar oportunidad',
          disabled: !puedeDuplicar,
          onClick: duplicar,
        }}
      />
    </Modal>
  )
}
