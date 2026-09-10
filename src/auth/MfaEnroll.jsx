import { useEffect, useRef, useState } from 'react'
import { Button } from '@vibe/core'
import { useAuth } from './AuthContext'
import * as api from './authClient'
import CampoCodigo from './CampoCodigo'

// Enrolamiento: la primera vez que la persona entra.
//
// Dos pantallas, y la segunda no es opcional. Después de confirmar el código aparecen los
// 10 códigos de recuperación, y el usuario tiene que marcar explícitamente que los guardó
// para poder seguir. Es la ÚNICA vez que existen: la base guarda su HMAC, así que ni
// nosotros podemos volver a mostrarlos. Dejar que se pase de largo con un clic distraído
// es garantizar la llamada de "perdí el celular y no puedo entrar" dentro de seis meses.

// Recuerda, por perfil, que esta persona ya escaneó el QR — así al volver no se le muestra
// otra vez y va directo a escribir el código. Es una comodidad del navegador y nada más: el
// servidor no cambia de opinión por esto, y si el localStorage no está disponible el único
// efecto es que se vuelve a ver el QR.
const CLAVE_ESCANEADO = 'stg_qr_escaneado'

function yaEscaneo(cuenta) {
  try {
    return JSON.parse(window.localStorage.getItem(CLAVE_ESCANEADO) || '[]').includes(cuenta)
  } catch {
    return false
  }
}

function recordarEscaneo(cuenta, escaneado) {
  try {
    const lista = JSON.parse(window.localStorage.getItem(CLAVE_ESCANEADO) || '[]').filter((c) => c !== cuenta)
    if (escaneado) lista.push(cuenta)
    window.localStorage.setItem(CLAVE_ESCANEADO, JSON.stringify(lista))
  } catch {
    /* sin localStorage simplemente se vuelve a mostrar el QR */
  }
}

