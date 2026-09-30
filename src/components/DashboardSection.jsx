import { useCallback, useEffect, useMemo, useState } from 'react'
import { AttentionBox, Button } from '@vibe/core'
import { MdRefresh } from 'react-icons/md'
import { fetchEstadosOportunidad, fetchOportunidadesDashboard } from '../services/mondayApi'
import { conversion, FECHAS, PERIODOS, RESULTADO, resumir, tasaDeCierre } from '../services/dashboardOportunidades'
import LoadingScreen from './LoadingScreen'
import './PillTabs.css'
import './DashboardSection.css'

// Sección de Dashboards. A pedido, por ahora solo Oportunidades: Concretadas, No
// concretadas (y las que siguen En curso), filtrando por período y por cuál de las 3
// fechas decide el período. Solo lee de monday.
//
// Colores: slots categóricos validados (validate_palette.js, modo claro, pasa CVD) y
// siempre con su etiqueta al lado — el color nunca es la única pista.

const SERIES = [
  { key: RESULTADO.CONCRETADA, label: 'Concretadas', color: 'var(--dash-concretada)' },
  { key: RESULTADO.NO_CONCRETADA, label: 'No concretadas', color: 'var(--dash-no-concretada)' },
  { key: RESULTADO.EN_CURSO, label: 'En curso', color: 'var(--dash-en-curso)' },
]

