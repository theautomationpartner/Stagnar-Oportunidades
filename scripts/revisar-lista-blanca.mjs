// npm run auth:lista
//
// Pre-vuelo de la lista blanca: lee el tablero de monday con las MISMAS reglas que va a
// aplicar el backend y responde, para cada persona de la cuenta de monday, si va a poder
// entrar y con qué permisos.
//
// Correrlo ANTES de poner AUTH_ENFORCE=on. Es la diferencia entre descubrir que a tres
// personas les falta el Estado en un martes tranquilo, o descubrirlo un lunes a las nueve
// con el equipo sin poder trabajar.
//
// No necesita base de datos: importa api/_auth/boardLectura.js, que es justamente el
// módulo que no depende de Postgres. Y no reimplementa ninguna regla — si mañana cambia el
// criterio en el backend, este script cambia solo.

import fs from 'node:fs'

// Las variables tienen que estar en process.env ANTES de importar env.js, porque su
// `config` se evalúa al importarse. Por eso los imports de abajo son dinámicos.
const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v

const { config } = await import('../api/_auth/env.js')
const { leerTableroSinCache, perfilesDe, diagnosticar } = await import('../api/_auth/boardLectura.js')
const { rolDesdeEtiqueta, permisosDe } = await import('../api/_auth/permisos.js')

if (!config.mondayApiKey) {
  console.error('Falta MONDAY_API_KEY en .env')
  process.exit(1)
}

const entradas = await leerTableroSinCache()

// Los usuarios reales de la cuenta de monday: son los únicos que pueden llegar a
// presentarse con un sessionToken, así que son el universo contra el que hay que contrastar
// el tablero. Una fila para alguien que no es usuario de monday no habilita a nadie.
const res = await fetch('https://api.monday.com/v2', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: config.mondayApiKey,
    'API-Version': '2024-10',
  },
  body: JSON.stringify({ query: 'query { users(limit: 200) { id name email enabled is_guest } }' }),
})
const usuarios = (await res.json()).data?.users ?? []

console.log('Tablero  : ' + config.listaBlancaBoardId + '  (' + entradas.length + ' filas)')
console.log('Esta app : ' + config.appId + '  (columna "ID app" = ' + config.columnas.idApp + ')')
console.log('Cuenta   : ' + usuarios.length + ' usuarios de monday')
console.log('TTL copia: ' + config.listaBlancaTtlSegundos + 's\n')

console.log('QUIÉN VA A PODER ENTRAR')
console.log('─'.repeat(96))

let entran = 0
for (const u of usuarios) {
  const r = perfilesDe(entradas, { mondayUserId: u.id, email: u.email })

  if (!r.permitido) {
    console.log(
      '  NO   ' + (u.email || u.name).padEnd(40) + r.motivo + (u.is_guest ? '  (es invitado de monday)' : '')
    )
    continue
  }

  entran++
  // Un asiento puede ofrecer varios perfiles: se listan todos, porque cada uno entra con
  // su propio segundo factor y con su propio rol.
  const encabezado = r.compartido
    ? '  SI   ' + (u.email || u.name).padEnd(40) + 'elige entre ' + r.perfiles.length + ' perfiles:'
    : '  SI   ' + (u.email || u.name).padEnd(40)

  if (r.compartido) console.log(encabezado)

  for (const p of r.perfiles) {
    const rol = rolDesdeEtiqueta(p.rolEtiqueta)
    const permisos = permisosDe({ rol, teams: p.teams })
    const detalle =
      'fila "' + p.nombre + '"  ' + rol.padEnd(9) + permisos.length + ' permiso(s): ' + permisos.join(', ')
    console.log(r.compartido ? '         · ' + detalle : encabezado + detalle)
  }
}

console.log('─'.repeat(96))
console.log('Entran ' + entran + ' de ' + usuarios.length + ' usuarios de la cuenta.\n')

// Filas del tablero que no corresponden a ningún usuario de monday. No es un error en sí
// —este tablero también se usa para el Ejecutivo Virtual de WhatsApp— pero conviene verlas
// para no creer que alguien tiene acceso cuando no lo tiene.
const idsDeLaCuenta = new Set(usuarios.map((u) => String(u.id)))
const emailsDeLaCuenta = new Set(usuarios.map((u) => (u.email || '').toLowerCase()))
const huerfanas = entradas.filter(
  (e) => !idsDeLaCuenta.has(e.mondayUserId ?? '') && !emailsDeLaCuenta.has(e.email ?? '')
)
if (huerfanas.length) {
  console.log('FILAS QUE NO SON USUARIOS DE MONDAY (no dan acceso a nadie)')
  for (const e of huerfanas) {
    console.log('  · ' + e.nombre.padEnd(28) + 'estado: ' + e.estado)
  }
  console.log()
}

const problemas = diagnosticar(entradas)
if (!problemas.length) {
  console.log('Sin problemas detectados en el tablero.')
} else {
  console.log('PROBLEMAS (' + problemas.length + ')')
  const orden = { alta: 0, media: 1, baja: 2 }
  for (const p of [...problemas].sort((a, b) => orden[a.gravedad] - orden[b.gravedad])) {
    console.log('\n  [' + p.gravedad.toUpperCase() + '] ' + p.tipo)
    console.log('    ' + p.detalle)
    for (const i of p.items) console.log('      · ' + i.nombre + ' (item ' + i.itemId + ', ' + i.estado + ')')
  }
}
