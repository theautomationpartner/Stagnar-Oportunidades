import { useEffect, useState } from 'react'
import { AttentionBox, Button, Modal, ModalContent, ModalFooter, TextField } from '@vibe/core'
import { MdClear } from 'react-icons/md'
import { Required, RequiredDropdown, codigoPaisDropdownProps } from './crear/FormPrimitives'
import { CODIGO_PAIS_OPTIONS, emailError, telefonoError } from '../services/personaFields'
import { normalizarParaMatch } from '../services/format'
import { buscarContactosCrmLibre, fetchClienteContactos, searchContactos } from '../services/mondayApi'
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
  // Pide elegir el cliente. Solo lo activa la sección Contactos, donde el contacto se
  // crea suelto y hay que decir a quién pertenece; en el wizard y en la ficha del cliente
  // ya se sabe cuál es y el buscador no aparece.
  pedirCliente = false,
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
  const [mismoClienteTildado, setMismoCliente] = useState(mismoClienteInicial)
  // "El contacto es el mismo cliente" solo existe cuando hay un cliente conocido: su
  // checkbox se muestra únicamente con `nombreCliente`. Sin eso, el estado quedaba en
  // true sin forma de apagarlo, el campo Nombre no se mostraba —se renderiza cuando es
  // false— y el popup no dejaba crear nada porque el nombre salía vacío.
  const mismoCliente = Boolean(nombreCliente) && mismoClienteTildado
  const [nombre, setNombre] = useState(inicial.nombre ?? '')
  const [codigoPais, setCodigoPais] = useState(inicial.codigoPais ?? '+598')
  const [telefono, setTelefono] = useState(inicial.telefono ?? '')
  const [email, setEmail] = useState(inicial.email ?? '')
  // Verificación del teléfono contra Contactos: 'sin' (nada que verificar todavía),
  // 'buscando', 'libre' o 'duplicado' (con el contacto encontrado en dupTelefono).
  const [chequeo, setChequeo] = useState('sin')
  const [dupTelefono, setDupTelefono] = useState(null)
  // El cliente se BUSCA y se elige, no se filtra una lista entera cargada de antemano:
  // se escribe y se aprieta Buscar (o Enter), igual que en las tablas de la app. Así no
  // se traen los clientes que nadie va a mirar y la consulta sale una sola vez, con el
  // término completo, en vez de una por tecla.
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [resultadosCliente, setResultadosCliente] = useState(null)
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [clienteElegido, setClienteElegido] = useState(null)

  const buscarCliente = async () => {
    const termino = busquedaCliente.trim()
    if (termino.length < 2) return
    setBuscandoCliente(true)
    try {
      setResultadosCliente(await searchContactos(termino))
    } catch {
      setResultadosCliente([])
    } finally {
      setBuscandoCliente(false)
    }
  }

  // Al elegirlo se traen sus contactos: hacen falta para avisar del homónimo y, sobre
  // todo, para remandarlos al vincular — monday reemplaza la lista entera, así que sin
  // ellos el cliente se quedaría solo con el contacto nuevo.
  const elegirCliente = async (cliente) => {
    setClienteElegido({ ...cliente, contactos: [] })
    try {
      setClienteElegido({ ...cliente, contactos: await fetchClienteContactos(cliente.id) })
    } catch {
      // Sin la lista no se puede vincular sin romper lo que ya había: se deshace.
      setClienteElegido(null)
    }
  }

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

  // Con el selector puesto, el cliente elegido trae sus contactos: si ya tiene uno con
  // el mismo nombre, crear otro sería duplicarlo. Es el mismo criterio que el homónimo
  // del wizard, resuelto acá porque el cliente recién se sabe al elegirlo.
  const homonimoDelCliente =
    nombre.trim() && clienteElegido
      ? (clienteElegido.contactos ?? []).find(
          (x) => normalizarParaMatch(x.name) === normalizarParaMatch(nombre)
        ) ?? null
      : null

  // Dos homónimos distintos, cada uno con su aviso: el del wizard ("es el mismo
  // cliente" tildado y ese cliente ya tiene su contacto) y el del selector de acá (el
  // cliente elegido ya tiene a alguien con ese nombre). Los dos frenan, pero mezclar los
  // textos dejaba el del wizard sin nombre de cliente que poner.
  const homonimoDelMismoCliente = mismoCliente && Boolean(homonimo)
  const bloqueadoPorHomonimo = homonimoDelMismoCliente || Boolean(homonimoDelCliente)
  // En gris hasta que el teléfono esté VERIFICADO como libre — ni mientras se busca ni
  // con un duplicado a la vista.
  // Todo obligatorio menos el email. Con el selector puesto, el cliente también.
  const puedeGuardar =
    (mismoCliente ? Boolean(nombreCliente) : Boolean(nombre.trim())) &&
    Boolean(telefono.trim()) &&
    (!pedirCliente || Boolean(clienteElegido)) &&
    !telErr &&
    !mailErr &&
    !bloqueadoPorHomonimo &&
    chequeo === 'libre' &&
    !guardando

  const confirmar = () => {
    if (!puedeGuardar) return
    onGuardar({
      mismoCliente,
      nombre: nombre.trim(),
      codigoPais,
      telefono,
      email,
      clienteId: clienteElegido?.id,
      // Los contactos que el cliente YA tiene: al vincular hay que remandarlos todos o
      // monday los desvincula (ver createContactoCrm).
      contactosDelCliente: clienteElegido?.contactos ?? [],
    })
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

        {homonimoDelMismoCliente && (
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

        {homonimoDelCliente && (
          <AttentionBox
            type="danger"
            title="Ese cliente ya tiene un contacto con ese nombre"
            className="contacto-nuevo__dup"
          >
            <strong>{clienteElegido.name}</strong> ya tiene cargado a <strong>{homonimoDelCliente.name}</strong>.
            Si es la misma persona no hace falta crearla de nuevo; si es otra, conviene distinguirla en el nombre.
          </AttentionBox>
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
          {pedirCliente && (
            <label className="crear-op__field crear-op__field--full">
              <span>Cliente <Required /></span>
              {clienteElegido ? (
                <div className="contacto-nuevo__cliente-elegido">
                  <strong>{clienteElegido.name}</strong>
                  <Button
                    kind="tertiary"
                    size="small"
                    onClick={() => {
                      setClienteElegido(null)
                      setResultadosCliente(null)
                    }}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : (
                <>
                  <div className="contacto-nuevo__buscar-cliente">
                    <TextField
                      size="medium"
                      placeholder="Nombre, CI o RUT del cliente"
                      value={busquedaCliente}
                      onChange={setBusquedaCliente}
                      onKeyDown={(e) => e.key === 'Enter' && buscarCliente()}
                      icon={MdClear}
                      onIconClick={() => {
                        setBusquedaCliente('')
                        setResultadosCliente(null)
                      }}
                    />
                    <Button
                      kind="secondary"
                      size="medium"
                      loading={buscandoCliente}
                      disabled={busquedaCliente.trim().length < 2}
                      onClick={buscarCliente}
                    >
                      Buscar
                    </Button>
                  </div>
                  {resultadosCliente !== null && !buscandoCliente && resultadosCliente.length === 0 && (
                    <span className="crear-op__field-error" role="alert">
                      Sin resultados para «{busquedaCliente.trim()}» en Clientes.
                    </span>
                  )}
                  {(resultadosCliente ?? []).length > 0 && (
                    <RequiredDropdown
                      size="medium"
                      options={resultadosCliente.map((c) => ({
                        value: String(c.id),
                        label: [c.name, c.ci && `CI ${c.ci}`].filter(Boolean).join(' — '),
                      }))}
                      value={null}
                      placeholder={`${resultadosCliente.length} resultado(s): elegí el cliente`}
                      onChange={(opcion) => {
                        const c = resultadosCliente.find((x) => String(x.id) === opcion?.value)
                        if (c) elegirCliente(c)
                      }}
                    />
                  )}
                </>
              )}
            </label>
          )}
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
