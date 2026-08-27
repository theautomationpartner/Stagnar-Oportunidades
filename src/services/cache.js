// Caché en memoria para consultas de solo lectura que se repetían idénticas
// (auditoría): catálogos de Autodata (mismo Año+Marca consultado en cada apertura del
// popup "Editar vehículo" y otra vez al validar antes de cotizar) y la lista de
// archivos de un Cliente (re-pedida en cada cambio de paso porque ClientFicha se
// desmonta/monta). No es persistente: vive lo que vive la pestaña, y cualquier
// escritura sobre lo cacheado tiene que llamar a `invalidate` (ver mondayApi.js).
const store = new Map()

export function memoAsync(key, fn, ttlMs = 5 * 60 * 1000) {
  const hit = store.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.promise
  const promise = fn().catch((err) => {
    // No cachear errores: el próximo llamado vuelve a intentar.
    store.delete(key)
    throw err
  })
  store.set(key, { promise, expiresAt: Date.now() + ttlMs })
  return promise
}

export function invalidate(prefix) {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}
