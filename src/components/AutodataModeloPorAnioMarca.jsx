import { useState, useEffect } from 'react'
import { Dropdown } from '@vibe/core'
import { fetchAutodataModelosByAnioMarca } from '../services/mondayApi'
import { matchesSearchQuery, modeloSinMarca } from '../services/format'
import { filtroParaModeloLeido } from '../services/modeloLeido'

// Modelo (Autodata) filtrado por Año + Marca ya elegidos — a diferencia de una búsqueda
// libre por texto (que trae resultados de CUALQUIER año/marca), acá solo se pide la
// lista real de modelos para esa combinación puntual (ver
// mondayApi.js#fetchAutodataModelosByAnioMarca). Si además ya se sabe Tipo/Combustible
// (leídos automáticamente o elegidos antes), se filtra más fino por esos dos; si ese
// filtro estricto no deja ninguna opción, se cae de nuevo a la lista completa por
// Año+Marca (mejor mostrar de más que dejar el dropdown vacío por un dato que no
// coincide exacto). Compartido entre CrearOportunidadForm.jsx (paso 2, alta de una
// oportunidad nueva) y CotizarStepPanel.jsx (edición del paso "Cotizar").
// Valor ficticio para pintar el modelo YA guardado cuando en esta edición todavía no se
// eligió ninguno: no puede colisionar con un id real de Autodata (todos numéricos).
const MODELO_ACTUAL = '__modelo-actual__'

export default function AutodataModeloPorAnioMarca({
  anio,
  marca,
  tipo,
  combustible,
  value,
  onChange,
  placeholder,
  disabled: forceDisabled = false,
  // Modelo que la oportunidad YA tiene guardado (texto). Solo para mostrarlo mientras no
  // se elija otro — ver `selected` más abajo.
  currentName,
  // Modelo tal como lo leyó la IA de la Carta del vehículo: deja el buscador ya filtrado
  // (ver modeloLeido.js#filtroParaModeloLeido). No elige nada solo.
  modeloLeido = '',
}) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  // Texto con el que se filtra la lista a partir del modelo leído de la Carta (vacío = sin
  // filtro). Apenas se escribe algo en el buscador se deja de aplicar: la búsqueda vuelve a
  // ser sobre todos los modelos, como siempre.
  const [prefiltro, setPrefiltro] = useState('')

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
        const lista = strict.length > 0 ? strict : mapped
        setOptions(lista)
        setPrefiltro(modeloLeido && !value ? filtroParaModeloLeido(modeloLeido, lista, marca) : '')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // value queda afuera a propósito: el filtro se calcula al llegar las opciones, no
    // cada vez que se elige un modelo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, marca, tipo, combustible, modeloLeido])

  // Bug reportado: al abrir "Editar vehículo" de una oportunidad que YA tenía modelo, el
  // campo aparecía vacío ("Selecciona un modelo"), como si se hubiera perdido.
  // `value` es la elección de ESTA edición y arranca en null a propósito: null significa
  // "no se tocó, se conserva el modelo que ya está guardado" (ver buildInitialForm en
  // CotizarStepPanel.jsx, y el guardado en OpportunityDetail.jsx, que solo reescribe la
  // conexión de Autodata si de verdad se eligió uno nuevo). Lo que faltaba era MOSTRARLO.
  // Se pinta como valor seleccionado sin tocar `value`, así el campo dice la verdad y la
  // edición sigue sin quedar marcada como "modelo cambiado".
  const selected = value
    ? { value: value.id, label: value.name }
    : currentName
      ? { value: MODELO_ACTUAL, label: currentName }
      : null
  const disabled = forceDisabled || !anio || !marca

  const elegir = (option) =>
    onChange(option ? { id: option.value, name: option.label, combustible: option.combustible, tipo: option.tipo } : null)

  // Reunión del 24/09 (completar el alta sin mouse): Enter con algo tipeado elige la
  // primera opción que coincide, igual que RequiredDropdown. El Dropdown filtra pero no
  // resalta ninguna, así que Enter no hacía nada aunque quedara un solo modelo.
  const handleKeyDown = (e) => {
    const texto = query.trim() || prefiltro
    if (e.key !== 'Enter' || !texto) return
    const match = options.find((o) => matchesSearchQuery(o.label, texto))
    if (match) {
      e.preventDefault()
      setQuery('')
      elegir(match)
    }
  }

  return (
    <div onKeyDown={handleKeyDown}>
    <Dropdown
      clearable={false}
      searchable
      filterOption={(option, inputValue) => matchesSearchQuery(option.label, inputValue)}
      onInputChange={(input) => {
        setQuery(input ?? '')
        if ((input ?? '').trim()) setPrefiltro('')
      }}
      options={prefiltro ? options.filter((o) => matchesSearchQuery(o.label, prefiltro)) : options}
      // Solo presentación: la marca ya está elegida arriba, en la lista y en el valor se
      // muestra el modelo sin ella ("206 1.6 Presence Full…"). El label/valor real que se
      // guarda sigue siendo el nombre completo de Autodata.
      optionRenderer={(option) => <span>{modeloSinMarca(marca, option.label)}</span>}
      valueRenderer={(option) => <span>{modeloSinMarca(marca, option.label)}</span>}
      value={selected}
      loading={loading || forceDisabled}
      disabled={disabled}
      placeholder={
        forceDisabled
          ? 'Buscando el modelo...'
          : disabled
            ? 'Elegí primero Año y Marca'
            : prefiltro
              ? `Leído de la carta: «${prefiltro}» — escribí para buscar otro`
              : placeholder || 'Selecciona un modelo'
      }
      noOptionsMessage={loading ? 'Buscando...' : 'Sin modelos para esa combinación'}
      onChange={(option) => {
        setQuery('')
        elegir(option)
      }}
    />
    </div>
  )
}
