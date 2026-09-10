import { useEffect, useRef } from 'react'

// El campo de los 6 dígitos. Un input, no seis cajitas separadas.
//
// Las seis cajitas se ven mejor en una maqueta y son peores en la mano: rompen el
// autocompletado del gestor de contraseñas, rompen el "pegar" (el portapapeles trae los 6
// dígitos juntos y hay que repartirlos a mano), y en el iPhone el teclado se cierra entre
// caja y caja. Un solo input con inputMode numérico y autocomplete one-time-code deja que
// iOS y Android ofrezcan el código directamente arriba del teclado.

export default function CampoCodigo({ valor, onChange, onEnter, deshabilitado, autoFocus = true }) {
  const ref = useRef(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  return (
    <input
      ref={ref}
      className="auth-codigo"
      type="text"
      inputMode="numeric"
      // Lo que hace que el celular ofrezca el código sin que el usuario lo tipee.
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      placeholder="000000"
      value={valor}
      disabled={deshabilitado}
      aria-label="Código de 6 dígitos"
      onChange={(e) => {
        const limpio = e.target.value.replace(/\D/g, '').slice(0, 6)
        onChange(limpio)
        // Se envía solo al llegar a 6. Es un código de largo fijo: obligar a apretar un
        // botón después de tipear el último dígito es un paso que no aporta nada.
        if (limpio.length === 6) onEnter?.(limpio)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && valor.length === 6) onEnter?.(valor)
      }}
    />
  )
}
