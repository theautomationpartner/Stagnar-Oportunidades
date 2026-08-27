// Buscador de Cliente/Lead existente (paso 1) — extraído de CrearOportunidadForm.jsx.
import { useState } from 'react'
import { Button, Dropdown } from '@vibe/core'
import { MdClear, MdSearch } from 'react-icons/md'
import { searchContactos } from '../../services/mondayApi'

// Búsqueda contra el tablero Clientes (18420863014) para precargar los datos personales
// de un registro que ya existe, en vez de tipear todo de nuevo — el modo de búsqueda
// (nombre vs. Cédula) lo decide searchContactos según lo que se tipeó. A pedido: la
// consulta NO se dispara solo, hay que tocar "Buscar" (o Enter) — antes buscaba en cada
// tecla (debounced), pero eso pegaba a la API de más con cada letra tipeada. Un mismo
// ítem puede volver etiquetado "Cliente" (contacto completo) o "Lead" (persona
// encontrada a través de una Oportunidad vieja, datos más livianos) — el campo Situación
// del propio tablero (ver mapContactoItem en mondayApi.js) dice cuál es. Cada opción se
// muestra con su etiqueta + el nombre a la izquierda, y la Cédula resaltada en azul a la
// derecha (optionRenderer). Al elegir una, onChange recibe la opción entera
// (source/id/name/ci + datos personales) — se arma en handleResultadoSeleccionado.
export function ExistingRecordSearch({ value, onChange }) {
  const [inputValue, setInputValue] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Distingue "todavía no buscaste nada" (noOptionsMessage invita a tocar Buscar) de
  // "buscaste y no había resultados" (avisa que no encontró nada) — sin esto los 2 casos
  // mostraban el mismo mensaje.
  const [searched, setSearched] = useState(false)

  const handleBuscar = () => {
    const term = inputValue.trim()
    if (term.length < 2) return
    setLoading(true)
    setMenuOpen(true)
    searchContactos(term)
      .then((resultados) => {
        setOptions(
          resultados.map((c) => ({
            value: `${c.source}:${c.id}`,
            label: c.name,
            ci: c.ci,
            source: c.source,
            id: c.id,
            name: c.name,
            fechaNacimiento: c.fechaNacimiento,
            telefono: c.telefono,
            telefonoCountryShortName: c.telefonoCountryShortName,
            departamentoNombre: c.departamentoNombre,
            localidadNombre: c.localidadNombre,
            direccion: c.direccion,
            nombre: c.nombre,
            apellido: c.apellido,
          }))
        )
        setSearched(true)
      })
      .finally(() => setLoading(false))
  }

  // Si se sigue tipeando después de una búsqueda ya hecha, los resultados quedan
  // desactualizados respecto al texto — se esconden hasta la próxima búsqueda explícita
  // en vez de dejarlos ahí sugiriendo que ya reflejan lo que hay tipeado ahora.
  const handleInputChange = (input) => {
    setInputValue(input ?? '')
    if (searched) {
      setOptions([])
      setSearched(false)
    }
  }

  const selected = value ? { value: `${value.source}:${value.id}`, label: value.name, ci: value.ci, source: value.source } : null

  // Cruz propia (no el "clearable" nativo del Dropdown, ver el comentario grande de
  // más abajo sobre por qué se dejó en false) — a pedido, borra tanto lo tipeado en
  // este campo como el resultado ya elegido, y el onChange(null) de abajo es lo que le
  // avisa al padre que también limpie los datos del form que se habían autocompletado.
  // No hace falta remontar nada acá: al pasar `value` de un resultado elegido a null,
  // el propio Dropdown (downshift por debajo) ya limpia su inputValue interno solo,
  // como parte de su manejo normal de un selectedItem controlado que cambia.
  const handleClear = () => {
    setInputValue('')
    setOptions([])
    setSearched(false)
    setMenuOpen(false)
    onChange(null)
  }

  return (
    <div className="crear-op__search-wrap">
      {/* Enter dispara la misma búsqueda que el botón — no hace falta soltar el teclado
          para ir a buscarlo con el mouse. onKeyDownCapture (no onKeyDown) + stopPropagation:
          el propio Dropdown (downshift por debajo) también escucha Enter y, sin
          highlightedIndex (acá nunca hay uno resaltado — filterOption/highlight propios
          no se usan), lo interpreta como "borrar lo tipeado" — hay que interceptarlo ANTES
          de que le llegue, no después. */}
      <div
        className="crear-op__search-row"
        onKeyDownCapture={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          e.stopPropagation()
          handleBuscar()
        }}
      >
        <div className="crear-op__search-dropdown-wrap">
          <Dropdown
            clearable={false}
            searchable
            // Sin esto, el Dropdown vuelve a filtrar por su cuenta las opciones ya
            // devueltas por la búsqueda del servidor contra el texto tipeado — que
            // matchea desde el principio del `label` (mismo default que documenta
            // RequiredDropdown más arriba). Con una Cédula (el label es el nombre, no el
            // número) eso descartaba TODOS los resultados aunque la búsqueda real sí los
            // hubiera encontrado. `options` acá ya viene filtrado por searchContactos,
            // así que no hace falta (ni conviene) que el Dropdown filtre una segunda vez.
            filterOption={() => true}
            options={options}
            value={selected}
            loading={loading}
            inputValue={inputValue}
            onInputChange={handleInputChange}
            isMenuOpen={menuOpen}
            onMenuOpen={() => setMenuOpen(true)}
            onMenuClose={() => setMenuOpen(false)}
            placeholder="Colocá la cédula de identidad o el nombre y apellido..."
            noOptionsMessage={
              !searched ? 'Escribí y tocá "Buscar" (o Enter)' : 'Sin resultados'
            }
            optionRenderer={(option) => (
              <div className="crear-op__cliente-option">
                <div className="crear-op__cliente-option-row">
                  <span className="crear-op__cliente-option-main">
                    <span className={`crear-op__source-tag crear-op__source-tag--${option.source}`}>
                      {option.source === 'contacto' ? 'Cliente' : 'Lead'}
                    </span>
                    {option.label}
                  </span>
                  {option.ci && <span className="crear-op__cliente-option-ci">{option.ci}</span>}
                </div>
              </div>
            )}
            onChange={(option) => onChange(option ?? null)}
          />
          {(inputValue || selected) && (
            <button
              type="button"
              className="crear-op__search-clear"
              onClick={handleClear}
              aria-label="Borrar búsqueda"
            >
              <MdClear />
            </button>
          )}
        </div>
        <Button
          kind="secondary"
          className="crear-op__search-btn"
          onClick={handleBuscar}
          disabled={inputValue.trim().length < 2 || loading}
        >
          <MdSearch /> Buscar
        </Button>
      </div>
    </div>
  )
}
