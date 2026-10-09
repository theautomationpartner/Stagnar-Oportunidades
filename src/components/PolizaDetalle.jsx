import { useEffect, useState } from 'react'
import { AttentionBox, Button } from '@vibe/core'
import { MdArrowBack, MdAttachFile, MdExpandLess, MdExpandMore, MdOpenInNew, MdPictureAsPdf } from 'react-icons/md'
import { fetchAssetAsFile, fetchPolizaDetalle } from '../services/mondayApi'
import { formatImporte, formatShortDate } from '../services/format'
import { coberturaParaMostrar } from '../services/coberturaGroups'
import LoadingScreen from './LoadingScreen'
import './PolizasSection.css'
import PdfCanvas from './PdfCanvas'

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

const esPdf = (a) => /\.pdf$/i.test(a.nombre || '')

// Visor del PDF de la póliza (a pedido: al entrar a la póliza, verla ahí mismo). Se baja
// el archivo de monday por el mismo proxy que el resto (fetchAssetAsFile) y se muestra con
// el visor de PDF del navegador. Si hay más de un PDF se elige cuál; se puede plegar, y
// siempre está "Abrir en otra pestaña" por si el visor embebido no carga (por ejemplo, si
// el navegador no muestra PDFs adentro de la página).
function VisorPdf({ archivos }) {
  const pdfs = archivos.filter(esPdf)
  const [actual, setActual] = useState(pdfs[0]?.assetId ?? null)
  const [url, setUrl] = useState(null)
  const [blob, setBlob] = useState(null)
  const [error, setError] = useState(null)
  const [plegado, setPlegado] = useState(false)
  const archivo = pdfs.find((a) => a.assetId === actual)

  useEffect(() => {
    if (!archivo) return undefined
    let vivo = true
    let creada = null
    setUrl(null)
    setError(null)
    fetchAssetAsFile(archivo.assetId, archivo.nombre)
      .then((f) => {
        if (!vivo) return
        if (!f) throw new Error('monday no devolvió el archivo')
        // Algunos proxies lo devuelven sin tipo: sin "application/pdf" el navegador lo
        // descargaría en vez de mostrarlo.
        const pdf = f.type === 'application/pdf' ? f : new Blob([f], { type: 'application/pdf' })
        creada = URL.createObjectURL(pdf)
        setBlob(pdf)
        setUrl(creada)
      })
      .catch((err) => vivo && setError(err.message))
    return () => {
      vivo = false
      if (creada) URL.revokeObjectURL(creada)
    }
  }, [archivo?.assetId])

  if (!pdfs.length) return null

  return (
    <section className="poliza__visor">
      <div className="poliza__visor-barra">
        <h2>
          <MdPictureAsPdf aria-hidden="true" /> Póliza en PDF
        </h2>
        {pdfs.length > 1 && (
          <div className="poliza__visor-archivos" role="tablist" aria-label="PDF a ver">
            {pdfs.map((a) => (
              <button
                key={a.assetId}
                type="button"
                role="tab"
                aria-selected={a.assetId === actual}
                className={a.assetId === actual ? 'poliza__visor-archivo poliza__visor-archivo--activo' : 'poliza__visor-archivo'}
                onClick={() => setActual(a.assetId)}
              >
                {a.nombre}
              </button>
            ))}
          </div>
        )}
        <div className="poliza__visor-acciones">
          {url && (
            <a className="poliza__visor-boton" href={url} target="_blank" rel="noreferrer">
              <MdOpenInNew aria-hidden="true" /> Abrir en otra pestaña
            </a>
          )}
          <button type="button" className="poliza__visor-boton" aria-expanded={!plegado} onClick={() => setPlegado((v) => !v)}>
            {plegado ? <MdExpandMore aria-hidden="true" /> : <MdExpandLess aria-hidden="true" />}
            {plegado ? 'Mostrar' : 'Ocultar'}
          </button>
        </div>
      </div>
      {!plegado && (
        <div className="poliza__visor-marco">
          {error ? (
            <p className="poliza__visor-mensaje poliza__archivo-error">No se pudo traer «{archivo?.nombre}»: {error}</p>
          ) : !url ? (
            <p className="poliza__visor-mensaje">Trayendo el PDF de la póliza...</p>
          ) : (
            // pdf.js y no un <iframe>: adentro de monday Chrome y Brave bloquean el visor del
            // navegador en un frame (ver PdfCanvas).
            <PdfCanvas archivo={blob} titulo={'PDF de la póliza: ' + archivo?.nombre} />
          )}
        </div>
      )}
    </section>
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

      {/* A pedido: tarjetas de tamaño parecido. En vez de una grilla donde Vigencia (4
          datos) quedaba al lado de Póliza (8) y se veía vacía, 3 columnas armadas para que
          pesen parecido — Póliza + Vigencia + Otros datos, Cliente + Bien asegurado, Importes + Pago — y
          terminen a la misma altura (la última tarjeta de cada columna se estira). */}
      <div className="poliza__columnas">
        <div className="poliza__columna">
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
              titulo="Otros datos"
              filas={[
                ['Adicionales', p.adicionales],
                ['Corredor', p.corredor],
                ['Carpeta', p.carpeta],
                ['Renovaciones', p.renovaciones],
                ['Póliza relacionada', p.polizaRelacionada],
                ['Observaciones', p.observaciones ? <span className="poliza__observaciones">{p.observaciones}</span> : ''],
              ]}
            />
        </div>
        <div className="poliza__columna">
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
        </div>
        <div className="poliza__columna">
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
        </div>
      </div>

      <div className="poliza__grilla">
        {/* El PDF de la póliza ya se ve en el visor de abajo: acá quedan los demás
            archivos (y algún archivo de la póliza que no sea PDF, si lo hubiera). */}
        <section className="poliza__bloque poliza__bloque--ancho">
          <h2>Archivos</h2>
          <Archivos titulo="Otros archivos" archivos={[...p.archivosPoliza.filter((a) => !esPdf(a)), ...p.otrosArchivos]} />
        </section>
      </div>

      {/* A pedido: el visor del PDF va abajo de los datos. */}
      <VisorPdf key={p.id} archivos={p.archivosPoliza} />
    </section>
  )
}
