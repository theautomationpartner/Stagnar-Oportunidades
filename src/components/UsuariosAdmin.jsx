import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AttentionBox, Button, Modal, ModalContent, ModalFooter } from '@vibe/core'
import { MdAdd, MdClose, MdPersonAdd, MdSync, MdWarningAmber } from 'react-icons/md'
import { fetchProtegido } from '../auth/fetchProtegido'
import AlertModal from './AlertModal'
import LoadingScreen from './LoadingScreen'
import { normalizarParaMatch } from '../services/format'
import './CrearOportunidadForm.css'
import './PillTabs.css'
import './UsuariosAdmin.css'

// Apartado de administración de la lista blanca (solo Admin). A pedido, nadie entra a los
// tableros: esto los reemplaza. Se guarda en el tablero "Usuario Habilitados - Lista
// Blanca" (los teams en la columna Team, el Rol derivado de ellos) y además se mueve a la
// persona en los teams de monday Admin_App / Ventas_App (ver api/auth/admin/usuarios.js y
// api/_auth/listaBlancaEscritura.js).
//
// Qué se puede hacer: elegir los teams (uno, los dos o ninguno), dar de alta — a un usuario
// que ya está en monday, o invitándolo a monday por email — y dos bajas distintas, a pedido
// bien separadas:
//   - "Acceso a la app": Activo / Inactivo en la lista blanca. Solo deja de entrar a las
//     apps; sigue usando monday.
//   - "Cuenta de monday": desactiva al usuario en monday. Pierde el acceso a TODO monday y
//     libera la licencia; se puede reactivar.

const ENDPOINT = '/api/auth/admin/usuarios'

const TEXTO_ROL = { admin: 'Admin', usuario: 'Vendedor', invitado: 'Invitado (solo lectura)' }
const TEXTO_ESTADO = { activo: 'Activo', inactivo: 'Inactivo', sin_estado: 'Sin estado' }
const rolDeTeams = ({ admin, ventas }) => (admin ? 'admin' : ventas ? 'usuario' : 'invitado')

async function pedir(opciones) {
  const res = await fetchProtegido(ENDPOINT, opciones)
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(datos.mensaje || 'No se pudo completar la operación (' + res.status + ').')
  return datos
}

const postear = (cuerpo) =>
  pedir({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })

// Qué se movió en los teams, en una línea.
function resumenTeams({ teams, errorTeams, aviso }) {
  const partes = []
  if (aviso) partes.push(aviso)
  if (errorTeams) partes.push('No se pudieron actualizar los teams de monday: ' + errorTeams + '. Probá con "Sincronizar teams".')
  const movidos = [
    ...(teams?.cambios ?? []).map((c) => (c.accion === 'sumar' ? 'sumado a ' : 'sacado de ') + c.team),
    ...(teams?.fallidos ?? []).map((c) => 'no se pudo ' + (c.accion === 'sumar' ? 'sumar a ' : 'sacar de ') + c.team),
  ]
  if (movidos.length) partes.push('Teams de monday: ' + movidos.join(', ') + '.')
  return partes.join(' ')
}

// Los teams como etiquetas (a pedido): cada uno con su ✕ para sacarlo, y "+ Agregar" abre
// un desplegable con los que faltan. Además de Admin_App / Ventas_App (teams de monday, que
// definen el rol) van las otras etiquetas de la columna Team del tablero (Administracion,
// Vehiculos…): se ven en gris y solo se guardan en la columna.
const TEAMS = [
  { clave: 'admin', nombre: 'Admin_App' },
  { clave: 'ventas', nombre: 'Ventas_App' },
]

