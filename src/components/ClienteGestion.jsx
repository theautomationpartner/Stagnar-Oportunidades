import { useCallback, useEffect, useMemo, useState } from 'react'
import { MdArrowBack, MdBusiness, MdCall, MdClear, MdEdit, MdGroups, MdPeopleAlt, MdPersonAdd } from 'react-icons/md'
import { Button, Dropdown, TextField } from '@vibe/core'
import Avatar from './Avatar'
import StatusBadge from './StatusBadge'
import AlertModal from './AlertModal'
import ContactoNuevoModal from './ContactoNuevoModal'
import LoadingScreen from './LoadingScreen'
import {
  fetchClienteGestion,
  buscarClientesGestion,
  fetchGrupoEconomico,
  buscarGruposEconomicos,
  fetchContactosCrm,
  buscarContactosCrmLibre,
  createContactoCrm,
  vincularContactoACliente,
  desvincularContactoDeCliente,
  setClienteTipo,
  renombrarCliente,
  setClienteEmpresa,
  vincularRelacionClientes,
  desvincularRelacionClientes,
  agregarClienteAGrupo,
  quitarClienteDeGrupo,
  setRolEnGrupo,
  TIPOS_CLIENTE,
  ROL_GRUPO_DEFAULT,
  ROL_GRUPO_EMPRESA,
  rolesGrupoParaTipo,
} from '../services/mondayApi'
import {
  buildMondayPhone,
  buildMondayEmail,
  busquedaYaRegistrada,
  contactoDesdeBusqueda,
  initialsOf,
  splitNombreApellido,
  textoCrearDesdeBusqueda,
} from '../services/personaFields'
import { formatShortDate } from '../services/format'
import './ClienteGestion.css'

// Ficha de gestión de un Cliente: sus Contactos (vincular/crear/quitar), la Empresa
// donde trabaja (solo clientes de tipo Empresa como opciones), las Relaciones
// familiares/societarias (siempre simétricas, ver mondayApi) y el Grupo Económico
// (la conexión del cliente + el subitem "miembro" del grupo van y vienen juntos).
//
// Todas las escrituras van directo a monday y después se relee lo afectado (recargar) —
// acá no hay optimismo de pantalla: cada acción es puntual, con su botón en "ocupado", y
// releer garantiza que lo simétrico (los dos lados de cada conexión) quedó como se ve.

