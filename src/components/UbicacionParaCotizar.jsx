import { useEffect, useMemo, useState } from 'react'
import { Dropdown } from '@vibe/core'
import { MdPlace } from 'react-icons/md'
import { matchOption, matchesSearchQuery, sinCodigoPostal } from '../services/format'
import { opcionesDeLocalidad } from '../services/localidades'
import './UbicacionParaCotizar.css'

// A pedido: antes de la primera cotización se elige con qué ubicación se cotiza, porque
// es la que define la zona de circulación y por lo tanto el precio. Hasta ahora la
// oportunidad nacía con Montevideo - CP11500 puesto por defecto (ver
// CrearOportunidadForm#defaultUbicacion) y había que acordarse de entrar a "Editar" para
// cambiarla: el default pasaba desapercibido y se terminaba cotizando con una zona que no
// era la del vehículo.
//
// Las tres opciones son las tres cosas que pasan en la realidad: el vehículo circula
// donde vive el cliente, circula en Montevideo (el caso más común), o hay que elegir otra
// a mano.
//
// Solo aparece antes de cotizar por primera vez. Después la ubicación se cambia desde
// "Editar", que es el camino de siempre y ya avisa que hay que recotizar.
//
// Reunión del 24/09: arranca SIEMPRE en "Por defecto" (Montevideo), aunque la oportunidad
// traiga guardada otra ubicación — la del cliente, o la que se leyó de la cédula al darla
// de alta, que no es necesariamente donde circula el auto. Solo cambia si alguien elige
// otra opción acá, o si cambió la ubicación con "Editar" (`respetarGuardada`). Y ya no
// hay que confirmarla con un botón: la elegida se guarda al apretar "Cotizar" (ver
// CotizarStepPanel#cotizarConUbicacion), y es la que muestra el checklist de datos.
export const UBICACION_MONTEVIDEO = { departamento: 'Montevideo', localidad: 'Montevideo - CP11500' }

// Busca el ítem real del tablero por nombre, tolerando diferencias de acentos o espacios
// (el nombre guardado en la oportunidad y el del tablero no siempre coinciden carácter a
// carácter). Devuelve el id, que es lo que se guarda en la columna conectada.
function idPorNombre(opciones, nombre) {
  const real = matchOption(
    opciones.map((o) => o.name),
    nombre
  )
  return opciones.find((o) => o.name === real)?.id ?? ''
}

