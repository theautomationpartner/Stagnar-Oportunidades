import { MdBadge, MdCake, MdEdit, MdHome, MdPerson } from 'react-icons/md'
import { Button } from '@vibe/core'
import ClienteArchivos from './ClienteArchivos'
import { formatShortDate, modeloSinMarca } from '../services/format'
import { initialsOf, telefonoParaMostrar } from '../services/personaFields'
import { edadDesde } from '../services/edad'
import './ClientFicha.css'

// Ficha del cliente/Lead de la oportunidad — antes solo vivía en el paso "Cotizar" (ver
// CotizarStepPanel.jsx), a pedido ahora se repite igual en el resto de los pasos
// (Comparar/Confirmar/Emitir, ver OpportunityDetail.jsx) en vez de la tarjeta más simple
// que tenían antes. Componente propio (no duplicado en cada lugar que lo usa) para que
// los dos queden siempre iguales si se retoca el diseño.
// `tag`: badge chico al lado del nombre (ej. el número corto de la oportunidad, solo lo
// usa OpportunityDetail). `actions`: nodo extra en el header, al lado de "Editar" (ej.
// "Recotizar", solo en Comparar/Confirmar). `onEdit` ausente esconde el link "Editar"
// del header (datos personales). `onEditVehiculo` (a pedido: "Editar" separado para
// Datos personales y para Vehículo, cada uno abre su propio popup con solo esos
// campos, ver CotizarStepPanel.jsx) — ausente esconde el link "Editar" de la sección
// Vehículo; los demás usos de ClientFicha (que no lo pasan) quedan sin ese botón, sin
// cambios. `children`: contenido extra dentro de la misma tarjeta, debajo del Vehículo
// (ej. la propuesta elegida en el paso "Emitir", ver EmitirStepPanel.jsx) — para no
// repetir la info personal/del vehículo en una tarjeta aparte.
// `showDocumentos` (default true): sección "Documentos del cliente/lead" (columna
// Archivos del tablero Clientes, ver ClienteArchivos) — solo aparece si la oportunidad
// tiene un Cliente/Lead vinculado (opportunity.clienteId, llega en el detalle).
// A pedido: el paso 1 separa lo que es del CLIENTE (tablero Clientes, se edita con aviso
// porque cambia su ficha para todas sus oportunidades) de lo que es de ESTA cotización
// (la copia de CI/nacimiento con la que se cotiza y la zona de circulación).
// A pedido: sin Dirección, Localidad y Departamento — el domicilio ya se ve arriba, en la
// fila de datos clave (ver DatosClave).
function datosDelCliente(c) {
  if (c.tipo === 'Empresa') return [['Razón social', c.razonSocial || c.name], ['RUT', c.rut]]
  const nacionalidad = c.extranjero === 'Si' ? [c.nacionalidad, 'extranjero'].filter(Boolean).join(' · ') : c.nacionalidad
  return [
    ['Nombre', [c.nombre, c.apellido].filter(Boolean).join(' ') || c.name],
    ['CI', c.ci],
    ['Nacimiento', c.fechaNacimiento ? formatShortDate(c.fechaNacimiento) : ''],
    ['Sexo', c.sexo],
    ['Nacionalidad', nacionalidad],
  ]
}

// A pedido: lo importante arriba, debajo del nombre, cada dato con un ícono que lo
// identifica — domicilio, CI/RUT, nacimiento (con la edad) y el contacto. Lo que falta no
// se muestra (salvo el domicilio y el contacto, que avisan que no hay).
// El celular es SOLO el del contacto vinculado (a pedido, para que se entienda de dónde
// sale): ya no se cae a la copia guardada en la oportunidad, que puede estar vieja.
function DatosClave({ opportunity, cliente, onCambiarContacto, onEditarContacto }) {
  const esEmpresa = (cliente?.tipo || opportunity.clienteTipo) === 'Empresa'
  const documento = esEmpresa ? cliente?.rut : cliente?.ci || opportunity.ci
  const nacimiento = esEmpresa ? '' : cliente?.fechaNacimiento || opportunity.fechaNacimiento
  const edad = nacimiento ? edadDesde(nacimiento) : null
  const contacto = opportunity.contactoId
    ? [opportunity.contactoNombre || 'Contacto', opportunity.contactoTelefono ? telefonoParaMostrar(opportunity.contactoTelefono) : 'sin celular']
        .join(' · ')
    : 'Sin contacto vinculado'
  const items = [
    { icono: MdHome, titulo: 'Domicilio principal', texto: opportunity.clienteDomicilio || 'Sin domicilio cargado' },
    documento && { icono: MdBadge, titulo: esEmpresa ? 'RUT' : 'Cédula de identidad', texto: (esEmpresa ? 'RUT ' : 'CI ') + documento },
    nacimiento && {
      icono: MdCake,
      titulo: 'Fecha de nacimiento',
      texto: formatShortDate(nacimiento) + (edad != null ? ` · ${edad} años` : ''),
    },
  ].filter(Boolean)
  return (
    <div className="client-ficha__clave">
      {items.map(({ icono: Icono, titulo, texto }) => (
        <span key={titulo} className="client-ficha__address" title={titulo}>
          <Icono aria-hidden="true" />
          <span className="client-ficha__clave-texto">{texto}</span>
        </span>
      ))}
      <span className="client-ficha__address client-ficha__clave-contacto" title="Contacto vinculado a la oportunidad">
        <MdPerson aria-hidden="true" />
        <span className="client-ficha__clave-texto">
          <span className="client-ficha__clave-etiqueta">Contacto:</span> {contacto}
        </span>
        {onEditarContacto && opportunity.contactoId && (
          <button type="button" className="client-ficha__clave-accion" onClick={onEditarContacto}>
            Editar contacto
          </button>
        )}
        {onCambiarContacto && (
          <button type="button" className="client-ficha__clave-accion" onClick={onCambiarContacto}>
            {opportunity.contactoId ? 'Cambiar contacto' : 'Agregar contacto'}
          </button>
        )}
      </span>
    </div>
  )
}