function TagsTeams({ valor, onChange, disabled, bloquearAdmin, otras = [], disponibles = [], onChangeOtras }) {
  const [abierto, setAbierto] = useState(false)
  const raizRef = useRef(null)
  const faltan = TEAMS.filter((t) => !valor[t.clave])
  const otrasFaltan = onChangeOtras ? disponibles.filter((e) => !otras.includes(e)) : []
  const hayParaAgregar = faltan.length > 0 || otrasFaltan.length > 0

  useEffect(() => {
    if (!abierto) return undefined
    const cerrar = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return
      if (e.type === 'mousedown' && raizRef.current?.contains(e.target)) return
      setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', cerrar)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', cerrar)
    }
  }, [abierto])

  return (
    <div className="usuarios-admin__tags" ref={raizRef}>
      {TEAMS.filter((t) => valor[t.clave]).map((t) => {
        const fijo = bloquearAdmin && t.clave === 'admin'
        return (
          <span key={t.clave} className={'usuarios-admin__tag usuarios-admin__tag--' + t.clave}>
            {t.nombre}
            {!fijo && (
              <button
                type="button"
                className="usuarios-admin__tag-quitar"
                aria-label={'Quitar de ' + t.nombre}
                disabled={disabled}
                onClick={() => onChange({ ...valor, [t.clave]: false })}
              >
                <MdClose aria-hidden="true" />
              </button>
            )}
          </span>
        )
      })}
      {otras.map((e) => (
        <span key={e} className="usuarios-admin__tag usuarios-admin__tag--otra">
          {e}
          {onChangeOtras && (
            <button
              type="button"
              className="usuarios-admin__tag-quitar"
              aria-label={'Quitar la etiqueta ' + e}
              disabled={disabled}
              onClick={() => onChangeOtras(otras.filter((x) => x !== e))}
            >
              <MdClose aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      {faltan.length === TEAMS.length && otras.length === 0 && (
        <span className="usuarios-admin__muted usuarios-admin__sin-team">Sin team</span>
      )}
      {hayParaAgregar && (
        <span className="usuarios-admin__tag-agregar-caja">
          <button
            type="button"
            className="usuarios-admin__tag-agregar"
            aria-haspopup="listbox"
            aria-expanded={abierto}
            disabled={disabled}
            onClick={() => setAbierto((v) => !v)}
          >
            <MdAdd aria-hidden="true" /> Agregar
          </button>
          {abierto && (
            <ul className="usuarios-admin__tag-menu" role="listbox" aria-label="Agregar team">
              {faltan.length > 0 && <li className="usuarios-admin__tag-menu-titulo">Teams de monday · definen el rol</li>}
              {faltan.map((t) => (
                <li key={t.clave}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setAbierto(false)
                      onChange({ ...valor, [t.clave]: true })
                    }}
                  >
                    <span className={'usuarios-admin__tag usuarios-admin__tag--' + t.clave}>{t.nombre}</span>
                  </button>
                </li>
              ))}
              {otrasFaltan.length > 0 && <li className="usuarios-admin__tag-menu-titulo">Etiquetas de la lista blanca</li>}
              {otrasFaltan.map((e) => (
                <li key={e}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setAbierto(false)
                      onChangeOtras([...otras, e])
                    }}
                  >
                    <span className="usuarios-admin__tag usuarios-admin__tag--otra">{e}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </span>
      )}
    </div>
  )
}

function AltaModal({ usuariosCuenta, filas, etiquetasTeam, onClose, onCreado }) {
  // A pedido, el buscador muestra a TODOS los usuarios de monday. Los que ya tienen fila
  // (o están desactivados en monday) aparecen marcados y no se pueden elegir.
  const filaDe = useMemo(() => new Map(filas.filter((f) => f.mondayUserId).map((f) => [f.mondayUserId, f])), [filas])
  const motivoNoElegible = (u) => {
    const fila = filaDe.get(u.id)
    if (fila) return 'Ya está en la lista · ' + TEXTO_ESTADO[fila.estado]
    if (!u.habilitado) return 'Desactivado en monday'
    return null
  }

  const [modo, setModo] = useState('monday') // 'monday' | 'invitar'
  const [busqueda, setBusqueda] = useState('')
  const [elegido, setElegido] = useState(null)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [teams, setTeams] = useState({ admin: false, ventas: true })
  const [etiquetas, setEtiquetas] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const q = normalizarParaMatch(busqueda)
  const visibles = q
    ? usuariosCuenta.filter((u) => normalizarParaMatch(`${u.nombre} ${u.email ?? ''}`).includes(q))
    : usuariosCuenta

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const listo = modo === 'monday' ? Boolean(elegido) && Boolean(nombre.trim()) : emailOk && Boolean(nombre.trim())

  const crear = async () => {
    setGuardando(true)
    setError(null)
    try {
      const r =
        modo === 'monday'
          ? await postear({ accion: 'alta', mondayUserId: elegido.id, nombre: nombre.trim(), ...teams, etiquetas })
          : await postear({ accion: 'invitar', email: email.trim(), nombre: nombre.trim(), ...teams, etiquetas })
      onCreado(r)
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  const irAInvitar = () => {
    setModo('invitar')
    setElegido(null)
    // Lo que se buscó se aprovecha: si parece un email va al email, si no al nombre.
    if (/@/.test(busqueda)) setEmail(busqueda.trim())
    else if (busqueda.trim()) setNombre(busqueda.trim())
  }

  return (
    <Modal id="usuarios-alta-modal" show onClose={onClose} size="large">
      <ModalContent className="crear-op__editar-contacto-content usuarios-admin__alta">
        <h2 className="crear-op__editar-contacto-title">Dar de alta</h2>

        <div className="pill-tabs usuarios-admin__modos" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'monday'}
            className={modo === 'monday' ? 'pill-tabs__tab pill-tabs__tab--active' : 'pill-tabs__tab'}
            onClick={() => setModo('monday')}
          >
            Ya está en monday
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'invitar'}
            className={modo === 'invitar' ? 'pill-tabs__tab pill-tabs__tab--active' : 'pill-tabs__tab'}
            onClick={irAInvitar}
          >
            Invitar por email
          </button>
        </div>

        {modo === 'monday' ? (
          <>
            <p className="usuarios-admin__ayuda">
              Buscá a la persona entre todos los usuarios de la cuenta de monday. Quien ya está en la lista se cambia
              desde su fila. Si no tiene usuario de monday, usá «Invitar por email».
            </p>
            <input
              className="usuarios-admin__input usuarios-admin__input--ancho"
              placeholder="Buscar por nombre o email"
              aria-label="Buscar usuario de monday"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <ul className="usuarios-admin__cuenta" role="listbox" aria-label="Usuarios de monday">
              {visibles.length === 0 && (
                // A pedido ("no me deja buscar a Lucia"): quien no está en la cuenta de monday
                // no aparece acá — se la suma invitándola. Se dice claro y con el botón a mano.
                <li className="usuarios-admin__vacio">
                  <strong>«{busqueda.trim()}» no es usuario de la cuenta de monday.</strong>
                  <span>Para sumarla hay que invitarla a monday por email: se le crea la fila en la lista al mismo tiempo.</span>
                  <Button size="small" leftIcon={MdPersonAdd} onClick={irAInvitar}>
                    Invitar por email
                  </Button>
                </li>
              )}
              {visibles.map((u) => {
                const motivo = motivoNoElegible(u)
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={elegido?.id === u.id}
                      disabled={Boolean(motivo)}
                      className={
                        elegido?.id === u.id
                          ? 'usuarios-admin__cuenta-fila usuarios-admin__cuenta-fila--elegida'
                          : 'usuarios-admin__cuenta-fila'
                      }
                      onClick={() => {
                        setElegido(u)
                        setNombre(u.nombre)
                      }}
                    >
                      <strong>{u.nombre}</strong>
                      <span>{u.email ?? 'sin email'}</span>
                      {motivo ? (
                        <span className="usuarios-admin__marca">{motivo}</span>
                      ) : (
                        (u.invitado || u.pendiente) && (
                          <span className="usuarios-admin__marca">{u.pendiente ? 'Invitación pendiente' : 'Invitado en monday'}</span>
                        )
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <>
            <p className="usuarios-admin__ayuda">
              Para quien todavía no tiene usuario de monday (la app corre adentro de monday). Se le manda la invitación
              y se le crea la fila; va a poder entrar cuando la acepte.
            </p>
            <div className="usuarios-admin__alta-datos">
              <label className="usuarios-admin__campo">
                <span>Email</span>
                <input
                  className="usuarios-admin__input"
                  type="email"
                  placeholder="nombre@stagnariseguros.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {/* A pedido: desde la app solo se invita como Invitado (no ocupa licencia).
                  Para sumar a alguien como Miembro se hace desde monday. */}
              <div className="usuarios-admin__campo">
                <span>Tipo de usuario en monday</span>
                <span className="usuarios-admin__tipo-fijo">Invitado (no ocupa licencia)</span>
              </div>
            </div>
          </>
        )}

        {(modo === 'invitar' || elegido) && (
          <div className="usuarios-admin__alta-datos">
            <label className="usuarios-admin__campo">
              <span>Nombre en la lista</span>
              <input className="usuarios-admin__input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
            <div className="usuarios-admin__campo">
              <span>Teams · rol: {TEXTO_ROL[rolDeTeams(teams)]}</span>
              <TagsTeams
                valor={teams}
                onChange={setTeams}
                otras={etiquetas}
                disponibles={etiquetasTeam}
                onChangeOtras={setEtiquetas}
              />
            </div>
          </div>
        )}

        {error && (
          <AttentionBox type="danger" className="usuarios-admin__aviso">
            {error}
          </AttentionBox>
        )}
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose }}
        primaryButton={{
          text: guardando ? 'Guardando...' : modo === 'monday' ? 'Dar de alta' : 'Invitar y dar de alta',
          disabled: !listo || guardando,
          onClick: crear,
        }}
      />
    </Modal>
  )
}

// Baja de un usuario en monday. A pedido, si tiene oportunidades asignadas, antes se elige
// a quién pasárselas o si quedan sin asignar (el backend las resuelve ANTES de
// desactivarlo, ver api/_auth/asignaciones.js).
function BajaModal({ alcance, fila, candidatos, comparteUsuario, onClose, onConfirmar }) {
  const enMonday = alcance === 'monday'
  const [asignadas, setAsignadas] = useState(null) // { total, items } | { error }
  const [destino, setDestino] = useState('reasignar')
  const [reasignarA, setReasignarA] = useState(candidatos[0]?.id ?? '')

  useEffect(() => {
    let vivo = true
    if (!fila.mondayUserId) {
      setAsignadas({ total: 0, items: [] })
      return undefined
    }
    postear({ accion: 'asignadas', mondayUserId: fila.mondayUserId })
      .then((r) => vivo && setAsignadas(r))
      .catch((err) => vivo && setAsignadas({ error: err.message }))
    return () => {
      vivo = false
    }
  }, [fila.mondayUserId])

  const total = asignadas?.total ?? 0
  const listo = asignadas && !asignadas.error && (total === 0 || destino === 'vaciar' || Boolean(reasignarA))

  return (
    <Modal id="usuarios-baja" show onClose={onClose} size="medium">
      <ModalContent className="crear-op__editar-contacto-content">
        <h2 className="crear-op__editar-contacto-title">
          {enMonday ? '¿Desactivar el usuario de monday de ' + fila.nombre + '?' : '¿Quitarle el acceso a la app a ' + fila.nombre + '?'}
        </h2>
        <AttentionBox type="warning" className="usuarios-admin__aviso">
          {enMonday
            ? 'Pierde el acceso a TODO monday (no solo a la app) y se libera su licencia. Sus ítems y updates se conservan, y se puede reactivar desde acá.'
            : 'Deja de poder entrar en el acto y sale de los teams Admin_App y Ventas_App. Sigue usando monday con normalidad. Inactivo lo saca de todas las apps del grupo, no solo de esta.'}
          {comparteUsuario &&
            (enMonday
              ? ' Ojo: ese usuario de monday lo comparten varios perfiles de la lista, y los deja a todos afuera.'
              : ' Ojo: bloquea también a los otros perfiles que comparten su usuario de monday.')}
        </AttentionBox>

        {!asignadas && <p className="usuarios-admin__ayuda">Buscando sus oportunidades asignadas...</p>}
        {asignadas?.error && (
          <AttentionBox type="danger" className="usuarios-admin__aviso">
            No se pudieron buscar sus oportunidades: {asignadas.error}
          </AttentionBox>
        )}
        {asignadas && !asignadas.error && total === 0 && (
          <p className="usuarios-admin__ayuda">No tiene oportunidades asignadas.</p>
        )}
        {total > 0 && (
          <div className="usuarios-admin__reasignar">
            <p className="usuarios-admin__reasignar-titulo">
              Tiene <strong>{total}</strong> {total === 1 ? 'oportunidad asignada' : 'oportunidades asignadas'}. ¿Qué hacemos con{' '}
              {total === 1 ? 'ella' : 'ellas'}?
            </p>
            <ul className="usuarios-admin__reasignar-lista">
              {asignadas.items.slice(0, 5).map((it) => (
                <li key={it.id}>{it.nombre}</li>
              ))}
              {total > 5 && <li className="usuarios-admin__muted">y {total - 5} más</li>}
            </ul>
            <label className="usuarios-admin__opcion">
              <input type="radio" name="destino" checked={destino === 'reasignar'} onChange={() => setDestino('reasignar')} />
              Pasárselas a
              <select
                className="usuarios-admin__select"
                aria-label="Nuevo asignado"
                value={reasignarA}
                disabled={destino !== 'reasignar'}
                onChange={(e) => setReasignarA(e.target.value)}
              >
                {candidatos.length === 0 && <option value="">No hay nadie más con acceso</option>}
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="usuarios-admin__opcion">
              <input type="radio" name="destino" checked={destino === 'vaciar'} onChange={() => setDestino('vaciar')} />
              Dejarlas sin asignar
            </label>
          </div>
        )}
      </ModalContent>
      <ModalFooter
        secondaryButton={{ text: 'Cancelar', onClick: onClose }}
        primaryButton={{
          text: enMonday ? 'Desactivar en monday' : 'Quitar acceso',
          disabled: !listo,
          onClick: () => onConfirmar(total > 0 ? { destino, reasignarA: destino === 'reasignar' ? reasignarA : null } : {}, total),
        }}
      />
    </Modal>
  )
}

export default function UsuariosAdmin() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null) // { tipo: 'success' | 'danger', texto }
  const [ocupado, setOcupado] = useState(null) // itemId (o 'teams') con una operación en curso
// Cambio elegido en un desplegable de acceso, esperando confirmación:
  // { tipo: 'app' | 'monday', fila, valor: 'activo' | 'inactivo' }.
  const [cambio, setCambio] = useState(null)
  const [altaAbierta, setAltaAbierta] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setDatos(await pedir())
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const ejecutar = async (clave, cuerpo, textoOk) => {
    setOcupado(clave)
    setAviso(null)
    try {
      const r = await postear(cuerpo)
      setAviso({ tipo: 'success', texto: [textoOk, resumenTeams(r)].filter(Boolean).join(' ') })
      await cargar()
    } catch (err) {
      setAviso({ tipo: 'danger', texto: err.message })
    } finally {
      setOcupado(null)
    }
  }

  // Primero las filas que dan acceso a esta app; al final las que están en el tablero por
  // otra cosa (el tablero también lo usa el Ejecutivo Virtual de WhatsApp).
  const filas = useMemo(() => {
    const todas = datos?.filas ?? []
    return [...todas].sort((a, b) => Number(b.tieneEstaApp) - Number(a.tieneEstaApp) || a.nombre.localeCompare(b.nombre, 'es'))
  }, [datos])

  if (error && !datos) {
    return (
      <section className="usuarios-admin">
        <AttentionBox type="danger">No se pudo cargar la lista blanca: {error}</AttentionBox>
      </section>
    )
  }
  if (!datos) return <LoadingScreen title="Cargando usuarios" message="Estamos trayendo la lista blanca desde monday." />

  const cuentaDe = (id) => datos.usuariosCuenta?.find((u) => u.id === id)
  const nombreCuenta = (id) => cuentaDe(id)?.nombre
  const protegido = (id) => (datos.mondayProtegidos ?? []).includes(id)

  // ¿Lo que dice la lista coincide con quién está hoy en los teams de monday? Solo para
  // filas que identifican a un usuario de monday; una Inactiva tiene que estar en ninguno.
  const desalineado = (f) => {
    const m = datos.miembrosTeams
    if (!m || !f.mondayUserId || !f.tieneEstaApp) return null
    const esperado = f.estado === 'activo' ? f.teamsApp : { admin: false, ventas: false }
    const real = { admin: m.admin.includes(f.mondayUserId), ventas: m.ventas.includes(f.mondayUserId) }
    const dif = []
    if (esperado.admin !== real.admin) dif.push(real.admin ? 'está en Admin_App y no debería' : 'falta en Admin_App')
    if (esperado.ventas !== real.ventas) dif.push(real.ventas ? 'está en Ventas_App y no debería' : 'falta en Ventas_App')
    return dif.length ? 'En monday ' + dif.join(' y ') + '. Se corrige con "Sincronizar teams".' : null
  }

  return (
    <section className="usuarios-admin">
      <header className="usuarios-admin__head">
        <div>
          <h1>Usuarios y accesos</h1>
          <p>
            Quién entra a la app y a qué teams pertenece. El rol sale de los teams: Admin_App es Admin, solo Ventas_App es
            Vendedor, y sin team queda en solo lectura. Los cambios rigen en el acto y también mueven a la persona en los
            teams de monday.
          </p>
        </div>
        <div className="usuarios-admin__acciones">
          <Button
            kind="secondary"
            leftIcon={MdSync}
            loading={ocupado === 'teams'}
            disabled={Boolean(ocupado)}
            onClick={() => ejecutar('teams', { accion: 'sincronizar-teams' }, 'Teams sincronizados.')}
          >
            Sincronizar teams
          </Button>
          <Button leftIcon={MdPersonAdd} disabled={Boolean(ocupado)} onClick={() => setAltaAbierta(true)}>
            Dar de alta
          </Button>
        </div>
      </header>

      {aviso && (
        <AttentionBox type={aviso.tipo} className="usuarios-admin__aviso" onClose={() => setAviso(null)}>
          {aviso.texto}
        </AttentionBox>
      )}

      <div className="usuarios-admin__tabla-caja">
        <table className="usuarios-admin__tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario de monday</th>
              <th>Teams</th>
              <th>Rol</th>
              <th>Acceso a la app</th>
              <th>Cuenta de monday</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const esMiFila = datos.miFila != null && String(datos.miFila) === f.itemId
              const enCurso = ocupado === f.itemId
              const difTeams = desalineado(f)
              return (
                <tr key={f.itemId} className={f.tieneEstaApp ? undefined : 'usuarios-admin__fila--ajena'}>
                  <td>
                    <strong>{f.nombre}</strong>
                    {esMiFila && <span className="usuarios-admin__marca">Vos</span>}
                    {!f.tieneEstaApp && <span className="usuarios-admin__marca">Sin acceso a esta app</span>}
                  </td>
                  <td className="usuarios-admin__muted">
                    {f.mondayUserId ? nombreCuenta(f.mondayUserId) ?? 'ID ' + f.mondayUserId : f.email ?? 'Sin usuario vinculado'}
                  </td>
                  <td>
                    <TagsTeams
                      valor={f.teamsApp}
                      disabled={Boolean(ocupado)}
                      bloquearAdmin={esMiFila}
                      onChange={(sel) =>
                        ejecutar(f.itemId, { accion: 'teams', itemId: f.itemId, ...sel }, 'Teams de ' + f.nombre + ' actualizados.')
                      }
                      otras={f.otrasEtiquetas ?? []}
                      disponibles={datos.etiquetasTeam ?? []}
                      onChangeOtras={(etiquetas) =>
                        ejecutar(
                          f.itemId,
                          { accion: 'teams', itemId: f.itemId, ...f.teamsApp, etiquetas },
                          'Etiquetas de ' + f.nombre + ' actualizadas.'
                        )
                      }
                    />
                    {difTeams && (
                      <span className="usuarios-admin__desalineado" title={difTeams}>
                        <MdWarningAmber aria-hidden="true" /> No coincide con monday
                      </span>
                    )}
                  </td>
                  <td>{TEXTO_ROL[rolDeTeams(f.teamsApp)]}</td>
                  <td>
                    {/* A pedido: el cambio se elige en un desplegable y se confirma con una
                        advertencia que dice qué va a pasar (ver "cambio" más abajo). */}
                    <select
                      className={'usuarios-admin__select usuarios-admin__select--' + f.estado}
                      aria-label={'Acceso a la app de ' + f.nombre}
                      value={f.estado === 'activo' ? 'activo' : 'inactivo'}
                      disabled={Boolean(ocupado) || esMiFila}
                      title={esMiFila ? 'No podés quitarte el acceso a vos mismo' : undefined}
                      onChange={(e) => setCambio({ tipo: 'app', fila: f, valor: e.target.value })}
                    >
                      <option value="activo">Activo</option>
                      <option value="inactivo">{f.estado === 'sin_estado' ? 'Sin estado' : 'Inactivo'}</option>
                    </select>
                    {enCurso && <span className="usuarios-admin__guardando">Guardando...</span>}
                  </td>
                  <td>
                    {(() => {
                      const cuenta = f.mondayUserId ? cuentaDe(f.mondayUserId) : null
                      if (!cuenta) return <span className="usuarios-admin__muted">Sin usuario de monday</span>
                      const bloqueado = protegido(f.mondayUserId)
                      const valor = cuenta.habilitado ? 'activo' : 'inactivo'
                      return (
                        <>
                          <select
                            className={'usuarios-admin__select usuarios-admin__select--' + valor}
                            aria-label={'Cuenta de monday de ' + f.nombre}
                            value={valor}
                            disabled={Boolean(ocupado) || (bloqueado && cuenta.habilitado)}
                            title={
                              bloqueado
                                ? 'Este usuario de monday no se puede desactivar desde acá (es el tuyo o el que usa la app para hablar con monday)'
                                : undefined
                            }
                            onChange={(e) => setCambio({ tipo: 'monday', fila: f, valor: e.target.value })}
                          >
                            <option value="activo">{cuenta.pendiente ? 'Invitación pendiente' : 'Activa'}</option>
                            <option value="inactivo">Desactivada</option>
                          </select>
                          {ocupado === 'monday-' + f.mondayUserId && <span className="usuarios-admin__guardando">Guardando...</span>}
                        </>
                      )
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {cambio &&
        (() => {
          const { tipo, fila, valor } = cambio
          const comparteUsuario = filas.filter((x) => x.mondayUserId && x.mondayUserId === fila.mondayUserId).length > 1
          const cerrar = () => setCambio(null)
          if (valor === 'inactivo') {
            // A quién se le pueden pasar las oportunidades: quien entra hoy a la app y está
            // activo en monday, sin repetir asientos compartidos.
            const vistos = new Set([fila.mondayUserId])
            const candidatos = []
            for (const x of filas) {
              const cuenta = x.mondayUserId ? cuentaDe(x.mondayUserId) : null
              if (!cuenta?.habilitado || x.estado !== 'activo' || !x.tieneEstaApp || vistos.has(x.mondayUserId)) continue
              vistos.add(x.mondayUserId)
              candidatos.push({ id: x.mondayUserId, nombre: cuenta.nombre })
            }
            candidatos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
            return (
              <BajaModal
                alcance={tipo}
                fila={fila}
                candidatos={candidatos}
                comparteUsuario={comparteUsuario}
                onClose={cerrar}
                onConfirmar={(extra, total) => {
                  cerrar()
                  const aQuien = extra.reasignarA ? candidatos.find((c) => c.id === extra.reasignarA)?.nombre : null
                  ejecutar(
                    tipo === 'monday' ? 'monday-' + fila.mondayUserId : fila.itemId,
                    tipo === 'monday'
                      ? { accion: 'monday-desactivar', mondayUserId: fila.mondayUserId, ...extra }
                      : { accion: 'estado', itemId: fila.itemId, estado: 'inactivo', ...extra },
                    (tipo === 'monday' ? 'Se desactivó el usuario de monday de ' + fila.nombre + '.' : fila.nombre + ' ya no tiene acceso a la app.') +
                      (total ? (aQuien ? ' Sus ' + total + ' oportunidades pasaron a ' + aQuien + '.' : ' Sus ' + total + ' oportunidades quedaron sin asignar.') : '')
                  )
                }}
              />
            )
          }
          // Las bajas (a Inactivo / Desactivada) van por BajaModal, arriba: acá solo las altas.
          const textos =
            tipo === 'app'
              ? {
                  titulo: '¿Darle acceso a la app a ' + fila.nombre + '?',
                  detalle:
                    'Va a poder entrar a la app en el acto, como ' +
                    TEXTO_ROL[rolDeTeams(fila.teamsApp)] +
                    ', y se lo suma a sus teams de monday.' +
                    (fila.mondayUserId ? '' : ' Ojo: esta fila no tiene usuario de monday vinculado, así que igual no va a poder entrar.'),
                  boton: 'Dar acceso',
                  ok: fila.nombre + ' volvió a tener acceso a la app.',
                  cuerpo: { accion: 'estado', itemId: fila.itemId, estado: 'activo' },
                  clave: fila.itemId,
                }
              : {
                  titulo: '¿Reactivar el usuario de monday de ' + fila.nombre + '?',
                  detalle:
                    'Vuelve a tener acceso a monday y ocupa una licencia otra vez. El acceso a la app es aparte: depende de la columna "Acceso a la app".',
                  boton: 'Reactivar en monday',
                  ok: 'Se reactivó el usuario de monday de ' + fila.nombre + '.',
                  cuerpo: { accion: 'monday-activar', mondayUserId: fila.mondayUserId },
                  clave: 'monday-' + fila.mondayUserId,
                }
          return (
            <AlertModal
              id="usuarios-cambio-acceso"
              type="warning"
              title={textos.titulo}
              description={textos.detalle}
              primaryButton={{
                text: textos.boton,
                onClick: () => {
                  cerrar()
                  ejecutar(textos.clave, textos.cuerpo, textos.ok)
                },
              }}
              secondaryButton={{ text: 'Cancelar', onClick: cerrar }}
              onClose={cerrar}
            />
          )
        })()}

      {altaAbierta && (
        <AltaModal
          usuariosCuenta={datos.usuariosCuenta ?? []}
          etiquetasTeam={datos.etiquetasTeam ?? []}
          filas={filas}
          onClose={() => setAltaAbierta(false)}
          onCreado={async (r) => {
            setAltaAbierta(false)
            setAviso({ tipo: 'success', texto: ['Alta hecha.', resumenTeams(r)].filter(Boolean).join(' ') })
            await cargar()
          }}
        />
      )}
    </section>
  )
}
