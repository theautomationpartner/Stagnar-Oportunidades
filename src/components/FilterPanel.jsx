import { useEffect, useRef, useState } from 'react'
import { MdClose, MdFilterList } from 'react-icons/md'
import { Button, Dropdown, Search } from '@vibe/core'
import { matchesSearchQuery } from '../services/format'
import { RANGOS_DE_FECHA, cantidadDeFiltrosActivos } from '../services/filtrosOportunidades'
import './FilterPanel.css'

// Dropdown (@vibe/core) maneja {value, label} y el objeto entero como valor
// seleccionado, no un string plano como filters/onFilterChange (que no
// cambiaron, siguen siendo strings) — el adaptador de ida y vuelta pasa acá.
// `options` puede ser una lista de textos o de {value, label} (Asignado: el valor es el
// id de la persona y se muestra su nombre).
function FilterSelect({ label, field, value, options, onChange, placeholder }) {
  const dropdownOptions = options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt))
  const selected = dropdownOptions.find((o) => o.value === value) ?? null

  return (
    <label className="filter-field">
      <span>{label}</span>
      <Dropdown
        size="small"
        options={dropdownOptions}
        value={selected}
        placeholder={placeholder}
        searchable
        filterOption={(option, inputValue) => matchesSearchQuery(option.label, inputValue)}
        clearable
        onClear={() => onChange(field, '')}
        onChange={(option) => onChange(field, option?.value ?? '')}
      />
    </label>
  )
}

// Un rango de fechas es un par de campos "desde" y "hasta"; cualquiera de los dos puede
// quedar vacío (sin límite de ese lado).
function FilterDateRange({ label, clave, filters, onChange }) {
  const desde = `${clave}Desde`
  const hasta = `${clave}Hasta`
  return (
    <fieldset className="filter-field filter-field--rango">
      <legend>{label}</legend>
      <div className="filter-field__rango">
        <input
          type="date"
          aria-label={`${label} desde`}
          value={filters[desde]}
          max={filters[hasta] || undefined}
          onChange={(e) => onChange(desde, e.target.value)}
        />
        <span aria-hidden="true">a</span>
        <input
          type="date"
          aria-label={`${label} hasta`}
          value={filters[hasta]}
          min={filters[desde] || undefined}
          onChange={(e) => onChange(hasta, e.target.value)}
        />
      </div>
    </fieldset>
  )
}

const fechaCorta = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

// Los filtros puestos, como etiquetas con su cruz para sacarlos (se ven sin abrir el
// panel). Un rango es una sola etiqueta y la cruz saca los dos extremos.
function etiquetasActivas(filters, filterOptions) {
  const etiquetas = []
  const suelto = (field, label, valor) =>
    filters[field] && etiquetas.push({ key: field, texto: `${label}: ${valor}`, campos: [field] })
  suelto('estadoOportunidad', 'Oportunidad', filters.estadoOportunidad)
  suelto('estadoCotizacion', 'Cotización', filters.estadoCotizacion)
  suelto('estadoEnvio', 'Envío', filters.estadoEnvio)
  suelto(
    'asignado',
    'Asignado',
    filterOptions.asignados?.find((o) => o.value === filters.asignado)?.label ?? filters.asignado
  )
  suelto('tipoSujeto', 'Sujeto', filters.tipoSujeto)
  for (const r of RANGOS_DE_FECHA) {
    const desde = filters[`${r.clave}Desde`]
    const hasta = filters[`${r.clave}Hasta`]
    if (!desde && !hasta) continue
    const rango =
      desde && hasta
        ? `${fechaCorta(desde)} a ${fechaCorta(hasta)}`
        : desde
          ? `desde ${fechaCorta(desde)}`
          : `hasta ${fechaCorta(hasta)}`
    etiquetas.push({ key: r.clave, texto: `${r.label}: ${rango}`, campos: [`${r.clave}Desde`, `${r.clave}Hasta`] })
  }
  return etiquetas
}