const porcentaje = (v) => (v == null ? '—' : Math.round(v * 100) + '%')
const fechaCorta = (dia) => {
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a}`
}

function Tile({ label, valor, detalle, color }) {
  return (
    <div className="dash__tile">
      <span className="dash__tile-label">
        {color && <span className="dash__swatch" style={{ background: color }} aria-hidden="true" />}
        {label}
      </span>
      <span className="dash__tile-valor">{valor}</span>
      {detalle && <span className="dash__tile-detalle">{detalle}</span>}
    </div>
  )
}

function Pills({ opciones, valor, onChange, etiqueta, disabled }) {
  return (
    <div className="pill-tabs dash__pills" role="tablist" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={valor === o.key}
          disabled={disabled}
          className={valor === o.key ? 'pill-tabs__tab pill-tabs__tab--active' : 'pill-tabs__tab'}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function DashboardSection() {
  const [oportunidades, setOportunidades] = useState(null)
  const [estados, setEstados] = useState([])
  // Cuándo se trajeron los datos que se están viendo (a pedido, al lado de "Actualizar").
  const [actualizadoEn, setActualizadoEn] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [periodo, setPeriodo] = useState('mes')
  const [fecha, setFecha] = useState('creacion')
  const [tooltip, setTooltip] = useState(null) // { x, y, texto }

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [ops, lista] = await Promise.all([fetchOportunidadesDashboard(), fetchEstadosOportunidad().catch(() => [])])
      setEstados(lista)
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
    () => (oportunidades ? resumir(oportunidades, { periodo, fecha }, new Date(), estados) : null),
    [oportunidades, periodo, fecha, estados]
  )

  if (error && !oportunidades) {
    return (
      <section className="dash">
        <AttentionBox type="danger">No se pudieron traer las oportunidades: {error}</AttentionBox>
      </section>
    )
  }
  if (!resumen) return <LoadingScreen title="Armando el dashboard" message="Estamos trayendo las oportunidades desde monday." />

  const { totales, vendedores, rango, sinFecha, grupos } = resumen
  const tasa = tasaDeCierre(totales)
  const maxEstado = Math.max(1, ...grupos.flatMap((g) => g.estados.map((e) => e.cantidad)))
  const maxVendedor = Math.max(1, ...vendedores.map((v) => v.total))
  const nombreFecha = FECHAS.find((f) => f.key === fecha)?.label.toLowerCase()
  const deTotal = (n) => (totales.total ? Math.round((n / totales.total) * 100) + '% del total' : null)

  return (
    <section className="dash">
      <header className="dash__head">
        <div>
          <h1>Dashboards</h1>
          <p>Indicadores de las oportunidades, leídos en el momento desde monday.</p>
        </div>
        <div className="dash__actualizar">
          {actualizadoEn && (
            <span className="dash__actualizado">
              Actualizado el{' '}
              {actualizadoEn.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las{' '}
              {actualizadoEn.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          )}
          <Button kind="secondary" leftIcon={MdRefresh} loading={cargando} onClick={cargar}>
            Actualizar
          </Button>
        </div>
      </header>

      <div className="pill-tabs dash__secciones" role="tablist" aria-label="Dashboard">
        <button type="button" role="tab" aria-selected className="pill-tabs__tab pill-tabs__tab--active">
          Oportunidades
        </button>
      </div>

      {/* Filtros en una sola fila, arriba de los números. */}
      <div className="dash__filtros">
        <Pills opciones={PERIODOS} valor={periodo} onChange={setPeriodo} etiqueta="Período" />
        <div className="dash__filtro-fecha">
          <span className="dash__filtro-lbl">Según fecha de</span>
          <Pills opciones={FECHAS} valor={fecha} onChange={setFecha} etiqueta="Fecha" disabled={periodo === 'todo'} />
        </div>
      </div>

      <p className="dash__rango">
        {rango
          ? `Del ${fechaCorta(rango[0])} al ${fechaCorta(rango[1])}, por fecha de ${nombreFecha}.`
          : 'Todas las oportunidades, sin importar la fecha.'}
        {rango && sinFecha > 0 && (
          <span className="dash__sin-fecha">
            {' '}
            {sinFecha} {sinFecha === 1 ? 'oportunidad no tiene' : 'oportunidades no tienen'} fecha de {nombreFecha} y{' '}
            {sinFecha === 1 ? 'queda' : 'quedan'} afuera.
          </span>
        )}
      </p>

      <div className="dash__tiles">
        {SERIES.map((s) => (
          <Tile key={s.key} label={s.label} valor={totales[s.key]} detalle={deTotal(totales[s.key])} color={s.color} />
        ))}
        {/* A pedido ("en todas es 100%"): el número principal es la conversión sobre el
            total; la tasa sobre las resueltas queda como detalle, porque mientras no haya
            ninguna "No Concretada" da siempre 100%. */}
        <Tile
          label="Conversión"
          valor={porcentaje(conversion(totales))}
          detalle={
            `${totales.concretada} de ${totales.total} concretadas` +
            (totales.concretada + totales.no_concretada ? ` · de las resueltas: ${porcentaje(tasa)}` : '')
          }
        />
      </div>

      {/* A pedido: todos los estados de la oportunidad, no solo los 3 grupos. Van
          agrupados por resultado y en el orden del tablero; los que tienen 0 también. */}
      <div className="dash__panel dash__panel--estados">
        <div className="dash__panel-head">
          <h2>Por estado</h2>
        </div>
        <div className="dash__grupos">
          {grupos.map((g) => {
            const serie = SERIES.find((x) => x.key === g.resultado)
            return (
              <div key={g.resultado} className="dash__grupo">
                <div className="dash__grupo-head">
                  <span className="dash__swatch" style={{ background: serie.color }} aria-hidden="true" />
                  <span>{serie.label}</span>
                  <span className="dash__grupo-total">{g.total}</span>
                </div>
                <ul className="dash__estados">
                  {g.estados.map((e) => (
                    <li key={e.nombre} className={e.cantidad ? undefined : 'dash__estado--cero'}>
                      <span className="dash__estado-nombre" title={e.nombre}>{e.nombre}</span>
                      <span className="dash__estado-barra-caja">
                        {e.cantidad > 0 && (
                          <span
                            className="dash__estado-barra"
                            style={{ width: (e.cantidad / maxEstado) * 100 + '%', background: serie.color }}
                            onMouseMove={(ev) =>
                              setTooltip({ x: ev.clientX, y: ev.clientY, texto: `${e.nombre}: ${e.cantidad}` })
                            }
                            onMouseLeave={() => setTooltip(null)}
                          />
                        )}
                      </span>
                      <span className="dash__num dash__estado-cant">{e.cantidad}</span>
                      <span className="dash__num dash__estado-pct">
                        {totales.total ? Math.round((e.cantidad / totales.total) * 100) + '%' : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      <div className="dash__panel">
        <div className="dash__panel-head">
          <h2>Por vendedor</h2>
          <ul className="dash__leyenda" aria-label="Referencias">
            {SERIES.map((s) => (
              <li key={s.key}>
                <span className="dash__swatch" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
              </li>
            ))}
          </ul>
        </div>

        {vendedores.length === 0 ? (
          <p className="dash__vacio">No hay oportunidades en este período.</p>
        ) : (
          <table className="dash__tabla">
            <thead>
              <tr>
                <th>Asignado</th>
                <th className="dash__col-barra" aria-label="Distribución" />
                <th className="dash__num">Concretadas</th>
                <th className="dash__num">No concretadas</th>
                <th className="dash__num">En curso</th>
                <th className="dash__num">Total</th>
                <th className="dash__num">Conversión</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((v) => (
                <tr key={v.nombre}>
                  <td className="dash__nombre">{v.nombre}</td>
                  <td className="dash__col-barra">
                    {/* Largo total = cantidad de oportunidades (misma escala para todos),
                        dividido por resultado. */}
                    <div className="dash__barra" style={{ width: (v.total / maxVendedor) * 100 + '%' }}>
                      {SERIES.filter((s) => v[s.key] > 0).map((s) => (
                        <span
                          key={s.key}
                          className="dash__segmento"
                          style={{ flexGrow: v[s.key], background: s.color }}
                          onMouseMove={(e) =>
                            setTooltip({ x: e.clientX, y: e.clientY, texto: `${v.nombre} · ${s.label}: ${v[s.key]}` })
                          }
                          onMouseLeave={() => setTooltip(null)}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="dash__num">{v.concretada}</td>
                  <td className="dash__num">{v.no_concretada}</td>
                  <td className="dash__num">{v.en_curso}</td>
                  <td className="dash__num dash__num--total">{v.total}</td>
                  <td className="dash__num">{porcentaje(conversion(v))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="dash__nota">
          Concretadas incluye «Concretada» y las «Ganada» (póliza, requiere autorización, requiere inspección). La conversión
          es sobre el total del período; la tasa de las resueltas no cuenta las que siguen en curso. Una oportunidad con dos asignados cuenta para los dos.
        </p>
      </div>

      {tooltip && (
        <div className="dash__tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }} role="tooltip">
          {tooltip.texto}
        </div>
      )}
    </section>
  )
}