function Datos({ filas }) {
  return (
    <dl className="client-ficha__datos">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="client-ficha__dato">
          <dt>{etiqueta}</dt>
          <dd className={valor ? undefined : 'client-ficha__dato--vacio'}>{valor || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function ClientFicha({
  opportunity,
  // Ficha del cliente (fetchClienteGestion): null mientras carga; undefined si la
  // oportunidad no tiene cliente vinculado.
  cliente,
  onEditCliente,
  // A pedido: sin cliente vinculado, elegir uno existente o crear uno nuevo.
  onVincularCliente,
  // A pedido: cambiar el contacto de la oportunidad (buscar uno o crearlo).
  onCambiarContacto,
  // A pedido: editar los datos del contacto vinculado (nombre, celular, email, notas).
  onEditarContacto,
  onEditVehiculo,
  tag,
  actions,
  children,
  showDocumentos = true,
}) {
  // A pedido: "Cliente" o "Lead" según la Situación real en el tablero Clientes — no
  // llamar "cliente" a quien todavía es un lead.
  const situacion = opportunity.clienteSituacion || ''
  const esLead = situacion.toLowerCase() === 'lead'

  return (
    <div className="client-ficha">
      <div className="client-ficha__header">
        <div className="client-ficha__identity">
          <div className="client-ficha__avatar">{initialsOf(opportunity.clienteNombre)}</div>
          <div className="client-ficha__heading">
            <div className="client-ficha__name-row">
              <h3 className="client-ficha__name">{opportunity.clienteNombre}</h3>
              {tag && <span className="client-ficha__tag">{tag}</span>}
              {situacion && <span className="client-ficha__tag">{situacion}</span>}
            </div>
            {/* Acá va SOLO el domicilio del Cliente/Lead (Dirección, Localidad y
                Departamento del tablero Clientes). Antes, cuando la oportunidad no tenía
                persona vinculada, se caía a la zona de circulación del vehículo: en el
                mismo renglón y debajo del nombre, eso se lee como el domicilio de la
                persona, y no lo es. Reportado con una oportunidad cuyo cliente no tiene
                localidad ni departamento cargados y que aparecía viviendo en "Montevideo —
                Montevideo - CP11100", que es donde circula el auto.
                La zona de circulación no se pierde: se ve en "Datos obligatorios para
                cotizar" y en el bloque de ubicación, que es donde corresponde. */}
            <DatosClave
              opportunity={opportunity}
              cliente={cliente}
              onCambiarContacto={onCambiarContacto}
              onEditarContacto={onEditarContacto}
            />
          </div>
        </div>
        <div className="client-ficha__header-actions">
          {actions}
        </div>
      </div>

      {/* ---- Del cliente (tablero Clientes) ---- */}
      <div className="client-ficha__vehiculo client-ficha__bloque">
        <div className="client-ficha__vehiculo-head">
          <span className="client-ficha__vehiculo-label">{opportunity.clienteTipo === 'Empresa' ? 'Datos de la empresa' : 'Datos del cliente'}</span>
          {onEditCliente && cliente && (
            <Button kind="tertiary" className="client-ficha__edit-link" onClick={onEditCliente}>
              <MdEdit /> Editar
            </Button>
          )}
        </div>
        {cliente ? (
          <Datos filas={datosDelCliente(cliente)} />
        ) : (
          <span className="client-ficha__vehiculo-meta client-ficha__sin-cliente">
            {cliente === null ? 'Cargando los datos del cliente…' : 'Esta oportunidad no tiene un cliente vinculado.'}
            {cliente === undefined && onVincularCliente && (
              <Button kind="primary" size="small" onClick={onVincularCliente}>
                Elegir o crear cliente
              </Button>
            )}
          </span>
        )}
      </div>

      {/* A pedido: sin el bloque "Datos de esta oportunidad" (CI y nacimiento para cotizar,
          zona, teléfono e ID). Los datos con los que se cotiza se ven —y se editan— en
          "Datos obligatorios para cotizar" (ver CotizarStepPanel). */}
      <div className="client-ficha__vehiculo">
        <div className="client-ficha__vehiculo-head">
          <span className="client-ficha__vehiculo-label">Vehículo</span>
          {onEditVehiculo && (
            <Button kind="tertiary" className="client-ficha__edit-link" onClick={onEditVehiculo}>
              <MdEdit /> Editar
            </Button>
          )}
        </div>
        <strong className="client-ficha__vehiculo-title">
          {[opportunity.marca, modeloSinMarca(opportunity.marca, opportunity.modelo)].filter(Boolean).join(' ') || 'Sin vehículo cargado'}
          {opportunity.anio && ` (${opportunity.anio})`}
        </strong>
        {(opportunity.combustible || opportunity.tipo || opportunity.uso) && (
          <span className="client-ficha__vehiculo-meta">
            {[opportunity.combustible, opportunity.tipo, opportunity.uso && `Uso ${opportunity.uso}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>

      {showDocumentos && opportunity.clienteId && (
        <ClienteArchivos contactoId={opportunity.clienteId} tipo={esLead ? 'lead' : 'cliente'} />
      )}

      {children}
    </div>
  )
}
