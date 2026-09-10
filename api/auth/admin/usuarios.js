// /api/auth/admin/usuarios — diagnóstico de la lista blanca y reset de segundo factor.
// Requiere el permiso usuarios.administrar, o sea Rol = Admin en el tablero.
//
//   GET                                    cómo ve la app al tablero, y qué problemas tiene
//   POST { id, accion: 'resetear-mfa' }    para quien perdió el celular
//
// Lo que este endpoint YA NO hace, y es a propósito: dar de alta o de baja gente. Eso pasó
// a hacerse en el tablero de monday, que es la fuente de verdad. Un alta escrita acá no
// serviría de nada — la próxima lectura del tablero la pisaría—, y tener dos lugares donde
// parece que se administran los accesos es peor que tener uno solo.
//
// Lo que sí queda acá es lo que el tablero no puede resolver: el enrolamiento de 2FA vive
// en la base (el secreto va cifrado), así que resetearlo es una operación de la app.

import { protegerEndpoint } from '../../_auth/guard.js'
import { ErrorDeFlujo } from '../../_auth/errors.js'
import { leerJson } from '../../_auth/mfaFlow.js'
import { PERMISOS, ROLES, rolDesdeEtiqueta } from '../../_auth/permisos.js'
import { obtenerEntradas, diagnosticar, olvidarMemoria } from '../../_auth/boardWhitelist.js'
import { config } from '../../_auth/env.js'
import * as db from '../../_auth/db.js'
import * as audit from '../../_auth/audit.js'

export default protegerEndpoint(
  async (req, res, { usuario }) => {
    if (req.method === 'GET') {
      // Sin la memoria de la invocación: quien viene a diagnosticar quiere ver el tablero,
      // no una copia de hace un rato.
      olvidarMemoria()
      const entradas = await obtenerEntradas()

      return res.status(200).json({
        tablero: {
          boardId: config.listaBlancaBoardId,
          url: 'https://view.monday.com/boards/' + config.listaBlancaBoardId,
          columnas: config.columnas,
          ttlSegundos: config.listaBlancaTtlSegundos,
          // Contra qué "ID app" se está filtrando. Sin esto, un diagnóstico que dice "esta
          // persona no entra" no permite distinguir si le falta el Estado o si le falta
          // esta app en la columna.
          appId: config.appId,
        },
        // Cada fila, con la lectura ya interpretada: qué rol y qué permisos daría, y si
        // puede identificar a alguien. Es lo que responde "¿por qué Fulano no entra?".
        filas: entradas.map((e) => {
          const rol = rolDesdeEtiqueta(e.rolEtiqueta)
          const tieneEstaApp = e.apps.includes(String(config.appId))
          const entra = e.estado === 'activo' && tieneEstaApp && Boolean(e.mondayUserId || e.email)
          return {
            itemId: e.itemId,
            nombre: e.nombre,
            mondayUserId: e.mondayUserId,
            email: e.email,
            estado: e.estado,
            rol,
            teams: e.teams,
            apps: e.apps,
            tieneEstaApp,
            entra,
            permisos: entra ? ROLES[rol] : [],
          }
        }),
        problemas: diagnosticar(entradas),
        // El espejo local: quién llegó a enrolarse y cuándo entró por última vez. Sirve
        // para ver quién todavía no configuró el 2FA.
        espejo: await db.listarUsuarios(),
      })
    }

    const cuerpo = await leerJson(req)
    if (cuerpo.accion !== 'resetear-mfa') {
      throw new ErrorDeFlujo(
        'ACCION_DESCONOCIDA',
        'La única acción de este endpoint es "resetear-mfa". Las altas y bajas se hacen en el tablero de monday.'
      )
    }

    const id = Number(cuerpo.id)
    if (!id) throw new ErrorDeFlujo('DATOS_INCOMPLETOS', 'Falta el id del usuario (el del espejo, no el de monday).')

    // Un admin que se resetea a sí mismo no rompe nada (vuelve a escanear un QR), pero
    // conviene que sea deliberado y no un clic en la fila equivocada.
    if (id === usuario.id && !cuerpo.confirmarPropio) {
      throw new ErrorDeFlujo(
        'CONFIRMAR_PROPIO',
        'Estás por resetear tu propio segundo factor. Reenviá con confirmarPropio: true si es lo que querés.'
      )
    }

    // Resetear borra el enrolamiento, los códigos de recuperación, los dispositivos
    // confiables y las sesiones vivas. Las cuatro cosas: dejar los dispositivos confiables
    // permitiría seguir entrando sin 2FA a quien justamente lo perdió, que es lo contrario
    // de lo que se busca.
    await db.resetearMfa(id)

    await audit.registrar(req, 'admin_reset_mfa', {
      usuarioId: usuario.id,
      email: usuario.email,
      detalle: { objetivo: id },
    })

    return res.status(200).json({
      ok: true,
      mensaje: 'Listo. La próxima vez que entre, se le va a pedir que escanee un QR nuevo.',
    })
  },
  { metodos: ['GET', 'POST'], requierePermiso: PERMISOS.ADMINISTRAR_USUARIOS }
)
