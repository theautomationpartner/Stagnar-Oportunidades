// Bonificación de PORTO (30%) según el CI del cliente. Cuando la cotización pasa a
// "Cotizando", la app llama al escenario de Make "[TAP] Se cotiza una oportunidad -> se
// valida si tiene bonificacion en PORTO" (ver OpportunityDetail#pedirBonificacionPorto),
// que consulta el portal y escribe el resultado por zona. La app solo lo muestra en las
// tarjetas de PORTO: no toca el precio (a pedido).

export const CONSULTA_BONIF_PORTO_COLUMN_ID = 'color_mm7wqkj9'
export const RESPUESTA_BONIF_PORTO_COLUMN_ID = 'color_mm7whw7r'
export const ZONAS_BONIF_PORTO = [
  { key: 'montevideo', label: 'Montevideo / Canelones Sur', columnId: 'color_mm7w9q1a' },
  { key: 'resto', label: 'Resto del país', columnId: 'color_mm7wftck' },
]

// Estado de una zona para la tarjeta: 'aprobado' (verde), 'noAprobado' (rojo),
// 'consultando' o 'sinRespuesta' (gris), o null si nunca se consultó.
// Las etiquetas se comparan sin importar mayúsculas ni la letra B/V: la columna de
// Montevideo dice "APROBADO" y el escenario escribe "APROVADO" (y la de Resto del país,
// "APROVADO").
export function estadoZona(valorZona, consulta) {
  const c = String(consulta ?? '').trim().toLowerCase()
  // Primero la consulta en curso: al recotizar, la zona todavía tiene el resultado de la
  // vez anterior hasta que el escenario escriba el nuevo.
  if (c === 'consultar' || c === 'consultando') return 'consultando'
  const v = String(valorZona ?? '').trim().toUpperCase().replace(/V/g, 'B')
  if (v === 'APROBADO') return 'aprobado'
  if (v === 'NO APROBADO') return 'noAprobado'
  if (v || c === 'error' || c === 'consultado') return 'sinRespuesta'
  return null
}

// Las dos zonas listas para mostrar, a partir de la oportunidad mapeada (ver
// opportunityMapper.js#bonificacionPorto). null si nunca se consultó.
export function zonasBonificacionPorto(bonif) {
  if (!bonif) return null
  const zonas = ZONAS_BONIF_PORTO.map((z) => ({ ...z, estado: estadoZona(bonif[z.key], bonif.consulta) }))
  return zonas.some((z) => z.estado) ? zonas : null
}
