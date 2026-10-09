// A pedido: editar los datos del CLIENTE (tablero Clientes) desde el paso 1 de la
// oportunidad — identidad y domicilio, según su tipo. A diferencia de "Datos de esta
// cotización", esto cambia la ficha del cliente, que comparten todas sus oportunidades:
// antes de abrir este popup se avisa (ver CotizarStepPanel) y acá arriba se repite.
//
// Recibe `cliente` (fetchClienteGestion) y devuelve en onGuardar solo lo que cambió:
//   { nombre, apellido } (si cambió el nombre) y los campos de guardarDatosCliente.
import { useEffect, useState } from 'react'
import { AttentionBox, Modal, ModalContent, ModalFooter } from '@vibe/core'
import { findClientePorDocumento } from '../services/mondayApi'
import { documentoDelTipoCliente, fechaError, NACIONALIDAD_URUGUAY, stripCi } from '../services/personaFields'
import { matchOption } from '../services/format'
import { ExtranjeroFields, FechaTexto, RequiredDropdown } from './crear/FormPrimitives'
import ConfirmarCambioModal from './ConfirmarCambioModal'
import { useLocalidadOptions } from './crear/EditarPersonaModals'
import './CrearOportunidadForm.css'

const SEXOS = [
  { value: 'M', label: 'M' },
  { value: 'F', label: 'F' },
]

// El id de la localidad/departamento del cliente: la ficha trae el nombre, el selector
// necesita el id (se busca igual que en el paso Cotizar, sin importar tildes).
function idPorNombre(lista, nombre) {
  const real = matchOption(lista.map((o) => o.name), nombre)
  return lista.find((o) => o.name === real)?.id ?? ''
}

