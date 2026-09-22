import { useEffect, useState } from 'react'
import { MdPersonAddAlt, MdCheckCircle } from 'react-icons/md'
import { AttentionBox, Button, TextField } from '@vibe/core'
import {
  fetchClienteContactos,
  createContactoCrm,
  setMultipleColumnValues,
  OPORTUNIDAD_CONTACTO_CRM_COLUMN_ID,
} from '../services/mondayApi'
import { buildMondayEmail, countryShortNameFromDigits, emailError } from '../services/personaFields'
import './CrearContactoCard.css'

// Paso 4, oportunidad ya Concretada: rescate para las oportunidades ANTERIORES a MON-14,
// que nacieron sin Contacto (antes el teléfono y el email eran del Cliente). Se ofrece
// crear el contacto con los datos que ya tenemos y vincularlo al Cliente y a esta
// oportunidad.
//
// Las oportunidades nuevas ya nacen con su contacto (ver CrearOportunidadForm: el paso 1
// lo crea o lo reusa), así que para esas la tarjeta no aparece nunca.
export default function CrearContactoCard({ opportunity }) {
  const [state, setState] = useState('checking') // checking | offer | creating | done | dismissed | hidden
  const [existing, setExisting] = useState([])
  const [email, setEmail] = useState(opportunity.contactoEmail || '')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    // Ya tiene contacto propio: no hay nada que ofrecer.
    if (!opportunity.clienteId || opportunity.contactoId) {
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
  }, [opportunity.clienteId, opportunity.contactoId])

  if (state === 'checking' || state === 'hidden' || state === 'dismissed') return null

  const nombre = opportunity.clienteNombre || '—'
  const telefonoDigits = (opportunity.telefono || '').replace(/\D/g, '')
  const emailErr = emailError(email)

  const handleCreate = async () => {
    setState('creating')
    setError(null)
    try {
      const { id } = await createContactoCrm({
        name: nombre,
        phone: telefonoDigits
          ? { phone: telefonoDigits, countryShortName: countryShortNameFromDigits(telefonoDigits) }
          : null,
        email: email.trim() ? buildMondayEmail(email) : null,
        clienteId: opportunity.clienteId,
        existingContactIds: existing.map((c) => c.id),
      })
      // MON-14: además del Cliente, el contacto se vincula a ESTA oportunidad — es el
      // registro de a quién se le mandó la información. No bloqueante: si falla, el
      // contacto ya quedó creado y vinculado al Cliente, que es lo importante.
      try {
        await setMultipleColumnValues(opportunity.id, {
          [OPORTUNIDAD_CONTACTO_CRM_COLUMN_ID]: { item_ids: [Number(id)] },
        })
      } catch {
        // el vínculo con la oportunidad se puede poner a mano en monday
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
            {opportunity.clienteSituacion?.toLowerCase() === 'lead' ? ' lead' : ' cliente'} y a esta oportunidad.
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
