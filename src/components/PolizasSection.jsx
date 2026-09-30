import { useEffect, useMemo, useState } from 'react'
import { AttentionBox, Button, Dropdown, Search } from '@vibe/core'
import { MdChevronLeft, MdChevronRight } from 'react-icons/md'
import { fetchPolizas } from '../services/mondayApi'
import { formatImporte, formatShortDate, matchesSearchQuery, normalizarParaMatch } from '../services/format'
import { coberturaParaMostrar } from '../services/coberturaGroups'
import LoadingScreen from './LoadingScreen'
import './PolizasSection.css'

// "Consultar pólizas" (a pedido): la lista con los datos básicos — cliente, bien,
// vigencia —, un buscador por cliente, matrícula y modelo, y paginado de a 20. Un clic en
// la fila abre la ficha completa, de solo lectura (ver PolizaDetalle). La app no escribe
// nada en el tablero de pólizas.

const PAGE_SIZE = 20

// Números de página con "…", igual que Clientes (ver ClientesSection.jsx).
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

// Mes de vencimiento de una póliza ("AAAA-MM"): el Vencimiento, o si falta el fin de la
// vigencia. null si no tiene ninguno.
const mesDeVencimiento = (p) => (p.vencimiento || p.hasta || '').slice(0, 7) || null

const mesActual = () => {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

// "2026-09" → "setiembre de 2026"
const nombreMes = (mes) => {
  const [a, m] = mes.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('es-UY', { month: 'long', year: 'numeric' })
}

// Todos los meses entre dos "AAAA-MM", inclusive.
function mesesEntre(desde, hasta) {
  const meses = []
  let [a, m] = desde.split('-').map(Number)
  const [ah, mh] = hasta.split('-').map(Number)
  while (a < ah || (a === ah && m <= mh)) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      a++
    }
  }
  return meses
}

// A pedido, el selector de mes es el mismo desplegable de @vibe que usan los filtros del
// resto de la app (ver FilterPanel.jsx#FilterSelect), en vez del campo de mes nativo del
// navegador: se busca escribiendo ("mar 27", "2027") y se ve igual en todos lados.
function MesSelect({ etiqueta, value, meses, onChange }) {
  // "Setiembre 2026": corto, para que entre entero en el desplegable.
  const opciones = meses.map((mes) => {
    const [a, m] = mes.split('-').map(Number)
    const nombre = new Date(a, m - 1, 1).toLocaleDateString('es-UY', { month: 'long' })
    return { value: mes, label: nombre.charAt(0).toUpperCase() + nombre.slice(1) + ' ' + a }
  })
  return (
    <div className="polizas__mes">
      <Dropdown
        size="small"
        aria-label={etiqueta}
        options={opciones}
        value={opciones.find((o) => o.value === value) ?? null}
        searchable
        // El rango siempre tiene un mes: no hay nada que "limpiar".
        clearable={false}
        filterOption={(option, inputValue) => matchesSearchQuery(option.label, inputValue)}
        onChange={(option) => option && onChange(option.value)}
      />
    </div>
  )
}

// Color del estado: el de siempre de la app para vigente/vencida; el resto neutro.
const claseEstado = (estado) => {
  const e = normalizarParaMatch(estado)
  if (e === 'vigente') return 'polizas__estado polizas__estado--vigente'
  if (/vencid|anulad|cancelad/.test(e)) return 'polizas__estado polizas__estado--baja'
  return 'polizas__estado'
}

