// Primitivas de formulario del wizard "Crear Oportunidad" — extraídas de
// CrearOportunidadForm.jsx (auditoría). Los estilos siguen en CrearOportunidadForm.css.
import { useState } from 'react'
import { Button, Dropdown, TextField } from '@vibe/core'
import { MdCall, MdClear, MdEdit, MdInfoOutline, MdPersonAdd, MdPersonSearch } from 'react-icons/md'
import { CODIGO_PAIS_OPTIONS, emailError, telefonoError, telefonoParaMostrar } from '../../services/personaFields'
import FlagIcon from './FlagIcon'
import { matchesSearchQuery } from '../../services/format'
// El popup de contacto nuevo es COMPARTIDO (también lo usa la ficha de gestión del
// cliente) y ahora verifica adentro el teléfono repetido contra Contactos — ver
// ContactoNuevoModal.jsx. El import es circular (ese archivo importa RequiredDropdown y
// compañía de acá) pero solo se tocan en render, nunca al evaluar el módulo.
import ContactoNuevoModal from '../ContactoNuevoModal'

// A pedido: asterisco de obligatorio en rojo en TODOS los campos — antes era texto
// suelto (" *") sin ese color en los <label><span> armados a mano (Fecha Nacimiento,
// Teléfono, Departamento, Localidad, Año/Marca/Modelo/etc.), mientras que el TextField
// nativo de @vibe/core (Nombre/Apellido/CI) sí lo trae rojo de fábrica — quedaba
// inconsistente. Un solo componente en vez de repetir el span a mano en cada campo.
// Selector de código de país: cerrado muestra bandera + código; el menú, bandera +
// código + nombre del país.
export const codigoPaisDropdownProps = {
  valueRenderer: (option) => (
    <span className="crear-op__phone-code-value">
      <FlagIcon iso={option.iso} />
      {option.value}
    </span>
  ),
  optionRenderer: (option) => (
    <span className="crear-op__phone-code-option">
      <FlagIcon iso={option.iso} />
      <span>{option.value}</span>
      <span className="crear-op__phone-code-pais">{option.pais}</span>
    </span>
  ),
  menuWrapperClassName: 'crear-op__phone-menu',
}

export function Required() {
  return <span className="crear-op__required">*</span>
}

// AutodataModeloPorAnioMarca y matchesSearchQuery se movieron a sus propios archivos
// compartidos (ver AutodataModeloPorAnioMarca.jsx y services/format.js) — CotizarStepPanel.jsx
// (edición del paso "Cotizar") ahora reusa exactamente lo mismo, en vez de tener su
// propia versión sin filtrar por Año/Marca.

// clearable={false} SIEMPRE acá — van 2 veces que se prueba activarlo (con la "x" nativa
// del Dropdown) y las 2 terminó en un dato bueno borrándose solo: la primera vez al
// clickear para reabrir y elegir otro valor, esta segunda con solo hacer click afuera
// (blur) después de elegir uno. En vez de perseguir un tercer caso raro de la librería,
// mejor no usar su "clearable" en absoluto — reelegir otra opción (click → abre el menú)
// ya cubre el 100% de los casos reales en un formulario donde todo es obligatorio.
//
// Además, en los campos con `searchable`: 1) filtra por palabra en cualquier lugar de la
// opción (no solo desde el principio, igual que Modelo — ver matchesSearchQuery) y 2) al
// apretar Enter, si hay algo tipeado, elige directo la primera opción que matchea (antes
// había que bajar con la flecha para resaltarla).
//
// `searchable` arranca en true (reunión del 24/09): todo desplegable tiene que sugerir
// apenas se escribe, sin abrirlo antes, para completar el alta solo con teclado y Tab. El
// Dropdown de @vibe/core viene sin búsqueda por defecto, y cada campo que se olvidaba de
// pedirla quedaba mudo al tipear — así estaba Combustible ("N" no traía "Nafta").
export function RequiredDropdown({ onChange, onClear, searchable = true, options, ...props }) {
  const [query, setQuery] = useState('')

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || !searchable || !query.trim()) return
    const match = (options ?? []).find((o) => matchesSearchQuery(o.label, query))
    if (match) {
      e.preventDefault()
      onChange(match)
      setQuery('')
    }
  }

  return (
    <div onKeyDown={handleKeyDown}>
      <Dropdown
        clearable={false}
        searchable={searchable}
        options={options}
        filterOption={searchable ? (option, inputValue) => matchesSearchQuery(option.label, inputValue) : undefined}
        onInputChange={searchable ? (input) => setQuery(input ?? '') : undefined}
        onChange={(option) => {
          setQuery('')
          onChange(option)
        }}
        onClear={onClear ?? (() => onChange(null))}
        {...props}
      />
    </div>
  )
}