// A pedido: nada de dropdowns con live search para elegir clientes/empresas/grupos (son
// muchos datos) — el gesto es escribir y apretar Buscar (o Enter), como en el resto de
// la app. A pedido, los clientes y los grupos ya no se traen enteros (son miles): se busca
// en monday, y `buscar(termino)` devuelve las opciones ({id, label, meta}).
function BuscadorEnMonday({ placeholder, textoAccion, buscar: buscarOpciones, ocupado, onElegir }) {
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const buscar = async () => {
    const q = busqueda.trim()
    if (q.length < 2) return
    setBuscando(true)
    try {
      setResultados(await buscarOpciones(q))
    } catch {
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }
  return (
    <div className="gcli__buscador-local">
      <div className="gcli__buscar">
        <TextField
          size="medium"
          placeholder={placeholder}
          value={busqueda}
          onChange={(v) => {
            setBusqueda(v)
            setResultados(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && buscar()}
        />
        <Button kind="secondary" size="medium" loading={buscando} disabled={busqueda.trim().length < 2} onClick={buscar}>
          Buscar
        </Button>
      </div>
      {resultados !== null && resultados.length === 0 && <p className="gcli__vacio">Sin resultados.</p>}
      {(resultados ?? []).length > 0 && (
        <ul className="gcli__resultados">
          {resultados.map((o) => (
            <li key={o.id} className="gcli__fila">
              <div className="gcli__fila-datos">
                <strong>{o.label}</strong>
                {o.meta && <span>{o.meta}</span>}
              </div>
              <Button
                kind="secondary"
                size="small"
                disabled={ocupado}
                onClick={() => {
                  setBusqueda('')
                  setResultados(null)
                  onElegir(o)
                }}
              >
                {textoAccion}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// A pedido: los datos de identidad y ubicación del cliente, según su tipo. "—" si falta.
function datosDelCliente(c) {
  const ubicacion = [
    ['Dirección', c.direccion],
    ['Localidad', c.localidad],
    ['Departamento', c.departamento],
  ]
  if (c.tipo === 'Empresa') {
    return [['Razón social', c.razonSocial || c.name], ['RUT', c.rut], ...ubicacion]
  }
  const nacionalidad = c.extranjero === 'Si' ? [c.nacionalidad, 'extranjero'].filter(Boolean).join(' · ') : c.nacionalidad
  return [
    ['Nombre', c.nombre],
    ['Apellido', c.apellido],
    ['CI', c.ci],
    ['Fecha de nacimiento', c.fechaNacimiento ? formatShortDate(c.fechaNacimiento) : ''],
    ['Sexo', c.sexo],
    ['Nacionalidad', nacionalidad],
    ...ubicacion,
  ]
}

// A pedido: los contactos agrupados por su "Tipo de contacto" (tablero Contactos), en
// este orden; los que no tienen tipo van al final.
const TIPOS_DE_CONTACTO = ['Familiar', 'Vinculo societario', 'Profesional externo', 'Dato adicional', 'Homónimo del cliente']
const NOMBRE_TIPO_CONTACTO = { 'Vinculo societario': 'Vínculo societario' }
function contactosPorTipo(contactos) {
  const grupos = new Map()
  for (const c of contactos) {
    const tipo = TIPOS_DE_CONTACTO.includes(c.tipoContacto) ? c.tipoContacto : ''
    if (!grupos.has(tipo)) grupos.set(tipo, [])
    grupos.get(tipo).push(c)
  }
  return [...TIPOS_DE_CONTACTO, '']
    .filter((t) => grupos.has(t))
    .map((t) => ({ tipo: t, titulo: t ? NOMBRE_TIPO_CONTACTO[t] ?? t : 'Sin tipo', contactos: grupos.get(t) }))
}

export default function ClienteGestion({ clienteId, onBack, onOpenCliente }) {
  const [cliente, setCliente] = useState(null)
  const [contactosDetalle, setContactosDetalle] = useState([])
  // Solo el grupo del cliente (con sus miembros): a pedido, ya no se traen todos.
  const [grupoDelCliente, setGrupoDelCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Qué acción está escribiendo ahora mismo ('' = ninguna) — deshabilita su botón y evita
  // pisadas entre acciones (las conexiones se releen y reescriben completas).
  const [ocupado, setOcupado] = useState('')
  const [confirmar, setConfirmar] = useState(null) // { titulo, descripcion, textoOk, onOk }
  // Cambio de nombre (a pedido): null = no se está editando; si no, el borrador.
  const [editandoNombre, setEditandoNombre] = useState(null) // { nombre, apellido }

  // Alta/vínculo de contactos.
  const [busquedaContacto, setBusquedaContacto] = useState('')
  const [resultadosContacto, setResultadosContacto] = useState(null)
  // Lo que devolvió la búsqueda ANTES de sacar los ya vinculados: para saber si el celular
  // o email buscado ya existe (y entonces no ofrecer crearlo, ver busquedaYaRegistrada).
  const [resultadosContactoTodos, setResultadosContactoTodos] = useState([])
  const [buscandoContacto, setBuscandoContacto] = useState(false)
  const [creandoContacto, setCreandoContacto] = useState(false)
  // null = el popup abre como siempre; si no, con lo buscado (búsqueda sin resultados).
  const [contactoDesdeLaBusqueda, setContactoDesdeLaBusqueda] = useState(null)
  // El término que dio los resultados de abajo (el campo puede haber cambiado después).
  const [terminoContacto, setTerminoContacto] = useState('')

  // Rol pendiente de "Agregar al grupo" (solo personas — las empresas entran fijas
  // como Empresa vinculada).
  const [rolElegido, setRolElegido] = useState(ROL_GRUPO_DEFAULT)

  const recargar = useCallback(async () => {
    const cli = await fetchClienteGestion(clienteId)
    setCliente(cli)
    setGrupoDelCliente(cli?.grupo ? await fetchGrupoEconomico(cli.grupo.id) : null)
    setContactosDetalle(cli?.contactos.length ? await fetchContactosCrm(cli.contactos.map((c) => c.id)) : [])
  }, [clienteId])

  useEffect(() => {
    let vivo = true
    setLoading(true)
    setError(null)
    // A pedido: ya no se traen todos los clientes (son miles): la empresa y las relaciones
    // se buscan en monday al apretar Buscar (ver BuscadorEnMonday).
    recargar()
      .catch((err) => vivo && setError(err.message))
      .finally(() => vivo && setLoading(false))
    return () => {
      vivo = false
    }
  }, [recargar])

  // Envuelve cada acción: marca el botón ocupado, escribe, relee, y muestra el error si
  // algo falla (sin dejar la pantalla a medias — lo releído es lo que de verdad quedó).
  const accion = async (clave, fn) => {
    setOcupado(clave)
    setError(null)
    try {
      await fn()
      await recargar()
    } catch (err) {
      setError(err.message)
      await recargar().catch(() => {})
    } finally {
      setOcupado('')
    }
  }

  const esEmpresa = cliente?.tipo === 'Empresa'
  // El/los subitems "miembro" de ESTE cliente en su grupo actual — son los que hay que
  // borrar al quitarlo, y de ahí sale también su rol de hoy.
  const miembrosDelCliente = useMemo(() => {
    if (!cliente?.grupo) return []
    return (grupoDelCliente?.miembros ?? []).filter((m) => m.clienteId === cliente.id)
  }, [cliente, grupoDelCliente])
  const rolActual = miembrosDelCliente[0]?.rol || ''

  // Crear con lo buscado. Si el celular/email buscado ya es de otro contacto, el popup no
  // dejaría guardarlo: se abre vacío ("Crear un contacto nuevo") para cargar otro dato.
  const datoYaRegistrado = busquedaYaRegistrada(terminoContacto, resultadosContactoTodos)
  const textoBotonCrear = datoYaRegistrado ? 'Crear un contacto nuevo' : textoCrearDesdeBusqueda(terminoContacto)
  const crearDesdeBusqueda = () => {
    setContactoDesdeLaBusqueda(datoYaRegistrado ? {} : contactoDesdeBusqueda(terminoContacto))
    setCreandoContacto(true)
  }

  const buscarContactos = async () => {
    if (busquedaContacto.trim().length < 2) return
    setTerminoContacto(busquedaContacto.trim())
    setBuscandoContacto(true)
    try {
      const res = await buscarContactosCrmLibre(busquedaContacto)
      // Los que ya están vinculados a este cliente no se ofrecen de nuevo.
      setResultadosContactoTodos(res)
      setResultadosContacto(res.filter((r) => !(cliente?.contactos ?? []).some((c) => c.id === r.id)))
    } catch {
      setResultadosContacto([])
    } finally {
      setBuscandoContacto(false)
    }
  }

  // Contacto del cliente con su MISMO nombre — el popup bloquea "es el mismo cliente"
  // si ya existe, igual que en el wizard.
  const homonimoDelCliente =
    contactosDetalle.find(
      (c) => c.name.trim().toLowerCase() === (cliente?.name ?? '').trim().toLowerCase()
    ) ?? null

  const crearContacto = (datos) =>
    accion('crear-contacto', async () => {
      await createContactoCrm({
        name: datos.mismoCliente ? cliente.name : datos.nombre,
        phone: datos.telefono.trim() ? buildMondayPhone(datos.codigoPais, datos.telefono) : null,
        email: datos.email.trim() ? buildMondayEmail(datos.email) : null,
        clienteId,
        existingContactIds: (cliente?.contactos ?? []).map((c) => c.id),
      })
      setCreandoContacto(false)
    })

  if (loading) {
    // La misma pantalla verde de marca que el fallback de Suspense (LoadingScreen): el
    // chunk carga primero y los datos después — sin esto había dos esperas distintas.
    return (
      <LoadingScreen
        title="Abriendo el cliente"
        message="Estamos trayendo sus contactos, relaciones y grupo económico desde monday."
      />
    )
  }

  if (!cliente) {
    return (
      <div className="gcli">
        <Button kind="tertiary" size="small" onClick={onBack}>
          <MdArrowBack /> Clientes
        </Button>
        <p className="gcli__error" role="alert">
          {error || 'No se encontró el cliente.'}
        </p>
      </div>
    )
  }

  return (
    <div className="gcli">
      <Button kind="tertiary" size="small" className="gcli__volver" onClick={onBack}>
        <MdArrowBack /> Clientes
      </Button>

      {/* Encabezado: identidad + Tipo Cliente editable (Empresa/Particular/Otro). */}
      <header className="gcli__cabecera">
        <Avatar label={initialsOf(cliente.name)} />
        <div className="gcli__cabecera-datos">
          {/* A pedido: cambiar el nombre desde la ficha. Renombra el cliente y, si tiene
              un contacto homónimo (él mismo), también a ese contacto — ver
              mondayApi.js#renombrarCliente. */}
          {editandoNombre ? (
            <form
              className="gcli__nombre-form"
              onSubmit={(e) => {
                e.preventDefault()
                const { nombre, apellido } = editandoNombre
                if (!nombre.trim() || (!esEmpresa && !apellido.trim())) return
                accion('nombre', async () => {
                  await renombrarCliente(clienteId, { nombre, apellido })
                  setEditandoNombre(null)
                })
              }}
            >
              <TextField
                size="small"
                title={esEmpresa ? 'Razón social' : 'Nombre'}
                value={editandoNombre.nombre}
                onChange={(v) => setEditandoNombre((prev) => ({ ...prev, nombre: v }))}
                autoFocus
              />
              {!esEmpresa && (
                <TextField
                  size="small"
                  title="Apellido"
                  value={editandoNombre.apellido}
                  onChange={(v) => setEditandoNombre((prev) => ({ ...prev, apellido: v }))}
                />
              )}
              <Button
                type="submit"
                size="small"
                loading={ocupado === 'nombre'}
                disabled={!editandoNombre.nombre.trim() || (!esEmpresa && !editandoNombre.apellido.trim())}
              >
                Guardar
              </Button>
              <Button kind="tertiary" size="small" onClick={() => setEditandoNombre(null)} disabled={ocupado === 'nombre'}>
                Cancelar
              </Button>
              {homonimoDelCliente && (
                <p className="gcli__hint gcli__nombre-nota">
                  También se renombra su contacto «{homonimoDelCliente.name}».
                </p>
              )}
            </form>
          ) : (
            <div className="gcli__nombre">
              <h1>{cliente.name}</h1>
              <Button
                kind="tertiary"
                size="small"
                onClick={() =>
                  // Los ítems viejos pueden no tener las columnas Nombre/Apellido: se
                  // arranca del nombre del ítem, partido igual que en el alta.
                  setEditandoNombre(
                    esEmpresa
                      ? { nombre: cliente.nombre || cliente.name, apellido: '' }
                      : cliente.nombre || cliente.apellido
                        ? { nombre: cliente.nombre, apellido: cliente.apellido }
                        : splitNombreApellido(cliente.name)
                  )
                }
              >
                <MdEdit aria-hidden="true" /> Cambiar nombre
              </Button>
            </div>
          )}
          <div className="gcli__cabecera-meta">
            {cliente.estado && (
              <StatusBadge
                label={cliente.estado}
                color={cliente.estado === 'Cliente' ? { bg: '#00c875', border: '#00b461' } : { bg: '#fdab3d', border: '#e99729' }}
              />
            )}
            {esEmpresa
              ? [cliente.rut && `RUT: ${cliente.rut}`, cliente.razonSocial].filter(Boolean).map((t) => <span key={t}>{t}</span>)
              : cliente.ci && <span>CI: {cliente.ci}</span>}
          </div>
        </div>
        <label className="gcli__tipo">
          <span>Tipo de cliente</span>
          <Dropdown
            size="small"
            clearable={false}
            searchable={false}
            options={TIPOS_CLIENTE.map((t) => ({ value: t, label: t }))}
            value={cliente.tipo ? { value: cliente.tipo, label: cliente.tipo } : null}
            placeholder="Sin tipo"
            disabled={ocupado === 'tipo'}
            onChange={(op) => {
              if (op && op.value !== cliente.tipo) accion('tipo', () => setClienteTipo(clienteId, op.value))
            }}
          />
        </label>
      </header>

      {error && (
        <p className="gcli__error" role="alert">
          {error}
        </p>
      )}

      {/* ---- Datos del cliente (a pedido: los que corresponden a su tipo) ---- */}
      <section className="gcli__card gcli__datos">
        <h2>{esEmpresa ? 'Datos de la empresa' : 'Datos del cliente'}</h2>
        <dl className="gcli__datos-grilla">
          {datosDelCliente(cliente).map(([etiqueta, valor]) => (
            <div key={etiqueta} className="gcli__dato">
              <dt>{etiqueta}</dt>
              <dd className={valor ? undefined : 'gcli__vacio'}>{valor || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* A pedido: en pantallas anchas los bloques van en 2 columnas (Contactos a la
          izquierda, que es el más alto; Empresa/Relaciones/Grupo apilados a la derecha)
          — todo apilado obligaba a scrollear para ver la ficha entera. */}
      <div className="gcli__grid">
        <div className="gcli__col">
      {/* ---- Contactos ---- */}
      <section className="gcli__card">
        <h2>
          <MdCall aria-hidden="true" /> Contactos
        </h2>
        <p className="gcli__hint">Información de contacto.</p>

        {contactosDetalle.length === 0 && <p className="gcli__vacio">Este cliente no tiene contactos vinculados.</p>}
        {/* Agrupados por Tipo de contacto (Familiar, Vínculo societario…). */}
        {contactosPorTipo(contactosDetalle).map((grupo) => (
        <div key={grupo.tipo || 'sin-tipo'} className="gcli__grupo-contactos">
        <h3 className="gcli__grupo-titulo">
          {grupo.titulo} <span>({grupo.contactos.length})</span>
        </h3>
        <ul className="gcli__lista">
          {grupo.contactos.map((c) => (
            <li key={c.id} className="gcli__fila">
              <div className="gcli__fila-datos">
                <strong>{c.name}</strong>
                <span>{[c.telefono, c.email].filter(Boolean).join(' — ') || 'Sin teléfono ni email'}</span>
              </div>
              <Button
                kind="tertiary"
                size="small"
                disabled={ocupado === `quitar-contacto-${c.id}`}
                onClick={() =>
                  setConfirmar({
                    titulo: `¿Quitar a ${c.name}?`,
                    descripcion:
                      'Se desvincula de este cliente (en los dos sentidos). El contacto no se borra: sigue existiendo en el tablero Contactos.',
                    textoOk: 'Quitar contacto',
                    onOk: () => accion(`quitar-contacto-${c.id}`, () => desvincularContactoDeCliente(c.id, clienteId)),
                  })
                }
              >
                <MdClear /> Quitar
              </Button>
            </li>
          ))}
        </ul>
        </div>
        ))}

        <div className="gcli__agregar">
          <div className="gcli__buscar">
            <TextField
              size="medium"
              title="Vincular un contacto existente"
              placeholder="Nombre, teléfono o email"
              value={busquedaContacto}
              onChange={(v) => {
                setBusquedaContacto(v)
                setResultadosContacto(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && buscarContactos()}
            />
            <Button
              kind="secondary"
              size="medium"
              loading={buscandoContacto}
              disabled={busquedaContacto.trim().length < 2}
              onClick={buscarContactos}
            >
              Buscar
            </Button>
          </div>
          {resultadosContacto !== null && resultadosContacto.length === 0 && !buscandoContacto && (
            // A pedido: si no está, crearlo con lo que se buscó (celular, email o nombre).
            <div className="gcli__sin-resultados">
              <p className="gcli__hint">
                Sin resultados para «{terminoContacto}» en Contactos (o ya están vinculados a este cliente).
              </p>
              <Button kind="primary" size="small" onClick={crearDesdeBusqueda}>
                <MdPersonAdd /> {textoBotonCrear}
              </Button>
            </div>
          )}
          {(resultadosContacto ?? []).length > 0 && (
            <ul className="gcli__lista gcli__lista--resultados">
              {resultadosContacto.map((r) => (
                <li key={r.id} className="gcli__fila">
                  <div className="gcli__fila-datos">
                    <strong>{r.name}</strong>
                    <span>
                      {[r.telefono, r.email].filter(Boolean).join(' — ')}
                      {r.clienteNombre ? ` · cliente: ${r.clienteNombre}` : ''}
                    </span>
                  </div>
                  <Button
                    kind="secondary"
                    size="small"
                    disabled={ocupado === `vincular-contacto-${r.id}`}
                    onClick={() =>
                      accion(`vincular-contacto-${r.id}`, async () => {
                        await vincularContactoACliente(r.id, clienteId)
                        setBusquedaContacto('')
                        setResultadosContacto(null)
                      })
                    }
                  >
                    Vincular
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {/* A pedido: crearlo también cuando hay resultados (puede no ser ninguno de ellos). */}
          {(resultadosContacto ?? []).length > 0 && (
            <div className="gcli__crear-igual">
              <span className="gcli__hint">¿No es ninguno de estos?</span>
              <Button kind="secondary" size="small" onClick={crearDesdeBusqueda}>
                <MdPersonAdd /> {textoBotonCrear}
              </Button>
            </div>
          )}

          {/* A pedido: el contacto nuevo se carga en el MISMO popup que usa el paso 1
              del wizard (ContactoNuevoModal), con su validación de homónimo y de
              teléfono repetido adentro. */}
          <Button
            kind="tertiary"
            size="small"
            onClick={() => {
              setContactoDesdeLaBusqueda(null)
              setCreandoContacto(true)
            }}
          >
            <MdPersonAdd /> Crear un contacto nuevo
          </Button>
        </div>
      </section>
        </div>

        <div className="gcli__col">
      {/* ---- Empresa donde trabaja (solo para no-empresas) ---- */}
      {!esEmpresa && (
        <section className="gcli__card">
          <h2>
            <MdBusiness aria-hidden="true" /> Empresa donde trabaja
          </h2>
          <p className="gcli__hint">Solo se pueden elegir clientes de tipo Empresa.</p>
          {cliente.empresa ? (
            <div className="gcli__fila">
              <div className="gcli__fila-datos">
                <button type="button" className="gcli__link" onClick={() => onOpenCliente?.(cliente.empresa.id)}>
                  {cliente.empresa.name}
                </button>
              </div>
              <Button
                kind="tertiary"
                size="small"
                disabled={ocupado === 'empresa'}
                onClick={() => accion('empresa', () => setClienteEmpresa(clienteId, null))}
              >
                <MdClear /> Quitar
              </Button>
            </div>
          ) : (
            <BuscadorEnMonday
              placeholder="Buscar la empresa por nombre o RUT"
              textoAccion="Elegir"
              ocupado={ocupado === 'empresa'}
              buscar={async (termino) =>
                (await buscarClientesGestion(termino))
                  .filter((e) => e.tipo === 'Empresa' && e.id !== clienteId)
                  .map((e) => ({
                    id: e.id,
                    label: e.name,
                    meta: [e.rut && `RUT: ${e.rut}`, e.razonSocial].filter(Boolean).join(' · '),
                  }))
              }
              onElegir={(o) => accion('empresa', () => setClienteEmpresa(clienteId, o.id))}
            />
          )}
        </section>
      )}

      {/* ---- Relaciones familiares / societarias ---- */}
      <section className="gcli__card">
        <h2>
          <MdPeopleAlt aria-hidden="true" /> Relación familiar / societaria
        </h2>
        <p className="gcli__hint">
          Otros clientes relacionados con este. El vínculo se escribe en los dos: quitarlo acá también lo saca del otro
          lado.
        </p>
        {cliente.relaciones.length === 0 && <p className="gcli__vacio">Sin clientes relacionados.</p>}
        <ul className="gcli__chips">
          {cliente.relaciones.map((r) => (
            <li key={r.id} className="gcli__chip">
              <button type="button" className="gcli__link" onClick={() => onOpenCliente?.(r.id)}>
                {r.name}
              </button>
              <button
                type="button"
                className="gcli__chip-x"
                aria-label={`Quitar la relación con ${r.name}`}
                disabled={ocupado === `quitar-relacion-${r.id}`}
                onClick={() => accion(`quitar-relacion-${r.id}`, () => desvincularRelacionClientes(clienteId, r.id))}
              >
                <MdClear />
              </button>
            </li>
          ))}
        </ul>
        <BuscadorEnMonday
          placeholder="Buscar un cliente por nombre, CI o RUT"
          textoAccion="Vincular"
          ocupado={ocupado === 'agregar-relacion'}
          buscar={async (termino) =>
            (await buscarClientesGestion(termino))
              .filter((c) => c.id !== clienteId && !(cliente?.relaciones ?? []).some((r) => r.id === c.id))
              .map((c) => ({
                id: c.id,
                label: c.name,
                meta: [c.ci && `CI: ${c.ci}`, c.rut && `RUT: ${c.rut}`, c.tipo].filter(Boolean).join(' · '),
              }))
          }
          onElegir={(o) => accion('agregar-relacion', () => vincularRelacionClientes(clienteId, o.id))}
        />
      </section>

      {/* ---- Grupo económico ---- */}
      <section className="gcli__card">
        <h2>
          <MdGroups aria-hidden="true" /> Grupo económico
        </h2>
        <p className="gcli__hint">
          Agregarlo crea el miembro dentro del grupo (con su rol); quitarlo borra ese miembro. Un cliente pertenece a un
          grupo a la vez.
        </p>
        {cliente.grupo ? (
          <div className="gcli__fila">
            <div className="gcli__fila-datos">
              <strong>{cliente.grupo.name}</strong>
              <label className="gcli__rol">
                <span>Rol en el grupo</span>
                {/* Los roles posibles dependen del Tipo Cliente (a pedido): Empresa solo
                    "Empresa vinculada", Particular solo Titular/Miembro. */}
                <Dropdown
                  size="small"
                  clearable={false}
                  searchable={false}
                  options={rolesGrupoParaTipo(cliente.tipo).map((r) => ({ value: r, label: r }))}
                  value={rolActual ? { value: rolActual, label: rolActual } : null}
                  placeholder="Sin rol"
                  disabled={ocupado === 'rol' || miembrosDelCliente.length === 0}
                  onChange={(op) => {
                    if (op && op.value !== rolActual)
                      accion('rol', () => setRolEnGrupo(miembrosDelCliente[0].subitemId, op.value))
                  }}
                />
              </label>
              {miembrosDelCliente.length === 0 && (
                <span className="gcli__aviso-suave">
                  El grupo no tiene el miembro correspondiente — al quitarlo y volver a agregarlo queda consistente.
                </span>
              )}
            </div>
            <Button
              kind="tertiary"
              size="small"
              disabled={ocupado === 'quitar-grupo'}
              onClick={() =>
                setConfirmar({
                  titulo: `¿Quitar del grupo ${cliente.grupo.name}?`,
                  descripcion: 'Se borra el miembro dentro del grupo y se desvincula el cliente.',
                  textoOk: 'Quitar del grupo',
                  onOk: () =>
                    accion('quitar-grupo', () =>
                      quitarClienteDeGrupo({
                        clienteId,
                        subitemIds: miembrosDelCliente.map((m) => m.subitemId),
                      })
                    ),
                })
              }
            >
              <MdClear /> Quitar del grupo
            </Button>
          </div>
        ) : (
          <div className="gcli__grupo-alta">
            {esEmpresa ? (
              // A pedido: una Empresa entra siempre como "Empresa vinculada" — no hay
              // rol para elegir.
              <p className="gcli__hint">Una empresa entra al grupo como <strong>Empresa vinculada</strong>.</p>
            ) : (
              <label className="gcli__rol">
                <span>Rol con el que entra</span>
                <Dropdown
                  size="small"
                  clearable={false}
                  searchable={false}
                  options={rolesGrupoParaTipo(cliente.tipo).map((r) => ({ value: r, label: r }))}
                  value={{ value: rolElegido, label: rolElegido }}
                  onChange={(op) => {
                    if (op) setRolElegido(op.value)
                  }}
                />
              </label>
            )}
            <BuscadorEnMonday
              placeholder="Buscar el grupo por nombre o alias"
              textoAccion="Agregar"
              ocupado={ocupado === 'agregar-grupo'}
              buscar={async (termino) =>
                (await buscarGruposEconomicos(termino)).map((g) => ({
                  id: g.id,
                  label: g.alias ? `${g.name} (${g.alias})` : g.name,
                  meta: `${g.miembros.length} miembro${g.miembros.length === 1 ? '' : 's'}`,
                }))
              }
              onElegir={(o) =>
                accion('agregar-grupo', async () => {
                  await agregarClienteAGrupo({
                    clienteId,
                    clienteNombre: cliente.name,
                    grupoId: o.id,
                    rol: esEmpresa ? ROL_GRUPO_EMPRESA : rolElegido,
                  })
                  setRolElegido(ROL_GRUPO_DEFAULT)
                })
              }
            />
          </div>
        )}
      </section>
        </div>
      </div>

      {creandoContacto && (
        <ContactoNuevoModal
          nombreCliente={cliente.name}
          // Con contactos ya cargados, lo típico acá es agregar a OTRA persona; sin
          // ninguno, el caso común es el propio cliente (igual que en el alta).
          // Desde una búsqueda por nombre, ese nombre es el de otra persona (como en el alta).
          mismoClienteInicial={contactoDesdeLaBusqueda ? !contactoDesdeLaBusqueda.nombre : contactosDetalle.length === 0}
          inicial={contactoDesdeLaBusqueda ?? {}}
          homonimo={homonimoDelCliente}
          contactosDelCliente={contactosDetalle}
          // El homónimo ya está vinculado a este cliente: "usarlo" es simplemente no
          // crear otro (el popup se cierra solo).
          onElegirHomonimo={() => {}}
          onUsarExistente={(contacto) =>
            accion('vincular-dup', () => vincularContactoACliente(contacto.id, clienteId))
          }
          onGuardar={crearContacto}
          guardando={ocupado === 'crear-contacto'}
          onClose={() => setCreandoContacto(false)}
        />
      )}

      {confirmar && (
        <AlertModal
          id="gcli-confirmar"
          type="warning"
          title={confirmar.titulo}
          description={confirmar.descripcion}
          primaryButton={{
            text: confirmar.textoOk,
            danger: true,
            onClick: () => {
              const { onOk } = confirmar
              setConfirmar(null)
              onOk()
            },
          }}
          secondaryButton={{ text: 'Cancelar', onClick: () => setConfirmar(null) }}
          onClose={() => setConfirmar(null)}
        />
      )}
    </div>
  )
}
