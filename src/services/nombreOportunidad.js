// Cómo se llama un ítem del tablero de Oportunidades.
//
// Está acá, en un módulo propio, porque el nombre se arma en tres momentos distintos y
// tienen que coincidir: al crear la oportunidad (CrearOportunidadForm), al editar sus
// datos desde el detalle (OpportunityDetail) y al renombrar las viejas
// (scripts/opp-nombres.mjs). Cuando el nombre se armaba suelto en el formulario, el del
// alta y el de la edición se fueron separando: quedaron ítems como
// "MARISA VILLAR CAMPOS-PIAGGIO-2001-Porter Furgón" cuyo vehículo real, en las columnas,
// ya era un NISSAN Qashqai 2024. El nombre no se actualizaba nunca después del alta.
//
// Formato acordado: "Cliente · MARCA Modelo (Año) · Matrícula".
//   Gloria Mollo · FIAT Uno Evo Attractive 1.4 Full (2018)
//   ALEJANDRO DANIEL CARRO HERNANDEZ · CHEVROLET New Onix 1.2 LS Full (2022) · SCU4818
// El separador es "·" y no "-" a propósito: los modelos traen guiones adentro
// ("CR-V", "S-Line"), así que con guiones no se distingue dónde termina cada dato.
// La extensión va explícita (el resto del código importa sin ella) para que
// scripts/opp-nombres.mjs pueda importar este módulo con node a secas, sin empaquetar:
// es lo que garantiza que el renombrado masivo y la app usen el MISMO formato.
import { modeloSinMarca } from './format.js'

// Tope de monday para el nombre de un ítem. No se recorta a ojo: se corta en el último
// espacio para no dejar una palabra partida al medio.
const MAX = 255

// La ficha de Autodata es larguísima ("New Onix 1.2 LS Full, 6Abag, ABS, CES, CTR,
// espejos 5p."). Lo que identifica al auto está antes de la primera coma; lo de después
// es equipamiento, que no hace falta para reconocerlo de un vistazo. El sufijo de país
// ("(ARG)", "(IND)") también se saca: el año va al final y dos paréntesis seguidos se
// leen mal.
function modeloCorto(marca, modelo) {
  return modeloSinMarca(marca, modelo)
    .split(',')[0]
    .replace(/\s*\([A-Z]{2,3}\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function recortar(texto) {
  if (texto.length <= MAX) return texto
  const cortado = texto.slice(0, MAX)
  const corte = cortado.lastIndexOf(' ')
  return (corte > MAX * 0.6 ? cortado.slice(0, corte) : cortado).trim()
}

// datos: { nombre, apellido, marca, modelo, anio, matricula, tipoRiesgo }
// Todos opcionales — una oportunidad recién creada puede no tener vehículo todavía, y en
// ese caso el nombre dice el tipo de riesgo ("Matías Stagnari · 🚗 Automóvil") en vez de
// arrastrar separadores vacíos como hacía el formato viejo ("Matías Stagnari--OMODA-").
export function nombreDeOportunidad(datos = {}) {
  const cliente = [datos.nombre, datos.apellido].map((s) => (s ?? '').trim()).filter(Boolean).join(' ')

  const marca = (datos.marca ?? '').trim()
  const vehiculo = [marca, modeloCorto(marca, datos.modelo)].filter(Boolean).join(' ')
  const anio = (datos.anio ?? '').toString().trim()
  const bien = [vehiculo, anio && `(${anio})`].filter(Boolean).join(' ')

  const partes = [cliente, bien || (datos.tipoRiesgo ?? '').trim(), (datos.matricula ?? '').trim()]
  const nombre = partes.filter(Boolean).join(' · ')

  // Un ítem sin nombre es peor que uno genérico: en monday no se puede clickear bien y no
  // se distingue de los demás en ninguna vista.
  return recortar(nombre) || 'Oportunidad sin datos'
}
