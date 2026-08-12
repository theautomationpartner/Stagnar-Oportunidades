import { useState, useEffect } from 'react'
import { Dropdown } from '@vibe/core'
import { fetchAutodataModelosByAnioMarca } from '../services/mondayApi'
import { matchesSearchQuery } from '../services/format'

// Modelo (Autodata) filtrado por Año + Marca ya elegidos — a diferencia de una búsqueda
// libre por texto (que trae resultados de CUALQUIER año/marca), acá solo se pide la
// lista real de modelos para esa combinación puntual (ver
// mondayApi.js#fetchAutodataModelosByAnioMarca). Si además ya se sabe Tipo/Combustible
// (leídos automáticamente o elegidos antes), se filtra más fino por esos dos; si ese
// filtro estricto no deja ninguna opción, se cae de nuevo a la lista completa por
// Año+Marca (mejor mostrar de más que dejar el dropdown vacío por un dato que no
// coincide exacto). Compartido entre CrearOportunidadForm.jsx (paso 2, alta de una
// oportunidad nueva) y CotizarStepPanel.jsx (edición del paso "Cotizar").
export default function AutodataModeloPorAnioMarca({
  anio,
  marca,
  tipo,
  combustible,
  value,
  onChange,
  placeholder,
  disabled: forceDisabled = false,
}) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!anio || !marca) {
      setOptions([])
      return undefined
    }
    let cancelled = false
    setLoading(true)
    fetchAutodataModelosByAnioMarca(anio, marca)
      .then((results) => {
        if (cancelled) return
        // Combustible/tipo tienen que viajar colgados de la opción, si no se pierden
        // antes de llegar al autocompletado.
        const mapped = results.map((r) => ({ value: r.id, label: r.name, combustible: r.combustible, tipo: r.tipo }))
        const matchesLeido = (o) =>
          (!tipo || (o.tipo && o.tipo.toLowerCase() === tipo.toLowerCase())) &&
          (!combustible || (o.combustible && o.combustible.toLowerCase() === combustible.toLowerCase()))
        const strict = tipo || combustible ? mapped.filter(matchesLeido) : mapped
        setOptions(strict.length > 0 ? strict : mapped)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [anio, marca, tipo, combustible])

  const selected = value ? { value: value.id, label: value.name } : null
  const disabled = forceDisabled || !anio || !marca

  return (
    <Dropdown
      clearable={false}
      searchable
      filterOption={(option, inputValue) => matchesSearchQuery(option.label, inputValue)}
      options={options}
      value={selected}
      loading={loading || forceDisabled}
      disabled={disabled}
      placeholder={forceDisabled ? 'Buscando el modelo...' : disabled ? 'Elegí primero Año y Marca' : placeholder || 'Selecciona un modelo'}
      noOptionsMessage={loading ? 'Buscando...' : 'Sin modelos para esa combinación'}
      onChange={(option) =>
        onChange(option ? { id: option.value, name: option.label, combustible: option.combustible, tipo: option.tipo } : null)
      }
    />
  )
}
