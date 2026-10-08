// A pedido: "Duplicar oportunidad". Crea una oportunidad NUEVA e independiente (no se
// vincula con la original) con el vehículo copiado tal cual, y el cliente, el contacto y
// la zona de circulación que se eligieron en el popup (ver DuplicarOportunidadModal).
// Solo datos del ítem: no copia cotizaciones (subitems), actividades, envíos ni estados
// del proceso — arranca en "Nueva", como una recién creada. De los archivos, solo la
// Carta del automóvil (es del vehículo; la cédula es del cliente, que puede cambiar).
//
// Mismo orden que el alta (ver handleGuardar en CrearOportunidadForm): el ítem se crea
// pelado y las columnas van después en otra mutation, para que monday dispare sus
// automatizaciones. Si algo falla a mitad de camino se borra lo creado en esta corrida.
import {
  createContactoCrm,
  createOpportunityItem,
  crearActividadesIniciales,
  crearCliente,
  deleteItem,
  dropdownColumnValue,
  fetchClienteGestion,
  fetchFileColumnAsFile,
  fetchItemsVinculados,
  OPORTUNIDAD_CONTACTO_CRM_COLUMN_ID,
  setMultipleColumnValues,
  uploadFileToColumn,
  vincularContactoACliente,
} from './mondayApi'
import { buildMondayEmail, buildMondayPhone, countryShortNameFromDigits, telefonoParaWhatsApp } from './personaFields'
import { ANIO_COTIZACION_COLUMN_ID, anioParaCotizar } from './anioCotizacion'
import { nombreDeOportunidad } from './nombreOportunidad'

const OPORTUNIDAD_CLIENTE_COLUMN_ID = 'board_relation_mm4qg1n2'
const MODELO_AUTODATA_COLUMN_ID = 'board_relation_mm5422v9'
const CARTA_AUTOMOVIL_COLUMN_ID = 'file_mm51jy06'

// El cliente: uno que ya existe ({ id }) o uno nuevo (los datos de VincularClienteModal,
// que ya verificó que el CI/RUT no esté repetido). Devuelve su ficha y el contacto que
// vino con el alta del cliente (si se cargó un teléfono).
async function resolverCliente(eleccion, creados) {
  if (eleccion.clienteNuevo) {
    const datos = eleccion.clienteNuevo
    const nuevo = await crearCliente(datos)
    creados.push(nuevo.id)
    let contacto = null
    if (datos.contactoExistente) {
      await vincularContactoACliente(datos.contactoExistente.id, nuevo.id)
      contacto = { id: String(datos.contactoExistente.id), telefono: datos.contactoExistente.telefono }
    } else if (datos.telefono) {
      const phone = buildMondayPhone(datos.codigoPais, datos.telefono)
      const creado = await createContactoCrm({ name: nuevo.name, phone, clienteId: nuevo.id, existingContactIds: [] })
      creados.push(String(creado.id))
      contacto = { id: String(creado.id), telefono: phone.phone }
    }
    const ficha = {
      id: nuevo.id,
      name: nuevo.name,
      tipo: datos.tipo,
      nombre: datos.nombre,
      apellido: datos.apellido,
      ci: datos.tipo === 'Empresa' ? '' : datos.documento,
      rut: datos.tipo === 'Empresa' ? datos.documento : '',
      fechaNacimiento: datos.fechaNacimiento,
      contactos: contacto ? [{ id: contacto.id }] : [],
    }
    return { ficha, contactoDelAlta: contacto }
  }
  const ficha = await fetchClienteGestion(eleccion.cliente.id)
  if (!ficha) throw new Error('No se encontró el cliente elegido en monday.')
  return { ficha, contactoDelAlta: null }
}

// El contacto: uno del cliente, uno que ya existía con ese teléfono (se suma al cliente)
// o uno nuevo (ContactoNuevoModal).
async function resolverContacto(eleccion, ficha, contactoDelAlta, creados) {
  if (contactoDelAlta) return contactoDelAlta
  const delCliente = (ficha.contactos ?? []).map((c) => String(c.id))
  const { contacto, contactoNuevo } = eleccion
  if (contactoNuevo) {
    const phone = contactoNuevo.telefono?.trim() ? buildMondayPhone(contactoNuevo.codigoPais, contactoNuevo.telefono) : null
    const creado = await createContactoCrm({
      name: contactoNuevo.mismoCliente ? ficha.name : contactoNuevo.nombre,
      phone,
      email: contactoNuevo.email?.trim() ? buildMondayEmail(contactoNuevo.email) : null,
      clienteId: ficha.id,
      existingContactIds: delCliente,
    })
    creados.push(String(creado.id))
    return { id: String(creado.id), telefono: phone?.phone ?? '' }
  }
  if (contacto) {
    if (!delCliente.includes(String(contacto.id))) await vincularContactoACliente(contacto.id, ficha.id)
    return { id: String(contacto.id), telefono: contacto.telefono ?? '' }
  }
  return null
}

