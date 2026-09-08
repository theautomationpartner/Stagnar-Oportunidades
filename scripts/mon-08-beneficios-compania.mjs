// MON-08: carga en PANEL los beneficios diferenciales de cada aseguradora. Van en una
// fila por compañía CON la compañía cargada y SIN cobertura — así valen para todas sus
// coberturas y no hay que repetir el mismo texto en cada una (ver
// recargoPanel.js#buildIncluyeLookup). Las viñetas se separan con "●", igual que el resto
// de los textos INCLUYE del tablero.
// Idempotente: si la fila ya existe, la actualiza en vez de duplicarla.
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const APLICAR = process.argv.includes('--apply')
const PANEL_BOARD = '18421072511'
const PANEL_GRUPO = 'group_mm526v30'

async function gql(query, variables) {
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: env.MONDAY_API_KEY },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400))
  return j.data
}

const BENEFICIOS = {
  BSE: [
    'REPOSICIÓN 0KM BAJO CONDICIONES: GLOBAL (HASTA 5 AÑOS) Y TRIPLE (HASTA 2 AÑOS)',
    'PEQUEÑOS DAÑOS: HASTA U$S 200 POR AÑO EN CRISTALES, CERRAJERÍA Y ESPEJOS EXTERIORES',
    'AUTO + CASA / AUTO + VIDA: COBERTURA ADICIONAL DE VIVIENDA O VIDA',
    'DESCUENTOS EN STRIX: GPS, RASTREO Y LOCALIZACIÓN',
    'DESCUENTOS EN CAR UP: EMERGENCIA MECÁNICA GRATUITA Y DESCUENTOS',
  ],
  SANCOR: [
    'AUXILIO MECÁNICO HASTA VEHÍCULOS DE 24 AÑOS',
    'ASISTENCIA JURÍDICA INTEGRAL',
    'GESTORÍA HASTA U$S 100',
    'COCHE DE CORTESÍA (A CONTRATAR)',
    'GRANIZO SIN DEDUCIBLE EN CIERTAS COBERTURAS',
    'OTROS BENEFICIOS VÍA AUXICAR',
  ],
  PORTO: [
    'RESPONSABILIDAD REGISTRADA (CON CÁMARA): 20% DE DESCUENTO EN EL DEDUCIBLE SI SOS RESPONSABLE, 100% DE EXONERACIÓN SI NO LO SOS, Y 25% ADICIONAL REPARANDO EN TALLERES ACREDITADOS',
    'CERRAJERÍA DE URGENCIA EN MONTEVIDEO Y CIUDAD DE LA COSTA HASTA EL PEAJE DE PANDO',
    'SERVICIOS TÉCNICOS AUTORIZADOS: MECÁNICA, ELECTRICIDAD Y GOMERÍA',
    'ALQUILER: 15% DE DESCUENTO EN EUROPCAR',
    'STRIX: 50% DE DESCUENTO EN LA INSTALACIÓN Y 30% EN EL ABONO MENSUAL',
    'INSPECCIÓN: 35% DE DESCUENTO EN LA ITV OBLIGATORIA',
    'TALLERES ACREDITADOS: 15% DE DESCUENTO EN EL DEDUCIBLE EN MONTEVIDEO Y 25% EN EL INTERIOR, GARANTÍA DE REPARACIÓN, DEDUCIBLE FINANCIADO HASTA EN 6 CUOTAS SIN RECARGO Y 20% DE DESCUENTO EN ALQUILER DURANTE LA REPARACIÓN',
  ],
  SURA: [
    'AUTO DE CORTESÍA HASTA 15 DÍAS (TOTAL PLUS)',
    'SURA TE LLEVA: CHOFER A DOMICILIO (12 SERVICIOS EN TOTAL PLUS) EN MONTEVIDEO, CIUDAD DE LA COSTA Y PUNTA DEL ESTE; REMISE EN COLONIA, SALTO, PAYSANDÚ, ROCHA Y TACUAREMBÓ',
    'AUXILIO PARA ELÉCTRICOS: TRASLADO AL PUNTO DE CARGA MÁS CERCANO (SOLO EN TERRITORIO NACIONAL)',
    'TRASLADO Y ALOJAMIENTO: REEMBOLSO CON TOPE DE $ 5.000 EN COBERTURAS TOTALES',
    'BICICLETAS (VERANO): TRASLADO ENTRE MONTEVIDEO Y PUNTA DEL ESTE',
  ],
}

const panel = await gql(
  `{boards(ids:[${PANEL_BOARD}]){items_page(limit:100){items{id name column_values(ids:["color_mm5fdknw","dropdown_mm52feqr","dropdown_mm5frxag","text_mm5f1wnh"]){id text}}}}}`
)
const filas = panel.boards[0].items_page.items.map((i) => ({
  id: i.id,
  name: i.name,
  ...Object.fromEntries(i.column_values.map((c) => [c.id, c.text])),
}))

for (const [compania, viñetas] of Object.entries(BENEFICIOS)) {
  const texto = viñetas.join(' ● ')
  const nombre = `${compania} - Beneficios`
  // La fila de beneficios de la compañía es la del grupo Incluye con compañía y SIN cobertura
  const existente = filas.find(
    (f) => f.color_mm5fdknw === 'Incluye' && f.dropdown_mm52feqr === compania && !f.dropdown_mm5frxag
  )
  const valores = {
    color_mm5fdknw: { label: 'Incluye' },
    dropdown_mm52feqr: { labels: [compania] },
    text_mm5f1wnh: texto,
  }

  if (existente) {
    if (existente.text_mm5f1wnh === texto) {
      console.log(`= sin cambios: ${nombre}`)
      continue
    }
    if (!APLICAR) {
      console.log(`~ actualizaría ${nombre} (${viñetas.length} viñetas)`)
      continue
    }
    await gql(
      `mutation($b:ID!,$i:ID!,$v:JSON!){change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v){id}}`,
      { b: PANEL_BOARD, i: existente.id, v: JSON.stringify(valores) }
    )
    console.log(`~ actualizada ${nombre} (${viñetas.length} viñetas)`)
  } else {
    if (!APLICAR) {
      console.log(`+ crearía ${nombre} (${viñetas.length} viñetas)`)
      continue
    }
    const d = await gql(
      `mutation($b:ID!,$g:String!,$n:String!,$v:JSON!){create_item(board_id:$b,group_id:$g,item_name:$n,column_values:$v){id}}`,
      { b: PANEL_BOARD, g: PANEL_GRUPO, n: nombre, v: JSON.stringify(valores) }
    )
    console.log(`+ creada ${nombre} (${viñetas.length} viñetas, id ${d.create_item.id})`)
  }
}

if (!APLICAR) console.log('\n(simulación — corré con --apply para escribir)')
