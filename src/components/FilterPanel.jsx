import { useState } from 'react'
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

  return (
    <section className="filter-panel">
      {/* Search nativo de @vibe/core — ya trae ícono de lupa, botón de limpiar y
          debounce, en vez de un <input> a mano. */}
      <Search
        className="filter-panel__search"
        placeholder="Buscar por nombre, apellido, CI, teléfono, vehículo o aseguradora..."
        value={searchTerm}
        onChange={onSearchTermChange}
        showClearIcon
      />

      <button
        type="button"
        className="filter-panel__advanced-toggle"
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
      >
        Filtros avanzados {advancedOpen ? <MdExpandLess /> : <MdExpandMore />}
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