// original: la oportunidad mapeada (opportunityMapper). eleccion: lo del popup —
//   { cliente | clienteNuevo, contacto | contactoNuevo, departamentoId, localidadId }
// Devuelve { id, avisos } — avisos: lo que no salió pero no impide usar la nueva.
export async function duplicarOportunidad(original, eleccion) {
  const creados = [] // clientes/contactos creados en esta corrida, para el rollback
  let nuevaId = null
  let nombreCliente = ''
  try {
    const { ficha, contactoDelAlta } = await resolverCliente(eleccion, creados)
    const contacto = await resolverContacto(eleccion, ficha, contactoDelAlta, creados)
    const esEmpresa = ficha.tipo === 'Empresa'
    nombreCliente = ficha.name
    const mismoCliente = String(ficha.id) === String(original.clienteId ?? '')

    nuevaId = (
      await createOpportunityItem(
        nombreDeOportunidad({
          nombre: esEmpresa ? ficha.razonSocial || ficha.nombre || ficha.name : ficha.nombre,
          apellido: esEmpresa ? '' : ficha.apellido,
          marca: original.marca,
          modelo: original.modelo,
          anio: original.anio,
          tipoRiesgo: original.tipoRiesgo,
        })
      )
    ).id

    const documento = String((esEmpresa ? ficha.rut : ficha.ci) ?? '').replace(/\D/g, '')
    // La fecha con la que se cotiza: la del cliente; a una empresa se le pide aparte y
    // vive en la oportunidad, así que solo se arrastra si el cliente es el mismo.
    const fechaNacimiento = esEmpresa ? (mismoCliente ? original.fechaNacimiento : '') : ficha.fechaNacimiento
    // En el formato de WhatsApp (los contactos viejos pueden tener el 0 adentro).
    const telefono = telefonoParaWhatsApp(contacto?.telefono)
    const columnValues = {
      deal_stage: 'Nueva',
      text_mm51b055: esEmpresa ? ficha.razonSocial || ficha.nombre || ficha.name : ficha.nombre || ficha.name,
      ...(esEmpresa ? {} : { text_mm51ez7e: ficha.apellido ?? '' }),
      ...(documento ? { numeric_mm51mb0s: documento } : {}),
      ...(fechaNacimiento ? { date_mm516agw: fechaNacimiento } : {}),
      ...(telefono ? { phone_mm519m27: { phone: telefono, countryShortName: countryShortNameFromDigits(telefono) } } : {}),
      [OPORTUNIDAD_CLIENTE_COLUMN_ID]: { item_ids: [Number(ficha.id)] },
      ...(contacto ? { [OPORTUNIDAD_CONTACTO_CRM_COLUMN_ID]: { item_ids: [Number(contacto.id)] } } : {}),
      board_relation_mm54tq30: { item_ids: [Number(eleccion.departamentoId)] },
      board_relation_mm5sqf8t: { item_ids: [Number(eleccion.localidadId)] },
      ...(original.asignadoId
        ? { deal_owner: { personsAndTeams: [{ id: Number(original.asignadoId), kind: 'person' }] } }
        : {}),
    }

    // El vehículo, tal cual estaba en la original (mismos formatos que el alta).
    if (original.tipoRiesgo) columnValues.color_mm5atxav = original.tipoRiesgo
    if (original.poseeVehiculo) columnValues.color_mm51n4j = original.poseeVehiculo
    if (original.marca) columnValues.dropdown_mm51ykrd = dropdownColumnValue(original.marca)
    if (original.anio) {
      columnValues.dropdown_mm51mdmq = dropdownColumnValue(original.anio)
      columnValues[ANIO_COTIZACION_COLUMN_ID] = anioParaCotizar(original.anio)
    }
    if (original.modelo) columnValues.text_mm54fb7m = original.modelo
    // La conexión con AUTODATA, si la original todavía la tiene (la automatización de
    // "Cotizar" la vacía después de usarla; sin ella se busca por el texto del modelo).
    const modeloIds = await fetchItemsVinculados(original.id, MODELO_AUTODATA_COLUMN_ID).catch(() => [])
    if (modeloIds.length) columnValues[MODELO_AUTODATA_COLUMN_ID] = { item_ids: modeloIds.map(Number) }
    if (original.combustible) columnValues.dropdown_mm52jp01 = dropdownColumnValue(original.combustible)
    if (original.tipo) columnValues.dropdown_mm5jqdk = dropdownColumnValue(original.tipo)
    if (original.uso) columnValues.color_mm52ey1d = original.uso
    if (original.matricula) columnValues.text_mm71dyf0 = original.matricula
    if (original.chasis) columnValues.text_mm711jjs = original.chasis
    if (original.motor) columnValues.text_mm711cng = original.motor

    await setMultipleColumnValues(nuevaId, columnValues)
  } catch (err) {
    const fallidos = []
    for (const id of [nuevaId, ...creados].filter(Boolean)) {
      await deleteItem(id).catch(() => fallidos.push(id))
    }
    if (fallidos.length) {
      throw new Error(`${err.message} No se pudieron borrar los ítems creados a medias (${fallidos.join(', ')}): hay que borrarlos a mano en monday.`)
    }
    throw err
  }

  // Lo que sigue no frena: la oportunidad ya quedó bien creada.
  const avisos = []
  if (original.libretaConducir) {
    try {
      const carta = await fetchFileColumnAsFile(original.id, CARTA_AUTOMOVIL_COLUMN_ID)
      if (carta) await uploadFileToColumn(nuevaId, CARTA_AUTOMOVIL_COLUMN_ID, carta)
      else avisos.push('No se pudo copiar la Carta del automóvil.')
    } catch {
      avisos.push('No se pudo copiar la Carta del automóvil.')
    }
  }
  crearActividadesIniciales(nuevaId, original.asignadoId, nombreCliente)
  return { id: nuevaId, avisos }
}
