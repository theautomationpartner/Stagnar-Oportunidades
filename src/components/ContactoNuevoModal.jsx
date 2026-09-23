import { useEffect, useState } from 'react'
import { AttentionBox, Button, Modal, ModalContent, ModalFooter, TextField } from '@vibe/core'
import { MdClear } from 'react-icons/md'
import { Required, RequiredDropdown, codigoPaisDropdownProps } from './crear/FormPrimitives'
import { CODIGO_PAIS_OPTIONS, emailError, telefonoError } from '../services/personaFields'
import { buscarContactosCrmLibre } from '../services/mondayApi'
// Los estilos de campos/errores son los del wizard (crear-op__*) — el popup nació ahí y
// se ve igual en todos lados.
import './CrearOportunidadForm.css'
import './ContactoNuevoModal.css'

// Popup ÚNICO para crear un contacto — el mismo en todos los lados donde se puede crear
// uno (paso 1 del wizard y la ficha de gestión del cliente), a pedido. Antes el wizard
// tenía el suyo y la ficha un formulario inline distinto.
//
// Trabaja con estado propio y recién al confirmar avisa afuera (onGuardar): cancelar
// deja todo como estaba, y un teléfono a medio tipear no dispara búsquedas contra un
// número que todavía no existe.
//
// Validación de duplicados ADENTRO del popup (a raíz del hueco que quedó al mover el
// crear a un popup): apenas el teléfono queda tipeado y válido se consulta Contactos
// (debounce de 500ms) y "Agregar contacto" queda EN GRIS hasta que la verificación diga
// que el número está libre — dos contactos con el mismo teléfono son la misma persona
// cargada dos veces (mismo criterio que el paso del Cliente). Repetido: advertencia
// bien visible + "Usar ese contacto" (onUsarExistente). Si monday no responde se sigue
// de largo: trabar la carga por una consulta caída es peor que el duplicado que evita.
//
// El match compara los ÚLTIMOS 8 dígitos de los dos lados: los números quedan guardados
// con formatos mezclados (598099..., 099..., 99...) y un contains contra el texto crudo
// dejaba pasar repetidos según cómo se tipeara.