export default function PolizasSection({ onOpenPoliza, venceInicial, onVenceInicialUsado }) {
  const [polizas, setPolizas] = useState(null)
  const [error, setError] = useState(null)
  // Igual que el resto de la app, la búsqueda no es en vivo: se aplica con Enter o "Buscar".
  const [busqueda, setBusqueda] = useState('')
  const [termino, setTermino] = useState('')
  const [page, setPage] = useState(1)
  // A pedido: "Vencen entre [mes] y [mes]". null = el valor por defecto, del mes actual al
  // vencimiento más lejano que haya, así arranca mostrando todas las que vencen de acá en
  // adelante. Los meses se aplican apenas se eligen (el texto sí espera a "Buscar").
  // Si se llega desde el dashboard ("Vencen en 30 días"), arranca con ese rango.
  const [venceDesde, setVenceDesde] = useState(venceInicial?.desde ?? null)
  const [venceHasta, setVenceHasta] = useState(venceInicial?.hasta ?? null)
  useEffect(() => {
    if (venceInicial) onVenceInicialUsado?.()
    // Solo al montar: el rango inicial se usa una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let vivo = true
    fetchPolizas()
      .then((p) => vivo && setPolizas(p))
      .catch((err) => vivo && setError(err.message))
    return () => {
      vivo = false
    }
  }, [])

  const buscar = () => {
    setTermino(busqueda)
    setPage(1)
  }

  const mesMasLejano = useMemo(() => {
    const meses = (polizas ?? []).map(mesDeVencimiento).filter(Boolean)
    return meses.reduce((max, m) => (m > max ? m : max), mesActual())
  }, [polizas])
  const desde = venceDesde ?? mesActual()
  const hasta = venceHasta ?? mesMasLejano
  // Los meses que se pueden elegir: desde el vencimiento más viejo (o el mes actual, si
  // todas vencen más adelante) hasta el más lejano.
  const mesesDisponibles = useMemo(() => {
    const meses = (polizas ?? []).map(mesDeVencimiento).filter(Boolean)
    const primero = meses.reduce((min, m) => (m < min ? m : min), mesActual())
    return mesesEntre(primero, mesMasLejano)
  }, [polizas, mesMasLejano])
  const vencimientoPorDefecto = venceDesde == null && venceHasta == null

  // Por cliente, matrícula y modelo (el nombre del vehículo trae marca y modelo). Sin
  // distinguir tildes ni mayúsculas; la matrícula también sin espacios ni guiones. Y por
  // mes de vencimiento: las que no tienen fecha solo se ven con el rango por defecto.
  const filtradas = useMemo(() => {
    const q = normalizarParaMatch(termino)
    const qCompacta = q.replace(/[\s-]/g, '')
    return (polizas ?? []).filter((p) => {
      const mes = mesDeVencimiento(p)
      if (mes ? mes < desde || mes > hasta : !vencimientoPorDefecto) return false
      if (!q) return true
      return (
        normalizarParaMatch(p.cliente).includes(q) ||
        normalizarParaMatch(p.vehiculo).includes(q) ||
        normalizarParaMatch(p.matricula).replace(/[\s-]/g, '').includes(qCompacta)
      )
    })
  }, [polizas, termino, desde, hasta, vencimientoPorDefecto])

  if (error && !polizas) {
    return (
      <section className="polizas">
        <AttentionBox type="danger">No se pudieron traer las pólizas: {error}</AttentionBox>
      </section>
    )
  }
  if (!polizas) return <LoadingScreen title="Cargando pólizas" message="Un momento, estamos trayendo las pólizas desde monday." />

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE))
  const paginaActual = Math.min(page, totalPaginas)
  const pagina = filtradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE)
  const primera = filtradas.length ? (paginaActual - 1) * PAGE_SIZE + 1 : 0
  const ultima = filtradas.length ? primera + pagina.length - 1 : 0

  return (
    <section className="polizas">
      <header className="polizas__head">
        <h1>Pólizas</h1>
        <p>Elegí una póliza para ver todos sus datos. Es solo de consulta: acá no se modifica nada.</p>
      </header>

      <div
        className="polizas__toolbar"
        onKeyDown={(e) => {
          if (e.key === 'Enter') buscar()
        }}
      >
        <Search
          className="polizas__buscador"
          placeholder="Cliente, matrícula o modelo"
          value={busqueda}
          onChange={setBusqueda}
          debounceRate={0}
          showClearIcon
        />
        <Button onClick={buscar}>Buscar</Button>
        <div className="polizas__vence">
          <span className="polizas__vence-lbl">Vencen entre</span>
          <MesSelect
            etiqueta="Vencen desde"
            value={desde}
            meses={mesesDisponibles.filter((m) => m <= hasta)}
            onChange={(mes) => {
              setVenceDesde(mes)
              setPage(1)
            }}
          />
          <span className="polizas__vence-lbl">y</span>
          <MesSelect
            etiqueta="Vencen hasta"
            value={hasta}
            meses={mesesDisponibles.filter((m) => m >= desde)}
            onChange={(mes) => {
              setVenceHasta(mes)
              setPage(1)
            }}
          />
          {!vencimientoPorDefecto && (
            <button
              type="button"
              className="polizas__restablecer"
              onClick={() => {
                setVenceDesde(null)
                setVenceHasta(null)
                setPage(1)
              }}
            >
              Restablecer
            </button>
          )}
        </div>
        <span className="polizas__conteo">
          {filtradas.length === polizas.length
            ? `${polizas.length} pólizas`
            : `${filtradas.length} de ${polizas.length} pólizas`}
        </span>
      </div>
      <p className="polizas__rango">
        Vencen de {nombreMes(desde)} a {nombreMes(hasta)}
        {vencimientoPorDefecto && ' (del mes actual al vencimiento más lejano)'}.
      </p>

      <div className="polizas__tabla-caja">
        <table className="polizas__tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Bien asegurado</th>
              <th>Matrícula</th>
              <th>Compañía · cobertura</th>
              <th>Vigencia</th>
              <th>Estado</th>
              <th className="polizas__num">Premio total</th>
            </tr>
          </thead>
          <tbody>
            {pagina.length === 0 && (
              <tr>
                <td colSpan={7} className="polizas__vacio">
                  {polizas.length === 0
                    ? 'Todavía no hay pólizas.'
                    : termino
                      ? `Ninguna póliza coincide con «${termino}» en esos meses.`
                      : 'Ninguna póliza vence en esos meses.'}
                </td>
              </tr>
            )}
            {pagina.map((p) => (
              <tr
                key={p.id}
                className="polizas__fila"
                tabIndex={0}
                onClick={() => onOpenPoliza(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onOpenPoliza(p.id)
                }}
              >
                <td className="polizas__cliente">{p.cliente || '—'}</td>
                <td>{p.vehiculo || '—'}</td>
                <td className="polizas__matricula">{p.matricula || '—'}</td>
                <td>
                  {p.compania || '—'}
                  {p.cobertura && <span className="polizas__muted"> · {coberturaParaMostrar(p)}</span>}
                </td>
                <td className="polizas__vigencia">
                  {p.desde ? `${formatShortDate(p.desde)} al ${formatShortDate(p.hasta)}` : '—'}
                </td>
                <td>{p.estado ? <span className={claseEstado(p.estado)}>{p.estado}</span> : '—'}</td>
                <td className="polizas__num">{formatImporte(p.premioTotal, p.moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtradas.length > PAGE_SIZE && (
        <div className="polizas__paginado">
          <span className="polizas__paginado-resumen">
            Mostrando {primera} a {ultima} de {filtradas.length} pólizas
          </span>
          <div className="polizas__paginado-paginas">
            <button
              type="button"
              className="polizas__page-btn"
              onClick={() => setPage(paginaActual - 1)}
              disabled={paginaActual <= 1}
              aria-label="Página anterior"
            >
              <MdChevronLeft />
            </button>
            {paginasVisibles(paginaActual, totalPaginas).map((n, i) =>
              n === null ? (
                <span key={`hueco-${i}`} className="polizas__page-gap">
                  …
                </span>
              ) : (
                <button
                  type="button"
                  key={n}
                  className={n === paginaActual ? 'polizas__page-btn polizas__page-btn--activa' : 'polizas__page-btn'}
                  onClick={() => setPage(n)}
                  aria-current={n === paginaActual ? 'page' : undefined}
                >
                  {n}
                </button>
              )
            )}
            <button
              type="button"
              className="polizas__page-btn"
              onClick={() => setPage(paginaActual + 1)}
              disabled={paginaActual >= totalPaginas}
              aria-label="Página siguiente"
            >
              <MdChevronRight />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
