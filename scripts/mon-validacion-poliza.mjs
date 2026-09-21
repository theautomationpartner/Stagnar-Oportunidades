// Crea en Oportunidades las columnas con las que el escenario de Make informa si los
// datos de la póliza emitida coinciden con lo que se cotizó.
//
// Van en Oportunidades y no en 📄 Pólizas Automóviles por una razón concreta: no existe
// ninguna relación entre las dos, así que desde la oportunidad no se puede leer la
// póliza. La app ya lee y poléa la oportunidad (mismo mecanismo que Estado Cotización y
// Estado Envío), y el escenario ya escribe ahí cuando crea la póliza.
//
// Cuatro validaciones, cada una con su estado y su motivo:
//
//   Persona     el cliente de la póliza vs. el de la oportunidad
//   Vehículo    matrícula, chasis, motor, marca y año
//   Compañía    la aseguradora de la póliza vs. la de la cotización elegida
//   Cotización  cobertura y premio vs. la cotización elegida
//
// Más un estado general que dice en qué anda la validación, para que la app pueda mostrar
// el progreso en vivo en vez de un cartel fijo.
//
// Qué escribe cada lado:
//   - Make: los cuatro estados, los cuatro motivos y el estado general.
//   - La app: solo "Revisado manualmente" cuando alguien decide emitir igual, y deja en el
//     motivo quién lo revisó.
//
// Idempotente: si una columna ya existe la deja como está.
//
// Uso:
//   node scripts/mon-validacion-poliza.mjs            # muestra qué haría
//   node scripts/mon-validacion-poliza.mjs --apply
import fs from 'node:fs'

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const APLICAR = process.argv.includes('--apply')
const BOARD = '18420863013'

// Los índices son los de la paleta de monday: 5 es el gris que monday usa como valor por
// defecto de una columna de estado, así que una oportunidad sin validar se lee "Sin
// validar" en vez de quedar en blanco. 1 verde (válido), 2 rojo (incorrecto) y 0 naranja
// para "revisado manualmente", que no es lo mismo que válido: lo pasó una persona, no el sistema.
const ESTADOS_VALIDACION = {
  labels: { 5: 'Sin validar', 1: 'Válido', 2: 'Incorrecto', 0: 'Revisado manualmente' },
}

// El general marca el ciclo completo: la app pide "Validar" al subir la póliza, el
// escenario pasa a "Validando" mientras trabaja y cierra en "Datos válidos" o "Con
// diferencias". La app muestra el progreso con eso y deja de refrescar al llegar al final.
const ESTADO_GENERAL = {
  labels: { 5: 'Sin validar', 4: 'Validar', 3: 'Validando', 1: 'Datos válidos', 2: 'Con diferencias' },
}

const COLUMNAS = [
  { titulo: 'Validación Póliza', tipo: 'status', defaults: ESTADO_GENERAL },
  { titulo: 'Validación Persona', tipo: 'status', defaults: ESTADOS_VALIDACION },
  { titulo: 'Validación Vehículo', tipo: 'status', defaults: ESTADOS_VALIDACION },
  { titulo: 'Validación Compañía', tipo: 'status', defaults: ESTADOS_VALIDACION },
  { titulo: 'Validación Cotización', tipo: 'status', defaults: ESTADOS_VALIDACION },
  { titulo: 'Motivo Persona', tipo: 'text' },
  { titulo: 'Motivo Vehículo', tipo: 'text' },
  { titulo: 'Motivo Compañía', tipo: 'text' },
  { titulo: 'Motivo Cotización', tipo: 'text' },
]

async function gql(query, variables) {
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: env.MONDAY_API_KEY },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400))
  return j.data
}

const existentes = (await gql(`{ boards(ids: ${BOARD}) { columns { id title type } } }`)).boards[0].columns
const porTitulo = new Map(existentes.map((c) => [c.title.trim().toLowerCase(), c]))

const faltan = COLUMNAS.filter((c) => !porTitulo.has(c.titulo.toLowerCase()))
const yaEstan = COLUMNAS.filter((c) => porTitulo.has(c.titulo.toLowerCase()))

console.log(`${faltan.length} columnas a crear, ${yaEstan.length} ya existen`)
for (const c of yaEstan) console.log(`  ya existe   ${c.titulo}  (${porTitulo.get(c.titulo.toLowerCase()).id})`)
for (const c of faltan) console.log(`  crear       ${c.titulo}  (${c.tipo})`)

if (faltan.length && !APLICAR) {
  console.log()
  console.log('Simulación. Para aplicarlo: node scripts/mon-validacion-poliza.mjs --apply')
} else if (faltan.length) {
  const creadas = []
  for (const c of faltan) {
    const data = await gql(
      `mutation($boardId: ID!, $title: String!, $type: ColumnType!, $defaults: JSON) {
         create_column(board_id: $boardId, title: $title, column_type: $type, defaults: $defaults) { id title }
       }`,
      { boardId: BOARD, title: c.titulo, type: c.tipo, defaults: c.defaults ? JSON.stringify(c.defaults) : null }
    )
    creadas.push({ ...c, id: data.create_column.id })
    console.log(`creada ${data.create_column.id.padEnd(24)} ${c.titulo}`)
  }
  console.log()
  console.log('Ids para el escenario de Make y para la app:')
  for (const c of creadas) console.log(`  ${c.id.padEnd(24)} ${c.titulo}`)
}