const colaTelefono = (s) => String(s ?? '').replace(/\D/g, '').slice(-8)
export default function ContactoNuevoModal({
  // Nombre del cliente, para el check "el contacto es el mismo cliente".
  nombreCliente = '',
  mismoClienteInicial = true,
  // Valores con los que abre (el wizard pasa lo que el form ya tenía; la ficha, vacío).
  inicial = {},
  // Contacto del Cliente con el MISMO nombre: con "es el mismo cliente" tildado, crear
  // otro sería duplicarlo — se bloquea y se ofrece usarlo.
  homonimo = null,
  onElegirHomonimo,
  // Contacto encontrado por TELÉFONO repetido al confirmar: "Usar ese contacto".
  onUsarExistente,
  // Confirmación: recibe { mismoCliente, nombre, codigoPais, telefono, email }. Puede ser
  // async (la ficha crea en monday acá mismo); `guardando` pinta el botón mientras tanto.
  onGuardar,
  guardando = false,
  onClose,
}) {
  const [mismoCliente, setMismoCliente] = useState(mismoClienteInicial)
  const [nombre, setNombre] = useState(inicial.nombre ?? '')
  const [codigoPais, setCodigoPais] = useState(inicial.codigoPais ?? '+598')
  const [telefono, setTelefono] = useState(inicial.telefono ?? '')
  const [email, setEmail] = useState(inicial.email ?? '')
  // Verificación del teléfono contra Contactos: 'sin' (nada que verificar todavía),
  // 'buscando', 'libre' o 'duplicado' (con el contacto encontrado en dupTelefono).
  const [chequeo, setChequeo] = useState('sin')
  const [dupTelefono, setDupTelefono] = useState(null)

  const telErr = telefonoError(telefono, codigoPais)
  const mailErr = emailError(email)

  useEffect(() => {
    if (!telefono.trim() || telErr) {
      setChequeo('sin')
      setDupTelefono(null)
      return undefined
    }
    let cancelado = false
    setChequeo('buscando')
    setDupTelefono(null)
    const timer = setTimeout(() => {
      const cola = colaTelefono(telefono)
      buscarContactosCrmLibre(cola)
        .then((encontrados) => {
          if (cancelado) return
          const repetido = encontrados.find((c) => colaTelefono(c.telefono) === cola) ?? null
          setDupTelefono(repetido)
          setChequeo(repetido ? 'duplicado' : 'libre')
        })
        .catch(() => {
          // monday no respondió: se sigue como si el número estuviera libre — trabar la
          // carga por una consulta caída es peor que el duplicado que se evita.
          if (cancelado) return
          setDupTelefono(null)
          setChequeo('libre')
        })
    }, 500)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [telefono, codigoPais, telErr])

  const bloqueadoPorHomonimo = mismoCliente && Boolean(homonimo)
  // En gris hasta que el teléfono esté VERIFICADO como libre — ni mientras se busca ni
  // con un duplicado a la vista.
  const puedeGuardar =
    (mismoCliente ? Boolean(nombreCliente) : Boolean(nombre.trim())) &&
    Boolean(telefono.trim()) &&
    !telErr &&
    !mailErr &&
    !bloqueadoPorHomonimo &&
    chequeo === 'libre' &&
    !guardando

  const confirmar = () => {
    if (!puedeGuardar) return
    onGuardar({ mismoCliente, nombre: nombre.trim(), codigoPais, telefono, email })
  }

  return (
    <Modal id="contacto-nuevo-modal" show onClose={onClose} size="medium">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">Contacto nuevo</h2>
        <p className="crear-op__section-hint">Información de contacto.</p>

        {nombreCliente && (
          <label className="crear-op__checkbox">
            <input type="checkbox" checked={mismoCliente} onChange={(e) => setMismoCliente(e.target.checked)} />
            <span>El contacto es el mismo cliente ({nombreCliente})</span>
          </label>
        )}

        {bloqueadoPorHomonimo && (
          <p className="crear-op__field-error" role="alert">
            {nombreCliente} ya tiene su propio contacto cargado — no hace falta crearlo de nuevo.{' '}
            {onElegirHomonimo && (
              <Button
                kind="tertiary"
                size="small"
                onClick={() => {
                  onElegirHomonimo(homonimo)
                  onClose()
                }}
              >
                Utilizar contacto existente
              </Button>
            )}
          </p>
        )}

        {chequeo === 'duplicado' && dupTelefono && (
          <AttentionBox
            type="danger"
            title="Ese teléfono ya está cargado"
            className="contacto-nuevo__dup"
          >
            <strong>{dupTelefono.name}</strong>
            {dupTelefono.clienteNombre ? ` (cliente: ${dupTelefono.clienteNombre})` : ''}.
            <br />
            Si corresponde a la misma persona, puede utilizar el contacto existente. De lo contrario, ingrese otro
            número.
            {onUsarExistente && (
              <div className="contacto-nuevo__dup-accion">
                <Button
                  kind="secondary"
                  size="small"
                  onClick={() => {
                    onUsarExistente(dupTelefono)
                    onClose()
                  }}
                >
                  Utilizar contacto existente
                </Button>
              </div>
            )}
          </AttentionBox>
        )}

        <div className="crear-op__fields--grid">
          {!mismoCliente && (
            <TextField
              size="medium"
              wrapperClassName="crear-op__field"
              title="Nombre del contacto"
              required
              placeholder="Ej: María Pérez (hija)"
              value={nombre}
              onChange={setNombre}
              icon={MdClear}
              onIconClick={() => setNombre('')}
              validation={nombre.trim() ? { status: 'success' } : undefined}
            />
          )}
          <label className="crear-op__field">
            <span>Teléfono <Required /></span>
            <div className="crear-op__phone">
              <div className="crear-op__phone-code">
                <RequiredDropdown
                  size="medium"
                  options={CODIGO_PAIS_OPTIONS}
                  value={CODIGO_PAIS_OPTIONS.find((o) => o.value === codigoPais) ?? null}
                  {...codigoPaisDropdownProps}
                  onChange={(option) => setCodigoPais(option?.value ?? '')}
                />
              </div>
              <TextField
                size="medium"
                wrapperClassName="crear-op__phone-number"
                placeholder="Ej: 099 123 456"
                value={telefono}
                onChange={setTelefono}
                icon={MdClear}
                onIconClick={() => setTelefono('')}
                validation={
                  telErr || chequeo === 'duplicado'
                    ? { status: 'error' }
                    : telefono && chequeo === 'libre'
                      ? { status: 'success' }
                      : undefined
                }
              />
            </div>
            {telErr && <span className="crear-op__field-error" role="alert">{telErr}</span>}
          </label>
          <label className="crear-op__field">
            <span>Email</span>
            <TextField
              size="medium"
              type="email"
              placeholder="Ej: nombre@dominio.com"
              value={email}
              onChange={setEmail}
              icon={MdClear}
              onIconClick={() => setEmail('')}
              validation={mailErr ? { status: 'error' } : email.trim() ? { status: 'success' } : undefined}
            />
            {mailErr && <span className="crear-op__field-error" role="alert">{mailErr}</span>}
          </label>
        </div>
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose }}
        primaryButton={{
          text: chequeo === 'buscando' ? 'Verificando teléfono...' : guardando ? 'Agregando...' : 'Agregar contacto',
          disabled: !puedeGuardar,
          onClick: confirmar,
        }}
      />
    </Modal>
  )
}
