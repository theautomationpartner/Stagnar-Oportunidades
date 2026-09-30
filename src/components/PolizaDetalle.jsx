import { useEffect, useState } from 'react'
import { AttentionBox, Button } from '@vibe/core'
import { MdArrowBack, MdAttachFile } from 'react-icons/md'
import { fetchAssetAsFile, fetchPolizaDetalle } from '../services/mondayApi'
import { formatImporte, formatShortDate } from '../services/format'
import { coberturaParaMostrar } from '../services/coberturaGroups'
import LoadingScreen from './LoadingScreen'
import './PolizasSection.css'

// Ficha de una póliza (a pedido): todos sus datos, agrupados por lo que significan, y de
// solo lectura — no hay ningún campo editable ni nada que escriba en monday. Los datos del
// cliente, del vehículo y de la tarjeta salen de los ítems vinculados.

const fecha = (d) => (d ? formatShortDate(d) : '')

// Días hasta el vencimiento (negativo si ya venció).
function diasHasta(dia) {
  if (!dia) return null
  const [a, m, d] = dia.split('-').map(Number)
  const hoy = new Date()
  const objetivo = new Date(a, m - 1, d)
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((objetivo - base) / 86400000)
}

// Un bloque de datos: título y pares etiqueta/valor. Los vacíos se muestran como "—"
// para que la estructura sea siempre la misma y se vea qué falta cargar.
function Bloque({ titulo, filas, ancho = false }) {
  return (
    <section className={ancho ? 'poliza__bloque poliza__bloque--ancho' : 'poliza__bloque'}>
      <h2>{titulo}</h2>
      <dl>
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="poliza__dato">
            <dt>{etiqueta}</dt>
            <dd>{valor === '' || valor == null ? <span className="polizas__muted">—</span> : valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Archivos({ titulo, archivos }) {
  const [abriendo, setAbriendo] = useState(null)
  const [error, setError] = useState(null)
  const abrir = async (a) => {
    setAbriendo(a.assetId)
    setError(null)
    try {
      const archivo = await fetchAssetAsFile(a.assetId, a.nombre)
      if (!archivo) throw new Error('monday no devolvió el archivo')
      window.open(URL.createObjectURL(archivo), '_blank', 'noopener')
    } catch (err) {
      setError('No se pudo abrir «' + a.nombre + '»: ' + err.message)
    } finally {
      setAbriendo(null)
    }
  }
  return (
    <div className="poliza__archivos">
      <span className="poliza__archivos-titulo">{titulo}</span>
      {archivos.length === 0 ? (
        <span className="polizas__muted">Sin archivos</span>
      ) : (
        archivos.map((a) => (
          <button key={a.assetId} type="button" className="poliza__archivo" disabled={abriendo === a.assetId} onClick={() => abrir(a)}>
            <MdAttachFile aria-hidden="true" /> {abriendo === a.assetId ? 'Abriendo...' : a.nombre}
          </button>
        ))
      )}
      {error && <span className="poliza__archivo-error">{error}</span>}
    </div>
  )
}

export default function PolizaDetalle({ polizaId, onBack }) {
  const [poliza, setPoliza] = useState(undefined) // undefined = cargando, null = no existe
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    fetchPolizaDetalle(polizaId)
      .then((p) => vivo && setPoliza(p))
      .catch((err) => vivo && setError(err.message))
    return () => {
      vivo = false
    }
  }, [polizaId])

  const volver = (
    <Button kind="tertiary" leftIcon={MdArrowBack} onClick={onBack}>
      Volver a las pólizas
    </Button>
  )

  if (error) {
    return (
      <section className="polizas">
        {volver}
        <AttentionBox type="danger">No se pudo traer la póliza: {error}</AttentionBox>
      </section>
    )
  }
  if (poliza === undefined) return <LoadingScreen title="Abriendo la póliza" message="Estamos trayendo sus datos desde monday." />
  if (poliza === null) {
    return (
      <section className="polizas">
        {volver}
        <AttentionBox type="warning">Esa póliza ya no existe en monday.</AttentionBox>
      </section>
    )
  }

  const p = poliza
  const $ = (v) => (v === '' ? '' : formatImporte(v, p.moneda))
  const dias = diasHasta(p.vencimiento || p.hasta)
  const tarjeta = p.tarjeta
    ? [p.tarjeta.tipo, p.tarjeta.banco, p.tarjeta.ultimos4 && '•••• ' + p.tarjeta.ultimos4].filter(Boolean).join(' · ')
    : ''

  return (
    <section className="polizas poliza">
      {volver}

      <header className="poliza__head">
        <div>
          <h1>Póliza {p.numero || 'sin número'}</h1>
          <p>
            {[p.compania, p.cobertura && coberturaParaMostrar(p), p.tipoMovimiento].filter(Boolean).join(' · ')}
            {p.estado && <span className="polizas__estado poliza__estado"> {p.estado}</span>}
          </p>
        </div>
        <div className="poliza__resumen">
          <span className="poliza__resumen-lbl">Premio total</span>
          <span className="poliza__resumen-valor">{formatImporte(p.importes.premioTotal, p.moneda)}</span>
          <span className="poliza__resumen-lbl">
            Vigencia {p.desde ? `${fecha(p.desde)} al ${fecha(p.hasta)}` : 'sin cargar'}
            {dias != null && (dias >= 0 ? ` · vence en ${dias} días` : ` · venció hace ${-dias} días`)}
          </span>
        </div>
      </header>

      <div className="poliza__grilla">
        <Bloque
          titulo="Póliza"
          filas={[
            ['Número', p.numero],
            ['Compañía', p.compania],
            // Total / Parcial, como en el resto de la app (ver coberturaParaMostrar).
            ['Cobertura', p.cobertura && coberturaParaMostrar(p)],
            ['Producto', p.producto],
            ['Estado', p.estado],
            ['Tipo de movimiento', p.tipoMovimiento],
            ['Origen', p.origen],
            ['Tipo de renovación', p.tipoRenovacion],
          ]}
        />
        <Bloque
          titulo="Vigencia"
          filas={[
            ['Fecha de emisión', fecha(p.fechaEmision)],
            ['Vigencia desde', fecha(p.desde)],
            ['Vigencia hasta', fecha(p.hasta)],
            ['Vencimiento', fecha(p.vencimiento)],
          ]}
        />
        <Bloque
          titulo="Cliente"
          filas={[
            ['Nombre', p.cliente.nombre],
            ['Tipo', p.cliente.tipo],
            [p.cliente.rut && !p.cliente.ci ? 'RUT' : 'Cédula', p.cliente.ci || p.cliente.rut],
            ['Dirección', p.cliente.direccion],
          ]}
        />
        <Bloque
          titulo="Bien asegurado"
          filas={[
            ['Vehículo', p.vehiculo.nombre],
            ['Matrícula', p.vehiculo.matricula],
            ['Marca', p.vehiculo.marca],
            ['Modelo', p.vehiculo.modelo],
            ['Año', p.vehiculo.anio],
            ['Motor', p.vehiculo.motor],
            ['Chasis', p.vehiculo.chasis],
            ['Padrón', p.vehiculo.padron],
            ['Categoría', p.vehiculo.categoria],
            ['Uso', p.uso],
            ['Zona de circulación', p.vehiculo.zona],
          ]}
        />
        <Bloque
          titulo={'Importes' + (p.moneda ? ' (' + p.moneda + ')' : '')}
          filas={[
            ['Prima comercial', $(p.importes.primaComercial)],
            ['Prima mínima comercial', $(p.importes.primaMinima)],
            ['Impuesto M.S.P.', $(p.importes.impuestoMsp)],
            ['I.V.A.', $(p.importes.iva)],
            ['Redondeo', $(p.importes.redondeo)],
            ['Premio total', $(p.importes.premioTotal)],
            ['Costo total', $(p.importes.costoTotal)],
            ['Bonificación', p.bonificacion === '' ? '' : p.bonificacion + ' %'],
            ['Deducible', $(p.deducible)],
          ]}
        />
        <Bloque
          titulo="Pago"
          filas={[
            ['Forma de pago', p.formaPago],
            ['Medio de pago', p.medioPago],
            ['Modo de facturación', p.modoFacturacion],
            ['Tarjeta', tarjeta],
            ['Titular de la tarjeta', p.tarjeta?.titular ?? ''],
          ]}
        />
        <Bloque
          titulo="Otros datos"
          ancho
          filas={[
            ['Adicionales', p.adicionales],
            ['Corredor', p.corredor],
            ['Carpeta', p.carpeta],
            ['Renovaciones', p.renovaciones],
            ['Póliza relacionada', p.polizaRelacionada],
            ['Observaciones', p.observaciones ? <span className="poliza__observaciones">{p.observaciones}</span> : ''],
          ]}
        />
        <section className="poliza__bloque poliza__bloque--ancho">
          <h2>Archivos</h2>
          <Archivos titulo="Póliza" archivos={p.archivosPoliza} />
          <Archivos titulo="Otros archivos" archivos={p.otrosArchivos} />
        </section>
      </div>
    </section>
  )
}
