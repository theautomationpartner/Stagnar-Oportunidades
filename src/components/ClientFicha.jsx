import { MdEdit, MdSmartphone, MdHome } from 'react-icons/md'
import { Button } from '@vibe/core'
import ClienteArchivos from './ClienteArchivos'
import { formatShortDate, modeloSinMarca, sinCodigoPostal } from '../services/format'
import { initialsOf } from '../services/personaFields'
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
function datosDelCliente(c) {
  const ubicacion = [
    ['Dirección', c.direccion],
    ['Localidad', sinCodigoPostal(c.localidad)],
    ['Departamento', c.departamento],
  ]
  if (c.tipo === 'Empresa') return [['Razón social', c.razonSocial || c.name], ['RUT', c.rut], ...ubicacion]
  const nacionalidad = c.extranjero === 'Si' ? [c.nacionalidad, 'extranjero'].filter(Boolean).join(' · ') : c.nacionalidad
  return [
    ['Nombre', [c.nombre, c.apellido].filter(Boolean).join(' ') || c.name],
    ['CI', c.ci],
    ['Nacimiento', c.fechaNacimiento ? formatShortDate(c.fechaNacimiento) : ''],
    ['Sexo', c.sexo],
    ['Nacionalidad', nacionalidad],
    ...ubicacion,
  ]
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
  onEdit,
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
            <span className="client-ficha__address" title="Domicilio principal">
              <MdHome />
              {opportunity.clienteDomicilio || 'Sin domicilio cargado'}
            </span>
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

      {/* ---- De esta oportunidad (sus propias columnas) ---- */}
      <div className="client-ficha__vehiculo client-ficha__bloque">
        <div className="client-ficha__vehiculo-head">
          <span className="client-ficha__vehiculo-label">Datos de esta oportunidad</span>
          {onEdit && (
            <Button kind="tertiary" className="client-ficha__edit-link" onClick={onEdit}>
              <MdEdit /> Editar
            </Button>
          )}
        </div>
        <Datos
          filas={[
            [opportunity.clienteTipo === 'Empresa' ? 'RUT para cotizar' : 'CI para cotizar', opportunity.ci],
            ['Nacimiento para cotizar', opportunity.fechaNacimiento ? formatShortDate(opportunity.fechaNacimiento) : ''],
            [
              'Zona de circulación',
              [opportunity.departamento, sinCodigoPostal(opportunity.zonaCirculacion)].filter(Boolean).join(' — '),
            ],
          ]}
        />
        <div className="client-ficha__badges">
          {/* MON-14: el teléfono es del Contacto de la oportunidad; las anteriores a MON-14
              no tienen contacto y caen a la copia guardada en la propia oportunidad. */}
          <span className="client-ficha__badge">
            <MdSmartphone />
            {opportunity.contactoTelefono || opportunity.telefono || '—'}
          </span>
          {/* Id real del ítem en monday, para ir a buscarlo directo si hace falta. */}
          <span className="client-ficha__badge">ID: {opportunity.id}</span>
        </div>
      </div>

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
