// Campos manuales del vehículo (paso 3) — extraído de CrearOportunidadForm.jsx.
import { Required, RequiredDropdown } from './FormPrimitives'
import AutodataModeloPorAnioMarca from '../AutodataModeloPorAnioMarca'

// Año/Marca/Modelo/Combustible/Tipo/Uso a mano — se usa en dos casos: Posee Vehículo =
// "No" (nunca hubo archivo que leer) y Posee Vehículo = "Sí" con lectura en "Error" (el
// robot no pudo terminar; se completa/corrige lo que haga falta a mano en vez de trabar
// el formulario). `onModeloChange` varía según el caso: en "No" siempre pisa Combustible/
// Tipo con lo que sepa el modelo elegido (handleModeloChange); en el fallback de "Sí" se
// prioriza lo que ya se haya leído automáticamente (handleModeloChangeConOcr).
// highlightEmpty (a pedido, estética tipo mockup): cuando la lectura automática de la
// Carta Automóvil falla, en vez de un aviso genérico se resaltan en amarillo justo los
// campos que quedaron vacíos (los que SÍ se leyeron quedan con su estilo normal) — el
// mismo campo puede llegar acá ya completado (Año/Marca/Combustible/Uso) o vacío
// (Modelo/Tipo, por ejemplo), según lo que haya podido extraer el robot.
export function VehiculoManualFields({
  form,
  setForm,
  handleChange,
  anioOptions,
  marcaOptions,
  combustibleOptions,
  tipoOptions,
  usoOptions,
  onModeloChange,
  highlightEmpty = false,
  modeloDisabled = false,
}) {
  const missingClass = (value) => (highlightEmpty && !value ? ' crear-op__field--missing' : '')

  return (
    <div className="crear-op__fields--grid">
      <label className={`crear-op__field${missingClass(form.anio)}`}>
        <span>Año <Required /></span>
        <RequiredDropdown
          options={anioOptions}
          value={anioOptions.find((o) => o.value === form.anio) ?? null}
          placeholder={highlightEmpty && !form.anio ? 'Seleccioná el año faltante...' : 'Escribe para buscar resultados'}
          searchable
          onChange={(option) => {
            // Cambiar Año/Marca invalida el Modelo elegido (se filtra por esos dos) y lo
            // que se haya autocompletado a partir de él.
            setForm((prev) => ({
              ...prev,
              anio: option?.value ?? '',
              modeloSeleccion: null,
              combustible: '',
              tipo: '',
            }))
          }}
        />
      </label>
      <label className={`crear-op__field${missingClass(form.marca)}`}>
        <span>Marca <Required /></span>
        <RequiredDropdown
          options={marcaOptions}
          value={marcaOptions.find((o) => o.value === form.marca) ?? null}
          placeholder={highlightEmpty && !form.marca ? 'Seleccioná la marca faltante...' : 'Escribe para buscar resultados'}
          searchable
          onChange={(option) => {
            setForm((prev) => ({
              ...prev,
              marca: option?.value ?? '',
              modeloSeleccion: null,
              combustible: '',
              tipo: '',
            }))
          }}
        />
      </label>
      <label className={`crear-op__field crear-op__field--full${missingClass(form.modeloSeleccion)}`}>
        <span>Modelo <Required /></span>
        <AutodataModeloPorAnioMarca
          anio={form.anio}
          marca={form.marca}
          tipo={form.tipo}
          combustible={form.combustible}
          value={form.modeloSeleccion}
          onChange={onModeloChange}
          placeholder={highlightEmpty && !form.modeloSeleccion ? 'Seleccioná el modelo faltante...' : undefined}
          disabled={modeloDisabled}
        />
      </label>
      <label className={`crear-op__field crear-op__field--full${missingClass(form.combustible)}`}>
        <span>Combustible <Required /></span>
        <RequiredDropdown
          options={combustibleOptions}
          value={combustibleOptions.find((o) => o.value === form.combustible) ?? null}
          placeholder={highlightEmpty && !form.combustible ? 'Seleccioná el combustible faltante...' : 'Selecciona una opción'}
          onChange={(option) => handleChange('combustible', option?.value ?? '')}
        />
        {form.modeloSeleccion && !form.combustible && (
          <span className="crear-op__autofill-note">
            No fue posible completar este campo automáticamente con el modelo
            seleccionado. Por favor, complételo manualmente.
          </span>
        )}
      </label>
      <label className={`crear-op__field${missingClass(form.tipo)}`}>
        <span>Tipo <Required /></span>
        <RequiredDropdown
          options={tipoOptions}
          value={tipoOptions.find((o) => o.value === form.tipo) ?? null}
          placeholder={highlightEmpty && !form.tipo ? 'Seleccioná el tipo...' : 'Escribe para buscar resultados'}
          searchable
          onChange={(option) => handleChange('tipo', option?.value ?? '')}
        />
        {form.modeloSeleccion && !form.tipo && (
          <span className="crear-op__autofill-note">
            No fue posible completar este campo automáticamente con el modelo
            seleccionado. Por favor, complételo manualmente.
          </span>
        )}
      </label>
      <label className={`crear-op__field${missingClass(form.uso)}`}>
        <span>Uso <Required /></span>
        <RequiredDropdown
          options={usoOptions}
          value={usoOptions.find((o) => o.value === form.uso) ?? null}
          placeholder={highlightEmpty && !form.uso ? 'Seleccioná el uso faltante...' : 'Escribe para buscar resultados'}
          searchable
          onChange={(option) => handleChange('uso', option?.value ?? '')}
        />
      </label>
    </div>
  )
}
