// GET /api/auth/me — quién soy, según el servidor.
//
// Existe por una razón concreta: el frontend no puede decidir por su cuenta si la sesión
// sigue viva. Tiene el token en localStorage, pero el token puede estar vencido, el
// usuario puede haber sido revocado hace un minuto, o la sesión puede haber sido
// invalidada desde otro dispositivo. Preguntar es la única forma de saber, y este endpoint
// pasa por el mismo guardián que cualquier endpoint con datos — así la respuesta refleja
// exactamente lo que la app va a poder hacer.

import { protegerEndpoint } from '../_auth/guard.js'
import { perfilPublico } from '../_auth/mfaFlow.js'
import * as db from '../_auth/db.js'

export default protegerEndpoint(
  async (req, res, { usuario, modo }) => {
    if (!usuario) return res.status(200).json({ autenticado: false, authDeshabilitado: true })

    const mfa = await db.obtenerMfa(usuario.id)
    const codigosRestantes = await db.contarCodigosRecuperacionSinUsar(usuario.id)

    return res.status(200).json({
      autenticado: true,
      modo,
      usuario: perfilPublico(usuario),
      mfa: {
        configurado: Boolean(mfa?.confirmado_en),
        configuradoEn: mfa?.confirmado_en ?? null,
        codigosRecuperacionRestantes: codigosRestantes,
        // Avisar a tiempo evita el caso feo: la persona se queda sin códigos, pierde el
        // celular y ahí sí no hay salida que no sea un administrador.
        convieneRegenerarCodigos: Boolean(mfa?.confirmado_en) && codigosRestantes <= 3,
      },
    })
  },
  { metodos: ['GET'] }
)
