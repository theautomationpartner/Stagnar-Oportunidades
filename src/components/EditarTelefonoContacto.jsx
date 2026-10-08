// A pedido: desde "Enviar por WhatsApp" se puede corregir el teléfono del contacto al que
// se le manda (p. ej. el número cargado está mal y recién se nota acá). Va al tablero
// Contactos, no a este envío nada más: por eso arriba se aclara que se edita el CONTACTO.
// Mismas reglas que la ficha del contacto (ver ContactosSection): el formato según el país
// y que el número no sea de OTRO contacto (se compara por los últimos 8 dígitos, ver
// buscarContactosCrmLibre). Hasta no verificarlo no se deja guardar.
//   onGuardado(telefonoMonday) — con el número tal como quedó en monday ("59899…").
// A pedido: si el número ya es de OTRO contacto, en vez de quedar trabado se ofrece
// (opcional) usar ese contacto: sumarlo al cliente y ponerlo en la oportunidad
//   onUsarContacto(contactoRepetido) — la escritura la hace quien llama.
// `tieneCliente`: solo para el texto del botón (sin cliente, solo cambia en la oportunidad).
import { useEffect, useState } from 'react'
import { AttentionBox, Button, TextField } from '@vibe/core'
import { MdClear } from 'react-icons/md'
import { buscarContactosCrmLibre, updateContactoCrmFicha } from '../services/mondayApi'
import { buildMondayPhone, CODIGO_PAIS_OPTIONS, colaTelefono, ejemploTelefono, telefonoError } from '../services/personaFields'
import { RequiredDropdown, codigoPaisDropdownProps } from './crear/FormPrimitives'
import ConfirmarCambioModal from './ConfirmarCambioModal'
import './CrearOportunidadForm.css'


// "59899123456" → { codigoPais: '+598', numero: '099123456' } (el formato local de siempre).
function separarTelefono(digits) {
  const limpio = String(digits ?? '').replace(/\D/g, '')
  const codigos = [...CODIGO_PAIS_OPTIONS].sort((a, b) => b.value.length - a.value.length)
  const match = codigos.find((o) => limpio.startsWith(o.value.replace('+', '')))
  if (!match) return { codigoPais: '+598', numero: limpio }
  const resto = limpio.slice(match.value.replace('+', '').length)
  return { codigoPais: match.value, numero: match.value === '+598' && resto && !resto.startsWith('0') ? '0' + resto : resto }
}

export default function EditarTelefonoContacto({ contacto, tieneCliente, onGuardado, onUsarContacto, onCancelar }) {
  const inicial = separarTelefono(contacto.telefono)
  const [codigoPais, setCodigoPais] = useState(inicial.codigoPais)
  const [telefono, setTelefono] = useState(inicial.numero)
  const [chequeo, setChequeo] = useState('sin') // 'sin' | 'buscando' | 'libre' | 'duplicado'
  const [duplicado, setDuplicado] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const telErr = telefono.trim() ? telefonoError(telefono, codigoPais) : null
  const nuevo = telefono.trim() ? buildMondayPhone(codigoPais, telefono) : null
  const cambio = colaTelefono(nuevo?.phone) !== colaTelefono(contacto.telefono)

  useEffect(() => {
    if (!nuevo || telErr || !cambio) {
      setChequeo('sin')
      setDuplicado(null)
      return undefined
    }
    let cancelado = false
    setChequeo('buscando')
    const timer = setTimeout(() => {
      const cola = colaTelefono(telefono, codigoPais)
      buscarContactosCrmLibre(cola)
        .then((encontrados) => {
          if (cancelado) return
          const otro = encontrados.find((c) => String(c.id) !== String(contacto.id) && colaTelefono(c.telefono) === cola) ?? null
          setDuplicado(otro)
          setChequeo(otro ? 'duplicado' : 'libre')
        })
        // Si monday no responde no se traba la edición (mismo criterio que la ficha).
        .catch(() => !cancelado && setChequeo('libre'))
    }, 500)
    return () => {
      cancelado = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telefono, codigoPais, telErr, cambio, contacto.id])

  const puedeGuardar = Boolean(nuevo) && !telErr && cambio && chequeo === 'libre' && !guardando

  const usarRepetido = async () => {
    setGuardando(true)
    setError(null)
    try {
      await onUsarContacto(duplicado)
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  // A pedido: antes de escribir en el contacto se confirma (ver ConfirmarCambioModal).
  const [confirmando, setConfirmando] = useState(false)

  const guardar = async () => {
    setConfirmando(false)
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)
    try {
      await updateContactoCrmFicha(contacto.id, { phone: nuevo })
      onGuardado(nuevo.phone)
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  return (
    <div className="wa-modal__editar-telefono">
      <AttentionBox type="warning" title="Vas a editar el teléfono del contacto">
        El número nuevo se guarda en la ficha de <strong>{contacto.name}</strong> (tablero Contactos), no solo para
        este envío: se va a usar en todas las oportunidades donde esté este contacto.
      </AttentionBox>
      {error && (
        <p className="crear-op__error" role="alert">
          Error: {error}
        </p>
      )}
      <div className="crear-op__phone">
        <div className="crear-op__phone-code">
          <RequiredDropdown
            size="medium"
            options={CODIGO_PAIS_OPTIONS}
            value={CODIGO_PAIS_OPTIONS.find((o) => o.value === codigoPais) ?? null}
            {...codigoPaisDropdownProps}
            onChange={(o) => setCodigoPais(o?.value ?? '')}
          />
        </div>
        <TextField
          size="medium"
          wrapperClassName="crear-op__phone-number"
          placeholder={ejemploTelefono(codigoPais)}
          value={telefono}
          onChange={setTelefono}
          icon={MdClear}
          onIconClick={() => setTelefono('')}
          validation={telErr || chequeo === 'duplicado' ? { status: 'error' } : chequeo === 'libre' ? { status: 'success' } : undefined}
        />
      </div>
      {telErr && (
        <span className="crear-op__field-error" role="alert">
          {telErr}
        </span>
      )}
      {chequeo === 'buscando' && <span className="crear-op__section-hint">Verificando que ningún otro contacto tenga ese teléfono…</span>}
      {chequeo === 'duplicado' && duplicado && (
        <>
          <span className="crear-op__field-error" role="alert">
            Ese teléfono ya es del contacto {duplicado.name}
            {duplicado.clienteNombre ? ` (cliente: ${duplicado.clienteNombre})` : ''}.
          </span>
          {onUsarContacto && (
            <div className="wa-modal__editar-telefono-repetido">
              <span className="crear-op__section-hint">
                Si es la misma persona, podés usar ese contacto: no se modifica ningún teléfono y
                {contacto.name ? ` ${contacto.name}` : ' el contacto actual'} sigue en Contactos.
              </span>
              <Button kind="secondary" size="small" onClick={usarRepetido} disabled={guardando} loading={guardando}>
                {tieneCliente
                  ? 'Agregar ese contacto al cliente y usarlo en esta oportunidad'
                  : 'Usar ese contacto en esta oportunidad'}
              </Button>
            </div>
          )}
        </>
      )}
      <div className="wa-modal__editar-telefono-acciones">
        <Button kind="tertiary" size="small" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button kind="primary" size="small" onClick={() => setConfirmando(true)} disabled={!puedeGuardar} loading={guardando}>
          Guardar en el contacto
        </Button>
      </div>
      {confirmando && (
        <ConfirmarCambioModal entidad="contacto" nombre={contacto.name} onCancelar={() => setConfirmando(false)} onConfirmar={guardar} />
      )}
    </div>
  )
}
