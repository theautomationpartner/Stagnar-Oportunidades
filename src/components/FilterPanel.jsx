import { useState } from 'react'
import { MdExpandLess, MdExpandMore, MdSearch } from 'react-icons/md'
import { Button, Dropdown } from '@vibe/core'
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

function FilterInput({ label, field, value, onChange, placeholder }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </label>
  )
}

export default function FilterPanel({
  searchTerm,
  onSearchTermChange,
  filters,
  onFilterChange,
  filterOptions,
  onClear,
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <section className="filter-panel">
      <div className="filter-panel__head">
        <div className="filter-panel__title-row">
          <span className="filter-panel__step">1</span>
          <div>
            <h2 className="filter-panel__title">Seleccionar oportunidad</h2>
            <p className="filter-panel__subtitle">
              Buscá y filtrá para encontrar la oportunidad sobre la cual querés ver las posibles
              cotizaciones.
            </p>
          </div>
        </div>
        <Button
          kind="secondary"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          {collapsed ? <MdExpandMore /> : <MdExpandLess />} {collapsed ? 'Mostrar filtros' : 'Ocultar filtros'}
        </Button>
      </div>

      {!collapsed && (
        <>
          <input
            className="filter-panel__search"
            type="text"
            placeholder="Buscar por nombre, apellido, CI, teléfono, bien o compañía..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
          />

          <div className="filter-panel__fields">
            <FilterSelect
              label="Marca"
              field="marca"
              value={filters.marca}
              options={filterOptions.marcas}
              onChange={onFilterChange}
              placeholder="Todas las marcas"
            />
            <FilterSelect
              label="Año"
              field="anio"
              value={filters.anio}
              options={filterOptions.anios}
              onChange={onFilterChange}
              placeholder="Todos los años"
            />
            <FilterInput
              label="Nombre y apellido"
              field="nombre"
              value={filters.nombre}
              onChange={onFilterChange}
              placeholder="Ej: Martín Cabrera"
            />
            <FilterInput
              label="CI"
              field="ci"
              value={filters.ci}
              onChange={onFilterChange}
              placeholder="Ej: 4.892.331-6"
            />
            <FilterInput
              label="Teléfono"
              field="telefono"
              value={filters.telefono}
              onChange={onFilterChange}
              placeholder="Ej: 099 123 456"
            />
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
            <Button kind="primary">
              <MdSearch /> Buscar oportunidades
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
