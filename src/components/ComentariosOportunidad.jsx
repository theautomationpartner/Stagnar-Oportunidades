import { useEffect, useRef, useState } from 'react'
import { MdAttachFile, MdClose, MdInsertDriveFile, MdOutlineChatBubbleOutline, MdPictureAsPdf, MdSend } from 'react-icons/md'
import { Button, Modal, ModalContent } from '@vibe/core'
import { crearComentario, fetchComentarios, fetchMe, fetchMondayUsers } from '../services/mondayApi'
import Avatar from './Avatar'
import VisorArchivos, { tipoDeArchivo } from './VisorArchivos'
import { initialsOf } from '../services/personaFields'
import './ComentariosOportunidad.css'

// A pedido: comentarios del trámite y archivos (sobre todo fotos del vehículo) que se
// pueden dejar en cualquier paso de la oportunidad. Se guardan como Updates de monday
// con el prefijo [COMENTARIO] (ver fetchComentarios / crearComentario en mondayApi.js).
//
// El botón vive en el encabezado de la oportunidad, así está a mano en los 4 pasos, y
// muestra cuántos comentarios hay.

const fechaLarga = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}


// Quién escribe: el usuario de la sesión (su id de monday está verificado al entrar). Sin
// sesión —en local o con la autenticación apagada— el dueño del token, igual que el
// resto de la app (ver LandingScreen).
function useAutorActual(usuarioSesion) {
  const [autor, setAutor] = useState(null)
  useEffect(() => {
    if (usuarioSesion?.mondayUserId || usuarioSesion?.nombre) {
      setAutor({ id: usuarioSesion.mondayUserId ?? null, name: usuarioSesion.nombre || usuarioSesion.email || 'Usuario' })
      return
    }
    let cancelado = false
    fetchMe()
      .then((me) => !cancelado && me && setAutor({ id: me.id, name: me.name }))
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [usuarioSesion?.mondayUserId, usuarioSesion?.nombre, usuarioSesion?.email])
  return autor
}

export default function ComentariosOportunidad({ opportunityId, usuarioSesion, className }) {
  const [abierto, setAbierto] = useState(false)
  const [comentarios, setComentarios] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [errorCarga, setErrorCarga] = useState(null)
  const [fotos, setFotos] = useState(new Map())
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState([])
  const [publicando, setPublicando] = useState(false)
  const [errorPublicar, setErrorPublicar] = useState(null)
  const inputArchivos = useRef(null)
  // A pedido: los archivos se abren en un visor adentro de la app (ver VisorArchivos).
  const [visor, setVisor] = useState(null) // { archivos, indice }
  const autor = useAutorActual(usuarioSesion)

  const cargar = async () => {
    setCargando(true)
    setErrorCarga(null)
    try {
      setComentarios(await fetchComentarios(opportunityId))
    } catch (err) {
      setErrorCarga(err.message)
    } finally {
      setCargando(false)
    }
  }

  // Se cargan al entrar a la oportunidad (para el contador del botón) y cada vez que se
  // abre la sección (por si alguien comentó mientras tanto).
  useEffect(() => {
    setComentarios(null)
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId])

  // Fotos de perfil de monday por id, para los avatares.
  useEffect(() => {
    fetchMondayUsers()
      .then((usuarios) => setFotos(new Map(usuarios.map((u) => [u.id, u.photo]))))
      .catch(() => {})
  }, [])

  const abrir = () => {
    setAbierto(true)
    cargar()
  }

  const agregarArchivos = (lista) => {
    const nuevos = [...(lista ?? [])]
    if (nuevos.length) setArchivos((prev) => [...prev, ...nuevos])
  }

  const publicar = async () => {
    if (!texto.trim() && archivos.length === 0) return
    setPublicando(true)
    setErrorPublicar(null)
    try {
      const { fallidos } = await crearComentario(opportunityId, { texto, autor, archivos })
      setTexto('')
      setArchivos([])
      if (fallidos.length) {
        setErrorPublicar(`El comentario se guardó, pero no se pudieron subir: ${fallidos.join(', ')}.`)
      }
      await cargar()
    } catch (err) {
      setErrorPublicar(`No se pudo guardar el comentario (${err.message}).`)
    } finally {
      setPublicando(false)
    }
  }

  const cantidad = comentarios?.length ?? 0

  return (
    <>
      <Button
        kind="secondary"
        size="small"
        leftIcon={MdOutlineChatBubbleOutline}
        className={className}
        onClick={abrir}
      >
        Comentarios{cantidad > 0 ? ` (${cantidad})` : ''}
      </Button>

      {abierto && (
        <Modal id="comentarios-oportunidad-modal" show onClose={() => setAbierto(false)} size="large">
          <ModalContent>
            <div className="comentarios">
              <div className="comentarios__titulo">
                <h2>Comentarios y archivos</h2>
                <p>Lo que se deja acá queda guardado en la oportunidad y también se ve en monday.</p>
              </div>
              {/* Nuevo comentario */}
              <div
                className="comentarios__nuevo"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  agregarArchivos(e.dataTransfer.files)
                }}
              >
                <div className="comentarios__nuevo-autor">
                  <Avatar label={initialsOf(autor?.name ?? '')} foto={autor?.id ? fotos.get(String(autor.id)) : null} />
                  <span>{autor?.name ?? '…'}</span>
                </div>
                <textarea
                  className="comentarios__texto"
                  rows={3}
                  placeholder="Escribí un comentario del trámite (ej. va a evaluar la compra, confirma cuándo lo retira)…"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  disabled={publicando}
                />
                {archivos.length > 0 && (
                  <ul className="comentarios__adjuntos-nuevos">
                    {archivos.map((f, i) => (
                      <li key={`${f.name}-${i}`}>
                        <MdInsertDriveFile aria-hidden="true" />
                        <span>{f.name}</span>
                        <button
                          type="button"
                          aria-label={`Quitar ${f.name}`}
                          disabled={publicando}
                          onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <MdClose />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="comentarios__acciones">
                  <input
                    ref={inputArchivos}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => {
                      agregarArchivos(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <Button
                    kind="secondary"
                    size="small"
                    leftIcon={MdAttachFile}
                    className="opp-detail__recotizar-btn"
                    disabled={publicando}
                    onClick={() => inputArchivos.current?.click()}
                  >
                    Adjuntar fotos o archivos
                  </Button>
                  <Button
                    kind="primary"
                    size="small"
                    leftIcon={MdSend}
                    loading={publicando}
                    disabled={!autor || (!texto.trim() && archivos.length === 0)}
                    onClick={publicar}
                  >
                    Publicar
                  </Button>
                </div>
                {errorPublicar && (
                  <p className="comentarios__error" role="alert">
                    {errorPublicar}
                  </p>
                )}
              </div>

              {/* Comentarios existentes, del más nuevo al más viejo */}
              {errorCarga && (
                <p className="comentarios__error" role="alert">
                  No se pudieron cargar los comentarios ({errorCarga}).
                </p>
              )}
              {cargando && !comentarios && <p className="comentarios__vacio">Cargando comentarios…</p>}
              {comentarios && comentarios.length === 0 && (
                <p className="comentarios__vacio">Todavía no hay comentarios en esta oportunidad.</p>
              )}
              {comentarios && comentarios.length > 0 && (
                <ul className="comentarios__lista">
                  {comentarios.map((c) => (
                    <li key={c.id} className="comentarios__item">
                      <Avatar label={initialsOf(c.autor.name)} foto={c.autor.photo || (c.autor.id ? fotos.get(c.autor.id) : null)} />
                      <div className="comentarios__cuerpo">
                        <div className="comentarios__cabecera">
                          <strong>{c.autor.name}</strong>
                          <span>{fechaLarga(c.fecha)}</span>
                        </div>
                        {c.texto && <p className="comentarios__mensaje">{c.texto}</p>}
                        {c.archivos.length > 0 && (
                          <div className="comentarios__archivos">
                            {c.archivos.map((a, i) => {
                              const abrirVisor = () => setVisor({ archivos: c.archivos, indice: i })
                              const tipo = tipoDeArchivo(a)
                              return tipo === 'imagen' ? (
                                <button key={a.id} type="button" className="comentarios__foto" title={a.nombre} onClick={abrirVisor}>
                                  <img src={a.miniatura || a.url} alt={a.nombre} loading="lazy" />
                                </button>
                              ) : (
                                <button key={a.id} type="button" className="comentarios__archivo" title={a.nombre} onClick={abrirVisor}>
                                  {tipo === 'pdf' ? <MdPictureAsPdf aria-hidden="true" /> : <MdInsertDriveFile aria-hidden="true" />}
                                  <span>{a.nombre}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ModalContent>
        </Modal>
      )}
      {visor && <VisorArchivos archivos={visor.archivos} indiceInicial={visor.indice} onClose={() => setVisor(null)} />}
    </>
  )
}
