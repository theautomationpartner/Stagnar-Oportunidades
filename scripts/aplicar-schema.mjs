// npm run db:schema            muestra qué falta, sin escribir
// npm run db:schema -- --apply aplica db/schema.sql
//
// Mismo criterio que el resto de los scripts de esta carpeta: idempotente y sin efecto sin
// --apply. El schema está escrito entero con CREATE TABLE IF NOT EXISTS, así que correrlo
// dos veces no rompe nada; el modo sin --apply existe igual para poder mirar contra qué
// base se va a correr antes de correrlo, que es donde se cometen los errores caros.
import fs from 'node:fs'
import { neon } from '@neondatabase/serverless'

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const APLICAR = process.argv.includes('--apply')
const url = process.env.DATABASE_URL || env.DATABASE_URL
if (!url) {
  console.error('Falta DATABASE_URL (en .env o en el entorno).')
  process.exit(1)
}

// Se muestra el host, nunca la cadena entera: lleva la contraseña adentro.
console.log('Base:', new URL(url).host)

const sql = neon(url)

const TABLAS = [
  'usuarios_autorizados',
  'mfa_usuarios',
  'mfa_codigos_recuperacion',
  'dispositivos_confiables',
  'monday_usuarios_cache',
  'lista_blanca_cache',
  'intentos_rate_limit',
  'auditoria',
]

const existentes = await sql`
  SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = ANY(${TABLAS})
`
const yaEstan = new Set(existentes.map((f) => f.table_name))

for (const tabla of TABLAS) {
  console.log((yaEstan.has(tabla) ? '  ya existe  ' : '  falta      ') + tabla)
}

if (!APLICAR) {
  console.log('\nSin --apply no se escribe nada. Para aplicar:\n  npm run db:schema -- --apply')
  process.exit(0)
}

// El driver HTTP de neon manda una sentencia por viaje, así que el archivo se parte por
// ";" a nivel superior. El schema no tiene funciones ni bloques $$, que serían el caso
// donde este corte ingenuo se rompería.
const sentencias = fs
  .readFileSync('db/schema.sql', 'utf8')
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s && !s.split('\n').every((l) => l.trim().startsWith('--')))

// Ejecuta SQL literal, sin parámetros.
//
// En @neondatabase/serverless 0.10 la función que devuelve neon() es SOLO una tagged
// template: no tiene .query(). Pero una llamada `sql`texto`` es, por debajo,
// sql(arrayDeStrings, ...valores) — así que armando ese array a mano se manda una sentencia
// arbitraria. Es lo que hace falta para DDL, que no lleva parámetros.
//
// Se queda en HTTP, que es lo que conviene: la alternativa (el Client compatible con
// node-postgres del mismo paquete) habla por WebSocket y no aporta nada acá.
//
// Nunca usar esto con valores que vengan de afuera: no parametriza nada. Acá la entrada es
// un archivo del repositorio, no input de usuario.
function ejecutarLiteral(texto) {
  return sql(Object.assign([texto], { raw: [texto] }))
}

for (const sentencia of sentencias) {
  const titulo = sentencia.split('\n').find((l) => !l.trim().startsWith('--'))?.slice(0, 70)
  await ejecutarLiteral(sentencia)
  console.log('  ok ', titulo)
}

console.log('\nEsquema aplicado.')
