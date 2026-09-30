import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MdCancelScheduleSend,
  MdCheckCircle,
  MdCompareArrows,
  MdErrorOutline,
  MdEvent,
  MdExpandLess,
  MdExpandMore,
  MdFiberNew,
  MdForum,
  MdReportProblem,
  MdRequestQuote,
  MdSend,
  MdSync,
} from 'react-icons/md'
import { fetchEstadosOportunidad, fetchOportunidadesDashboard, fetchPolizas } from '../services/mondayApi'
import { conversion, polizasPorVencer, resumir } from '../services/dashboardOportunidades'
import { CONCRETADAS_TODAS, PROBLEMAS, tieneProblema } from '../services/filtrosOportunidades'
import './OportunidadesResumen.css'

// Resumen arriba de la tabla de Oportunidades (a pedido: calcado del "Dashboard de Drafts"
// de referencia, Cambios24-09/image (7).png, y del audio "Dashboard de oportunidades y
// alertas"): cuántas hay en cada paso del circuito y lo que requiere atención hoy. Cada
// tarjeta, al hacerle clic, filtra la tabla de abajo. Cuenta sobre TODAS las oportunidades
// (al día de hoy), no sobre lo filtrado. Solo lee de monday.

const PREFERENCIA = 'oportunidades-resumen-oculto'
const leerOculto = () => {
  try {
    return localStorage.getItem(PREFERENCIA) === '1'
  } catch {
    return false
  }
}

const porcentaje = (v) => (v == null ? '—' : Math.round(v * 100) + '%')
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

function Tarjeta({ tono, Icono, valor, titulo, detalle, onClick }) {
  return (
    <button type="button" className={'resumen-tarjeta resumen-tarjeta--' + tono} onClick={onClick}>
      <Icono className="resumen-tarjeta__icono" aria-hidden="true" />
      <span className="resumen-tarjeta__valor">{valor}</span>
      <span className="resumen-tarjeta__titulo">{titulo}</span>
      {detalle && <span className="resumen-tarjeta__detalle">{detalle}</span>}
    </button>
  )
}