export default function UbicacionParaCotizar({
  opportunity,
  dropdownOptions,
  onElegidaChange,
  onPendienteChange,
  respetarGuardada = false,
}) {
  const departamentos = dropdownOptions?.departamentos ?? []
  const localidades = dropdownOptions?.localidades ?? []

  const nombreDe = (lista, id) => lista.find((o) => o.id === id)?.name ?? ''

  const delCliente = useMemo(() => {
    const departamentoId = idPorNombre(departamentos, opportunity.clienteDepartamento)
    const localidadId = idPorNombre(localidades, opportunity.clienteLocalidad)
    // Sin los dos no sirve: media ubicación no se puede guardar ni cotizar.
    if (!departamentoId || !localidadId) return null
    return { departamentoId, localidadId }
  }, [departamentos, localidades, opportunity.clienteDepartamento, opportunity.clienteLocalidad])

  const montevideo = useMemo(
    () => ({
      departamentoId: idPorNombre(departamentos, UBICACION_MONTEVIDEO.departamento),
      localidadId: idPorNombre(localidades, UBICACION_MONTEVIDEO.localidad),
    }),
    [departamentos, localidades]
  )

  const actual = useMemo(
    () => ({
      departamentoId: idPorNombre(departamentos, opportunity.departamento),
      localidadId: idPorNombre(localidades, opportunity.zonaCirculacion),
    }),
    [departamentos, localidades, opportunity.departamento, opportunity.zonaCirculacion]
  )

  const mismaQue = (u) => Boolean(u?.departamentoId) && u.departamentoId === actual.departamentoId && u.localidadId === actual.localidadId

  // Derivado y no un useState con el valor calculado de arranque: las listas de
  // departamentos y localidades llegan asincrónicas y en el primer render pueden estar
  // vacías. Lo que sí se guarda es lo que la persona elige, que pisa lo derivado.
  const [eleccionManual, setEleccionManual] = useState(null)
  const eleccionAuto = !respetarGuardada
    ? 'montevideo'
    : mismaQue(montevideo)
      ? 'montevideo'
      : mismaQue(delCliente)
        ? 'cliente'
        : 'otra'
  const eleccion = eleccionManual ?? eleccionAuto

  // "Otra": muestra la ubicación guardada cuando es justamente una "otra" que se cargó con
  // "Editar"; se vacía apenas se elige "Otra" a mano.
  const [otraManual, setOtraManual] = useState(null)
  const otra =
    otraManual ?? (respetarGuardada && eleccionAuto === 'otra' ? actual : { departamentoId: '', localidadId: '' })
  const setOtra = (valor) => setOtraManual((prev) => (typeof valor === 'function' ? valor(prev ?? otra) : valor))

  const departamentoDeOtra = departamentos.find((d) => d.id === otra.departamentoId)?.name
  const opcionesLocalidad = useMemo(
    () => opcionesDeLocalidad(localidades, { departamento: departamentoDeOtra, seleccionadaId: otra.localidadId }),
    [localidades, departamentoDeOtra, otra.localidadId]
  )

  const elegida = eleccion === 'cliente' ? delCliente : eleccion === 'montevideo' ? montevideo : otra
  const completa = Boolean(elegida?.departamentoId && elegida?.localidadId)

  // Hacia afuera: la ubicación con la que se va a cotizar (con sus nombres, para el
  // checklist), y si falta algo para poder cotizar.
  const pendiente = completa ? null : 'incompleta'
  const elegidaDepartamentoId = completa ? elegida.departamentoId : ''
  const elegidaLocalidadId = completa ? elegida.localidadId : ''
  useEffect(() => {
    onPendienteChange?.(pendiente)
  }, [pendiente, onPendienteChange])
  useEffect(() => {
    onElegidaChange?.(
      elegidaDepartamentoId
        ? {
            departamentoId: elegidaDepartamentoId,
            localidadId: elegidaLocalidadId,
            departamento: nombreDe(departamentos, elegidaDepartamentoId),
            localidad: nombreDe(localidades, elegidaLocalidadId),
          }
        : null
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegidaDepartamentoId, elegidaLocalidadId, departamentos, localidades, onElegidaChange])
  // Al desaparecer el panel (ya hay cotizaciones) no queda nada pendiente de él.
  useEffect(
    () => () => {
      onPendienteChange?.(null)
      onElegidaChange?.(null)
    },
    [onPendienteChange, onElegidaChange]
  )

  const detalleDe = (u) =>
    [sinCodigoPostal(nombreDe(localidades, u.localidadId)), nombreDe(departamentos, u.departamentoId)]
      .filter(Boolean)
      .join(' · ')

  const opciones = [
    {
      key: 'cliente',
      titulo: 'Cliente',
      detalle: delCliente ? detalleDe(delCliente) : 'El cliente no tiene zona y departamento cargados',
      deshabilitada: !delCliente,
    },
    {
      key: 'montevideo',
      // A pedido se llama por lo que es y no por el lugar: es la ubicación con la que se
      // cotiza cuando nadie elige otra. Cuál es sigue a la vista en el detalle de abajo.
      titulo: 'Por defecto',
      detalle: montevideo.departamentoId ? detalleDe(montevideo) : UBICACION_MONTEVIDEO.departamento,
      deshabilitada: !montevideo.departamentoId || !montevideo.localidadId,
    },
    { key: 'otra', titulo: 'Otra', detalle: 'Elegir departamento y zona principal de circulación' },
  ]

  const comoOpcion = (lista, id) => {
    const item = lista.find((o) => o.id === id)
    return item ? { value: item.id, label: sinCodigoPostal(item.name) } : null
  }

  return (
    <section className="ubicacion-cotizar">
      <h3 className="ubicacion-cotizar__titulo">
        <MdPlace /> ¿Con qué ubicación se cotiza?
      </h3>
      <p className="ubicacion-cotizar__sub">
        Define la zona de circulación del vehículo. La elegida se guarda al cotizar.
      </p>

      <div className="ubicacion-cotizar__opciones">
        {opciones.map((o) => (
          <button
            key={o.key}
            type="button"
            className={
              eleccion === o.key
                ? 'ubicacion-cotizar__opcion ubicacion-cotizar__opcion--activa'
                : 'ubicacion-cotizar__opcion'
            }
            aria-pressed={eleccion === o.key}
            disabled={o.deshabilitada}
            onClick={() => {
              // Entrar a "Otra" arranca en blanco: se elige "Otra" justamente para poner
              // otra, no para confirmar la de siempre.
              if (o.key === 'otra' && eleccion !== 'otra') setOtra({ departamentoId: '', localidadId: '' })
              setEleccionManual(o.key)
            }}
          >
            <span className="ubicacion-cotizar__opcion-titulo">{o.titulo}</span>
            <span className="ubicacion-cotizar__opcion-detalle">{o.detalle}</span>
          </button>
        ))}
      </div>

      {eleccion === 'otra' && (
        <div className="ubicacion-cotizar__selects">
          <label className="ubicacion-cotizar__campo">
            <span>Departamento</span>
            <Dropdown
              size="small"
              searchable
              filterOption={(option, inputValue) => matchesSearchQuery(option.label, inputValue)}
              placeholder="Elegí un departamento"
              options={departamentos.map((d) => ({ value: d.id, label: d.name }))}
              value={comoOpcion(departamentos, otra.departamentoId)}
              onChange={(opt) =>
                // Cambiar de departamento borra la zona: la que estaba puede no pertenecer
                // al nuevo, y guardar ese par sería guardar algo que no existe.
                setOtra({ departamentoId: opt?.value ?? '', localidadId: '' })
              }
            />
          </label>
          <label className="ubicacion-cotizar__campo">
            <span>Zona principal de circulación</span>
            <Dropdown
              size="small"
              searchable
              filterOption={(option, inputValue) => matchesSearchQuery(option.label, inputValue)}
              placeholder={otra.departamentoId ? 'Elegí una zona' : 'Elegí primero el departamento'}
              options={opcionesLocalidad}
              value={comoOpcion(localidades, otra.localidadId)}
              onChange={(opt) => setOtra((prev) => ({ ...prev, localidadId: opt?.value ?? '' }))}
            />
          </label>
        </div>
      )}

      {pendiente && (
        <p className="ubicacion-cotizar__pendiente" role="alert">
          Elegí el departamento y la zona principal de circulación para poder cotizar.
        </p>
      )}
    </section>
  )
}