// LOG-06 / LOG-08: "Extranjero" (status Si/No de Clientes) + "Nacionalidad" (dropdown
// con los países del mismo tablero). Van juntos y en el mismo orden en los 3 lugares
// donde se cargan los datos de la persona (el formulario de Lead manual y los 2 popups
// de edición, ver EditarPersonaModals.jsx) — de ahí que sean un componente y no 2
// campos copiados. Nacionalidad es obligatoria, pero en el caso común ya viene en
// URUGUAY: en la práctica solo frena a quien marca Extranjero = Sí.
export function ExtranjeroFields({ extranjero, nacionalidad, nacionalidadOptions, onExtranjeroChange, onNacionalidadChange }) {
  const selectedNacionalidad = nacionalidadOptions.find((o) => o.value === nacionalidad) ?? null
  return (
    <>
      <label className="crear-op__field">
        <span>Extranjero <Required /></span>
        <RequiredDropdown
          options={EXTRANJERO_OPTIONS}
          value={EXTRANJERO_OPTIONS.find((o) => o.value === extranjero) ?? null}
          onChange={(option) => onExtranjeroChange(option?.value ?? 'No')}
        />
      </label>
      <label className="crear-op__field">
        <span>Nacionalidad <Required /></span>
        <RequiredDropdown
          options={nacionalidadOptions}
          value={selectedNacionalidad}
          placeholder="Escribe para buscar resultados"
          searchable
          onChange={(option) => onNacionalidadChange(option?.value ?? '')}
        />
      </label>
    </>
  )
}

// "Si" (sin tilde) es el label real de la columna color_mm6zs3fk — el valor que se
// escribe en monday; la tilde es solo lo que se ve en pantalla.
const EXTRANJERO_OPTIONS = [
  { value: 'No', label: 'No' },
  { value: 'Si', label: 'Sí' },
]

// A pedido: título de sección con ícono en círculo de color al lado (mockup) en vez del
// texto solo — reusado por las 3 secciones tituladas del paso 1 (Datos personales/
// Contacto/Ubicación, ver más abajo).
export function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="crear-op__section-title-row">
      <span className="crear-op__section-icon">
        <Icon />
      </span>
      <h3 className="crear-op__section-title">{children}</h3>
    </div>
  )
}

// MON-14: sección "Contacto" — a quién se le manda la información. El Teléfono y el
// Email son DEL CONTACTO, no del Cliente (esas columnas ya no existen en el tablero
// Clientes). En el caso típico el contacto es el propio cliente y alcanza con el check
// marcado; destildarlo pide el nombre de la otra persona (un familiar, el administrativo
// de una empresa).
//
// Reusada tanto por el formulario manual ("No tengo la Cédula") como por el perfil leído
// con IA ("Sí" + lectura ok) — la IA no devuelve teléfono, así que en los 2 casos hay que
// pedirlo aparte.
// Sección Contacto del paso 1 — máquina de estados de la selección (a pedido, la
// oportunidad SIEMPRE queda con exactamente un Cliente y un Contacto marcado explícito):
//
//   contactoId cargado          -> resumen "se reusa X" + botón Cambiar. Resuelto.
//   sin contactoId              -> radios, UNO por camino posible:
//     · un radio por cada contacto ya vinculado al Cliente (elegirlo = contactoId)
//     · buscador (solo `permitirVincular`, siempre a la vista): contra el tablero
//       Contactos por celular/nombre/email (onBuscarContacto); elegir un resultado =
//       onVincularContacto -> contactoId. Sin resultados, ofrece crearlo con lo buscado.
//     · "Crear un contacto nuevo": el popup de siempre (mismo cliente / nombre)
//   Nada marcado (contactoModo null y sin contactoId) bloquea Continuar — la selección
//   es explícita incluso cuando el Cliente tiene UN solo contacto (antes se auto-elegía).
//
// El teléfono/email quedan visibles también con contacto elegido: solo completan lo que
// al contacto le falte (ensureContactoCrmId nunca pisa lo que ya tenía cargado).
// Reunión del 24/09: si la búsqueda de contacto no encuentra nada, se ofrece crearlo con
// lo que se buscó. Un término que es un número se toma como celular (con su código de
// país si lo trae, "+54 11..."); cualquier otra cosa, como el nombre del contacto.
const pareceTelefono = (termino) => /^\+?[\d\s().-]{6,}$/.test(termino.trim())

