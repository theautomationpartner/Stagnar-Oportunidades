import { useCallback, useEffect, useMemo, useState } from 'react'
import { MdArrowBack, MdBusiness, MdCall, MdClear, MdGroups, MdPeopleAlt, MdPersonAdd } from 'react-icons/md'
import { Button, Dropdown, TextField } from '@vibe/core'
import Avatar from './Avatar'
import StatusBadge from './StatusBadge'
import AlertModal from './AlertModal'
import ContactoNuevoModal from './ContactoNuevoModal'
import LoadingScreen from './LoadingScreen'
import {
  fetchClienteGestion,
  fetchClientesGestion,
  fetchGruposEconomicos,
  fetchContactosCrm,
  buscarContactosCrmLibre,
  createContactoCrm,
  vincularContactoACliente,
  desvincularContactoDeCliente,
  setClienteTipo,
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
import { normalizarParaMatch } from '../services/format'
import { buildMondayPhone, buildMondayEmail, initialsOf } from '../services/personaFields'
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
// la app. La búsqueda es local (las listas ya están en memoria) e ignora tildes.
function BuscadorLocal({ placeholder, sinOpciones, textoAccion, opciones, ocupado, onElegir }) {
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState(null)
  const buscar = () => {
    const q = normalizarParaMatch(busqueda)
    if (q.length < 2) return
    setResultados(
      opciones.filter((o) => [o.label, o.meta].filter(Boolean).some((v) => normalizarParaMatch(v).includes(q)))
    )
  }
  return (
    <div className="gcli__buscador-local">
      <div className="gcli__buscar">
        <TextField
          size="medium"
          placeholder={opciones.length ? placeholder : sinOpciones}
          value={busqueda}
          disabled={!opciones.length}
          onChange={(v) => {
            setBusqueda(v)
            setResultados(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && buscar()}
        />
        <Button kind="secondary" size="medium" disabled={busqueda.trim().length < 2} onClick={buscar}>
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

export default function ClienteGestion({ clienteId, onBack, onOpenCliente }) {
  const [cliente, setCliente] = useState(null)
  const [contactosDetalle, setContactosDetalle] = useState([])
  const [clientes, setClientes] = useState([])
  const [grupos, setGrupos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Qué acción está escribiendo ahora mismo ('' = ninguna) — deshabilita su botón y evita
  // pisadas entre acciones (las conexiones se releen y reescriben completas).
  const [ocupado, setOcupado] = useState('')
  const [confirmar, setConfirmar] = useState(null) // { titulo, descripcion, textoOk, onOk }

  // Alta/vínculo de contactos.
  const [busquedaContacto, setBusquedaContacto] = useState('')
  const [resultadosContacto, setResultadosContacto] = useState(null)
  const [buscandoContacto, setBuscandoContacto] = useState(false)
  const [creandoContacto, setCreandoContacto] = useState(false)

  // Rol pendiente de "Agregar al grupo" (solo personas — las empresas entran fijas
  // como Empresa vinculada).
  const [rolElegido, setRolElegido] = useState(ROL_GRUPO_DEFAULT)

  const recargar = useCallback(async () => {
    const [cli, grs] = await Promise.all([fetchClienteGestion(clienteId), fetchGruposEconomicos()])
    setCliente(cli)
    setGrupos(grs)
    setContactosDetalle(cli?.contactos.length ? await fetchContactosCrm(cli.contactos.map((c) => c.id)) : [])
  }, [clienteId])

  useEffect(() => {
    let vivo = true
    setLoading(true)
    setError(null)
    Promise.all([recargar(), fetchClientesGestion().then((lista) => vivo && setClientes(lista))])
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
  const empresas = useMemo(
    () => clientes.filter((c) => c.tipo === 'Empresa' && c.id !== clienteId),
    [clientes, clienteId]
  )
  const posiblesRelaciones = useMemo(
    () =>
      clientes.filter(
        (c) => c.id !== clienteId && !(cliente?.relaciones ?? []).some((r) => r.id === c.id)
      ),
    [clientes, clienteId, cliente]
  )
  // El/los subitems "miembro" de ESTE cliente en su grupo actual — son los que hay que
  // borrar al quitarlo, y de ahí sale también su rol de hoy.
  const miembrosDelCliente = useMemo(() => {
    if (!cliente?.grupo) return []
    const grupo = grupos.find((g) => g.id === cliente.grupo.id)
    return (grupo?.miembros ?? []).filter((m) => m.clienteId === cliente.id)
  }, [cliente, grupos])
  const rolActual = miembrosDelCliente[0]?.rol || ''

  const buscarContactos = async () => {
    if (busquedaContacto.trim().length < 2) return
    setBuscandoContacto(true)
    try {
      const res = await buscarContactosCrmLibre(busquedaContacto)
      // Los que ya están vinculados a este cliente no se ofrecen de nuevo.
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
          <h1>{cliente.name}</h1>
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
        <p className="gcli__hint">A quién se le manda la información de este cliente.</p>

        {contactosDetalle.length === 0 && <p className="gcli__vacio">Este cliente no tiene contactos vinculados.</p>}
        <ul className="gcli__lista">
          {contactosDetalle.map((c) => (
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
            <p className="gcli__hint">Sin resultados en Contactos (o ya están vinculados a este cliente).</p>
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

          {/* A pedido: el contacto nuevo se carga en el MISMO popup que usa el paso 1
              del wizard (ContactoNuevoModal), con su validación de homónimo y de
              teléfono repetido adentro. */}
          <Button kind="tertiary" size="small" onClick={() => setCreandoContacto(true)}>
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
            <BuscadorLocal
              placeholder="Buscar la empresa por nombre o RUT"
              sinOpciones="Todavía no hay clientes de tipo Empresa para elegir"
              textoAccion="Elegir"
              ocupado={ocupado === 'empresa'}
              opciones={empresas.map((e) => ({
                id: e.id,
                label: e.name,
                meta: [e.rut && `RUT: ${e.rut}`, e.razonSocial].filter(Boolean).join(' · '),
              }))}
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
        <BuscadorLocal
          placeholder="Buscar un cliente por nombre, CI o RUT"
          sinOpciones="No quedan clientes para relacionar"
          textoAccion="Vincular"
          ocupado={ocupado === 'agregar-relacion'}
          opciones={posiblesRelaciones.map((c) => ({
            id: c.id,
            label: c.name,
            meta: [c.ci && `CI: ${c.ci}`, c.rut && `RUT: ${c.rut}`, c.tipo].filter(Boolean).join(' · '),
          }))}
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
            <BuscadorLocal
              placeholder="Buscar el grupo por nombre o alias"
              sinOpciones="Todavía no hay grupos económicos creados en monday"
              textoAccion="Agregar"
              ocupado={ocupado === 'agregar-grupo'}
              opciones={grupos.map((g) => ({
                id: g.id,
                label: g.alias ? `${g.name} (${g.alias})` : g.name,
                meta: `${g.miembros.length} miembro${g.miembros.length === 1 ? '' : 's'}`,
              }))}
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
          mismoClienteInicial={contactosDetalle.length === 0}
          homonimo={homonimoDelCliente}
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
