import { useEffect, useState } from 'react'
import { Dropdown } from '@vibe/core'
import { fetchMondayUsers } from '../services/mondayApi'

// Selector de "Asignado" (columna people deal_owner de la Oportunidad). Lo comparten el
// alta —donde arranca en quien la está creando— y el detalle, donde se puede reasignar.
//
// `value` y `onChange` trabajan con el id de monday de la persona (string), no con el
// objeto del Dropdown: así el resto de la app guarda y compara ids, que es lo que la
// columna people necesita para escribirse.
//
// Mientras la lista no llegó, un `value` ya puesto no encuentra su opción y el campo se ve
// vacío un instante: se completa solo apenas llegan los usuarios.
export default function AsignadoSelect({ value, onChange, disabled = false, size = 'small', className }) {
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelado = false
    fetchMondayUsers()
      .then((lista) => {
        if (!cancelado) setUsuarios(lista)
      })
      .catch((err) => {
        if (!cancelado) setError(err.message)
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  const opciones = usuarios.map((u) => ({ value: u.id, label: u.name }))
  const seleccionada = opciones.find((o) => o.value === String(value ?? '')) ?? null

  return (
    <Dropdown
      className={className}
      size={size}
      options={opciones}
      value={seleccionada}
      placeholder={error ? 'No se pudo cargar la lista' : 'Sin asignar'}
      loading={cargando}
      disabled={disabled || Boolean(error)}
      searchable
      clearable={false}
      onChange={(opcion) => onChange(opcion?.value ?? null)}
    />
  )
}
