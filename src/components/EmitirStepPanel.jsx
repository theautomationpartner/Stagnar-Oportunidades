import { useEffect, useState } from 'react'
import { MdCheckCircle, MdHome } from 'react-icons/md'
import { AttentionBox, Button, Modal, ModalContent } from '@vibe/core'
import { formatMoney } from '../services/format'
import { accentForCompania } from '../services/companyColors'
import { fetchFileColumnAsFile } from '../services/mondayApi'
import FileUploadField from './FileUploadField'
import StepFooter from './StepFooter'
import StatusBadge from './StatusBadge'
import GradientSpinner from './GradientSpinner'
import ErrorDetailBox from './ErrorDetailBox'
import AlertModal from './AlertModal'
import ClientFicha from './ClientFicha'
import './EmitirStepPanel.css'

// Resumen final de todos los datos con los que se cerró la oportunidad: cliente, bien
// asegurado y la propuesta que quedó elegida en el paso 3 — última revisión antes de
// cargar la póliza. No repite el checklist "falta/no falta" del paso 3 (ya se validó
// ahí); acá se listan los valores tal cual quedaron.
const CLIENTE_FIELDS = [
  { key: 'clienteNombre', label: 'Cliente' },
  { key: 'ci', label: 'CI' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'fechaNacimiento', label: 'Fecha de nacimiento' },
  { key: 'departamento', label: 'Departamento' },
]

const BIEN_FIELDS = [
  { key: 'marca', label: 'Marca' },
  { key: 'modelo', label: 'Modelo' },
  { key: 'anio', label: 'Año' },
  { key: 'combustible', label: 'Combustible' },
  { key: 'uso', label: 'Uso' },
]

// A pedido: chequeo explícito acá (paso 4), no solo confiar en el gate del paso 3
// (ConfirmarStepPanel) — cubre el caso de volver atrás y borrar un dato después de
// haber confirmado, o entrar directo a este paso en una oportunidad vieja. Mismos
// campos que ya se muestran en "Resumen final" (CLIENTE_FIELDS/BIEN_FIELDS) + los 2
// documentos del asegurado (Cédula/Libreta, ver `opportunity.cedula`/
// `.libretaConducir` — mismos nombres que usa ConfirmarStepPanel). "Propuesta elegida"
// queda afuera a propósito — este paso ya deja explícito que se puede cargar la póliza
// sin una elegida (ver el aviso más abajo, "Todavía no se eligió..."), no hace falta
// bloquear algo que el resto de la pantalla dice que es opcional.
const DOCS_FIELDS = [
  { key: 'libretaConducir', label: 'Libreta de Conducir / Carta Automóvil' },
  { key: 'cedula', label: 'Cédula de Identidad' },
]

function getMissingLabels(opportunity) {
  return [...CLIENTE_FIELDS, ...BIEN_FIELDS, ...DOCS_FIELDS]
    .filter((f) => !opportunity[f.key])
    .map((f) => f.label)
}

