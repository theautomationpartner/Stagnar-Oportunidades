// A pedido: "Duplicar oportunidad". Antes de crear nada se elige con quién va la copia:
//   - Vehículo: FIJO, el de la original (solo lectura — no se puede cambiar acá).
//   - Cliente: el mismo de la original, u otro (buscarlo o crearlo, ver VincularClienteModal).
//   - Contacto: igual que el cliente — se muestra el elegido y "Cambiar contacto" abre
//     un popup para buscarlo o crearlo (ver ElegirContactoModal), validando repetidos.
//   - Datos para cotizar: solo los básicos del cliente (tipo, nombre, apellido si es
//     particular, CI/RUT y fecha de nacimiento — la del conductor si es empresa),
//     precargados y editables. El teléfono NO se copia (a pedido).
//   - Zona de circulación: departamento y localidad.
// No escribe nada: "Duplicar" le pasa la elección a onDuplicar (ver duplicarOportunidad.js).
import { useEffect, useState } from 'react'
import { AttentionBox, Button, Modal, ModalContent, ModalFooter } from '@vibe/core'
import { MdDirectionsCar, MdLock } from 'react-icons/md'
import { fetchClienteGestion, fetchContactosCrm, findClientePorDocumento } from '../services/mondayApi'
import { matchOption, modeloSinMarca } from '../services/format'
import { documentoDelTipoCliente, fechaError, stripCi, telefonoParaMostrar } from '../services/personaFields'
import { FechaTexto, RequiredDropdown } from './crear/FormPrimitives'
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

  // ---- Datos para cotizar ----
  // { tipo, nombre, apellido, documento, fechaNacimiento } del cliente elegido; null
  // mientras se trae su ficha. La fecha de una empresa (la del conductor) no está en el
  // cliente: se arrastra de la original solo si el cliente es el mismo.
  const [datos, setDatos] = useState(null)
  const cambiarDato = (clave, valor) => setDatos((prev) => ({ ...prev, [clave]: valor }))

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
  const documento = documentoDelTipoCliente(esEmpresa ? 'Empresa' : 'Particular')
  const docLimpio = stripCi(String(datos?.documento ?? ''))
  // Se valida si se cargó o cambió acá; el que ya traía el cliente no frena (mismo criterio
  // que la ficha del cliente).
  const docError =
    docLimpio && docLimpio !== stripCi(String(datos?.documentoDelCliente ?? '')) ? documento.validar(docLimpio) : null
  const fechaErr = datos?.fechaNacimiento ? fechaError(datos.fechaNacimiento) : null

  // A pedido: un CI/RUT cargado o cambiado acá no puede ser de OTRO cliente (mismo
  // criterio que el alta y el paso 1). Si es el mismo con el que vino el cliente, no se
  // consulta. Hasta saberlo no se deja duplicar; si monday no responde, no se traba.
  const docCambiado = Boolean(docLimpio) && docLimpio !== stripCi(String(datos?.documentoDelCliente ?? ''))
  const [docChequeo, setDocChequeo] = useState({ fase: 'sin', duplicado: null }) // 'sin' | 'buscando' | 'listo'
  useEffect(() => {
    if (!docCambiado || docError) {
      setDocChequeo({ fase: 'sin', duplicado: null })
      return undefined
    }
    let vivo = true
    setDocChequeo({ fase: 'buscando', duplicado: null })
    const timer = setTimeout(() => {
      findClientePorDocumento(docLimpio, { tipoCliente: esEmpresa ? 'Empresa' : 'Particular' })
        .then((r) => {
          if (!vivo) return
          // Con un cliente que ya existe, encontrarse a sí mismo no es un duplicado.
          const otro = r?.cliente && (!cliente || String(r.cliente.id) !== String(cliente.id)) ? r.cliente : null
          setDocChequeo({ fase: 'listo', duplicado: otro })
        })
        .catch(() => vivo && setDocChequeo({ fase: 'listo', duplicado: null }))
    }, 500)
    return () => {
      vivo = false
      clearTimeout(timer)
    }
  }, [docCambiado, docLimpio, docError, esEmpresa, cliente])
  const docDuplicado = docChequeo.duplicado
  const docPendiente = docCambiado && !docError && docChequeo.fase !== 'listo'

  const datosOk = Boolean(datos) && Boolean(datos.nombre?.trim()) && !docError && !fechaErr && !docDuplicado && !docPendiente
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
          <span className="duplicar-op__titulo">Datos para cotizar</span>
          {!hayCliente ? (
            <span className="duplicar-op__detalle">Elegí primero el cliente.</span>
          ) : !datos ? (
            <span className="duplicar-op__detalle">Trayendo los datos del cliente…</span>
          ) : (
            <>
              <span className="duplicar-op__detalle">
                {esEmpresa ? 'Empresa' : 'Particular'} · solo estos datos se copian a la oportunidad nueva (el teléfono no).
              </span>
              <div className="crear-op__fields--grid">
                <label className="crear-op__field">
                  <span>{esEmpresa ? 'Razón social' : 'Nombre'}</span>
                  <input type="text" value={datos.nombre} onChange={(e) => cambiarDato('nombre', e.target.value)} />
                </label>
                {!esEmpresa && (
                  <label className="crear-op__field">
                    <span>Apellido</span>
                    <input type="text" value={datos.apellido} onChange={(e) => cambiarDato('apellido', e.target.value)} />
                  </label>
                )}
                <label className="crear-op__field">
                  <span>{documento.label}</span>
                  <input
                    type="text"
                    placeholder={documento.placeholder}
                    value={datos.documento}
                    onChange={(e) => cambiarDato('documento', e.target.value)}
                  />
                  {docError && <span className="crear-op__field-error">{docError}</span>}
                  {!docError && docPendiente && (
                    <span className="crear-op__section-hint">Verificando que el {documento.label} no sea de otro cliente…</span>
                  )}
                  {docDuplicado && (
                    <span className="crear-op__field-error" role="alert">
                      Este {documento.label} ya es de {docDuplicado.name}. Si es esa persona, elegila con «Cambiar cliente».
                    </span>
                  )}
                </label>
                <label className="crear-op__field">
                  <span>{esEmpresa ? 'Fecha de nacimiento (conductor)' : 'Fecha de nacimiento'}</span>
                  <div className="crear-op__date-wrap">
                    <FechaTexto
                      ariaLabel={esEmpresa ? 'Fecha de nacimiento del conductor' : 'Fecha de nacimiento'}
                      value={datos.fechaNacimiento}
                      onChange={(v) => cambiarDato('fechaNacimiento', v)}
                    />
                  </div>
                  {fechaErr && <span className="crear-op__field-error">{fechaErr}</span>}
                </label>
              </div>
            </>
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
