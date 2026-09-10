import { Button } from '@vibe/core'
import { AuthProvider, useAuth, ESTADOS } from './AuthContext'
import MfaEnroll from './MfaEnroll'
import MfaChallenge from './MfaChallenge'
import LoginForm from './LoginForm'
import PerfilPicker from './PerfilPicker'
import './auth.css'

// La puerta. Envuelve a toda la app: mientras no haya sesión completa, los hijos ni
// siquiera se montan.
//
// Eso último importa y no es solo prolijidad de React. Los componentes de la app disparan
// sus fetch al montarse (App.jsx pide oportunidades, departamentos, localidades y el
// esquema del tablero en cuanto aparece). Si el gate renderizara la app "escondida"
// detrás de un modal, esos pedidos saldrían igual y el backend los rechazaría de a
// docenas, gastando cupo del rate limit por IP contra el propio usuario legítimo.
//
// Aclaración necesaria sobre qué es y qué no es esta pantalla: es comodidad, no
// seguridad. Que alguien logre cargar la pantalla de la app no le da acceso a ningún dato
// — cada pedido al backend se valida individualmente en api/_auth/guard.js. Es la
// diferencia entre entrar al edificio y entrar a la oficina.

function Pantallas({ children }) {
  const { estado, mensaje, reintentar } = useAuth()

  if (estado === ESTADOS.LISTO) return children

  if (estado === ESTADOS.CARGANDO) {
    return (
      <div className="auth-pantalla">
        <div className="auth-card auth-card--centrado">
          <div className="auth-spinner" aria-hidden="true" />
          <p className="auth-sub">Verificando tu acceso…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-pantalla">
      {estado === ESTADOS.ELEGIR_PERFIL && <PerfilPicker />}
      {estado === ESTADOS.ENROLAR && <MfaEnroll />}
      {estado === ESTADOS.CODIGO && <MfaChallenge />}
      {estado === ESTADOS.LOGIN && <LoginForm />}

      {estado === ESTADOS.SIN_ACCESO && (
        <div className="auth-card auth-card--centrado">
          <h1>Acceso restringido</h1>
          {/* Mensaje genérico a propósito: nunca decimos si el email existe en el sistema
              ni qué módulos hay adentro. Eso solo le confirmaría información a quien está
              tanteando, y a la persona legítima no la ayuda en nada. */}
          <p className="auth-sub">{mensaje ?? 'No tenés acceso a esta aplicación. Contactá al administrador.'}</p>
        </div>
      )}

      {estado === ESTADOS.ERROR && (
        <div className="auth-card auth-card--centrado">
          <h1>No pudimos verificar tu acceso</h1>
          <p className="auth-sub">{mensaje}</p>
          {/* Este estado SÍ ofrece reintentar, a diferencia de "sin acceso": acá el
              problema puede ser pasajero y volver a intentar tiene sentido. */}
          <Button onClick={reintentar}>Reintentar</Button>
        </div>
      )}
    </div>
  )
}

export default function AuthGate({ children }) {
  return (
    <AuthProvider>
      <Pantallas>{children}</Pantallas>
    </AuthProvider>
  )
}
