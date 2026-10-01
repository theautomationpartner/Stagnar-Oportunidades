// Red de contención para los módulos que se bajan recién cuando hacen falta (los
// `lazy()` de App.jsx y el `import()` de whatsappImage en OpportunityDetail).
//
// El problema que resuelve: Vite parte esos módulos en archivos propios con un hash en el
// nombre (assets/OpportunityDetail-<hash>.js) y el navegador los pide recién al entrar a
// esa pantalla. Si entre que se abrió la pestaña y ese momento se publicó una versión
// nueva, el archivo con el hash viejo ya no está en el servidor: 404. No es un bug del
// código y no se arregla solo — hasta que no se recargue la página, el index viejo que
// tiene cargado el navegador va a seguir pidiendo archivos que ya no existen.
//
// Se reportó así: "había varias propuestas marcadas, apreté Enviar y no cargaba el pop
// up; actualizamos la página y sí funcionó".

// Cada navegador redacta el error distinto, de ahí las variantes.
export function esChunkCaido(err) {
  const mensaje = `${err?.message ?? ''} ${err?.name ?? ''}`
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|dynamically imported module/i.test(
    mensaje
  )
}

// Marca de "ya recargué por esto" — vive en sessionStorage (no localStorage) para que
// dure lo que dure la pestaña y no se arrastre a la próxima visita.
const CLAVE_YA_RECARGUE = 'stg_recarga_por_chunk_caido'

function yaRecargue() {
  try {
    return sessionStorage.getItem(CLAVE_YA_RECARGUE) === '1'
  } catch {
    // Modo incógnito o storage bloqueado: se asume que no, y si hace falta recargar se
    // recarga. El peor caso sin la marca sería un bucle, pero sin storage tampoco
    // podríamos evitarlo de otra forma — y el navegador corta solo los bucles duros.
    return false
  }
}

function marcarRecarga(valor) {
  try {
    if (valor) sessionStorage.setItem(CLAVE_YA_RECARGUE, '1')
    else sessionStorage.removeItem(CLAVE_YA_RECARGUE)
  } catch {
    // ver yaRecargue
  }
}

// Envuelve un `() => import('...')` para usar con React.lazy:
//
//   const Pantalla = lazy(() => importarConReintento(() => import('./Pantalla')))
//
// 1) Reintenta una vez. Cubre el corte de red puntual, que es el único caso donde pedir
//    el MISMO archivo otra vez puede salir bien.
// 2) Si vuelve a fallar, el archivo no está: recarga la página una sola vez. Es lo mismo
//    que hace a mano quien se come el error, pero sin que tenga que darse cuenta.
// 3) Si después de recargar sigue fallando, no insiste: deja subir el error. Sin esto,
//    un servidor mal publicado dejaría la app recargándose en loop.
//
// Para los `lazy()` recargar es seguro: se está entrando a una pantalla nueva, no hay
// nada a medio cargar que se pueda perder. Donde SÍ hay algo que perder (el botón de
// enviar por WhatsApp, con propuestas ya seleccionadas) no se usa esto: ahí se le muestra
// el error con un botón de recargar y decide la persona.
export async function importarConReintento(importar) {
  try {
    const modulo = await importar()
    // Salió bien: se borra la marca, así el próximo deploy vuelve a tener su recarga.
    if (yaRecargue()) marcarRecarga(false)
    return modulo
  } catch (err) {
    if (!esChunkCaido(err)) throw err
    try {
      return await importar()
    } catch (err2) {
      if (!esChunkCaido(err2) || yaRecargue()) throw err2
      marcarRecarga(true)
      window.location.reload()
      // La recarga no es instantánea. Se devuelve una promesa que nunca resuelve para que
      // React se quede en el fallback de Suspense en vez de mostrar un error que se vería
      // por una fracción de segundo antes de que la página se vaya.
      return new Promise(() => {})
    }
  }
}
