// Cálculos del dashboard de Oportunidades (ver components/DashboardSection.jsx). Sin
// React y sin red: recibe las oportunidades de fetchOportunidadesDashboard y devuelve los
// números, así se puede probar suelto.

// A pedido: Concretadas = "Concretada" más las tres "Ganada"; No concretadas = "No
// Concretada"; todo lo demás (Nueva, Cotización Emitida/Enviada, Negociación, aceptada, o
// sin estado) sigue abierto y va como "En curso".
export const RESULTADO = { CONCRETADA: 'concretada', NO_CONCRETADA: 'no_concretada', EN_CURSO: 'en_curso' }

export function resultadoDe(estado) {
  const e = String(estado ?? '').trim().toLowerCase()
  if (e === 'concretada' || e.startsWith('ganada')) return RESULTADO.CONCRETADA
  if (e === 'no concretada') return RESULTADO.NO_CONCRETADA
  return RESULTADO.EN_CURSO
}

// Por qué fecha se decide en qué período cae cada oportunidad (a pedido, las 3).
export const FECHAS = [
  { key: 'creacion', label: 'Creación' },
  { key: 'cotizacion', label: 'Cotización' },
  { key: 'cierre', label: 'Cierre' },
]

export const PERIODOS = [
  { key: 'semana', label: 'Esta semana' },
  { key: 'semana_pasada', label: 'Semana pasada' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_pasado', label: 'Mes pasado' },
  { key: 'todo', label: 'Todo el historial' },
]

const dosDigitos = (n) => String(n).padStart(2, '0')
const aDia = (d) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`

// La fecha elegida de una oportunidad como "AAAA-MM-DD" en la hora local (Uruguay), o
// null si no la tiene. La creación viene como instante UTC: se pasa a local, si no una
// oportunidad creada un lunes a las 22:00 caería el martes.
export function diaDe(op, fecha) {
  if (fecha === 'creacion') return op.creadaEn ? aDia(new Date(op.creadaEn)) : null
  const texto = fecha === 'cotizacion' ? op.fechaCotizacion : op.fechaCierre
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(texto ?? '')
  return m ? m[1] : null
}

// [desde, hasta] inclusive, como "AAAA-MM-DD". La semana va de lunes a domingo. null para
// "Todo el historial".
export function rangoDe(periodo, hoy = new Date()) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const lunes = new Date(d)
  lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (periodo === 'semana') {
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)
    return [aDia(lunes), aDia(domingo)]
  }
  if (periodo === 'semana_pasada') {
    const desde = new Date(lunes)
    desde.setDate(lunes.getDate() - 7)
    const hasta = new Date(lunes)
    hasta.setDate(lunes.getDate() - 1)
    return [aDia(desde), aDia(hasta)]
  }
  if (periodo === 'mes') {
    return [aDia(new Date(d.getFullYear(), d.getMonth(), 1)), aDia(new Date(d.getFullYear(), d.getMonth() + 1, 0))]
  }
  if (periodo === 'mes_pasado') {
    return [aDia(new Date(d.getFullYear(), d.getMonth() - 1, 1)), aDia(new Date(d.getFullYear(), d.getMonth(), 0))]
  }
  return null
}

const vacio = () => ({ concretada: 0, no_concretada: 0, en_curso: 0, total: 0 })

// Conversión: del total del período, cuántas se concretaron (las que siguen en curso
// cuentan como no concretadas todavía). Es el número principal: la tasa de cierre de abajo
// da 100% mientras no haya ninguna "No Concretada". null sin oportunidades.
export function conversion(c) {
  return c.total ? c.concretada / c.total : null
}

// Tasa de cierre: de las que ya se resolvieron, cuántas se concretaron. Las que siguen en
// curso no cuentan (todavía pueden ir para cualquier lado). null si no hay ninguna resuelta.
export function tasaDeCierre(c) {
  const resueltas = c.concretada + c.no_concretada
  return resueltas ? c.concretada / resueltas : null
}

export const SIN_ESTADO = 'Sin estado'

// Los números del período. `sinFecha`: las que quedan afuera porque no tienen la fecha
// elegida (con "Todo el historial" entran todas). `estados`: los de la columna, en su
// orden (fetchEstadosOportunidad) — salen todos, aunque tengan 0, agrupados por resultado.
export function resumir(oportunidades, { periodo, fecha }, hoy = new Date(), estados = []) {
  const rango = rangoDe(periodo, hoy)
  const totales = vacio()
  const porVendedor = new Map()
  const porEstado = new Map([...estados, SIN_ESTADO].map((e) => [e, 0]))
  let sinFecha = 0
  for (const op of oportunidades) {
    if (rango) {
      const dia = diaDe(op, fecha)
      if (!dia) {
        sinFecha++
        continue
      }
      if (dia < rango[0] || dia > rango[1]) continue
    }
    const r = resultadoDe(op.estado)
    totales[r]++
    totales.total++
    const estado = String(op.estado ?? '').trim() || SIN_ESTADO
    porEstado.set(estado, (porEstado.get(estado) ?? 0) + 1)
    // Una oportunidad con dos asignados cuenta para los dos; sin asignado, va aparte.
    for (const nombre of op.asignados.length ? op.asignados : ['Sin asignar']) {
      if (!porVendedor.has(nombre)) porVendedor.set(nombre, vacio())
      const c = porVendedor.get(nombre)
      c[r]++
      c.total++
    }
  }
  const vendedores = [...porVendedor.entries()]
    .map(([nombre, c]) => ({ nombre, ...c }))
    .sort((a, b) => b.concretada - a.concretada || b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))
  const grupos = [RESULTADO.CONCRETADA, RESULTADO.EN_CURSO, RESULTADO.NO_CONCRETADA].map((resultado) => ({
    resultado,
    total: totales[resultado],
    estados: [...porEstado.entries()]
      .filter(([nombre]) => resultadoDe(nombre === SIN_ESTADO ? '' : nombre) === resultado)
      // "Sin estado" solo aparece si hay alguna.
      .filter(([nombre, cantidad]) => nombre !== SIN_ESTADO || cantidad > 0)
      .map(([nombre, cantidad]) => ({ nombre, cantidad })),
  }))
  return { rango, totales, vendedores, sinFecha, grupos }
}

// Pólizas que vencen de hoy a `dias` días (inclusive), por su Vencimiento (o el fin de la
// vigencia si falta).
export function polizasPorVencer(polizas, dias = 30, hoy = new Date()) {
  const desde = aDia(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()))
  const hastaFecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias)
  const hasta = aDia(hastaFecha)
  const cantidad = polizas.filter((p) => {
    const d = (p.vencimiento || p.hasta || '').slice(0, 10)
    return d && d >= desde && d <= hasta
  }).length
  // El filtro de la lista de pólizas es por mes: del actual al del día límite.
  return { cantidad, mesDesde: desde.slice(0, 7), mesHasta: hasta.slice(0, 7) }
}