function contactoDesdeBusqueda(termino, codigoPaisPorDefecto) {
  const limpio = termino.trim()
  if (!pareceTelefono(limpio)) return { nombre: limpio }
  if (limpio.startsWith('+')) {
    const digitos = limpio.replace(/\D/g, '')
    // El código más largo primero: "+595" no tiene que leerse como "+59" + "5...".
    const codigo = [...CODIGO_PAIS_OPTIONS]
      .sort((a, b) => b.value.length - a.value.length)
      .find((o) => digitos.startsWith(o.value.slice(1)))
    if (codigo) return { codigoPais: codigo.value, telefono: digitos.slice(codigo.value.length - 1) }
  }
  return { codigoPais: codigoPaisPorDefecto || '+598', telefono: limpio }
}

export function ContactoFields({
  form,
  handleChange,
  resetKey,
  contactosDelCliente = [],
  onElegirContacto,
  onContactoModo,
  permitirVincular = false,
  onBuscarContacto,
  onVincularContacto,
  // Contacto del Cliente con el MISMO nombre que el cliente (lo calcula el form): con el
  // check "es el mismo cliente" tildado se ofrece usarlo en vez de crear un duplicado.
  homonimo = null,
}) {
  const nombreCliente = `${form.nombre} ${form.apellido}`.trim()
  // El elegido puede no estar en contactosDelCliente (vino de "Vincular" o del aviso de
  // duplicados): se arma el resumen con lo que el form ya tiene de él.
  const contactoElegido = form.contactoId
    ? contactosDelCliente.find((c) => c.id === form.contactoId) ?? {
        id: form.contactoId,
        name: form.contactoNombre || 'Contacto seleccionado',
        telefono: form.telefono,
        email: form.email,
      }
    : null
  // El contacto nuevo existe recién cuando pasó por el popup y tiene teléfono: antes de
  // eso no hay nada que mostrar en la lista. No es un ítem de monday todavía —se crea al
  // guardar la oportunidad, como siempre—, así que la etiqueta "Nuevo" es lo único que lo
  // distingue del resto.
  const contactoNuevo =
    form.contactoModo === 'nuevo' && !form.contactoId && form.telefono?.trim()
      ? {
          nombre: form.contactoMismoCliente !== false ? nombreCliente : form.contactoNombre?.trim(),
          telefono: form.telefono,
          email: form.email,
        }
      : null

  const hayOpciones = contactosDelCliente.length > 0 || permitirVincular
  // A pedido: los datos que el contacto elegido YA tiene no se tocan (ni se muestran como
  // campos) — como mucho se SUMA lo que le falta. El chip de arriba ya muestra lo cargado.
  // Solo para SUMARLE a un contacto ya elegido lo que le falte. Los datos del contacto
  // nuevo se cargan en el popup, no acá.
  const mostrarTelefono = Boolean(contactoElegido) && !contactoElegido.telefono
  const mostrarEmail = Boolean(contactoElegido) && !contactoElegido.email

  // Buscador de contactos — a pedido, NO es live search: se busca
  // recién al apretar "Buscar" (o Enter). Buscar es una acción deliberada acá — el
  // usuario tipea un dato completo (nombre, teléfono, email) y pide resultados una vez,
  // no espera sugerencias a medio tipear. `resultados === null` = todavía no buscó nada
  // (no se muestra "sin resultados" antes de la primera búsqueda).
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState(null)
  // Qué contacto tiene abierta la lista de sus clientes. Uno por vez: son filas cortas y
  // abrir varias a la vez empuja el resto de la pantalla sin que nadie lo haya pedido.
  const [detalleClientes, setDetalleClientes] = useState(null)
  const [modalNuevo, setModalNuevo] = useState(false)
  // Con qué abre el popup de contacto nuevo cuando viene de una búsqueda sin resultados
  // (ver contactoDesdeBusqueda). null = abre con lo que el form ya tenía, como siempre.
  const [nuevoDesdeBusqueda, setNuevoDesdeBusqueda] = useState(null)
  const abrirNuevo = (desdeBusqueda = null) => {
    setNuevoDesdeBusqueda(desdeBusqueda)
    setModalNuevo(true)
  }
  // Qué término produjo los resultados de abajo — se muestra en el label para que nunca
  // queden resultados de "juan" bajo un input que ya dice "pedro".
  const [terminoBuscado, setTerminoBuscado] = useState('')
  const [buscando, setBuscando] = useState(false)
  const ejecutarBusqueda = async () => {
    if (!onBuscarContacto || busqueda.trim().length < 2) return
    setBuscando(true)
    setTerminoBuscado(busqueda.trim())
    try {
      setResultados(await onBuscarContacto(busqueda))
    } catch {
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }

  const etiquetaContacto = (c) => [c.name, c.telefono && telefonoParaMostrar(c.telefono), c.email].filter(Boolean).join(' — ')

  // Un contacto puede estar vinculado a varios Clientes, y la lista entera no entra en
  // una línea: se veía "(cliente: Valentina TAP, santiago tap, VALERIA DAIANA GRAJALES
  // SOSA, Theautomationpartner)" tapando el nombre y el teléfono, que es lo que se está
  // mirando para elegir. Se resume por cantidad y el detalle queda a un hover o un clic.
  //
  // La cantidad sale de clienteIds y no de contar comas en el texto: monday junta los
  // nombres con ", " y un cliente con coma en el nombre daría un número inventado.
  const clientesDeContacto = (c) => {
    const cuantos = c.clienteIds?.length ?? (c.clienteNombre ? 1 : 0)
    if (!cuantos || !c.clienteNombre) return null
    // El caso más común es que el contacto SEA el cliente: repetir ahí el nombre no
    // agrega nada y hace la fila más larga ("Ana Gomez — 099... — Ana Gomez").
    const mismoNombre = c.clienteNombre.trim().toLowerCase() === String(c.name ?? '').trim().toLowerCase()
    if (cuantos === 1 && mismoNombre) return null
    // Con uno solo, el nombre entra y dice mucho más que "de 1 cliente".
    return {
      resumen: cuantos === 1 ? c.clienteNombre : `Contacto de ${cuantos} clientes`,
      detalle: c.clienteNombre,
      varios: cuantos > 1,
    }
  }

  return (
    <div className="crear-op__section">
      <SectionTitle icon={MdCall}>Contacto</SectionTitle>
      {/* A pedido, el mismo rótulo en todos lados donde se cargan o eligen datos de
          contacto (popup de contacto nuevo, ficha del cliente, y este paso tanto con
          un Lead nuevo como con un Cliente ya elegido). */}
      <p className="crear-op__section-hint">Información de contacto.</p>

      {contactoNuevo ? (
        // A pedido: el contacto nuevo se muestra igual que los demás, con una etiqueta
        // que aclara que todavía no existe en Contactos. Es solo visual: se crea recién
        // al guardar la oportunidad, como siempre.
        <div className="crear-op__contacto-elegido">
          <span>
            <strong>{contactoNuevo.nombre || 'Contacto nuevo'}</strong>
            <span className="crear-op__etiqueta-nuevo">Nuevo</span>
            {[contactoNuevo.telefono, contactoNuevo.email].filter(Boolean).length > 0 && (
              <> — {[contactoNuevo.telefono, contactoNuevo.email].filter(Boolean).join(' — ')}</>
            )}
          </span>
          <span className="crear-op__contacto-acciones">
            <Button kind="tertiary" size="small" onClick={() => abrirNuevo()}>
              <MdEdit /> Editar
            </Button>
            <Button kind="tertiary" size="small" onClick={() => onContactoModo?.(null)}>
              <MdClear /> Quitar
            </Button>
          </span>
        </div>
      ) : contactoElegido ? (
        // Resuelto: se reusa tal cual está en Contactos. "Quitar" deshace la selección
        // (a pedido: arrepentirse tiene que ser un botón obvio, no releer un párrafo).
        <div className="crear-op__contacto-elegido">
          <span>
            <strong>{contactoElegido.name}</strong>
            {[contactoElegido.telefono, contactoElegido.email].filter(Boolean).length > 0 && (
              <> — {[contactoElegido.telefono && telefonoParaMostrar(contactoElegido.telefono), contactoElegido.email].filter(Boolean).join(' — ')}</>
            )}
          </span>
          <Button kind="tertiary" size="small" onClick={() => onElegirContacto?.(null)}>
            <MdClear /> Quitar
          </Button>
        </div>
      ) : (
        <>
          {hayOpciones && (
            <>
              {/* En pantallas anchas los contactos van en 2 columnas (auto-fit) — la fila
                  entera para un solo radio dejaba media pantalla vacía. Las opciones de
                  camino (Vincular/Crear) quedan a lo ancho, cierran la lista. */}
              {/* Los contactos ya vinculados al Cliente van como filas-tarjeta (ver
                  .crear-op__opcion) — antes radios y checkbox eran renglones idénticos
                  y "es el mismo cliente" parecía una opción hermana más. */}
              <div className="crear-op__contactos-radios">
                {contactosDelCliente.map((c) => {
                  const clientes = clientesDeContacto(c)
                  return (
                    <label key={c.id} className="crear-op__checkbox crear-op__opcion">
                      <input
                        type="radio"
                        name="contacto-oportunidad"
                        checked={false}
                        onChange={() => onElegirContacto?.(c.id)}
                      />
                      <span>
                        {etiquetaContacto(c)}
                        {clientes && (
                          <>
                            {' — '}
                            {clientes.varios ? (
                              <button
                                type="button"
                                className="crear-op__clientes-chip"
                                title={clientes.detalle}
                                aria-expanded={detalleClientes === c.id}
                                onClick={(e) => {
                                  // El clic es del chip, no de la fila: sin esto elegiría
                                  // el contacto solo por querer ver de quién es.
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setDetalleClientes((prev) => (prev === c.id ? null : c.id))
                                }}
                              >
                                {clientes.resumen} <MdInfoOutline />
                              </button>
                            ) : (
                              <span className="crear-op__clientes-chip">{clientes.resumen}</span>
                            )}
                          </>
                        )}
                        {clientes && detalleClientes === c.id && (
                          <span className="crear-op__clientes-detalle">{clientes.detalle}</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
              {/* Reunión del 24/09: el buscador de contactos (por celular o nombre) ya no
                  está detrás de "Vincular un contacto existente": va siempre a la vista, y
                  si no encuentra nada ofrece crear el contacto con lo buscado. */}
              {permitirVincular && (
                <div className="crear-op__subopcion">
                  <div className="crear-op__buscar-contacto">
                    <TextField
                      size="medium"
                      title="Buscar contacto"
                      placeholder="Celular, nombre o email"
                      value={busqueda}
                      onChange={setBusqueda}
                      onKeyDown={(e) => e.key === 'Enter' && ejecutarBusqueda()}
                      icon={MdClear}
                      onIconClick={() => {
                        setBusqueda('')
                        setResultados(null)
                      }}
                    />
                    <Button
                      kind="secondary"
                      size="medium"
                      loading={buscando}
                      disabled={busqueda.trim().length < 2}
                      onClick={ejecutarBusqueda}
                    >
                      <MdPersonSearch /> Buscar
                    </Button>
                  </div>
                  {resultados !== null && !buscando && resultados.length === 0 && (
                    <div className="crear-op__sin-resultados">
                      <p className="crear-op__section-hint">Sin resultados para «{terminoBuscado}» en Contactos.</p>
                      <Button
                        kind="primary"
                        size="small"
                        onClick={() => abrirNuevo(contactoDesdeBusqueda(terminoBuscado, form.codigoPais))}
                      >
                        <MdPersonAdd />{' '}
                        {pareceTelefono(terminoBuscado)
                          ? `Crear contacto con el celular ${terminoBuscado}`
                          : `Crear el contacto «${terminoBuscado}»`}
                      </Button>
                    </div>
                  )}
                  {/* A pedido: los resultados a la vista, en una lista con scroll — antes era
                      un desplegable que había que abrir para ver qué había. Un clic en la
                      fila vincula ese contacto. */}
                  {(resultados ?? []).length > 0 && (
                    <div className="crear-op__resultados-contacto">
                      <span className="crear-op__resultados-titulo">
                        Resultados de «{terminoBuscado}» ({resultados.length})
                      </span>
                      <ul role="list">
                        {resultados.map((c) => {
                          const clientes = clientesDeContacto(c)
                          return (
                            <li key={c.id}>
                              <button
                                type="button"
                                className="crear-op__resultado-contacto"
                                title={clientes?.detalle || undefined}
                                onClick={() => onVincularContacto?.(c)}
                              >
                                <strong>{c.name}</strong>
                                <span>{[c.telefono && telefonoParaMostrar(c.telefono), c.email].filter(Boolean).join(' · ')}</span>
                                {clientes && <span className="crear-op__resultado-clientes">{clientes.resumen}</span>}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <div className="crear-op__risk-toggle crear-op__contacto-caminos">
                <button
                  type="button"
                  className={
                    form.contactoModo === 'nuevo'
                      ? 'crear-op__risk-option crear-op__risk-option--active'
                      : 'crear-op__risk-option'
                  }
                  onClick={() => abrirNuevo()}
                >
                  <MdPersonAdd className="crear-op__risk-option-icon" />
                  Crear un contacto nuevo
                </button>
              </div>
            </>
          )}

        </>
      )}

      {modalNuevo && (
        <ContactoNuevoModal
          nombreCliente={nombreCliente}
          // Desde una búsqueda por nombre, el nombre buscado es el del contacto (no el
          // del cliente); por celular, arranca como el propio cliente, editable.
          mismoClienteInicial={
            nuevoDesdeBusqueda ? !nuevoDesdeBusqueda.nombre : form.contactoMismoCliente !== false
          }
          inicial={
            nuevoDesdeBusqueda
              ? {
                  nombre: nuevoDesdeBusqueda.nombre ?? '',
                  codigoPais: nuevoDesdeBusqueda.codigoPais ?? form.codigoPais,
                  telefono: nuevoDesdeBusqueda.telefono ?? '',
                  email: '',
                }
              : {
                  nombre: form.contactoNombre ?? '',
                  codigoPais: form.codigoPais,
                  telefono: form.telefono ?? '',
                  email: form.email ?? '',
                }
          }
          homonimo={homonimo}
          contactosDelCliente={contactosDelCliente}
          onElegirHomonimo={(h) => onElegirContacto?.(h.id)}
          // Teléfono repetido detectado adentro del popup: "usar ese contacto" cae en el
          // mismo camino que elegirlo desde el buscador.
          onUsarExistente={onVincularContacto ? (contacto) => onVincularContacto(contacto) : undefined}
          onClose={() => setModalNuevo(false)}
          onGuardar={(datos) => {
            handleChange('contactoMismoCliente', datos.mismoCliente)
            handleChange('contactoNombre', datos.mismoCliente ? '' : datos.nombre)
            handleChange('codigoPais', datos.codigoPais)
            handleChange('telefono', datos.telefono)
            handleChange('email', datos.email)
            // Recién acá queda marcado el camino: hasta confirmar, abrir el popup y
            // cerrarlo no tiene que cambiar nada de lo que estaba elegido.
            onContactoModo?.('nuevo')
            setModalNuevo(false)
          }}
        />
      )}

      {/* Teléfono/Email: con "crear nuevo" son los datos del contacto; con uno elegido
          solo aparecen los que le FALTAN (los cargados no se editan desde acá). Con nada
          marcado todavía, no hay a quién cargarle datos y no se muestra ninguno. */}
      {(mostrarTelefono || mostrarEmail) && (
      <div className="crear-op__fields--grid">
        {mostrarTelefono && (
        <label className="crear-op__field">
          <span>Teléfono <Required /></span>
          <div className="crear-op__phone">
            <div className="crear-op__phone-code">
              <RequiredDropdown
                size="medium"
                options={CODIGO_PAIS_OPTIONS}
                value={CODIGO_PAIS_OPTIONS.find((o) => o.value === form.codigoPais) ?? null}
                {...codigoPaisDropdownProps}
                onChange={(option) => handleChange('codigoPais', option?.value ?? '')}
              />
            </div>
            <TextField
              size="medium"
              key={`telefono-${resetKey}`}
              wrapperClassName="crear-op__phone-number"
              placeholder="Ej: 099 123 456"
              value={form.telefono}
              onChange={(value) => handleChange('telefono', value)}
              icon={MdClear}
              onIconClick={() => handleChange('telefono', '')}
              validation={
                telefonoError(form.telefono, form.codigoPais)
                  ? { status: 'error' }
                  : form.telefono
                    ? { status: 'success' }
                    : undefined
              }
            />
          </div>
          {telefonoError(form.telefono, form.codigoPais) && (
            <span className="crear-op__field-error" role="alert">{telefonoError(form.telefono, form.codigoPais)}</span>
          )}
        </label>
        )}
        {/* Email del Contacto (columna contact_email del tablero Contactos). Opcional,
            pero si se carga se valida el formato (ver emailError). */}
        {mostrarEmail && (
        <label className="crear-op__field">
          <span>Email</span>
          <TextField
            size="medium"
            key={`email-${resetKey}`}
            type="email"
            placeholder="Ej: nombre@dominio.com"
            value={form.email ?? ''}
            onChange={(value) => handleChange('email', value)}
            icon={MdClear}
            onIconClick={() => handleChange('email', '')}
            validation={
              emailError(form.email) ? { status: 'error' } : form.email?.trim() ? { status: 'success' } : undefined
            }
          />
          {emailError(form.email) && (
            <span className="crear-op__field-error" role="alert">{emailError(form.email)}</span>
          )}
        </label>
        )}
      </div>
      )}
    </div>
  )
}

// Título grande de cada paso (círculo azul numerado + texto, sin subtítulo) — mismo
// número que ese paso muestra en el Stepper de arriba (ver STEPS), así que el título
// nunca queda desincronizado del contador si algún día cambia el orden/cantidad de
// pasos. `number` a mano (no `stepIndex + 1`) porque el llamado a este componente vive
// adentro de un `{stepIndex === N && (...)}` puntual, no en un .map — no hay de dónde
// sacar el índice ahí. aria-hidden en el círculo: es un adorno visual que repite un
// número que un lector de pantalla ya anuncia por otro lado (el Stepper es navegable
// con aria-selected, ver Stepper.jsx), no hace falta leerlo de nuevo acá.
export function StepHeading({ number, title, subtitle }) {
  return (
    <div className="crear-op__step-heading-wrap">
      <div className="crear-op__step-heading">
        <span className="crear-op__step-badge" aria-hidden="true">
          {number}
        </span>
        <span className="crear-op__step-title">{title}</span>
      </div>
      {subtitle && <p className="crear-op__step-subtitle">{subtitle}</p>}
    </div>
  )
}
