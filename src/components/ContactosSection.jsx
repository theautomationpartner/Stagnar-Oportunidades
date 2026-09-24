import { useEffect, useMemo, useState } from 'react'
import { MdChevronLeft, MdChevronRight, MdClear, MdContactPhone, MdGroups, MdPeopleAlt, MdPersonAdd, MdSearch } from 'react-icons/md'
import { AttentionBox, Button, EmptyState, Modal, ModalContent, ModalFooter, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, TextField } from '@vibe/core'
import Avatar from './Avatar'
import LoadingScreen from './LoadingScreen'
import ContactoNuevoModal from './ContactoNuevoModal'
import {
  createContactoCrm,
  fetchContactosCrmTodos,
  fetchContactoFicha,
  updateContactoCrmFicha,
  buscarContactosCrmLibre,
} from '../services/mondayApi'
import { buildMondayPhone, CODIGO_PAIS_OPTIONS, emailError, initialsOf, telefonoError } from '../services/personaFields'
import { RequiredDropdown, codigoPaisDropdownProps, Required } from './crear/FormPrimitives'
import { normalizarParaMatch } from '../services/format'
// Estilos de los campos del modo edición (crear-op__field / crear-op__phone) — los
// mismos del wizard, para que los inputs de la card se vean como el resto de la app.
import './CrearOportunidadForm.css'
// El estilo pill-tabs se importa por componente (no es global), igual que en Clientes y
// Grupos: sin esto las solapas quedan como botones pelados.
import './PillTabs.css'
import './ContactosSection.css'

// Tabla del tablero Contactos: a quién se le manda la información. Es una vista de
// consulta — de acá no se edita nada; el alta y la vinculación pasan por el paso 1 de
// Crear Oportunidad.
//
// El tablero es chico (decenas), así que se trae entero y la búsqueda filtra en memoria.
// El recorrido con cursor igual está en fetchContactosCrmTodos: el día que crezca, lo que
// falla en silencio es traer una sola página y no enterarse.

const COLUMNS = [
  { id: 'contacto', title: 'Contacto', width: '30%' },
  { id: 'telefono', title: 'Teléfono', width: '20%' },
  { id: 'email', title: 'Email', width: '25%' },
  { id: 'clientes', title: 'Clientes', width: '25%' },
]

// A pedido: máximo 50 por página. Todo está en memoria — el paginado existe para que la
// página no se haga interminable, no hay cursor de por medio.
const PAGE_SIZE = 50

// Números de página con "…": primera, última, la actual con una de margen, y el resto
// resumido. Mismo criterio que las otras tablas de la app.
function paginasVisibles(actual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = [...new Set([1, total, actual - 1, actual, actual + 1])]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b)
  const conHuecos = []
  set.forEach((p, i) => {
    if (i > 0 && p - set[i - 1] > 1) conHuecos.push(null)
    conHuecos.push(p)
  })
  return conHuecos
}

// Un contacto puede estar vinculado a varios Clientes y la lista entera no entra en una
// celda. Se resume por cantidad y los nombres quedan en el title, al alcance del mouse.
// La cantidad sale de clienteIds y no de contar comas: monday junta los nombres con ", "
// y un cliente con coma en el nombre daría un número inventado.
function clientesDeContacto(c) {
  const cuantos = c.clienteIds?.length ?? 0
  if (!cuantos || !c.clienteNombre) return null
  return {
    resumen: cuantos === 1 ? c.clienteNombre : `${cuantos} clientes`,
    detalle: c.clienteNombre,
    // Con un solo cliente el resumen YA es el nombre: el subrayado punteado prometía un
    // detalle al pasar el mouse que era exactamente lo mismo que se estaba leyendo.
    varios: cuantos > 1,
  }
}

