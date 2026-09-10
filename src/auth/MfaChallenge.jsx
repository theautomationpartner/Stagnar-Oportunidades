import { useState } from 'react'
import { Button } from '@vibe/core'
import { useAuth } from './AuthContext'
import * as api from './authClient'
import CampoCodigo from './CampoCodigo'

// El ingreso de todos los días: los 6 dígitos.
//
// Dos detalles de experiencia que son también decisiones de seguridad:
//
//   "Confiar en este dispositivo por 30 días" viene marcado. Baja muchísimo la resistencia
//   al cambio sin bajar la seguridad de forma significativa: el dispositivo solo se marca
//   confiable DESPUÉS de haber pasado el segundo factor, y la confianza se revoca desde el
//   panel de administración o cerrando sesión en todos lados. La alternativa —pedir el
//   código todos los días— es la que hace que la gente busque cómo saltearse el 2FA.
//
//   El error de "demasiados intentos" se muestra distinto del de "código incorrecto",
//   porque son problemas distintos para el usuario: uno se corrige tipeando bien, el otro
//   solo esperando. Confundirlos hace que alguien reintente quince veces y se bloquee más.

export default function MfaChallenge() {
  const { preAuthToken, usuario, perfil, aplicarRespuesta, reintentar } = useAuth()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState(null)
  const [bloqueado, setBloqueado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [modoRecuperacion, setModoRecuperacion] = useState(false)
  const [recordar, setRecordar] = useState(true)

  async function enviar(codigoFinal) {
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      const datos = modoRecuperacion
        ? await api.usarCodigoDeRecuperacion(preAuthToken, codigoFinal)
        : await api.verificarCodigo(preAuthToken, codigoFinal, recordar)
      aplicarRespuesta(datos)
    } catch (err) {
      if (err.codigo === 'DEMASIADOS_INTENTOS') setBloqueado(true)
      // El preAuthToken dura poco a propósito. Si venció mientras la persona buscaba el
      // celular, no sirve de nada mostrarle un error: se vuelve al principio del flujo,
      // que es transparente porque el token de monday se pide de nuevo solo.
      if (err.status === 401) {
        reintentar()
        return
      }
      setError(err.message || 'No pudimos verificar el código.')
      setCodigo('')
    } finally {
      setEnviando(false)
    }
  }

  if (modoRecuperacion) {
    return (
      <div className="auth-card">
        <h1>Código de recuperación</h1>
        <p className="auth-sub">
          Escribí uno de los 10 códigos que guardaste al configurar el segundo factor. Cada uno
          sirve una sola vez.
        </p>

        <input
          className="auth-input"
          type="text"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
          value={codigo}
          disabled={enviando}
          aria-label="Código de recuperación"
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && enviar(codigo)}
        />

        {error && <p className="auth-error">{error}</p>}

        <Button disabled={!codigo || enviando} onClick={() => enviar(codigo)}>
          {enviando ? 'Verificando…' : 'Entrar'}
        </Button>
        <button
          type="button"
          className="auth-enlace"
          onClick={() => {
            setModoRecuperacion(false)
            setCodigo('')
            setError(null)
          }}
        >
          Volver al código de la app
        </button>
      </div>
    )
  }

  return (
    <div className="auth-card">
      <h1>Verificación en dos pasos</h1>
      {/* Se prefiere el nombre del perfil al email: en un asiento compartido los cuatro
          perfiles tienen el mismo correo, así que mostrarlo no distinguiría nada. */}
      <p className="auth-sub">
        {perfil?.nombre || usuario?.email ? (
          <strong>{perfil?.nombre ?? usuario.email}</strong>
        ) : (
          'Abrí tu app de autenticación'
        )}{' '}
        — escribí el código de 6 dígitos.
      </p>

      <CampoCodigo
        valor={codigo}
        onChange={setCodigo}
        onEnter={enviar}
        deshabilitado={enviando || bloqueado}
      />

      <label className="auth-check">
        <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
        <span>No volver a preguntar en este dispositivo por 30 días</span>
      </label>

      {error && <p className={bloqueado ? 'auth-error auth-error--espera' : 'auth-error'}>{error}</p>}

      <Button disabled={codigo.length !== 6 || enviando || bloqueado} onClick={() => enviar(codigo)}>
        {enviando ? 'Verificando…' : 'Entrar'}
      </Button>

      <button
        type="button"
        className="auth-enlace"
        onClick={() => {
          setModoRecuperacion(true)
          setCodigo('')
          setError(null)
        }}
      >
        Perdí el celular
      </button>
    </div>
  )
}
