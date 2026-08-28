import { useEffect, useState } from 'react'
import { MdPersonAddAlt, MdCheckCircle } from 'react-icons/md'
import { AttentionBox, Button, TextField } from '@vibe/core'
import { fetchClienteContactos, createContactoCrm, setContactoColumnValues, CONTACTO_EMAIL_COLUMN_ID } from '../services/mondayApi'
import { buildMondayEmail, countryShortNameFromDigits, emailError } from '../services/personaFields'
import './CrearContactoCard.css'

// Paso 4, oportunidad ya Concretada (a pedido): si el Cliente/Lead vinculado todavía no
// tiene ningún contacto en el tablero Contactos, se ofrece crearlo con los datos que ya
// tenemos (nombre, teléfono) y la posibilidad de cargar/corregir el email acá mismo, y
// se vincula al Cliente. Si ya tiene contactos, no se muestra nada.
export default function CrearContactoCard({ opportunity }) {
  const [state, setState] = useState('checking') // checking | offer | creating | done | dismissed | hidden
  const [existing, setExisting] = useState([])
  const [email, setEmail] = useState(opportunity.clienteEmail || '')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!opportunity.clienteId) {
      setState('hidden')
      return undefined
    }
    fetchClienteContactos(opportunity.clienteId)
      .then((contactos) => {
        if (cancelled) return
        setExisting(contactos)
        setState(contactos.length > 0 ? 'hidden' : 'offer')
      })
      .catch(() => {
        // Si no se pudo consultar, mejor no ofrecer (evita duplicar un contacto).
        if (!cancelled) setState('hidden')
      })
    return () => {
      cancelled = true
    }
  }, [opportunity.clienteId])

  useEffect(() => {
    if (opportunity.clienteEmail && !email) setEmail(opportunity.clienteEmail)
  }, [opportunity.clienteEmail])

  if (state === 'checking' || state === 'hidden' || state === 'dismissed') return null

  const nombre = opportunity.clienteNombre || '—'
  const telefonoDigits = (opportunity.telefono || '').replace(/\D/g, '')
  const emailErr = emailError(email)

  const handleCreate = async () => {
    setState('creating')
    setError(null)
    try {
      await createContactoCrm({
        name: nombre,
        phone: telefonoDigits
          ? { phone: telefonoDigits, countryShortName: countryShortNameFromDigits(telefonoDigits) }
          : null,
        email: email.trim() ? buildMondayEmail(email) : null,
        clienteId: opportunity.clienteId,
        existingContactIds: existing.map((c) => c.id),
      })
      // Si el email se cargó acá y el Cliente/Lead no tenía, se guarda también en su ficha.
      if (email.trim() && !opportunity.clienteEmail) {
        try {
          await setContactoColumnValues(opportunity.clienteId, { [CONTACTO_EMAIL_COLUMN_ID]: buildMondayEmail(email) })
        } catch {
          // El contacto ya quedó creado y vinculado; el email en la ficha es un extra.
        }
      }
      setState('done')
    } catch (err) {
      setError(err.message)
      setState('offer')
    }
  }

  if (state === 'done') {
    return (
      <AttentionBox type="positive" className="crear-contacto__done">
        <MdCheckCircle /> Contacto creado y vinculado a <strong>{nombre}</strong>.
      </AttentionBox>
    )
  }

  return (
    <div className="crear-contacto">
      <div className="crear-contacto__head">
        <span className="crear-contacto__icon">
          <MdPersonAddAlt />
        </span>
        <div>
          <h3 className="crear-contacto__title">¿Querés crear un contacto para {nombre}?</h3>
          <p className="crear-contacto__subtitle">
            Todavía no tiene ninguno en el tablero Contactos. Se crea con estos datos y queda vinculado al
            {opportunity.clienteSituacion?.toLowerCase() === 'lead' ? ' lead' : ' cliente'}.
          </p>
        </div>
      </div>

      <dl className="crear-contacto__data">
        <div>
          <dt>Nombre</dt>
          <dd>{nombre}</dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{telefonoDigits || '—'}</dd>
        </div>
        <div className="crear-contacto__email">
          <dt>Email</dt>
          <dd>
            <TextField
              size="small"
              type="email"
              placeholder="nombre@dominio.com (opcional)"
              value={email}
              onChange={setEmail}
              validation={emailErr ? { status: 'error' } : email.trim() ? { status: 'success' } : undefined}
            />
            {emailErr && (
              <span className="crear-contacto__error" role="alert">
                {emailErr}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {error && (
        <p className="crear-contacto__error" role="alert">
          No se pudo crear el contacto: {error}
        </p>
      )}

      <div className="crear-contacto__actions">
        <Button kind="tertiary" onClick={() => setState('dismissed')} disabled={state === 'creating'}>
          Ahora no
        </Button>
        <Button kind="primary" onClick={handleCreate} loading={state === 'creating'} disabled={Boolean(emailErr) || state === 'creating'}>
          <MdPersonAddAlt /> Crear contacto
        </Button>
      </div>
    </div>
  )
}
