import { useEffect, useMemo, useState } from 'react'
import { Button, Dropdown } from '@vibe/core'
import { MdPlace } from 'react-icons/md'
import { matchOption } from '../services/format'
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

export default function UbicacionParaCotizar({ opportunity, dropdownOptions, onGuardar, guardando, onPendienteChange }) {
  const departamentos = dropdownOptions?.departamentos ?? []
  const localidades = dropdownOptions?.localidades ?? []

  const delCliente = useMemo(() => {
    const departamentoId = idPorNombre(departamentos, opportunity.clienteDepartamento)
    const localidadId = idPorNombre(localidades, opportunity.clienteLocalidad)
    // Sin los dos no sirve: media ubicación no se puede guardar ni cotizar.
    if (!departamentoId || !localidadId) return null
    return {
      departamentoId,
      localidadId,
      departamento: opportunity.clienteDepartamento,
      localidad: opportunity.clienteLocalidad,
    }
  }, [departamentos, localidades, opportunity.clienteDepartamento, opportunity.clienteLocalidad])

  const montevideo = useMemo(
    () => ({
      departamentoId: idPorNombre(departamentos, UBICACION_MONTEVIDEO.departamento),
      localidadId: idPorNombre(localidades, UBICACION_MONTEVIDEO.localidad),
      ...UBICACION_MONTEVIDEO,
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

  const mismaQue = (u) => Boolean(u) && u.departamentoId === actual.departamentoId && u.localidadId === actual.localidadId

  // Marcada la opción que coincide con lo que la oportunidad ya tiene: así se ve de
  // entrada con qué se va a cotizar, en vez de pedir una elección a ciegas.
  //
  // Derivado y no un useState con el valor calculado de arranque: las listas de
  // departamentos y localidades llegan asincrónicas, y en el primer render pueden estar
  // vacías. Con el valor congelado ahí, TODA oportunidad quedaba marcada en "Montevideo"
  // —porque con las listas vacías los ids son '' y '' coincide con ''— y nunca se
  // corregía al llegar los datos. Lo que sí se guarda es lo que la persona elige, que
  // pisa lo derivado.
  const [eleccionManual, setEleccionManual] = useState(null)
  const eleccionAuto = mismaQue(delCliente) ? 'cliente' : mismaQue(montevideo) ? 'montevideo' : 'otra'
  const eleccion = eleccionManual ?? eleccionAuto
  const setEleccion = setEleccionManual

  // Mismo criterio para los dos selectores de "Otra": mientras nadie los toque muestran
  // la ubicación actual (cuando es justamente una "otra"), y se vacían apenas se elige
  // "Otra" a mano.
  const [otraManual, setOtraManual] = useState(null)
  const otra = otraManual ?? (eleccionAuto === 'otra' ? actual : { departamentoId: '', localidadId: '' })
  const setOtra = (valor) => setOtraManual((prev) => (typeof valor === 'function' ? valor(prev ?? otra) : valor))

  const localidadesDelDepartamento = useMemo(() => {
    const nombre = departamentos.find((d) => d.id === otra.departamentoId)?.name
    // Sin departamento elegido se ven todas: filtrar a cero sería peor que no filtrar.
    return nombre ? localidades.filter((l) => l.departamento === nombre) : localidades
  }, [departamentos, localidades, otra.departamentoId])

  const elegida = eleccion === 'cliente' ? delCliente : eleccion === 'montevideo' ? montevideo : otra
  const completa = Boolean(elegida?.departamentoId && elegida?.localidadId)
  const sinCambios = completa && mismaQue(elegida)

  // Bug reportado: se elegía "Otra", no se completaba departamento/localidad, y el botón
  // "Cotizar" de abajo dejaba cotizar igual — con la ubicación ANTERIOR, en silencio. El
  // panel ahora avisa hacia afuera qué le falta para que la elección sea real:
  //   'incompleta'    → falta elegir departamento y/o localidad.
  //   'sin-confirmar' → está completa pero es distinta a la guardada y nadie apretó
  //                     "Usar esta ubicación", así que todavía no es la que se cotizaría.
  const pendiente = !completa ? 'incompleta' : sinCambios ? null : 'sin-confirmar'
  useEffect(() => {
    onPendienteChange?.(pendiente)
  }, [pendiente, onPendienteChange])
  // Al desaparecer el panel (ya hay cotizaciones) no queda nada pendiente de él.
  useEffect(() => () => onPendienteChange?.(null), [onPendienteChange])

  const opciones = [
    {
      key: 'cliente',
      titulo: 'Cliente',
      detalle: delCliente
        ? `${delCliente.localidad} · ${delCliente.departamento}`
        : 'El cliente no tiene localidad y departamento cargados',
      deshabilitada: !delCliente,
    },
    {
      key: 'montevideo',
      // A pedido se llama por lo que es y no por el lugar: Montevideo - CP11500 es la
      // ubicación con la que nacía toda oportunidad, la que queda cuando nadie elige
      // otra. Cuál es sigue a la vista en el detalle de abajo.
      titulo: 'Por defecto',
      detalle: `${UBICACION_MONTEVIDEO.localidad} · ${UBICACION_MONTEVIDEO.departamento}`,
      deshabilitada: !montevideo.departamentoId || !montevideo.localidadId,
    },
    { key: 'otra', titulo: 'Otra', detalle: 'Elegir departamento y localidad' },
  ]

  const comoOpcion = (lista, id) => {
    const item = lista.find((o) => o.id === id)
    return item ? { value: item.id, label: item.name } : null
  }

  return (
    <section className="ubicacion-cotizar">
      <h3 className="ubicacion-cotizar__titulo">
        <MdPlace /> ¿Con qué ubicación se cotiza?
      </h3>
      <p className="ubicacion-cotizar__sub">Define la zona de circulación del vehículo.</p>

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
              // Entrar a "Otra" arranca en blanco. Antes traía puesta la ubicación que la
              // oportunidad ya tenía, y eso contradice lo que promete el botón: se elige
              // "Otra" justamente para poner otra, no para confirmar la de siempre.
              if (o.key === 'otra' && eleccion !== 'otra') setOtra({ departamentoId: '', localidadId: '' })
              setEleccion(o.key)
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
              placeholder="Elegí un departamento"
              options={departamentos.map((d) => ({ value: d.id, label: d.name }))}
              value={comoOpcion(departamentos, otra.departamentoId)}
              onChange={(opt) =>
                // Cambiar de departamento borra la localidad: la que estaba puede no
                // pertenecer al nuevo, y guardar ese par sería guardar algo que no existe.
                setOtra({ departamentoId: opt?.value ?? '', localidadId: '' })
              }
            />
          </label>
          <label className="ubicacion-cotizar__campo">
            <span>Localidad</span>
            <Dropdown
              size="small"
              placeholder={otra.departamentoId ? 'Elegí una localidad' : 'Elegí primero el departamento'}
              options={localidadesDelDepartamento.map((l) => ({ value: l.id, label: l.name }))}
              value={comoOpcion(localidades, otra.localidadId)}
              onChange={(opt) => setOtra((prev) => ({ ...prev, localidadId: opt?.value ?? '' }))}
            />
          </label>
        </div>
      )}

      <div className="ubicacion-cotizar__pie">
        {pendiente && (
          <p className="ubicacion-cotizar__pendiente" role="alert">
            {pendiente === 'incompleta'
              ? 'Elegí el departamento y la localidad para poder cotizar.'
              : 'Confirmá la ubicación con «Usar esta ubicación» para poder cotizar.'}
          </p>
        )}
        <Button
          kind="primary"
          disabled={!completa || sinCambios || guardando}
          onClick={() => onGuardar({ departamentoId: elegida.departamentoId, localidadId: elegida.localidadId })}
        >
          {guardando ? 'Guardando...' : sinCambios ? 'Es la que está puesta' : 'Usar esta ubicación'}
        </Button>
      </div>
    </section>
  )
}