// Buscador + filtros de la tabla de Oportunidades. A pedido, todo en UNA fila: el
// buscador de texto libre (más angosto), el botón "Filtros" con cuántos hay puestos y
// los filtros activos como etiquetas. Los filtros se abren en un panel flotante agrupado
// (Estados · Personas · Fechas) que se superpone a la tabla en vez de empujarla hacia
// abajo. Los únicos filtros aparte del buscador son los que un texto libre no puede
// resolver (estados, personas y fechas, ver filtrosOportunidades.js).
export default function FilterPanel({
  searchTerm,
  onSearchTermChange,
  filters,
  onFilterChange,
  filterOptions,
  onClear,
}) {
  const [abierto, setAbierto] = useState(false)
  const raizRef = useRef(null)
  // A pedido: la búsqueda no se aplica sola mientras se tipea — hay que apretar Enter o
  // el botón. Por eso el campo tiene su propio estado (lo que se está escribiendo) y
  // recién al buscar se lo pasa para arriba, que es lo que filtra la tabla.
  const [borrador, setBorrador] = useState(searchTerm)

  // Si el término aplicado cambia desde afuera ("Limpiar"), el campo acompaña.
  useEffect(() => {
    setBorrador(searchTerm)
  }, [searchTerm])

  // El panel se cierra con Esc o con un clic afuera. Los menús de los desplegables
  // (@vibe/core) pueden dibujarse fuera del panel: un clic en una opción no cuenta como
  // "afuera".
  useEffect(() => {
    if (!abierto) return undefined
    const cerrar = (e) => {
      if (e.type === 'keydown') {
        if (e.key === 'Escape') setAbierto(false)
        return
      }
      if (raizRef.current?.contains(e.target)) return
      if (e.target.closest?.('[role="listbox"], [role="option"], [role="menu"]')) return
      setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', cerrar)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', cerrar)
    }
  }, [abierto])

  const buscar = () => onSearchTermChange(borrador.trim())

  const handleChange = (valor) => {
    setBorrador(valor)
    // Vaciar el campo sí se aplica al instante: si no, la tabla seguía filtrada con la
    // barra vacía y no había manera de entender por qué faltaban filas.
    if (!valor.trim() && searchTerm) onSearchTermChange('')
  }
  // Auditoría (Nielsen N1, visibilidad del estado): el contador va en el propio botón, y
  // los filtros puestos se ven como etiquetas aunque el panel esté cerrado.
  const activeCount = cantidadDeFiltrosActivos(filters)
  const etiquetas = etiquetasActivas(filters, filterOptions)
  const hayAlgo = activeCount > 0 || Boolean(searchTerm)

  return (
    <section className="filter-panel" ref={raizRef}>
      <div className="filter-panel__fila">
        {/* Search nativo de @vibe/core. El Enter se escucha en el contenedor y no en el
            Search: así no depende de que el componente reexporte onKeyDown.
            debounceRate=0: el debounce propio existía para el live search y acá hacía
            perder lo último tipeado. */}
        <div
          className="filter-panel__search-row"
          onKeyDown={(e) => {
            if (e.key === 'Enter') buscar()
          }}
        >
          <Search
            className="filter-panel__search"
            placeholder="Nombre, CI, teléfono, vehículo o aseguradora"
            value={borrador}
            onChange={handleChange}
            debounceRate={0}
            showClearIcon
          />
          <Button className="filter-panel__search-btn" onClick={buscar}>
            Buscar
          </Button>
        </div>

        <Button
          kind="secondary"
          className={abierto ? 'filter-panel__toggle filter-panel__toggle--abierto' : 'filter-panel__toggle'}
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls="filter-panel-popover"
        >
          <MdFilterList aria-hidden="true" /> Filtros
          {activeCount > 0 && (
            <span className="filter-panel__active-count" aria-label={`${activeCount} filtros activos`}>
              {activeCount}
            </span>
          )}
        </Button>

        {etiquetas.length > 0 && (
          <ul className="filter-panel__chips" aria-label="Filtros aplicados">
            {etiquetas.map((e) => (
              <li key={e.key} className="filter-panel__chip">
                <span>{e.texto}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${e.texto}`}
                  onClick={() => e.campos.forEach((c) => onFilterChange(c, ''))}
                >
                  <MdClose aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {hayAlgo && (
          <Button kind="tertiary" size="small" className="filter-panel__limpiar" onClick={onClear}>
            Limpiar
          </Button>
        )}
      </div>

      {abierto && (
        <div id="filter-panel-popover" className="filter-panel__popover" role="dialog" aria-label="Filtros">
          <div className="filter-panel__grupo">
            <h3 className="filter-panel__grupo-titulo">Estados</h3>
            <div className="filter-panel__grupo-campos filter-panel__grupo-campos--3">
              <FilterSelect
                label="De la oportunidad"
                field="estadoOportunidad"
                value={filters.estadoOportunidad}
                options={filterOptions.estadosOportunidad}
                onChange={onFilterChange}
                placeholder="Todos"
              />
              {/* Reunión del 24/09: los estados de transición (Cotizar/Cotizando,
                  Enviar/Enviando) van juntos como "Otros" — ver filtrosOportunidades.js. */}
              <FilterSelect
                label="De la cotización"
                field="estadoCotizacion"
                value={filters.estadoCotizacion}
                options={filterOptions.estadosCotizacion}
                onChange={onFilterChange}
                placeholder="Todos"
              />
              <FilterSelect
                label="Del envío"
                field="estadoEnvio"
                value={filters.estadoEnvio}
                options={filterOptions.estadosEnvio}
                onChange={onFilterChange}
                placeholder="Todos"
              />
            </div>
          </div>

          <div className="filter-panel__grupo">
            <h3 className="filter-panel__grupo-titulo">Personas</h3>
            <div className="filter-panel__grupo-campos filter-panel__grupo-campos--2">
              <FilterSelect
                label="Asignado"
                field="asignado"
                value={filters.asignado}
                options={filterOptions.asignados}
                onChange={onFilterChange}
                placeholder="Todos"
              />
              <FilterSelect
                label="Tipo de sujeto"
                field="tipoSujeto"
                value={filters.tipoSujeto}
                options={filterOptions.tiposSujeto}
                onChange={onFilterChange}
                placeholder="Todos"
              />
            </div>
          </div>

          <div className="filter-panel__grupo">
            <h3 className="filter-panel__grupo-titulo">Fechas</h3>
            <div className="filter-panel__grupo-campos filter-panel__grupo-campos--fechas">
              {RANGOS_DE_FECHA.map((r) => (
                <FilterDateRange key={r.clave} label={r.label} clave={r.clave} filters={filters} onChange={onFilterChange} />
              ))}
            </div>
          </div>

          <div className="filter-panel__popover-pie">
            <Button kind="tertiary" size="small" onClick={onClear} disabled={!hayAlgo}>
              Limpiar filtros
            </Button>
            <Button kind="primary" size="small" onClick={() => setAbierto(false)}>
              Listo
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