// El teléfono se guarda con el código de país pegado ("59809...") — para editar se
// separa contra la lista real de códigos (el más largo que matchee) y si ninguno
// matchea se asume Uruguay con el número tal cual vino.
function separarTelefono(digits) {
  const limpio = String(digits ?? '').replace(/\D/g, '')
  const codigos = [...CODIGO_PAIS_OPTIONS].sort((a, b) => b.value.length - a.value.length)
  const match = codigos.find((o) => limpio.startsWith(o.value.replace('+', '')))
  if (match) return { codigoPais: match.value, numero: limpio.slice(match.value.replace('+', '').length) }
  return { codigoPais: '+598', numero: limpio }
}

const colaTelefono = (s) => String(s ?? '').replace(/\D/g, '').slice(-8)

// Card con la ficha del contacto (a pedido): se abre al clickear la fila. La tabla ya
// sabe nombre/teléfono/email — con eso se pinta al instante — y por atrás se pide lo que
// la fila no tiene: los clientes vinculados con su id (para saltar a la ficha de cada
// uno), las Notas y el estado de Revisión que deja la lectura automática.
//
// "Editar" (a pedido) transforma los textos en inputs EN EL MISMO lugar: nombre,
// teléfono (con código de país), email y notas. El teléfono editado se verifica contra
// Contactos igual que en el alta (debounce, excluyéndose a sí mismo): repetido, no se
// puede guardar.
function ContactoFichaModal({ contacto, onOpenCliente, onActualizado, onClose }) {
  const [ficha, setFicha] = useState(null)
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [codigoPais, setCodigoPais] = useState('+598')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState(null)
  // Verificación del teléfono editado: 'sin' | 'buscando' | 'libre' | 'duplicado'.
  const [chequeo, setChequeo] = useState('sin')
  const [dupTelefono, setDupTelefono] = useState(null)

  useEffect(() => {
    let vivo = true
    fetchContactoFicha(contacto.id)
      .then((f) => vivo && f && setFicha(f))
      .catch(() => {
        // sin detalle extra, la card se queda con lo que la fila ya mostraba
      })
    return () => {
      vivo = false
    }
  }, [contacto.id])
  const datos = ficha ?? { ...contacto, clientes: null, notas: '', revision: '', motivoRevision: '' }

  const telErr = telefonoError(telefono, codigoPais)
  const mailErr = emailError(email)
  const telefonoCambio = editando && colaTelefono(buildMondayPhone(codigoPais, telefono).phone) !== colaTelefono(datos.telefono)

  // Mismo criterio que el popup de contacto nuevo: apenas hay un número válido y
  // DISTINTO del actual, se consulta Contactos y Guardar queda en gris hasta saber que
  // está libre. El propio contacto no cuenta como duplicado.
  useEffect(() => {
    if (!editando || !telefono.trim() || telErr || !telefonoCambio) {
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
          const repetido =
            encontrados.find((c) => String(c.id) !== String(contacto.id) && colaTelefono(c.telefono) === cola) ?? null
          setDupTelefono(repetido)
          setChequeo(repetido ? 'duplicado' : 'libre')
        })
        .catch(() => {
          // monday no respondió: no se traba la edición por una consulta caída
          if (cancelado) return
          setDupTelefono(null)
          setChequeo('libre')
        })
    }, 500)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [editando, telefono, codigoPais, telErr, telefonoCambio, contacto.id])

  const entrarEdicion = () => {
    const { codigoPais: cp, numero } = separarTelefono(datos.telefono)
    setNombre(datos.name)
    setCodigoPais(cp)
    setTelefono(numero)
    setEmail(datos.email ?? '')
    setNotas(datos.notas ?? '')
    setErrorGuardar(null)
    setEditando(true)
  }

  // El teléfono solo condiciona el guardado si se TOCÓ. Sin esto el botón quedaba en
  // gris para siempre en dos casos muy comunes, y no se podía corregir ni el nombre ni
  // el email ni las notas:
  //
  //   · Contactos sin teléfono. Son la mayoría del tablero.
  //   · Contactos cuyo número guardado no valida contra el formato que espera la app.
  //     En el tablero conviven cuatro largos distintos después del 598 (8, 9, 12 y 13
  //     dígitos) y solo el de 9 pasa: el resto abría la edición ya en rojo, bloqueada,
  //     por un dato que venía así de antes y que nadie estaba editando.
  //
  // Un número que no se tocó tampoco se escribe (ver `guardar`), así que dejarlo pasar
  // no guarda nada malo. Si se edita, se valida y se chequea duplicado como siempre.
  const telefonoBloquea = telefonoCambio && (Boolean(telErr) || (Boolean(telefono.trim()) && chequeo !== 'libre'))

  const puedeGuardar = Boolean(nombre.trim()) && !mailErr && !telefonoBloquea && !guardando

  const guardar = async () => {
    if (!puedeGuardar) return
    setGuardando(true)
    setErrorGuardar(null)
    try {
      await updateContactoCrmFicha(contacto.id, {
        name: nombre.trim() !== datos.name ? nombre : undefined,
        phone: telefonoCambio ? buildMondayPhone(codigoPais, telefono) : undefined,
        email: (email ?? '').trim() !== (datos.email ?? '') ? email.trim() : undefined,
        notas: (notas ?? '') !== (datos.notas ?? '') ? notas : undefined,
      })
      const f = await fetchContactoFicha(contacto.id).catch(() => null)
      if (f) {
        setFicha(f)
        // La fila de la tabla de atrás se actualiza en el momento, sin recargar todo.
        onActualizado?.(f)
      }
      setEditando(false)
    } catch (err) {
      setErrorGuardar(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal id="contacto-ficha-modal" show onClose={onClose} size="medium">
      <ModalContent className="contactos__ficha">
        <div className="contactos__ficha-cabecera">
          <Avatar label={initialsOf(editando ? nombre || datos.name : datos.name)} />
          {editando ? (
            <TextField
              size="medium"
              wrapperClassName="contactos__ficha-nombre-input"
              title="Nombre"
              required
              value={nombre}
              onChange={setNombre}
              icon={MdClear}
              onIconClick={() => setNombre('')}
              validation={nombre.trim() ? { status: 'success' } : { status: 'error' }}
            />
          ) : (
            <div>
              <h2>{datos.name}</h2>
              <p>
                Contacto
                {datos.clientes?.length
                  ? ` de ${datos.clientes.length} cliente${datos.clientes.length === 1 ? '' : 's'}`
                  : ''}
              </p>
            </div>
          )}
        </div>

        {datos.revision === 'Si' && !editando && (
          <AttentionBox type="warning" title="Marcado para revisión" className="contactos__ficha-aviso">
            {datos.motivoRevision || 'Hay un dato de este contacto para revisar.'}
          </AttentionBox>
        )}

        {editando && chequeo === 'duplicado' && dupTelefono && (
          <AttentionBox type="danger" title="Ese teléfono ya está cargado" className="contactos__ficha-aviso">
            <strong>{dupTelefono.name}</strong>
            {dupTelefono.clienteNombre ? ` (cliente: ${dupTelefono.clienteNombre})` : ''}.
            <br />
            {/* Acá no se ofrece "utilizar el existente": se está EDITANDO un contacto
                que ya existe, no eligiendo cuál usar. */}
            Si corresponde a la misma persona, ya está cargada. De lo contrario, ingrese otro número.
          </AttentionBox>
        )}

        {errorGuardar && (
          <AttentionBox type="danger" title="No se pudo guardar" className="contactos__ficha-aviso">
            {errorGuardar}
          </AttentionBox>
        )}

        {/* El mismo panel en los dos modos: "Editar" transforma cada dato en su input,
            en el mismo lugar donde se estaba leyendo. */}
        <dl className="contactos__ficha-datos">
          <div>
            <dt>Teléfono{editando && <Required />}</dt>
            <dd>
              {editando ? (
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
                        : telefono && (!telefonoCambio || chequeo === 'libre')
                          ? { status: 'success' }
                          : undefined
                    }
                  />
                </div>
              ) : (
                datos.telefono || '—'
              )}
              {editando && telErr && (
                <span className="crear-op__field-error" role="alert">
                  {telErr}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              {editando ? (
                <>
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
                  {mailErr && (
                    <span className="crear-op__field-error" role="alert">
                      {mailErr}
                    </span>
                  )}
                </>
              ) : (
                datos.email || '—'
              )}
            </dd>
          </div>
          {(editando || datos.notas) && (
            <div className="contactos__ficha-notas">
              <dt>Notas</dt>
              <dd>
                {editando ? (
                  <textarea
                    className="contactos__ficha-notas-input"
                    rows={3}
                    placeholder="Notas del contacto"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                  />
                ) : (
                  datos.notas
                )}
              </dd>
            </div>
          )}
        </dl>

        <div className="contactos__ficha-clientes">
          <h3>Clientes vinculados</h3>
          {datos.clientes === null ? (
            <p className="contactos__vacio">Cargando...</p>
          ) : datos.clientes.length === 0 ? (
            <p className="contactos__vacio">Sin clientes vinculados.</p>
          ) : (
            <ul>
              {datos.clientes.map((cl) => (
                <li key={cl.id}>
                  <button type="button" className="contactos__ficha-link" onClick={() => onOpenCliente?.(cl.id)}>
                    {cl.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ModalContent>
      {editando ? (
        <ModalFooter
          secondaryButton={{ text: 'Cancelar', onClick: () => setEditando(false) }}
          primaryButton={{
            text:
              chequeo === 'buscando'
                ? 'Verificando teléfono...'
                : guardando
                  ? 'Guardando...'
                  : 'Guardar cambios',
            disabled: !puedeGuardar,
            onClick: guardar,
          }}
        />
      ) : (
        <ModalFooter
          // Editar recién cuando llegó la ficha completa: editar sobre los datos a
          // medias de la fila pisaría notas que todavía no se vieron.
          secondaryButton={{ text: 'Editar', disabled: !ficha, onClick: entrarEdicion }}
          primaryButton={{ text: 'Cerrar', onClick: onClose }}
        />
      )}
    </Modal>
  )
}

export default function ContactosSection({ onIrAClientes, onIrAGrupos, onOpenCliente }) {
  const [fichaDe, setFichaDe] = useState(null)
  const [contactos, setContactos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Igual que en Clientes (a pedido): la búsqueda se aplica con "Buscar" o Enter, no
  // mientras se tipea. `busqueda` es lo tipeado; `termino` lo que filtra la tabla.
  const [busqueda, setBusqueda] = useState('')
  const [termino, setTermino] = useState('')
  const [page, setPage] = useState(1)
  // Alta de un contacto desde acá. A diferencia del wizard, el contacto no nace colgado
  // de una oportunidad: hay que decir a qué cliente pertenece, y por eso al popup se le
  // pasa la lista de clientes (ver ContactoNuevoModal).
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState(null)
  const [guardandoNuevo, setGuardandoNuevo] = useState(false)

  const abrirAlta = () => {
    setErrorCrear(null)
    setCreando(true)
  }

  const crearContacto = async (datos) => {
    setGuardandoNuevo(true)
    setErrorCrear(null)
    try {
      await createContactoCrm({
        name: datos.nombre,
        phone: buildMondayPhone(datos.codigoPais, datos.telefono),
        email: datos.email?.trim() ? { email: datos.email.trim(), text: datos.email.trim() } : undefined,
        clienteId: datos.clienteId,
        existingContactIds: (datos.contactosDelCliente ?? []).map((c) => c.id),
      })
      // La lista se vuelve a traer entera: el contacto nuevo ya viene con su cliente
      // vinculado, y así la fila se arma igual que las demás.
      const lista = await fetchContactosCrmTodos()
      setContactos(lista)
      setCreando(false)
    } catch (err) {
      setErrorCrear(err.message)
    } finally {
      setGuardandoNuevo(false)
    }
  }

  const buscar = (valor = busqueda) => {
    setTermino(valor)
    setPage(1)
  }

  useEffect(() => {
    let vivo = true
    fetchContactosCrmTodos()
      .then((lista) => {
        if (vivo) setContactos(lista)
      })
      .catch((err) => {
        if (vivo) setError(err.message)
      })
      .finally(() => {
        if (vivo) setLoading(false)
      })
    return () => {
      vivo = false
    }
  }, [])

  const filtrados = useMemo(() => {
    // Sin distinguir tildes (normalizarParaMatch): "lucia" encuentra "Lucía".
    const q = normalizarParaMatch(termino)
    if (!q) return contactos
    return contactos.filter((c) =>
      [c.name, c.telefono, c.email, c.clienteNombre]
        .filter(Boolean)
        .some((v) => normalizarParaMatch(v).includes(q))
    )
  }, [contactos, termino])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  const paginaActual = Math.min(page, totalPaginas)
  const pagina = useMemo(
    () => filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE),
    [filtrados, paginaActual]
  )
  const primeraFila = filtrados.length === 0 ? 0 : (paginaActual - 1) * PAGE_SIZE + 1
  const ultimaFila = filtrados.length === 0 ? 0 : primeraFila + pagina.length - 1

  // La misma pantalla verde que Clientes, Grupos y el fallback de Suspense: el esqueleto
  // de la tabla era otra espera distinta para lo mismo.
  if (loading) {
    return <LoadingScreen title="Cargando contactos" message="Estamos trayendo la lista de contactos desde monday." />
  }

  return (
    <section className="contactos">
      <header className="contactos__head">
        <h1>Contactos</h1>
        <p>A quién se le manda la información. Un contacto puede pertenecer a varios clientes.</p>
      </header>

      {/* Las tres solapas son las tres vistas de lo mismo: por cliente, por grupo
          económico y por contacto. Misma barra que Clientes y Grupos. */}
      <div className="contactos__toolbar">
        <div className="pill-tabs contactos__tabs" role="tablist">
          <button type="button" role="tab" aria-selected="false" className="pill-tabs__tab" onClick={onIrAClientes}>
            <MdPeopleAlt aria-hidden="true" /> Clientes
          </button>
          <button type="button" role="tab" aria-selected="false" className="pill-tabs__tab" onClick={onIrAGrupos}>
            <MdGroups aria-hidden="true" /> Grupos económicos
          </button>
          <button type="button" role="tab" aria-selected="true" className="pill-tabs__tab pill-tabs__tab--active">
            <MdContactPhone aria-hidden="true" /> Contactos
          </button>
        </div>
        <div className="contactos__buscador">
          <TextField
            size="medium"
            placeholder="Buscar por nombre, teléfono, email o cliente..."
            icon={MdClear}
            value={busqueda}
            onChange={(v) => {
              setBusqueda(v)
              // Borrar todo el texto vuelve a la lista completa sin apretar Buscar.
              if (!v.trim()) buscar('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
          />
          <Button kind="secondary" size="medium" onClick={() => buscar()}>
            <MdSearch /> Buscar
          </Button>
          <Button kind="primary" size="medium" onClick={abrirAlta}>
            <MdPersonAdd /> Crear contacto
          </Button>
          <span className="contactos__conteo">
            {termino.trim()
              ? `${filtrados.length} de ${contactos.length} contactos`
              : `${contactos.length} contactos`}
          </span>
        </div>
      </div>

      {errorCrear && (
        <AttentionBox type="danger" title="No se pudo crear el contacto" className="contactos__aviso">
          {errorCrear}
        </AttentionBox>
      )}

      {creando && (
        <ContactoNuevoModal
          pedirCliente
          onGuardar={crearContacto}
          guardando={guardandoNuevo}
          onClose={() => setCreando(false)}
        />
      )}

      <div className="contactos__tabla">
        {/* isLoading en false siempre: mientras carga, el componente devuelve la
            pantalla de carga y no llega a renderizar la tabla. */}
        <Table
          columns={COLUMNS}
          size="large"
          style={{ '--table-row-size': '68px' }}
          dataState={{ isLoading: false, isError: Boolean(error) }}
          errorState={<EmptyState title="Error" description={error || 'No se pudieron cargar los contactos.'} />}
          emptyState={<EmptyState title="Sin contactos" description="No se encontraron contactos para mostrar." />}
        >
          <TableHeader>
            {COLUMNS.map((col) => (
              <TableHeaderCell key={col.id} title={col.title} />
            ))}
          </TableHeader>
          <TableBody>
            {pagina.map((c) => {
              const clientes = clientesDeContacto(c)
              // La fila entera abre la card con la ficha del contacto (a pedido) — el
              // click vive en cada celda porque TableRow no acepta onClick.
              const abrir = () => setFichaDe(c)
              return (
                <TableRow key={c.id} className="contactos__row">
                  <TableCell>
                    <div
                      className="contactos__celda contactos__celda--contacto"
                      role="button"
                      tabIndex={0}
                      aria-label={`Ver la ficha de ${c.name}`}
                      onClick={abrir}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          abrir()
                        }
                      }}
                    >
                      <Avatar label={initialsOf(c.name)} />
                      <span className="contactos__nombre">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="contactos__celda" onClick={abrir}>
                      {c.telefono || <span className="contactos__vacio">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="contactos__celda" onClick={abrir}>
                      {c.email || <span className="contactos__vacio">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="contactos__celda" onClick={abrir}>
                      {clientes ? (
                        <span
                          className={clientes.varios ? 'contactos__clientes contactos__clientes--varios' : 'contactos__clientes'}
                          title={clientes.varios ? clientes.detalle : undefined}
                        >
                          {clientes.resumen}
                        </span>
                      ) : (
                        <span className="contactos__vacio">Sin cliente</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {filtrados.length > PAGE_SIZE && (
        <div className="contactos__paginado">
          <span className="contactos__paginado-resumen">
            Mostrando {primeraFila} a {ultimaFila} de {filtrados.length} contactos
          </span>
          <div className="contactos__paginado-paginas">
            <button
              type="button"
              className="contactos__page-btn"
              onClick={() => setPage(paginaActual - 1)}
              disabled={paginaActual <= 1}
              aria-label="Página anterior"
            >
              <MdChevronLeft />
            </button>
            {paginasVisibles(paginaActual, totalPaginas).map((p, i) =>
              p === null ? (
                <span key={`hueco-${i}`} className="contactos__page-gap">
                  …
                </span>
              ) : (
                <button
                  type="button"
                  key={p}
                  className={
                    p === paginaActual ? 'contactos__page-btn contactos__page-btn--activa' : 'contactos__page-btn'
                  }
                  onClick={() => setPage(p)}
                  aria-current={p === paginaActual ? 'page' : undefined}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              className="contactos__page-btn"
              onClick={() => setPage(paginaActual + 1)}
              disabled={paginaActual >= totalPaginas}
              aria-label="Página siguiente"
            >
              <MdChevronRight />
            </button>
          </div>
        </div>
      )}

      {fichaDe && (
        <ContactoFichaModal
          contacto={fichaDe}
          onOpenCliente={onOpenCliente}
          onActualizado={(f) =>
            setContactos((prev) =>
              prev.map((c) => (c.id === f.id ? { ...c, name: f.name, telefono: f.telefono, email: f.email } : c))
            )
          }
          onClose={() => setFichaDe(null)}
        />
      )}
    </section>
  )
}
