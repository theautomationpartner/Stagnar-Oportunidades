// ¿El formulario de "Crear una oportunidad" tiene trabajo sin guardar AHORA MISMO?
//
// Lo publica CrearOportunidadForm en cada render (mismo criterio que su "¿Salir sin
// crear?" interno: persona elegida, un paso avanzado o algún campo tipeado — y nada que
// perder si ya se creó o se está guardando) y lo consulta la AccionBar del shell en el
// momento del clic, para mostrar el aviso de descarte SOLO si hay algo que perder: entrar
// a Crear y salir sin tocar nada no merece cartel.
//
// Es un módulo con estado y no contexto de React a propósito: la barra lo necesita LEER
// al hacer clic, no re-renderizarse cada vez que cambia.
let hayTrabajo = false

export function publicarTrabajoEnCrear(valor) {
  hayTrabajo = Boolean(valor)
}

export function hayTrabajoEnCrear() {
  return hayTrabajo
}