export default function EmitirStepPanel({
  opportunity,
  groups,
  concretada,
  polizaFileName,
  uploading,
  deleting,
  error,
  onUploadPoliza,
  onDeletePoliza,
  estadoCreacion,
  estadoCreacionColor,
  polling,
  errorDetail,
  onConfirmarEmision,
  confirmandoEmision,
  confirmarEmisionError,
  onBack,
  onGoHome,
}) {
  const elegida = groups.flatMap((g) => g.entries).find((e) => e.raw.propuestaElegida)
  const accent = elegida ? accentForCompania(elegida.raw.compania) : null
  // A pedido, estética tipo mockup: mientras no esté "Creada" (la automatización de
  // creación de póliza, ver handleConfirmarEmision en OpportunityDetail.jsx, todavía
  // corriendo o sin arrancar) se muestra el botón "Concretar Oportunidad" + la cruz para
  // sacar el archivo si se subió el que no era; una vez "Creada" ya no hace sentido
  // ninguna de las 2 acciones, se deja solo la fila en verde como constancia.
  const polizaSubida = Boolean(polizaFileName)
  const polizaBusy = uploading || deleting
  const showConfirmarAction = polizaSubida && !polizaBusy && estadoCreacion !== 'Creada'

  // A pedido: cerrar el popup de "Creando póliza..." es solo visual, no corta el
  // polling de fondo — mismo criterio que CotizandoModal (ver su comentario). Se
  // resetea a "no cerrado" cada vez que arranca un polling nuevo (ej. reintentar tras
  // un Error), para que no quede escondido para siempre después del primer cierre.
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (polling) setDismissed(false)
  }, [polling])

  // A pedido: chequeo antes de subir la Póliza y antes de "Concretar Oportunidad" (ver
  // getMissingLabels más arriba) — si falta algo, se avisa con el mismo popup
  // compartido que el resto de la app (AlertModal) en vez de dejar pasar con datos a
  // medias.
  const [validationError, setValidationError] = useState(null)

  const handleUploadAttempt = (file) => {
    const missing = getMissingLabels(opportunity)
    if (missing.length > 0) {
      setValidationError(missing)
      return
    }
    onUploadPoliza(file)
  }

  const handleConcretarAttempt = () => {
    const missing = getMissingLabels(opportunity)
    if (missing.length > 0) {
      setValidationError(missing)
      return
    }
    onConfirmarEmision()
  }

  return (
    <div className="emitir-step">
      {concretada && (
        <AttentionBox type="positive">
          Póliza cargada — la oportunidad se marcó como <strong>Concretada</strong>.
        </AttentionBox>
      )}

      <div className="emitir-step__section">
        <h2 className="emitir-step__title">Resumen final</h2>
        <p className="emitir-step__subtitle">
          Última revisión de los datos antes de cargar la póliza.
        </p>

        {/* A pedido: misma ficha del cliente que el resto de los pasos (ver
            ClientFicha.jsx) en vez de la grilla de campos Cliente/Bien asegurado — sin
            `onEdit`, así no aparece el link "Editar" (acá es último repaso antes de
            cargar la póliza, no un lugar para tocar datos). La propuesta elegida va
            adentro de esta misma tarjeta (children), no en una sección aparte — antes
            se repetía la info personal/del vehículo (esta ficha + la de arriba de todo
            en OpportunityDetail.jsx, que ahora se esconde en este paso, ver
            OpportunityDetail.jsx). */}
        <ClientFicha opportunity={opportunity}>
          {elegida && !elegida.quote.blocked && (
            <div className="emitir-step__chosen-in-ficha">
              {/* A pedido, estética tipo mockup: la compañía/cobertura elegida como una
                  sola insignia (antes: encabezado propio adentro de la tarjeta) al lado
                  del título de la sección, y los montos en una tabla de verdad (antes:
                  grilla de cajitas sueltas) con "Total final" resaltado en verde. */}
              <div className="emitir-step__subtitle-label emitir-step__chosen-label">
                Propuesta elegida:{' '}
                <span
                  className="emitir-step__chosen-badge"
                  style={{ color: accent, borderColor: accent }}
                >
                  {elegida.raw.compania} {elegida.raw.cobertura || elegida.raw.name}
                </span>
              </div>
              <div className="emitir-step__chosen-table-wrap">
                <table className="emitir-step__chosen-table">
                  <thead>
                    <tr>
                      <th>Deducible</th>
                      <th>3 cuotas</th>
                      <th>6 cuotas</th>
                      <th>8 cuotas</th>
                      <th>10 cuotas</th>
                      <th className="emitir-step__chosen-table-total">Total final</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{elegida.quote.deducibleDisplay}</td>
                      <td>{formatMoney(elegida.quote.cuotas[3].valor)}</td>
                      <td>{formatMoney(elegida.quote.cuotas[6].valor)}</td>
                      <td>{formatMoney(elegida.quote.cuotas[8].valor)}</td>
                      <td>{formatMoney(elegida.quote.cuotas[10].valor)}</td>
                      <td className="emitir-step__chosen-table-total">
                        {formatMoney(elegida.quote.total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!elegida && (
            <p className="emitir-step__empty emitir-step__chosen-in-ficha">
              Todavía no se eligió una propuesta en el paso 3 — se puede cargar la póliza igual,
              pero conviene volver a "Confirmar" y elegir una antes de emitir.
            </p>
          )}
        </ClientFicha>
      </div>

      <div className="emitir-step__section">
        {/* A pedido, estética tipo mockup: el estado de creación va como insignia
            arriba a la derecha del título (antes: renglón propio "Estado de
            creación: ..." debajo del subtítulo). */}
        <div className="emitir-step__poliza-head">
          <div>
            <h2 className="emitir-step__title">Póliza</h2>
            <p className="emitir-step__subtitle">
              Subí el PDF (u otro archivo) de la póliza emitida por la compañía y apretá
              "Concretar Oportunidad": la automatización crea la póliza y la marca como "Concretada".
            </p>
          </div>
          {estadoCreacion && <StatusBadge label={estadoCreacion} color={estadoCreacionColor} />}
        </div>

        {/* A pedido: mismo campo de archivo (y misma previsualización con lightbox)
            que el resto de la app — antes esto eran 2 bloques totalmente distintos
            (DocumentUploadRow mientras faltaba, una fila verde armada a mano una vez
            cargada). Ahora es un solo FileUploadField siempre — "Concretar
            Oportunidad" ya no vive acá adentro (ver extraActions de antes), se movió
            al footer de abajo, mismo lugar que en los otros 3 pasos de la
            Oportunidad. */}
        <FileUploadField
          label="Póliza"
          required={false}
          fileName={polizaFileName}
          onFetchFile={() => fetchFileColumnAsFile(opportunity.id, 'file_mm5bzdd4')}
          uploading={uploading}
          deleting={deleting}
          error={error}
          missingMessage="Póliza pendiente de adjuntar"
          onUpload={handleUploadAttempt}
          onDelete={showConfirmarAction ? onDeletePoliza : undefined}
          showReplaceButton={false}
          compactDelete
        />
        {confirmarEmisionError && <p className="emitir-step__error">Error: {confirmarEmisionError}</p>}
        {!polling && <ErrorDetailBox detail={errorDetail} className="emitir-step__error-detail-spacing" />}
      </div>

      {/* A pedido: mismo footer pegado abajo del todo que los otros 3 pasos de la
          Oportunidad (ver StepFooter) — "Volver" vuelve a Confirmar. A la derecha,
          "Concretar Oportunidad" mientras corresponde (showConfirmarAction: subida y
          todavía no "Creada"); una vez que ya está "Creada" (concretada), ese mismo
          lugar pasa a tener "Inicio" — a pedido, en vez de un redirect automático al
          Inicio (se sacó), queda a mano de la persona cuándo salir. */}
      <StepFooter onBack={onBack}>
        {showConfirmarAction && (
          <Button
            kind="primary"
            className="emitir-step__confirmar-btn"
            onClick={handleConcretarAttempt}
            disabled={confirmandoEmision || polling}
          >
            <MdCheckCircle /> {confirmandoEmision ? 'Confirmando...' : 'Concretar Oportunidad'}
          </Button>
        )}
        {!showConfirmarAction && concretada && (
          <Button kind="primary" onClick={onGoHome}>
            <MdHome /> Inicio
          </Button>
        )}
      </StepFooter>

      {validationError && (
        <AlertModal
          id="emitir-faltan-datos-modal"
          type="warning"
          title="Faltan datos requeridos"
          description="No podés continuar porque hay información obligatoria que no ha sido completada."
          detailsTitle="Campos pendientes:"
          detailsList={validationError}
          onClose={() => setValidationError(null)}
          primaryButton={{ text: 'Entendido', onClick: () => setValidationError(null) }}
        />
      )}

      {/* A pedido: solo el círculo girando + un texto (sin barra de progreso ni
          subtítulo aparte) mientras corre la automatización de creación de póliza
          (color_mm5ejysv) — reemplaza el AttentionBox amarillo inline de antes. */}
      {polling && !dismissed && (
        <Modal id="poliza-creando-modal" show onClose={() => setDismissed(true)} size="small">
          <ModalContent className="emitir-step__creando-content">
            <GradientSpinner size={48} />
            <p className="emitir-step__creando-title">Leyendo la póliza y creándola...</p>
          </ModalContent>
        </Modal>
      )}
    </div>
  )
}
