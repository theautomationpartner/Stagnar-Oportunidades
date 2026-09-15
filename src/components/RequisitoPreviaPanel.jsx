import { useEffect, useState } from 'react'
import { Button, Loader, TextField } from '@vibe/core'
import {
  MdHourglassTop,
  MdOutlineChecklist,
  MdOutlineContentPasteSearch,
  MdOutlineEditCalendar,
  MdOutlineTaskAlt,
  MdOutlineVerifiedUser,
} from 'react-icons/md'
import StepFooter from './StepFooter'
import FileUploadField from './FileUploadField'
import './RequisitoPreviaPanel.css'

function fechaMasDias(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const hoyISO = () => fechaMasDias(0)

// "YYYY-MM-DD" + n días, en local (mismo cuidado con UTC que formatearFecha).
function sumarDias(iso, dias) {
  const [y, m, d] = String(iso ?? '').split('-').map(Number)
  if (!y || !m || !d) return fechaMasDias(dias)
  const f = new Date(y, m - 1, d)
  f.setDate(f.getDate() + dias)
  const mm = String(f.getMonth() + 1).padStart(2, '0')
  const dd = String(f.getDate()).padStart(2, '0')
  return `${f.getFullYear()}-${mm}-${dd}`
}

// "YYYY-MM-DD" → "jueves 18/9/2026", parseado como fecha LOCAL (new Date('YYYY-MM-DD')
// interpreta UTC y entre las 21 y las 24 hora Uruguay caería un día atrás).
function formatearFecha(iso) {
  const [y, m, d] = String(iso ?? '').split('-').map(Number)
  if (!y || !m || !d) return iso || '—'
  return new Date(y, m - 1, d).toLocaleDateString('es-UY', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
}

// Días de atraso de una fecha (positivo = ya pasó). Comparación a medianoche local.
function diasDeAtraso(iso) {
  const [y, m, d] = String(iso ?? '').split('-').map(Number)
  if (!y || !m || !d) return 0
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.round((hoy - new Date(y, m - 1, d)) / 86400000)
}

// Las dos piden fecha, pero con defaults distintos: la Inspección es una visita que
// normalmente se agenda para hoy/pronto; la Autorización depende de que la compañía
// responda, así que el default arranca 2 días adelante.
const FECHA_DEFAULT = { Inspección: () => hoyISO(), Autorización: () => fechaMasDias(2) }
const FECHA_LABEL = {
  Inspección: '¿Cuándo es la visita?',
  Autorización: '¿Para cuándo esperás la autorización?',
}

// Cada opción dice QUÉ va a pasar al confirmarla — antes era solo el título y había que
// adivinar que "requiere inspección" creaba una actividad y frenaba la póliza. 'ambos'
// (a pedido): puede requerirse Inspección Y Autorización, siempre en ese orden — se
// marcan juntas desde el inicio y, al completar la inspección, pasa directo a esperar la
// autorización sin volver por acá.
const OPCIONES = [
  {
    value: 'ninguno',
    label: 'No hace falta ningún paso previo',
    desc: 'Pasás directo a cargar la póliza.',
    Icono: MdOutlineTaskAlt,
  },
  {
    value: 'Inspección',
    label: 'Requiere inspección del vehículo',
    desc: 'Se agenda la visita como actividad y la póliza queda en espera hasta completarla.',
    Icono: MdOutlineContentPasteSearch,
  },
  {
    value: 'Autorización',
    label: 'Requiere autorización de la compañía',
    desc: 'Se registra el pedido como actividad y la póliza queda en espera hasta la respuesta.',
    Icono: MdOutlineVerifiedUser,
  },
  {
    value: 'ambos',
    label: 'Requiere inspección y luego autorización',
    desc: 'Se agendan las dos actividades: primero la visita y, al completarla, queda esperando la autorización.',
    Icono: MdOutlineChecklist,
  },
]

// El chip de estado de la actividad, con el tinte semántico que le corresponde.
const ESTADO_CHIP = {
  Pendiente: 'warning',
  'En Proceso': 'info',
  Completado: 'success',
  Vencido: 'danger',
}

// Paso previo a cargar la póliza (dentro de "Emitir"). Dos pantallas:
// - Selector: marcar una de las 3 opciones y confirmar — no dispara nada hasta
//   confirmar. Sirve tanto para la primera elección como para cambiarla: si ya había una
//   actividad de Inspección/Autorización pendiente, confirmar la EDITA en vez de
//   borrarla y crear una nueva.
// - Espera: mientras la actividad elegida sigue pendiente, con la tarjeta de la
//   actividad (estado, fecha, asignado, archivo/link opcionales).
//
// Navegación (a pedido, la versión anterior no convencía): "Volver" del footer siempre
// baja UN nivel — en la espera va al paso Confirmar; en el selector, si se entró desde
// la espera con "Cambiar", vuelve a la espera sin tocar nada. Y re-elegir ya no es un
// segundo botón "Volver a elegir" en el footer (dos "Volver" juntos se confundían): es
// el botón "Cambiar" arriba, en la propia tarjeta de la actividad que se va a cambiar.
//
// Nunca se vuelve a ofrecer Inspección después de completada una vez (ver
// inspeccionCompletada) — a pedido, puede venir Inspección y después Autorización, pero
// nunca al revés.
export default function RequisitoPreviaPanel({
  estadoLabel,
  actividades,
  loadingActividades,
  busy,
  error,
  onConfirmar,
  onMarcarCompletada,
  onBack,
  // Archivo/Link opcionales de la actividad (ej. el informe de la inspección, o el link
  // al trámite de la compañía) — ver el comentario de Inspecciones en el pedido
  // original: "existen campos opcionales de adjuntar archivo y link (no obligatorios)".
  onUploadArchivo,
  archivoUploading,
  archivoError,
  onGuardarLink,
  linkSaving,
  linkError,
}) {
  const inspeccionCompletada = actividades.some((a) => a.tipo === 'Inspección' && a.estado === 'Completado')
  const bloqueada =
    estadoLabel === 'Ganada - Requiere Inspección' || estadoLabel === 'Ganada - Requiere Autorización'
  const tipoBloqueo = estadoLabel === 'Ganada - Requiere Inspección' ? 'Inspección' : 'Autorización'
  const pendienteDe = (tipo) => actividades.find((a) => a.tipo === tipo && a.estado !== 'Completado')
  const actividadPendiente = bloqueada ? pendienteDe(tipoBloqueo) : null
  // Con 'ambos' marcado, mientras se espera la Inspección ya existe la Autorización
  // pendiente: la espera lo muestra como "después sigue..." para que se sepa que
  // completar la visita no libera la póliza todavía.
  const actividadSiguiente = bloqueada && tipoBloqueo === 'Inspección' ? pendienteDe('Autorización') : null

  // "Cambiar" desde la pantalla de espera: navegación local nomás, no cambia nada en
  // monday hasta que se confirme una opción. Se resetea sola cuando el estado real
  // cambia (confirmación exitosa), para no quedar mostrando el selector viejo.
  const [verSelector, setVerSelector] = useState(false)
  useEffect(() => {
    setVerSelector(false)
  }, [estadoLabel])
  const mostrarSelector = !bloqueada || verSelector
  // ¿El selector se abrió desde la espera? Cambia el destino de "Volver" (a la espera,
  // no al paso Confirmar) y el texto del botón de confirmación.
  const cambiando = bloqueada && verSelector

  const [opcion, setOpcion] = useState('ninguno')
  // `fecha` es la de la opción elegida (la visita, o la autorización sola); con 'ambos',
  // `fecha` es la visita y `fechaAut` cuándo se espera la autorización.
  const [fecha, setFecha] = useState(hoyISO())
  const [fechaAut, setFechaAut] = useState(fechaMasDias(2))
  // Al ENTRAR al selector (primera vez, o "Cambiar"), precarga lo que ya había elegido —
  // no en cada click, por eso la dependencia es solo `mostrarSelector`. Si están las dos
  // actividades pendientes, lo elegido era 'ambos'.
  useEffect(() => {
    if (!mostrarSelector) return
    const inspPend = pendienteDe('Inspección')
    const autPend = pendienteDe('Autorización')
    const tipoInicial = !bloqueada ? 'ninguno' : inspPend && autPend ? 'ambos' : tipoBloqueo
    setOpcion(tipoInicial)
    if (tipoInicial === 'ambos') {
      setFecha(inspPend.fecha || FECHA_DEFAULT['Inspección']())
      setFechaAut(autPend.fecha || sumarDias(inspPend.fecha || hoyISO(), 2))
    } else if (tipoInicial !== 'ninguno') {
      setFecha(actividadPendiente?.fecha || FECHA_DEFAULT[tipoInicial]())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarSelector])

  // Al marcar una opción distinta: si ya había una actividad pendiente de ESE tipo (venía
  // de "Cambiar" y tocó una que ya estaba), se mantiene su fecha; si no, el default de
  // ese tipo (hoy para Inspección, +2 días para Autorización — con 'ambos', la
  // autorización arranca 2 días después de la visita: la respuesta viene después).
  const handleElegirOpcion = (value) => {
    setOpcion(value)
    if (value === 'Inspección' || value === 'Autorización') {
      const pendiente = pendienteDe(value)
      setFecha(pendiente?.fecha || FECHA_DEFAULT[value]())
    } else if (value === 'ambos') {
      const visita = pendienteDe('Inspección')?.fecha || FECHA_DEFAULT['Inspección']()
      setFecha(visita)
      setFechaAut(pendienteDe('Autorización')?.fecha || sumarDias(visita, 2))
    }
  }

  // Con 'ambos', si mueven la visita para después de la autorización esperada, la
  // autorización se corre sola (+2 días desde la visita): la respuesta nunca puede
  // esperarse ANTES de la inspección.
  const handleCambiarVisita = (nueva) => {
    setFecha(nueva)
    if (opcion === 'ambos' && nueva && fechaAut < nueva) setFechaAut(sumarDias(nueva, 2))
  }

  // Borrador del link: se resetea cada vez que cambia la actividad pendiente (o su link
  // ya guardado), para no arrastrar lo que se estaba tipeando de una actividad anterior.
  const [linkDraft, setLinkDraft] = useState(actividadPendiente?.link || '')
  useEffect(() => {
    setLinkDraft(actividadPendiente?.link || '')
  }, [actividadPendiente?.id, actividadPendiente?.link])

  if (loadingActividades) {
    return (
      <div className="requisito-previa requisito-previa--loading">
        <Loader size={32} />
      </div>
    )
  }

  // Mientras hay una confirmación/completada en curso: crear/editar/borrar la actividad
  // y actualizar Estado Oportunidad son 2-3 llamadas asincrónicas seguidas (ver
  // handleConfirmarRequisito en OpportunityDetail.jsx) — hasta que todas terminan, las
  // props de acá (estadoLabel/actividades) siguen siendo las VIEJAS. Sin este corte, por
  // ejemplo al confirmar "ninguno" con una actividad ya creada, se veía por un instante la
  // pantalla de espera de la actividad que se está borrando, antes de que el borrado
  // termine y recién ahí desaparezca.
  if (busy) {
    return (
      <div className="requisito-previa requisito-previa--loading">
        <Loader size={32} />
        <p className="requisito-previa__subtitle">Guardando…</p>
      </div>
    )
  }

  if (mostrarSelector) {
    const handleContinuar = () => {
      setVerSelector(false) // por si el estado real no cambia (reelegir lo mismo)
      onConfirmar(opcion, opcion === 'ninguno' ? undefined : fecha, opcion === 'ambos' ? fechaAut : undefined)
    }
    const faltaFecha = (opcion !== 'ninguno' && !fecha) || (opcion === 'ambos' && !fechaAut)
    // La autorización nunca puede esperarse ANTES de la visita (mismo día sí: inspección a
    // la mañana, respuesta a la tarde). El `min` del input frena el calendario, y el
    // corrimiento automático cubre mover la visita — esto cubre lo que quede: una fecha
    // tipeada a mano. Comparación de strings ISO: en YYYY-MM-DD el orden alfabético ES el
    // cronológico.
    const ordenInvalido = opcion === 'ambos' && Boolean(fecha) && Boolean(fechaAut) && fechaAut < fecha

    return (
      <div className="requisito-previa">
        <h2 className="requisito-previa__title">
          {cambiando ? 'Cambiar el paso previo' : '¿Este caso requiere algún paso previo antes de cargar la póliza?'}
        </h2>
        <p className="requisito-previa__subtitle">
          {cambiando
            ? 'Nada cambia hasta que confirmes — con «Volver» la elección queda como estaba.'
            : 'Marcá una opción. Si hace falta, se crea la actividad correspondiente y la póliza queda en espera hasta completarla.'}
        </p>

        <div className="requisito-previa__opciones-lista" role="radiogroup" aria-label="Paso previo requerido">
          {OPCIONES.map((o) => {
            // Con la inspección ya completada no se vuelve a ofrecer nada que la incluya.
            if ((o.value === 'Inspección' || o.value === 'ambos') && inspeccionCompletada) return null
            const seleccionada = opcion === o.value
            return (
              <div key={o.value} className="requisito-previa__opcion">
                <button
                  type="button"
                  role="radio"
                  aria-checked={seleccionada}
                  className={
                    seleccionada
                      ? 'requisito-previa__opcion-btn requisito-previa__opcion-btn--activa'
                      : 'requisito-previa__opcion-btn'
                  }
                  onClick={() => handleElegirOpcion(o.value)}
                >
                  <span className="requisito-previa__opcion-dot" aria-hidden="true" />
                  <span className="requisito-previa__opcion-icono" aria-hidden="true">
                    <o.Icono />
                  </span>
                  <span className="requisito-previa__opcion-cuerpo">
                    <span className="requisito-previa__opcion-label">{o.label}</span>
                    <span className="requisito-previa__opcion-desc">{o.desc}</span>
                  </span>
                </button>
                {seleccionada && FECHA_LABEL[o.value] && (
                  <div className="requisito-previa__opcion-fecha">
                    <label htmlFor="requisito-fecha">{FECHA_LABEL[o.value]}</label>
                    <input
                      id="requisito-fecha"
                      type="date"
                      className="requisito-previa__fecha-input"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                    />
                  </div>
                )}
                {seleccionada && o.value === 'ambos' && (
                  <>
                    <div className="requisito-previa__opcion-fecha">
                      <label htmlFor="requisito-fecha">{FECHA_LABEL['Inspección']}</label>
                      <input
                        id="requisito-fecha"
                        type="date"
                        className="requisito-previa__fecha-input"
                        value={fecha}
                        onChange={(e) => handleCambiarVisita(e.target.value)}
                      />
                    </div>
                    <div className="requisito-previa__opcion-fecha">
                      <label htmlFor="requisito-fecha-aut">{FECHA_LABEL['Autorización']}</label>
                      <input
                        id="requisito-fecha-aut"
                        type="date"
                        className="requisito-previa__fecha-input"
                        min={fecha || undefined}
                        value={fechaAut}
                        aria-invalid={ordenInvalido || undefined}
                        onChange={(e) => setFechaAut(e.target.value)}
                      />
                    </div>
                    {ordenInvalido && (
                      <p className="requisito-previa__error requisito-previa__error--fecha" role="alert">
                        La autorización tiene que ser el día de la visita o después.
                      </p>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {error && (
          <p className="requisito-previa__error" role="alert">
            Error: {error}
          </p>
        )}

        {/* "Volver" baja un nivel: si se entró con "Cambiar" vuelve a la espera (sin
            tocar nada); en la primera elección vuelve al paso Confirmar, como siempre. */}
        <StepFooter onBack={cambiando ? () => setVerSelector(false) : onBack}>
          <Button kind="primary" onClick={handleContinuar} disabled={faltaFecha || ordenInvalido}>
            {cambiando ? 'Confirmar cambio' : 'Continuar'}
          </Button>
        </StepFooter>
      </div>
    )
  }

  const atraso = actividadPendiente ? diasDeAtraso(actividadPendiente.fecha) : 0
  const vencida = atraso > 0 && actividadPendiente?.estado !== 'Completado'

  return (
    <div className="requisito-previa">
      <div className="requisito-previa__espera-head">
        <span className="requisito-previa__espera-icono" aria-hidden="true">
          <MdHourglassTop />
        </span>
        <div>
          <h2 className="requisito-previa__title">
            Esperando {tipoBloqueo === 'Inspección' ? 'la inspección del vehículo' : 'la autorización de la compañía'}
          </h2>
          <p className="requisito-previa__subtitle">
            La póliza queda en espera hasta que se complete este trámite. Cuando esté, marcala como completada acá
            abajo.
          </p>
        </div>
      </div>

      {actividadPendiente && (
        <div className="requisito-previa__card">
          <div className="requisito-previa__card-head">
            <div className="requisito-previa__card-datos">
              <div className="requisito-previa__card-title-row">
                <p className="requisito-previa__card-title">{actividadPendiente.nombre}</p>
                <span
                  className={`requisito-previa__chip requisito-previa__chip--${ESTADO_CHIP[vencida ? 'Vencido' : actividadPendiente.estado] ?? 'info'}`}
                >
                  {vencida ? 'Vencida' : actividadPendiente.estado || 'Pendiente'}
                </span>
              </div>
              <p className="requisito-previa__card-fecha">
                Programada para el {formatearFecha(actividadPendiente.fecha)}
                {vencida && (
                  <span className="requisito-previa__vencida">
                    {' '}
                    — venció hace {atraso} {atraso === 1 ? 'día' : 'días'}
                  </span>
                )}
              </p>
              {(actividadPendiente.asignado || actividadPendiente.medio) && (
                <p className="requisito-previa__card-meta">
                  {[
                    actividadPendiente.asignado && `Asignada a ${actividadPendiente.asignado}`,
                    actividadPendiente.medio,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {actividadSiguiente && (
                <p className="requisito-previa__card-siguiente">
                  Después sigue la <strong>autorización de la compañía</strong> (esperada para el{' '}
                  {formatearFecha(actividadSiguiente.fecha)}) — completar la inspección todavía no libera la póliza.
                </p>
              )}
            </div>
            {/* A pedido: re-elegir vive ACÁ, pegado a lo que cambia — no como un segundo
                "Volver..." en el footer. Solo abre el selector; no toca monday. */}
            <button type="button" className="requisito-previa__cambiar" onClick={() => setVerSelector(true)}>
              <MdOutlineEditCalendar aria-hidden="true" /> Cambiar
            </button>
          </div>

          <div className="requisito-previa__extras">
            <FileUploadField
              label="Archivo (opcional)"
              required={false}
              fileName={actividadPendiente.archivo}
              uploading={archivoUploading}
              error={archivoError}
              missingMessage="Sin archivo adjunto"
              onUpload={(file) => onUploadArchivo(actividadPendiente.id, file)}
              showReplaceButton
              compactDelete
            />

            <div className="requisito-previa__link">
              <label className="requisito-previa__link-label">Link (opcional)</label>
              <div className="requisito-previa__link-row">
                <TextField size="small" placeholder="https://..." value={linkDraft} onChange={setLinkDraft} />
                <Button
                  kind="secondary"
                  size="small"
                  onClick={() => onGuardarLink(actividadPendiente.id, linkDraft.trim())}
                  disabled={linkSaving || linkDraft.trim() === (actividadPendiente.link || '')}
                >
                  {linkSaving ? 'Guardando...' : 'Guardar link'}
                </Button>
              </div>
              {linkError && (
                <p className="requisito-previa__error" role="alert">
                  Error: {linkError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="requisito-previa__error" role="alert">
          Error: {error}
        </p>
      )}

      <StepFooter onBack={onBack}>
        <Button kind="primary" onClick={() => onMarcarCompletada(actividadPendiente)} disabled={!actividadPendiente}>
          Marcar como completada
        </Button>
      </StepFooter>
    </div>
  )
}