export default function EditarClienteModal({ cliente, departamentos, localidades, nacionalidades, onGuardar, onClose }) {
  const esEmpresa = cliente.tipo === 'Empresa'
  const documento = documentoDelTipoCliente(esEmpresa ? 'Empresa' : 'Particular')
  const inicial = {
    nombre: esEmpresa ? cliente.razonSocial || cliente.nombre || cliente.name : cliente.nombre,
    apellido: esEmpresa ? '' : cliente.apellido,
    documento: esEmpresa ? cliente.rut : cliente.ci,
    fechaNacimiento: cliente.fechaNacimiento || '',
    sexo: cliente.sexo || '',
    extranjero: cliente.extranjero || 'No',
    nacionalidad: cliente.nacionalidad || NACIONALIDAD_URUGUAY,
    direccion: cliente.direccion || '',
    departamentoId: idPorNombre(departamentos, cliente.departamento),
    localidadId: idPorNombre(localidades, cliente.localidad),
  }
  const [form, setForm] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const cambiar = (clave, valor) => {
    setError(null)
    setForm((prev) => ({ ...prev, [clave]: valor }))
  }

  const departamentoOptions = departamentos.map((d) => ({ value: d.id, label: d.name }))
  const { selectedDepartamento, localidadOptions, selectedLocalidad } = useLocalidadOptions(
    departamentoOptions,
    localidades,
    form.departamentoId,
    form.localidadId
  )
  const nacionalidadOptions = nacionalidades.map((n) => ({ value: n, label: n }))

  // El CI/RUT nuevo no puede ser de OTRO cliente (mismo criterio que el alta): se
  // verifica antes de dejar guardar. Si la consulta falla, no se traba.
  const docNuevo = stripCi(String(form.documento ?? ''))
  const docCambio = docNuevo !== stripCi(String(inicial.documento ?? ''))
  // Solo si se cambió: un cliente viejo con un CI fuera de formato tiene que poder
  // guardar el resto de su ficha sin que se lo trabe un dato que nadie tocó.
  const docError = docNuevo && docCambio ? documento.validar(docNuevo) : null
  const [docChequeo, setDocChequeo] = useState('sin') // 'sin' | 'buscando' | 'libre' | 'duplicado'
  const [docDuplicado, setDocDuplicado] = useState(null)
  useEffect(() => {
    if (!docCambio || !docNuevo || docError) {
      setDocChequeo('sin')
      setDocDuplicado(null)
      return undefined
    }
    let cancelado = false
    setDocChequeo('buscando')
    const timer = setTimeout(() => {
      findClientePorDocumento(docNuevo, { tipoCliente: esEmpresa ? 'Empresa' : 'Particular' })
        .then((r) => {
          if (cancelado) return
          const deOtro = r && String(r.cliente.id) !== String(cliente.id)
          setDocDuplicado(deOtro ? r.cliente : null)
          setDocChequeo(deOtro ? 'duplicado' : 'libre')
        })
        .catch(() => !cancelado && setDocChequeo('libre'))
    }, 500)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [docCambio, docNuevo, docError, esEmpresa, cliente.id])

  const fechaErr = !esEmpresa && form.fechaNacimiento ? fechaError(form.fechaNacimiento) : null
  const faltaNombre = !form.nombre?.trim() || (!esEmpresa && !form.apellido?.trim())
  const bloqueado =
    faltaNombre || Boolean(docError) || Boolean(fechaErr) || (docCambio && (docChequeo === 'buscando' || docChequeo === 'duplicado'))

  // A pedido: antes de escribir en la ficha se confirma (ver ConfirmarCambioModal).
  const [porConfirmar, setPorConfirmar] = useState(null)

  const guardar = () => {
    const cambios = {}
    if (form.nombre.trim() !== (inicial.nombre ?? '').trim() || form.apellido.trim() !== (inicial.apellido ?? '').trim()) {
      cambios.nombre = form.nombre.trim()
      cambios.apellido = form.apellido.trim()
      if (esEmpresa) cambios.razonSocial = form.nombre.trim()
    }
    if (docCambio) cambios[esEmpresa ? 'rut' : 'ci'] = docNuevo
    if (!esEmpresa) {
      if (form.fechaNacimiento !== inicial.fechaNacimiento) cambios.fechaNacimiento = form.fechaNacimiento
      if (form.sexo !== inicial.sexo) cambios.sexo = form.sexo
      if (form.extranjero !== inicial.extranjero) cambios.extranjero = form.extranjero
      if (form.nacionalidad !== inicial.nacionalidad) cambios.nacionalidad = form.nacionalidad
    }
    if (form.direccion.trim() !== inicial.direccion.trim()) cambios.direccion = form.direccion.trim()
    if (form.departamentoId !== inicial.departamentoId) cambios.departamentoId = form.departamentoId
    if (form.localidadId !== inicial.localidadId) cambios.localidadId = form.localidadId
    if (!Object.keys(cambios).length) return onClose()
    setPorConfirmar(cambios)
  }

  const escribir = async (cambios) => {
    setPorConfirmar(null)
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(cambios)
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  const avisoDoc =
    docError ||
    (docChequeo === 'buscando'
      ? `Verificando que el ${documento.label} no sea de otro cliente…`
      : docChequeo === 'duplicado'
        ? `Este ${documento.label} ya es de ${docDuplicado?.name ?? 'otro cliente'}.`
        : '')

  return (
    <Modal id="editar-cliente-modal" show onClose={onClose} size="large">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">
          {esEmpresa ? 'Editar datos de la empresa' : 'Editar datos del cliente'}
        </h2>
        <AttentionBox type="warning" className="editar-cliente__aviso">
          Estás modificando la ficha del cliente <strong>{cliente.name}</strong>: los cambios se guardan en el tablero
          Clientes y se ven en todas sus oportunidades, no solo en esta.
        </AttentionBox>
        {error && (
          <p className="crear-op__error" role="alert">
            Error: {error}
          </p>
        )}
        <div className="crear-op__fields--grid">
          <label className="crear-op__field">
            <span>{esEmpresa ? 'Razón social' : 'Nombre'}</span>
            <input type="text" value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
          </label>
          {!esEmpresa && (
            <label className="crear-op__field">
              <span>Apellido</span>
              <input type="text" value={form.apellido} onChange={(e) => cambiar('apellido', e.target.value)} />
            </label>
          )}
          <label className="crear-op__field">
            <span>{documento.label}</span>
            <input
              type="text"
              placeholder={documento.placeholder}
              value={form.documento}
              onChange={(e) => cambiar('documento', e.target.value)}
            />
            {avisoDoc && (
              <span className={docError || docChequeo === 'duplicado' ? 'crear-op__field-error' : 'crear-op__section-hint'}>
                {avisoDoc}
              </span>
            )}
          </label>
          {!esEmpresa && (
            <>
              <label className="crear-op__field">
                <span>Fecha de nacimiento</span>
                <div className="crear-op__date-wrap">
                  <FechaTexto
                    ariaLabel="Fecha de nacimiento"
                    value={form.fechaNacimiento}
                    onChange={(iso) => cambiar('fechaNacimiento', iso)}
                  />
                </div>
                {fechaErr && <span className="crear-op__field-error">{fechaErr}</span>}
              </label>
              <label className="crear-op__field">
                <span>Sexo</span>
                <RequiredDropdown
                  options={SEXOS}
                  value={SEXOS.find((s) => s.value === form.sexo) ?? null}
                  placeholder="Sin definir"
                  searchable={false}
                  onChange={(o) => cambiar('sexo', o?.value ?? '')}
                />
              </label>
              <ExtranjeroFields
                extranjero={form.extranjero}
                nacionalidad={form.nacionalidad}
                nacionalidadOptions={nacionalidadOptions}
                onExtranjeroChange={(v) => {
                  setForm((prev) => ({
                    ...prev,
                    extranjero: v,
                    nacionalidad:
                      v === 'Si'
                        ? prev.nacionalidad === NACIONALIDAD_URUGUAY
                          ? ''
                          : prev.nacionalidad
                        : prev.nacionalidad || NACIONALIDAD_URUGUAY,
                  }))
                }}
                onNacionalidadChange={(v) => cambiar('nacionalidad', v)}
              />
            </>
          )}
          <label className="crear-op__field crear-op__field--full">
            <span>Dirección (calle y número)</span>
            <input type="text" value={form.direccion} onChange={(e) => cambiar('direccion', e.target.value)} />
          </label>
          <label className="crear-op__field">
            <span>Departamento</span>
            <RequiredDropdown
              options={departamentoOptions}
              value={selectedDepartamento}
              placeholder="Escribe para buscar resultados"
              searchable
              onChange={(o) => {
                setError(null)
                setForm((prev) => ({ ...prev, departamentoId: o?.value ?? '', localidadId: '' }))
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
              onChange={(o) => cambiar('localidadId', o?.value ?? '')}
            />
          </label>
        </div>
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose, disabled: guardando }}
        primaryButton={{
          text: guardando ? 'Guardando...' : docChequeo === 'buscando' && docCambio ? 'Verificando…' : 'Guardar en el cliente',
          disabled: guardando || bloqueado,
          onClick: guardar,
        }}
      />
      {porConfirmar && (
        <ConfirmarCambioModal
          entidad="cliente"
          nombre={cliente.name}
          onCancelar={() => setPorConfirmar(null)}
          onConfirmar={() => escribir(porConfirmar)}
        />
      )}
    </Modal>
  )
}
