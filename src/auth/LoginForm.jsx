import { useState } from 'react'
import { Button } from '@vibe/core'
import { useAuth } from './AuthContext'
import * as api from './authClient'

// Formulario del proveedor "contraseña" — solo aparece si AUTH_PASSWORD_LOGIN está
// encendido en el backend y VITE_AUTH_PASSWORD_LOGIN en el build del frontend.
//
// Mientras la app se use dentro de monday, esta pantalla no se muestra nunca: la identidad
// la da el sessionToken firmado y no hay ninguna contraseña de por medio. Existe para el
// escenario del punto 2.1 del documento, el día que haya un acceso directo.
//
// No hay registro autoservicio, y es deliberado: quién entra lo define la lista blanca que
// administra el cliente. Un formulario de "crear cuenta" abierto la contradice de raíz —
// cualquiera se daría de alta. El alta la hace un administrador desde el panel, y la
// contraseña se define después por invitación.

export default function LoginForm() {
  const { aplicarRespuesta } = useAuth()
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento) {
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      aplicarRespuesta(await api.abrirSesionConContrasena(email.trim(), contrasena))
    } catch (err) {
      // El backend contesta lo mismo para "ese email no existe" y para "la contraseña está
      // mal" (ver api/auth/login.js). Acá no se intenta adivinar cuál fue: mostrar un
      // mensaje más específico anularía justamente esa protección.
      setError(err.message || 'No pudimos verificar esas credenciales.')
      setContrasena('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="auth-card" onSubmit={enviar}>
      <h1>Ingresar</h1>
      <p className="auth-sub">Usá el email con el que te dieron acceso.</p>

      <input
        className="auth-input"
        type="email"
        name="email"
        autoComplete="username"
        placeholder="tu@empresa.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={enviando}
        required
        aria-label="Email"
      />
      <input
        className="auth-input"
        type="password"
        name="password"
        autoComplete="current-password"
        placeholder="Contraseña"
        value={contrasena}
        onChange={(e) => setContrasena(e.target.value)}
        disabled={enviando}
        required
        aria-label="Contraseña"
      />

      {error && <p className="auth-error">{error}</p>}

      <Button type="submit" disabled={!email || !contrasena || enviando}>
        {enviando ? 'Verificando…' : 'Continuar'}
      </Button>
      <p className="auth-nota">Después vamos a pedirte el código de tu app de autenticación.</p>
    </form>
  )
}
