// Distinguir una lectura de una escritura en el proxy de GraphQL.
//
// Hace falta porque /api/monday es un endpoint único por donde pasa TODO: las queries que
// traen oportunidades y las mutations que crean ítems, cambian columnas y cierran ventas.
// Sin esta distinción, el rol "Invitado" (solo lectura) sería solamente esconder botones —
// y esconder un botón no impide un POST hecho a mano contra el mismo endpoint.
//
// El criterio es deliberadamente conservador: ante la duda, se considera ESCRITURA. El
// error en esa dirección le niega una lectura a un invitado, que es molesto y visible; el
// error en la dirección contraria le permitiría escribir, que es silencioso y grave.

// Saca comentarios y literales de texto antes de buscar palabras clave. Sin esto, una
// query que traiga un campo cuyo valor sea la palabra "mutation" (el nombre de un ítem, un
// texto de búsqueda) se clasificaría mal.
function sanear(documento) {
  return String(documento ?? '')
    // Bloques de texto """..."""
    .replace(/"""[\s\S]*?"""/g, '""')
    // Textos simples "...", contemplando las comillas escapadas
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    // Comentarios hasta fin de línea
    .replace(/#[^\n\r]*/g, '')
}

// Devuelve { esEscritura, operaciones } para un documento GraphQL.
//
// `operaciones` son los nombres de las operaciones declaradas (GetOpportunities,
// CreateItem…). Hoy no se usan para decidir: el permiso de escritura es uno solo, porque
// los roles actuales no distinguen entre "puede crear" y "puede emitir". Se devuelven
// igual porque son el gancho para el día que sí haga falta: un mapa
// nombreDeOperacion -> permiso, aplicado acá, y nada más cambia.
export function analizar(documento) {
  const limpio = sanear(documento)

  // \b para que sea la palabra completa: un campo llamado "mutationCount" no cuenta.
  const esEscritura = /\bmutation\b/i.test(limpio) || /\bsubscription\b/i.test(limpio)

  const operaciones = []
  for (const m of limpio.matchAll(/\b(query|mutation|subscription)\s+([A-Za-z_]\w*)/gi)) {
    operaciones.push({ tipo: m[1].toLowerCase(), nombre: m[2] })
  }

  return { esEscritura, operaciones }
}

// Un cuerpo de pedido puede traer una sola operación o un lote (array). Si CUALQUIERA del
// lote escribe, el pedido entero cuenta como escritura: alcanzaría con esconder una
// mutation entre nueve queries para saltearse el control.
//
// Y si el cuerpo no se puede interpretar, también cuenta como escritura. Eso cierra un
// hueco real: Vercel entrega req.body ya parseado SEGÚN el Content-Type, así que un pedido
// declarado como text/plain llega como string, `d.query` queda undefined, y la versión
// anterior lo clasificaba como lectura y lo dejaba pasar. Hoy ese pedido igual moriría en
// monday, pero depender de eso es depender de un accidente: el control tiene que fallar
// cerrado por su cuenta.
export function cuerpoEsEscritura(cuerpo) {
  if (cuerpo == null) return true

  let valor = cuerpo
  if (typeof valor === 'string' || Buffer.isBuffer(valor)) {
    try {
      valor = JSON.parse(String(valor))
    } catch {
      return true
    }
  }
  if (typeof valor !== 'object') return true

  const documentos = Array.isArray(valor) ? valor : [valor]
  if (!documentos.length) return true

  return documentos.some((d) => {
    // Sin un `query` que sea texto no hay nada que analizar: no se puede afirmar que sea
    // una lectura, así que se trata como escritura.
    if (!d || typeof d.query !== 'string') return true
    return analizar(d.query).esEscritura
  })
}
