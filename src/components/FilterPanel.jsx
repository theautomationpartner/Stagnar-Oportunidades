import { useEffect, useState } from 'react'
import { MdExpandLess, MdExpandMore } from 'react-icons/md'
import { Button, Dropdown, Search } from '@vibe/core'
import './FilterPanel.css'

// Dropdown (@vibe/core) maneja {value, label} y el objeto entero como valor
// seleccionado, no un string plano como filters/onFilterChange (que no
// cambiaron, siguen siendo strings) — el adaptador de ida y vuelta pasa acá.
function FilterSelect({ label, field, value, options, onChange, placeholder }) {
  const dropdownOptions = options.map((opt) => ({ value: opt, label: opt }))
  const selected = dropdownOptions.find((o) => o.value === value) ?? null

  return (
    <label className="filter-field">
      <span>{label}</span>
      <Dropdown
        size="small"
        options={dropdownOptions}
        value={selected}
        placeholder={placeholder}
        clearable
        onClear={() => onChange(field, '')}
        onChange={(option) => onChange(field, option?.value ?? '')}
      />
    </label>
  )
}

// A pedido, estética tipo mockup: una sola barra de búsqueda para todos los campos
// posibles (nombre, apellido, CI, teléfono, vehículo, aseguradora — ver el haystack en
// App.jsx) en vez del bloque de 8 campos sueltos de antes. Marca/Año/Nombre/CI/Teléfono
// ya no tienen su propio filtro — quedan cubiertos por el buscador; los únicos filtros
// que se mantienen aparte ("filtros básicos") son los 3 que el buscador de texto libre
// no puede resolver (son estados/categorías, no texto): Estado de la cotización, Tipo
// de sujeto y Estado de envío, escondidos detrás de "Filtros avanzados" para no ocupar
// espacio de entrada.
export default function FilterPanel({
  searchTerm,
  onSearchTermChange,
  filters,
  onFilterChange,
  filterOptions,
  onClear,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // A pedido: la búsqueda no se aplica sola mientras se tipea — hay que apretar Enter o
  // el botón. Por eso el campo tiene su propio estado (lo que se está escribiendo) y
  // recién al buscar se lo pasa para arriba, que es lo que filtra la tabla.
  const [borrador, setBorrador] = useState(searchTerm)

  // Si el término aplicado cambia desde afuera ("Limpiar filtros"), el campo acompaña.
  useEffect(() => {
    setBorrador(searchTerm)
  }, [searchTerm])

  const buscar = () => onSearchTermChange(borrador.trim())

  const handleChange = (valor) => {
    setBorrador(valor)
    // Vaciar el campo sí se aplica al instante: si no, la tabla seguía filtrada con la
    // barra vacía y no había manera de entender por qué faltaban filas. Y no cuesta
    // nada, porque el filtrado es en el navegador.
    if (!valor.trim() && searchTerm) onSearchTermChange('')
  }
  // Auditoría (Nielsen N1, visibilidad del estado): con el panel cerrado no había forma
  // de saber que había filtros aplicados. El contador va en el propio toggle.
  const activeCount = Object.values(filters).filter(Boolean).length

  return (
    <section className="filter-panel">
      {/* Search nativo de @vibe/core — ya trae ícono de lupa y botón de limpiar, en vez
          de un <input> a mano. El Enter se escucha en el contenedor y no en el Search:
          así no depende de que el componente reexporte onKeyDown. */}
      <div
        className="filter-panel__search-row"
        onKeyDown={(e) => {
          if (e.key === 'Enter') buscar()
        }}
      >
        {/* debounceRate=0: el debounce propio del componente existía para el live search
            y acá hacía perder lo último tipeado — quien escribía y apretaba Enter
            enseguida buscaba con el texto anterior, o con nada. Ahora cada tecla
            actualiza el borrador al instante; lo que no se dispara sola es la búsqueda. */}
        <Search
          className="filter-panel__search"
          placeholder="Buscar por nombre, apellido, CI, teléfono, vehículo o aseguradora..."
          value={borrador}
          onChange={handleChange}
          debounceRate={0}
          showClearIcon
        />
        <Button className="filter-panel__search-btn" onClick={buscar}>
          Buscar
        </Button>
      </div>

      <button
        type="button"
        className="filter-panel__advanced-toggle"
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
      >
        Filtros avanzados
        {activeCount > 0 && (
          <span className="filter-panel__active-count" aria-label={`${activeCount} filtros activos`}>
            {activeCount}
          </span>
        )}
        {advancedOpen ? <MdExpandLess /> : <MdExpandMore />}
      </button>

      {advancedOpen && (
        <>
          <div className="filter-panel__fields">
            <FilterSelect
              label="Estado de la cotización"
              field="estadoCotizacion"
              value={filters.estadoCotizacion}
              options={filterOptions.estadosCotizacion}
              onChange={onFilterChange}
              placeholder="Todos los estados"
            />
            <FilterSelect
              label="Tipo de sujeto"
              field="tipoSujeto"
              value={filters.tipoSujeto}
              options={filterOptions.tiposSujeto}
              onChange={onFilterChange}
              placeholder="Todos"
            />
            <FilterSelect
              label="Estado de envío"
              field="estadoEnvio"
              value={filters.estadoEnvio}
              options={filterOptions.estadosEnvio}
              onChange={onFilterChange}
              placeholder="Todos los estados"
            />
          </div>
          <div className="filter-panel__footer">
            <Button kind="tertiary" onClick={onClear}>
              Limpiar filtros
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