export default function OportunidadesResumen({ onFiltrar, onVerPolizasPorVencer }) {
  const [oportunidades, setOportunidades] = useState(null)
  const [estados, setEstados] = useState([])
  const [polizas, setPolizas] = useState([])
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [actualizadoEn, setActualizadoEn] = useState(null)
  // Se puede plegar para ganar lugar para la tabla; se recuerda en este navegador.
  const [oculto, setOculto] = useState(leerOculto)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [ops, lista, pols] = await Promise.all([
        fetchOportunidadesDashboard(),
        fetchEstadosOportunidad().catch(() => []),
        fetchPolizas().catch(() => []),
      ])
      setEstados(lista)
      setPolizas(pols)
      setOportunidades(ops)
      setActualizadoEn(new Date())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const resumen = useMemo(
    () => (oportunidades ? resumir(oportunidades, { periodo: 'todo', fecha: 'creacion' }, new Date(), estados) : null),
    [oportunidades, estados]
  )
  // Misma regla que los accesos rápidos de la tabla: el error del paso y el estado de la
  // oportunidad que le corresponde (ver PROBLEMAS en filtrosOportunidades.js).
  const atencion = useMemo(() => {
    if (!oportunidades) return null
    const conEstado = oportunidades.map((o) => ({ ...o, estadoOportunidad: o.estado }))
    return Object.fromEntries(Object.keys(PROBLEMAS).map((k) => [k, conEstado.filter((o) => tieneProblema(o, k)).length]))
  }, [oportunidades])
  const porVencer = useMemo(() => polizasPorVencer(polizas), [polizas])

  const plegar = () => {
    setOculto((v) => {
      try {
        localStorage.setItem(PREFERENCIA, v ? '0' : '1')
      } catch {
        /* sin almacenamiento: queda solo para esta visita */
      }
      return !v
    })
  }

  const cantidadDe = (estado) =>
    resumen?.grupos.flatMap((g) => g.estados).find((e) => e.nombre.toLowerCase() === estado.toLowerCase())?.cantidad ?? 0
  const verEstado = (estadoOportunidad) => () => onFiltrar?.({ estadoOportunidad })
  const ver = (filtros) => () => onFiltrar?.(filtros)
  const aceptadas = cantidadDe('Cotizacion aceptada')

  return (
    <section className="resumen" aria-label="Resumen de oportunidades">
      <div className="resumen__barra">
        <button type="button" className="resumen__plegar" aria-expanded={!oculto} onClick={plegar}>
          {oculto ? <MdExpandMore aria-hidden="true" /> : <MdExpandLess aria-hidden="true" />}
          {oculto ? 'Mostrar resumen' : 'Resumen al día de hoy'}
        </button>
        {!oculto && (
          <div className="resumen__vivo">
            <MdSync aria-hidden="true" />
            <span>
              Datos en vivo del tablero de Oportunidades
              {actualizadoEn &&
                ` · actualizado a las ${actualizadoEn.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
            </span>
            <button type="button" className="resumen__actualizar" disabled={cargando} onClick={cargar}>
              {cargando ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        )}
      </div>

      {!oculto && error && !oportunidades && <p className="resumen__error">No se pudo armar el resumen: {error}</p>}
      {!oculto && !oportunidades && !error && <p className="resumen__cargando">Armando el resumen...</p>}

      {!oculto && resumen && (
        <>
          <div className="resumen__tarjetas">
            <Tarjeta tono="ambar" Icono={MdFiberNew} valor={cantidadDe('Nueva')} titulo="Nuevas" onClick={verEstado('Nueva')} />
            <Tarjeta
              tono="verdeagua"
              Icono={MdRequestQuote}
              valor={cantidadDe('Cotizacion Emitida')}
              titulo="Cotización emitida"
              onClick={verEstado('Cotizacion Emitida')}
            />
            <Tarjeta
              tono="azul"
              Icono={MdSend}
              valor={cantidadDe('Cotizacion Enviada')}
              titulo="Cotización enviada"
              onClick={verEstado('Cotizacion Enviada')}
            />
            <Tarjeta
              tono="lavanda"
              Icono={MdForum}
              valor={cantidadDe('Negociacion')}
              titulo="En negociación"
              detalle={aceptadas ? plural(aceptadas, 'cotización aceptada', 'cotizaciones aceptadas') : null}
              onClick={verEstado('Negociacion')}
            />
            <Tarjeta
              tono="verde"
              Icono={MdCheckCircle}
              valor={resumen.totales.concretada}
              titulo="Concretadas"
              detalle={`Conversión ${porcentaje(conversion(resumen.totales))}`}
              onClick={verEstado(CONCRETADAS_TODAS)}
            />
          </div>

          <h2 className="resumen__seccion">Requiere atención hoy</h2>
          <div className="resumen__tarjetas">
            <Tarjeta
              tono="rojo"
              Icono={MdErrorOutline}
              valor={atencion.cotizacion}
              titulo="Cotización con error"
              detalle="WINK no pudo cotizar · siguen en Nueva"
              onClick={ver(PROBLEMAS.cotizacion)}
            />
            <Tarjeta
              tono="rojo"
              Icono={MdCancelScheduleSend}
              valor={atencion.envio}
              titulo="Envío con error"
              detalle="No llegó por WhatsApp · en Cotización emitida"
              onClick={ver(PROBLEMAS.envio)}
            />
            <Tarjeta
              tono="ambar"
              Icono={MdCompareArrows}
              valor={atencion.diferencias}
              titulo="Pólizas con diferencias"
              detalle="No coincide con lo cotizado · en Ganada - Póliza"
              onClick={ver(PROBLEMAS.diferencias)}
            />
            <Tarjeta
              tono="lavanda"
              Icono={MdReportProblem}
              valor={atencion.emision}
              titulo="Error al crear la póliza"
              detalle="La emisión falló · en Concretada"
              onClick={ver(PROBLEMAS.emision)}
            />
            <Tarjeta
              tono="verdeagua"
              Icono={MdEvent}
              valor={porVencer.cantidad}
              titulo="Vencimientos"
              detalle="Pólizas que vencen en los próximos 30 días"
              onClick={() => onVerPolizasPorVencer?.({ desde: porVencer.mesDesde, hasta: porVencer.mesHasta })}
            />
          </div>
        </>
      )}
    </section>
  )
}
