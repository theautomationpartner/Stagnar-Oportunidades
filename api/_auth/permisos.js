// Roles y accesos a las funcionalidades, derivados de las columnas del tablero
// "Usuario Habilitados - Lista Blanca".
//
// Las etiquetas de acá abajo NO son inventadas: son las que el tablero tiene hoy.
//   Rol  (color_mm72cf90)    -> "Admin" | "Resto del equipo" | "Invitado"
//   Team (dropdown_mm72rsy7) -> "Administracion"
//
// Cada permiso de esta lista corresponde a un punto de control REAL en un endpoint. No hay
// permisos decorativos: si figura acá, hay un lugar donde se verifica. Es una restricción
// que vale la pena mantener — una constante como "puede emitir" que en realidad nadie
// chequea es peor que no tenerla, porque hace creer que algo está protegido.

export const PERMISOS = {
  // Leer: las queries GraphQL contra /api/monday y la descarga de adjuntos.
  VER: 'datos.ver',
  // Escribir: las mutations GraphQL contra /api/monday (crear oportunidad, cambiar
  // columnas, cotizar, confirmar, emitir — todo pasa por ahí).
  ESCRIBIR: 'datos.escribir',
  // Subir un archivo a una columna de monday.
  SUBIR_ARCHIVOS: 'archivos.subir',
  // Mandar un PDF a los escenarios de Make que leen la Cédula y la Carta Automóvil.
  LEER_DOCUMENTOS: 'documentos.leer',
  // Mandarle la propuesta al cliente por WhatsApp.
  ENVIAR_WHATSAPP: 'enviar.whatsapp',
  // Los dos exclusivos de Admin.
  ADMINISTRAR_USUARIOS: 'usuarios.administrar',
  RESETEAR_MFA: 'mfa.resetear',
}

// Lo que puede hacer alguien que opera la app todos los días.
const OPERACION = [
  PERMISOS.VER,
  PERMISOS.ESCRIBIR,
  PERMISOS.SUBIR_ARCHIVOS,
  PERMISOS.LEER_DOCUMENTOS,
  PERMISOS.ENVIAR_WHATSAPP,
]

export const ROLES = {
  // "Invitado" es el rol base: el que se aplica cuando la celda Rol está vacía o dice algo
  // que no reconocemos. Solo lectura. Que el default sea el más restrictivo es lo que hace
  // que un dato mal cargado nunca termine dando de más.
  invitado: [PERMISOS.VER],
  // "Resto del equipo": opera la aplicación completa, no administra personas.
  usuario: OPERACION,
  // "Admin": lo anterior más administrar la lista y resetear el segundo factor ajeno.
  admin: [...OPERACION, PERMISOS.ADMINISTRAR_USUARIOS, PERMISOS.RESETEAR_MFA],
}

export const ROL_BASE = 'invitado'

// Normaliza la etiqueta de la columna Rol.
//
// Cualquier valor desconocido —incluida la celda vacía— cae en el rol base. La dirección
// del default importa: si lo desconocido cayera en 'usuario', agregar una etiqueta nueva al
// tablero le daría permisos de escritura a todo el mundo hasta que alguien se acordara de
// tocar este archivo.
export function rolDesdeEtiqueta(etiqueta) {
  const limpia = String(etiqueta ?? '').trim().toLowerCase()
  if (limpia === 'admin') return 'admin'
  if (limpia === 'resto del equipo') return 'usuario'
  if (limpia === 'invitado') return 'invitado'
  return ROL_BASE
}

// El Team no restringe nada hoy, y decirlo explícitamente vale más que simular que sí.
//
// La columna tiene una sola etiqueta ("Administracion"), así que cualquier regla escrita
// sobre ella sería una regla sobre datos que no existen: o no aplica a nadie, o aplica a
// todos. Queda como metadato que viaja en la sesión y se audita.
//
// El día que el tablero tenga equipos de verdad (Comercial, Operaciones, Siniestros…),
// este es el único lugar a tocar: devolver acá la lista de permisos del equipo.
export function permisosDeTeam(_teams) {
  return null // null = el equipo no restringe
}

export function permisosDe({ rol, teams }) {
  const delRol = ROLES[rol] ?? ROLES[ROL_BASE]
  const delTeam = permisosDeTeam(teams)
  // Intersección y no unión: un equipo puede quitar permisos, nunca agregarlos. Si algún
  // día se invirtiera esto, un Team mal cargado podría volver administrador a cualquiera.
  if (!delTeam) return delRol
  return delRol.filter((p) => delTeam.includes(p))
}

export function puede(usuario, permiso) {
  return Boolean(usuario?.permisos?.includes(permiso))
}
