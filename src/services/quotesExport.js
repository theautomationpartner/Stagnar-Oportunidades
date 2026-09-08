// LOG-19: baja a planilla el detalle de todas las cotizaciones de una oportunidad, para
// cotejarlas a mano contra los portales. Una fila por opción con los parámetros
// EFECTIVOS (los que se usaron para calcular, ya pisados por los ajustes de
// "Parámetros" — ver quote.efectivo en pricingEngine.js), no solo lo que se ve en la
// tarjeta.
//
// Es un CSV con BOM y separador ";" — Excel en Windows en español lo abre con las
// columnas ya separadas, sin asistente de importación y sin sumar una dependencia de
// varios cientos de KB al bundle solo para esto.
import { CUOTA_COUNTS, modeloSinMarca } from './format'

const SEP = ';'

// Excel decide el tipo por el contenido: los números van sin separador de miles y con
// coma decimal (locale es-UY), y cualquier texto que traiga ";" o comillas se escapa.
function celda(valor) {
  if (valor == null || valor === '') return ''
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return ''
    return String(valor).replace('.', ',')
  }
  const texto = String(valor)
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

const numero = (valor) => {
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

// Porcentajes: en monday la Bonificación se carga como entero (15 = 15%) y los recargos
// como fracción (0.05 = 5%). Se exportan los dos como número entero de porcentaje para
// que la planilla se lea de una.
const porcentajeDeFraccion = (valor) => {
  const n = Number(valor)
  return Number.isFinite(n) ? Math.round(n * 10000) / 100 : null
}

const COLUMNAS = [
  { titulo: 'Oportunidad', valor: (_e, opp) => opp.oppNumber },
  { titulo: 'Cliente', valor: (_e, opp) => opp.clienteNombre },
  // El modelo de Autodata ya trae la marca adelante — mismo criterio que el resto de la
  // app (ver modeloSinMarca), si no queda "FIAT FIAT - Uno Evo...".
  {
    titulo: 'Vehículo',
    valor: (_e, opp) =>
      [opp.marca, modeloSinMarca(opp.marca, opp.modelo || opp.bienLinea1)].filter(Boolean).join(' '),
  },
  { titulo: 'Año', valor: (e, opp) => numero(e.quote.efectivo?.anioVehiculo || opp.anio) },
  { titulo: 'Uso', valor: (e, opp) => e.quote.efectivo?.uso || opp.uso },
  { titulo: 'Departamento', valor: (_e, opp) => opp.departamento },
  { titulo: 'Zona de circulación', valor: (_e, opp) => opp.zonaCirculacion },
  { titulo: 'Compañía', valor: (e) => e.raw.compania },
  { titulo: 'Cobertura', valor: (e) => e.raw.cobertura || e.raw.name },
  { titulo: 'Contado (monday)', valor: (e) => numero(e.raw.contado) },
  { titulo: 'Contado calculado', valor: (e) => numero(e.quote.efectivo?.contadoCalculado) },
  { titulo: 'Bonificación %', valor: (e) => numero(e.quote.efectivo?.bonif) },
  // Puede no coincidir con la de arriba: SANCOR no bonifica fuera del rango de edad.
  { titulo: 'Bonificación aplicada %', valor: (e) => porcentajeDeFraccion(e.quote.efectivo?.bonifAplicada) },
  { titulo: 'Adicionales', valor: (e) => numero(e.quote.efectivo?.adicionales) },
  { titulo: 'RC', valor: (e) => e.quote.rc },
  { titulo: 'Deducible', valor: (e) => e.quote.deducibleDisplay },
  { titulo: 'Deducible base', valor: (e) => numero(e.quote.efectivo?.deducibleBase) },
  { titulo: 'Deducible BSE', valor: (e) => e.quote.efectivo?.deducibleBSE },
  { titulo: 'Edad BSE', valor: (e) => e.quote.efectivo?.edadBSE },
  { titulo: 'Deducible SURA', valor: (e) => e.quote.efectivo?.deducibleSURA },
  { titulo: 'Deducible SANCOR (USD)', valor: (e) => numero(e.quote.efectivo?.deducibleSancorUsd) },
  { titulo: 'Edad titular', valor: (e) => numero(e.quote.efectivo?.edad) },
  { titulo: 'COSTO TOTAL', valor: (e) => numero(e.quote.total) },
  ...CUOTA_COUNTS.flatMap((n) => [
    { titulo: `Recargo ${n} cuotas %`, valor: (e) => porcentajeDeFraccion(e.quote.efectivo?.[`recargo${n}`]) },
    { titulo: `Valor ${n} cuotas`, valor: (e) => numero(e.quote.cuotas?.[n]?.valor) },
    { titulo: `Total ${n} cuotas`, valor: (e) => numero(e.quote.cuotas?.[n]?.total) },
  ]),
  { titulo: 'Cuotas sin recargo', valor: (e) => numero(e.quote.promo?.count) },
  { titulo: 'Valor cuota sin recargo', valor: (e) => numero(e.quote.promo?.valor) },
  { titulo: 'Condición sin recargo', valor: (e) => e.quote.promo?.condicion },
  // Los opcionales van en 2 columnas y no en una por cada uno: cada compañía tiene los
  // suyos y una columna por opcional dejaría la planilla llena de celdas vacías.
  {
    titulo: 'Adicionales contratados',
    valor: (e) => (e.quote.opcionales ?? []).filter((o) => o.contratado).map((o) => o.label).join(' | '),
  },
  {
    titulo: 'Adicionales disponibles',
    valor: (e) =>
      (e.quote.opcionales ?? [])
        .filter((o) => !o.contratado)
        .map((o) => `${o.label}${o.precio ? ` (${o.desde ? 'desde ' : ''}${o.precio})` : ''}`)
        .join(' | '),
  },
  { titulo: 'Enviada por WhatsApp', valor: (e) => (e.raw.incluirPropuesta ? 'Sí' : 'No') },
  { titulo: 'Elegida', valor: (e) => (e.raw.propuestaElegida ? 'Sí' : 'No') },
  { titulo: 'Advertencia', valor: (e) => e.quote.warning?.full },
]

export function buildQuotesCsv(opportunity, entries) {
  const filas = [COLUMNAS.map((c) => celda(c.titulo)).join(SEP)]
  for (const entry of entries) {
    // Sin fórmula de precio no hay nada que cotejar salvo de qué cotización se trata: se
    // exporta igual, con el motivo, para que no parezca que la opción no existió.
    if (entry.quote.blocked) {
      const fila = COLUMNAS.map((c) => {
        if (c.titulo === 'Compañía') return celda(entry.raw.compania)
        if (c.titulo === 'Cobertura') return celda(entry.raw.cobertura || entry.raw.name)
        if (c.titulo === 'Advertencia') return celda(entry.quote.blockedReason)
        return ''
      })
      filas.push(fila.join(SEP))
      continue
    }
    filas.push(COLUMNAS.map((c) => celda(c.valor(entry, opportunity))).join(SEP))
  }
  // \r\n: es lo que espera Excel; con \n solo, algunas versiones meten todo en una fila.
  return `﻿${filas.join('\r\n')}\r\n`
}

export function nombreArchivoCotizaciones(opportunity) {
  const fecha = new Date().toISOString().slice(0, 10)
  const cliente = (opportunity.clienteNombre || '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  return `cotizaciones-${opportunity.oppNumber}${cliente ? `-${cliente}` : ''}-${fecha}.csv`
}

export function descargarCsv(nombre, contenido) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Se libera en el próximo tick: revocar en la misma vuelta corta la descarga en
  // algunos navegadores antes de que llegue a empezar.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