export default function MfaEnroll() {
  const { preAuthToken, aplicarRespuesta, perfil, seleccion, volverAPerfiles } = useAuth()
  const [qr, setQr] = useState(null)
  const [secretoManual, setSecretoManual] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [verSecreto, setVerSecreto] = useState(false)
  // 'qr' mientras hay que escanear; 'codigo' cuando la persona dice que ya lo hizo.
  const [vista, setVista] = useState('qr')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [codigosRecuperacion, setCodigosRecuperacion] = useState(null)
  const [guardados, setGuardados] = useState(false)
  const [respuestaFinal, setRespuestaFinal] = useState(null)
  // null | 'ok' | 'error' — el resultado del último intento de copiar.
  const [copiado, setCopiado] = useState(null)
  const refCodigos = useRef(null)

  // El "✓ Copiado" se borra solo: es una confirmación, no un estado permanente. El aviso de
  // error dura más, porque ahí sí hay algo que hacer.
  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(null), copiado === 'ok' ? 2500 : 8000)
    return () => clearTimeout(t)
  }, [copiado])

  // El endpoint es idempotente: pedirlo dos veces (React en modo estricto lo hace, y
  // recargar la página también) devuelve SIEMPRE el mismo secreto pendiente. Sin eso, el QR
  // en pantalla podía no ser el que el servidor tenía guardado, y el código "no funcionaba".
  useEffect(() => {
    let vivo = true
    api
      .pedirQr(preAuthToken)
      .then((datos) => {
        if (!vivo) return
        setQr(datos.qr)
        setSecretoManual(datos.secretoManual)
        setCuenta(datos.cuenta ?? '')
        if (datos.cuenta && yaEscaneo(datos.cuenta)) setVista('codigo')
      })
      .catch((err) => vivo && setError(err.message || 'No se pudo generar el código QR.'))
    return () => {
      vivo = false
    }
  }, [preAuthToken])

  // Copiar los códigos de recuperación, avisando qué pasó.
  //
  // navigator.clipboard puede no existir o rechazar: hace falta un contexto seguro, y dentro
  // de un iframe de otro dominio —que es como corre esta app en monday— el navegador puede
  // bloquear la escritura salvo que el iframe tenga permiso explícito. Ignorar ese fallo, que
  // es lo que hacía antes, deja a la persona convencida de que guardó unos códigos que nunca
  // llegaron al portapapeles.
  async function copiar() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles')
      await navigator.clipboard.writeText(codigosRecuperacion.join('\n'))
      setCopiado('ok')
    } catch {
      // Plan B: se seleccionan los códigos para que se puedan copiar a mano.
      const nodo = refCodigos.current
      if (nodo) {
        const rango = document.createRange()
        rango.selectNodeContents(nodo)
        const seleccion = window.getSelection()
        seleccion?.removeAllRanges()
        seleccion?.addRange(rango)
      }
      setCopiado('error')
    }
  }

  // Empezar de cero, para quien lo escaneó en el teléfono equivocado.
  async function generarNuevo() {
    setError(null)
    setQr(null)
    setCodigo('')
    recordarEscaneo(cuenta, false)
    setVista('qr')
    try {
      const datos = await api.pedirQr(preAuthToken, { reiniciar: true })
      setQr(datos.qr)
      setSecretoManual(datos.secretoManual)
      setCuenta(datos.cuenta ?? '')
    } catch (err) {
      setError(err.message || 'No se pudo generar un código nuevo.')
    }
  }

  async function confirmar(codigoFinal) {
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      const datos = await api.confirmarEnrolamiento(preAuthToken, codigoFinal, true)
      // Ya está confirmado: la marca de "lo escaneé" no sirve más, y dejarla haría que un
      // futuro re-enrolamiento (si un admin lo resetea) arrancara escondiendo el QR.
      recordarEscaneo(cuenta, false)
      setCodigosRecuperacion(datos.codigosRecuperacion)
      // La sesión ya está hecha del lado del servidor, pero no se entra a la app hasta que
      // el usuario confirme que anotó los códigos.
      setRespuestaFinal(datos)
    } catch (err) {
      setError(err.message || 'No se pudo confirmar el código.')
      setCodigo('')
    } finally {
      setEnviando(false)
    }
  }

  if (codigosRecuperacion) {
    return (
      <div className="auth-card">
        <h1>Guardá estos códigos</h1>
        <p className="auth-sub">
          Son tus 10 códigos de recuperación, de un solo uso. Si perdés el celular, son la única
          forma de entrar. <strong>No los vamos a poder mostrar de nuevo.</strong>
        </p>

        <ul className="auth-codigos" ref={refCodigos}>
          {codigosRecuperacion.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>

        <div className="auth-acciones-secundarias">
          <button type="button" className="auth-enlace" onClick={copiar}>
            {copiado === 'ok' ? '✓ Copiado' : 'Copiar al portapapeles'}
          </button>
          <button
            type="button"
            className="auth-enlace"
            onClick={() => descargarComoTxt(codigosRecuperacion)}
          >
            Descargar como archivo
          </button>
        </div>

        {/* Que el fallo se vea es más importante que el éxito: si el navegador bloqueó el
            portapapeles y no se avisara, la persona se iría creyendo que guardó unos códigos
            que en realidad no copió — y son los que necesita justamente el día que pierde el
            teléfono. */}
        {copiado === 'error' && (
          <p className="auth-error auth-error--espera">
            El navegador no dejó copiar. Te los dejamos seleccionados: copialos con Ctrl+C, o
            usá "Descargar como archivo".
          </p>
        )}

        <label className="auth-check">
          <input type="checkbox" checked={guardados} onChange={(e) => setGuardados(e.target.checked)} />
          <span>Los guardé en un lugar seguro</span>
        </label>

        <Button disabled={!guardados} onClick={() => aplicarRespuesta(respuestaFinal)}>
          Entrar a la aplicación
        </Button>
      </div>
    )
  }

  return (
    <div className="auth-card">
      <h1>Configurá el segundo factor</h1>
      {/* En un asiento compartido hay que dejar clarísimo QUÉ perfil se está enrolando: el
          código que se guarde acá va a ser el que pida este perfil de ahí en adelante, y
          enrolar el de un compañero por error deja a esa persona sin poder entrar. */}
      {perfil?.nombre && (
        <p className="auth-perfil-activo">
          Perfil: <strong>{perfil.nombre}</strong>
        </p>
      )}
      {vista === 'qr' ? (
        <>
          <p className="auth-sub">
            Escaneá este código con Google Authenticator, Microsoft Authenticator, Authy o 1Password.
            Cualquiera sirve: es un estándar abierto.
          </p>

          {qr ? (
            <img className="auth-qr" src={qr} alt="Código QR para configurar el segundo factor" />
          ) : (
            <div className="auth-qr auth-qr--vacio">{error ? 'No disponible' : 'Generando…'}</div>
          )}

          {/* Disclosure y no enlace: es una salida alternativa que despliega contenido acá
              mismo (el secreto manual), y el chevron adelanta ese comportamiento. */}
          <button
            type="button"
            className="auth-desplegable"
            aria-expanded={verSecreto}
            aria-controls="auth-secreto-manual"
            onClick={() => setVerSecreto((v) => !v)}
          >
            {verSecreto ? 'Ocultar el código manual' : 'No puedo escanear el QR'}
          </button>
          {verSecreto && (
            // Para quien tiene la app de autenticación en la computadora, o una cámara que
            // no funciona. Es el mismo secreto que codifica el QR, escrito.
            <code id="auth-secreto-manual" className="auth-secreto">{secretoManual}</code>
          )}

          {/* Lo que pidieron: una vez escaneado, no volver a ver el QR. Se recuerda en este
              navegador, así que al volver la pantalla arranca directamente en el código.
              Botón secundario y no enlace: de todo lo que hay bajo el QR es la única acción
              que AVANZA el flujo, y tiene que pesar más que las salidas alternativas. */}
          <button
            type="button"
            className="auth-btn-secundario"
            onClick={() => {
              recordarEscaneo(cuenta, true)
              setVista('codigo')
            }}
          >
            Ya lo escaneé, quiero escribir el código
          </button>
        </>
      ) : (
        <p className="auth-sub">
          Abrí tu app de autenticación y escribí el código de 6 dígitos de{' '}
          <strong>{cuenta}</strong>.
        </p>
      )}

      {vista === 'qr' && <p className="auth-sub">Ahora escribí el código de 6 dígitos que muestra la app:</p>}

      <CampoCodigo valor={codigo} onChange={setCodigo} onEnter={confirmar} deshabilitado={enviando} />

      {error && <p className="auth-error">{error}</p>}

      <Button disabled={codigo.length !== 6 || enviando} onClick={() => confirmar(codigo)}>
        {enviando ? 'Verificando…' : 'Confirmar'}
      </Button>

      {vista === 'codigo' && (
        <button type="button" className="auth-enlace" onClick={() => setVista('qr')}>
          Ver el código QR otra vez
        </button>
      )}

      {/* Salida para el caso feo: lo escaneó en el teléfono que no era, y ahora ningún
          código le va a funcionar nunca. Sin esto quedaría trabado sin entender por qué. */}
      <button type="button" className="auth-enlace" onClick={generarNuevo} disabled={enviando}>
        Generar un código QR nuevo
      </button>

      {/* Importante acá: enrolar el perfil equivocado ata el teléfono de uno al perfil de
          otro, y esa persona después no puede entrar. La salida tiene que estar a la vista
          ANTES de escanear, no después. */}
      {seleccion?.perfiles?.length > 1 && (
        <button type="button" className="auth-enlace" onClick={volverAPerfiles} disabled={enviando}>
          Este no soy yo, cambiar de perfil
        </button>
      )}
    </div>
  )
}

function descargarComoTxt(codigos) {
  const contenido =
    'Códigos de recuperación — Stagnari\n' +
    'Cada uno sirve UNA sola vez. Guardalos en un lugar seguro.\n\n' +
    codigos.join('\n') +
    '\n'
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'codigos-recuperacion-stagnari.txt'
  a.click()
  URL.revokeObjectURL(url)
}
