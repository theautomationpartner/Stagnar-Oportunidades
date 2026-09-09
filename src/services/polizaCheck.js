// LOG-21: red de seguridad al cargar la póliza. El escenario de Make lee el PDF emitido
// por la compañía y deja lo que encontró en columnas propias de la Oportunidad; acá se
// contrasta contra lo que la oportunidad ya sabía, para avisar (sin bloquear) si se
// emitió sobre un vehículo distinto del que se cotizó.
//
// Los dos lados:
//  - Lo COTIZADO: matrícula/chasis/motor que la lectura de la Carta Automóvil dejó en la
//    Oportunidad al crearla (más marca y año, que ya estaban).
//  - Lo EMITIDO: el ítem de 🚘 Vehículos que crea el escenario de póliza con lo leído del
//    PDF, vinculado en "Bien Asegurado" (ver vehiculoAsegurado en opportunityMapper.js).
// Agregar un campo nuevo es agregar una entrada a CAMPOS_POLIZA; no hay un if por dato.
import { normalizarParaMatch } from './format'

// `enOportunidad` / `enPoliza` leen cada lado del mismo dato. `numerico` es para los
// campos que son un número escrito como texto: el año puede llegar "2006", " 2006" o
// "2006.0" según cómo lo haya leído la IA, y los tres son el mismo año. (Matrícula,
// chasis y motor NO son numéricos aunque parezcan: son códigos, y ahí un cero adelante
// o una letra cambian el dato.)
export const CAMPOS_POLIZA = [
  // Los 3 que de verdad salen del PDF: son los que pueden delatar que se emitió sobre
  // otro auto. Se comparan como TEXTO aunque parezcan números — son códigos, y un cero
  // adelante o una letra de más cambian el dato.
  { key: 'matricula', label: 'Matrícula', enOportunidad: (o) => o?.matricula, enPoliza: (p) => p?.matricula },
  { key: 'chasis', label: 'Chasis', enOportunidad: (o) => o?.chasis, enPoliza: (p) => p?.chasis },
  { key: 'motor', label: 'Motor', enOportunidad: (o) => o?.motor, enPoliza: (p) => p?.motor },
  // Marca y Año hoy no van a saltar nunca: el escenario los copia de la propia
  // oportunidad al crear el Vehículo, así que se comparan contra sí mismos. Se dejan
  // igual porque cuestan 2 ids en una consulta que ya se hace, y cubren el día que el
  // escenario los lea del PDF o que alguien edite el Vehículo a mano.
  { key: 'marca', label: 'Marca', enOportunidad: (o) => o?.marca, enPoliza: (p) => p?.marca },
  { key: 'anio', label: 'Año', enOportunidad: (o) => o?.anio, enPoliza: (p) => p?.anio, numerico: true },
]

function comparable(valor, campo) {
  const texto = String(valor ?? '').trim()
  if (!texto) return ''
  if (campo.numerico) {
    // Se compara el NÚMERO, no el texto: así "2006", " 2006 " y "2006.0" (la IA a veces
    // devuelve el año con decimal) son el mismo año. Si no es un número, se cae a la
    // comparación de texto en vez de descartar el dato.
    const n = Number(texto.replace(',', '.'))
    if (Number.isFinite(n)) return String(n)
  }
  return normalizarParaMatch(texto)
}

// Devuelve las diferencias entre la póliza y la oportunidad: [{ key, label, oportunidad,
// poliza }] con los valores TAL CUAL están cargados (sin normalizar), que es lo que hay
// que mostrarle a la persona para que decida.
//
// Un campo solo se compara cuando los DOS lados tienen valor: si el escenario no pudo
// leer la marca del PDF, eso no es una discrepancia — es un dato que falta, y acusarlo
// como "no coincide" convertiría el aviso en ruido que se aprende a ignorar.
export function compararPoliza(opportunity, poliza) {
  if (!opportunity || !poliza) return []
  const diferencias = []
  for (const campo of CAMPOS_POLIZA) {
    const enOp = campo.enOportunidad(opportunity)
    const enPol = campo.enPoliza(poliza)
    const a = comparable(enOp, campo)
    const b = comparable(enPol, campo)
    if (!a || !b) continue
    if (a === b) continue
    diferencias.push({
      key: campo.key,
      label: campo.label,
      oportunidad: String(enOp).trim(),
      poliza: String(enPol).trim(),
    })
  }
  return diferencias
}

// Los campos que el escenario todavía no pudo leer del PDF — se muestran aparte del
// aviso de discrepancia: "no lo pude leer" y "no coincide" son cosas distintas y ameritan
// reacciones distintas (revisar el PDF vs. revisar la emisión).
export function camposPolizaSinLeer(poliza) {
  if (!poliza) return []
  return CAMPOS_POLIZA.filter((campo) => !String(campo.enPoliza(poliza) ?? '').trim()).map((campo) => campo.label)
}
