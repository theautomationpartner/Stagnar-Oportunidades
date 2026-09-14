import { accentForCompania } from '../services/companyColors'
import sancor from '../assets/aseguradoras/oficial/sancor.png'
import bse from '../assets/aseguradoras/oficial/bse.png'
import sura from '../assets/aseguradoras/oficial/sura.png'
import porto from '../assets/aseguradoras/oficial/porto.png'
import './CompanyMark.css'

// Identidad visual de cada compañía (a pedido): el logotipo oficial sobre fondo blanco
// —nunca invertido— junto a un recuadro con el color exacto de su marca. Sin el nombre
// escrito al lado: se probó y quedaba repetido, todos los logos son wordmarks que ya
// dicen el nombre — el logo alcanza. Logos y tonos salen del PDF oficial
// (logo_aseguradoras/logos.pdf, recortados a src/assets/aseguradoras/oficial/); los
// tonos muestreados viven en ACCENT_BY_COMPANIA.
//
// Los cuadros de BSE y PORTO son casi el mismo cyan (así son las marcas): ahí el que
// distingue es el logo.
const LOGO_BY_COMPANIA = { SANCOR: sancor, BSE: bse, SURA: sura, PORTO: porto }

export default function CompanyMark({ compania, className }) {
  const logo = LOGO_BY_COMPANIA[compania]
  if (!logo) {
    // Compañía nueva sin logo cargado todavía: el nombre pelado, mejor que un hueco.
    return <span className={className}>{compania}</span>
  }
  const clases = ['company-mark', 'company-mark--' + compania.toLowerCase(), className]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={clases} title={compania}>
      <span className="company-mark__cuadro" style={{ background: accentForCompania(compania) }} />
      {/* El alt lleva el nombre: para un lector de pantalla el logo ES el texto "SANCOR",
          igual que antes lo era el globito con el nombre escrito. */}
      <img className="company-mark__logo" src={logo} alt={compania} />
    </span>
  )
}
