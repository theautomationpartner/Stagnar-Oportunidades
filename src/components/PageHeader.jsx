import './PageHeader.css'

// Encabezado de la tabla: solo título y bajada. A pedido, sin botones — crear una
// oportunidad y volver al inicio viven en el dropdown de la AccionBar de arriba.
export default function PageHeader() {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header__title">Oportunidades</h1>
        <p className="page-header__subtitle">
          Seleccioná una oportunidad para consultar sus detalles y gestionar las cotizaciones asociadas.
        </p>
      </div>
    </div>
  )
}
