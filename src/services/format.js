export function formatMoney(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$ ${Number(value).toLocaleString('es-UY')}`
}
