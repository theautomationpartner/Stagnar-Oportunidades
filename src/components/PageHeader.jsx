import './PageHeader.css'

// A pedido, los botones de navegación (Nueva oportunidad / Inicio) se subieron al
// TopBar (arriba del todo, en el nav) — acá ya solo queda el título/subtítulo.
export default function PageHeader() {
  return (
    <div className="page-header">
      <h1 className="page-header__title">Cotizaciones</h1>
      <p className="page-header__subtitle">
        Seleccioná una oportunidad para ver y comparar posibles cotizaciones.
      </p>
    </div>
  )
}
