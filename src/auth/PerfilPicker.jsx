import { useState } from 'react'
import { useAuth } from './AuthContext'

// Selector de perfil, para el asiento de monday compartido.
//
// monday ve un solo usuario donde en realidad hay cuatro personas (The Automation Partner
// comparte el asiento 95773286), así que el sessionToken no alcanza para distinguirlas.
// Acá se elige con cuál entrar.
//
// Elegir un perfil NO da acceso: da la pantalla del segundo factor de ESE perfil. Cada uno
// tiene su propio enrolamiento, así que elegir "Santi TAP / Admin" sin tener el teléfono de
// Santi no lleva a ningún lado. Es lo que hace que el selector sea una barrera y no una
// etiqueta.

const TEXTO_ROL = {
  admin: 'Administrador',
  usuario: 'Equipo',
  invitado: 'Solo lectura',
}

export default function PerfilPicker() {
  const { seleccion, seleccionarPerfil } = useAuth()
  const [eligiendo, setEligiendo] = useState(null)

  return (
    <div className="auth-card">
      <h1>¿Con qué perfil entrás?</h1>
      <p className="auth-sub">
        Esta cuenta de monday la comparten varias personas. Elegí la tuya: después te vamos a
        pedir tu código de verificación.
      </p>

      <ul className="auth-perfiles">
        {seleccion.perfiles.map((p) => (
          <li key={p.itemId}>
            <button
              type="button"
              className="auth-perfil"
              disabled={Boolean(eligiendo)}
              onClick={() => {
                setEligiendo(p.itemId)
                seleccionarPerfil(p.itemId)
              }}
            >
              <span className="auth-perfil__nombre">{p.nombre}</span>
              <span className="auth-perfil__meta">
                {TEXTO_ROL[p.rol] ?? p.rol}
                {/* Un perfil sin 2FA todavía está sin reclamar: el primero que lo elija va a
                    enrolar su propio teléfono. Decirlo evita que alguien abra por error el
                    perfil de un compañero, y que después nadie entienda por qué el dueño
                    real no puede entrar. */}
                {p.yaConfigurado ? '' : ' · sin configurar'}
              </span>
              {eligiendo === p.itemId && <span className="auth-perfil__cargando" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>

      <p className="auth-nota">
        Si ninguno es tuyo, pedile a un administrador que te agregue al tablero de usuarios
        habilitados.
      </p>
    </div>
  )
}
