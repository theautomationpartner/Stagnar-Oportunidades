// Qué RC se puede elegir en cada compañía, y cuál viene marcado de fábrica.
//
// Antes era UNA sola lista compartida por las cuatro (las etiquetas del dropdown del
// subítem: "Máximo", "U$S 1.000.000", "U$S 1.500.000"), que no se parece a cómo vende
// ninguna: BSE habla de niveles 40/30/20/10, PORTO de Nivel 1 a 4 y SANCOR de dos
// importes. Elegir el RC no cambia el precio — es el nivel de cobertura que se le muestra
// al cliente (ver quote.rc).
//
// SURA queda deliberadamente afuera: su RC es fijo por plan (Total / Total Plus) y los
// valores todavía no están confirmados, así que sigue con la lista del tablero hasta que
// lo estén.
export const RC_POR_COMPANIA = {
  BSE: {
    porDefecto: '40',
    opciones: ['40', '30', '20', '10'],
  },
  PORTO: {
    porDefecto: 'Nivel 4',
    opciones: ['Nivel 4', 'Nivel 3', 'Nivel 2', 'Nivel 1'],
    // Límite combinado de cada nivel, tal como los publica PORTO.
    importes: {
      'Nivel 4': 'USD 800.000',
      'Nivel 3': 'USD 600.000',
      'Nivel 2': 'USD 400.000',
      'Nivel 1': 'USD 200.000',
    },
  },
  SANCOR: {
    porDefecto: 'US$ 1.000.000',
    opciones: ['US$ 1.000.000', 'US$ 500.000'],
  },
}

// Las opciones que ve el vendedor. Si la compañía no tiene lista propia (SURA, o una
// nueva), se cae a las etiquetas del tablero, que es el comportamiento de siempre.
export function opcionesRc(compania, opcionesDelTablero = []) {
  return RC_POR_COMPANIA[compania]?.opciones ?? opcionesDelTablero
}

// El RC con el que arranca una cotización. El dato del portal puede venir vacío o con una
// etiqueta vieja que no es de esta compañía ("Máximo" en una de BSE): en los dos casos
// vale más el valor acordado por compañía que arrastrar algo que no se puede elegir.
export function rcPorDefecto({ compania, rc } = {}) {
  const config = RC_POR_COMPANIA[compania]
  if (!config) return rc
  return config.opciones.includes(rc) ? rc : config.porDefecto
}
