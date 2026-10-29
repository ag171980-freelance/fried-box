/**
 * Cliente de la API del panel.
 *
 * El token va en `Authorization: Bearer` y se guarda en localStorage. Es
 * una decisión consciente: la app es un SPA servido como archivos
 * estáticos y el backend puede vivir en otro origen, así que una cookie
 * de sesión obligaría a resolver CORS con credenciales y SameSite para
 * cada despliegue. Con token, el backend no necesita saber dónde está
 * parado el front.
 *
 * La contracara es que un XSS en el panel puede leer el token. Por eso
 * el panel no pinta HTML de nadie y el token vence a los 14 días.
 */

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const CLAVE = 'foodix.admin.token'

export class AdminError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.name = 'AdminError'
    this.status = status
    this.code = code
    Object.assign(this, extra)
  }
}

export const token = {
  leer() {
    try {
      return localStorage.getItem(CLAVE) || null
    } catch {
      return null
    }
  },
  guardar(valor) {
    try {
      localStorage.setItem(CLAVE, valor)
    } catch {
      /* Navegación privada: la sesión dura lo que dure la pestaña. */
    }
  },
  borrar() {
    try {
      localStorage.removeItem(CLAVE)
    } catch {
      /* Si no se puede borrar, igual sacamos el token de memoria. */
    }
  },
}

async function pedir(path, { method = 'GET', body, form } = {}) {
  const t = token.leer()

  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        // Con FormData el navegador pone el Content-Type y el boundary.
        // Si lo escribimos nosotros, el backend no puede parsearlo.
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: form || (body ? JSON.stringify(body) : undefined),
    })
  } catch {
    throw new AdminError(0, 'sin_conexion', 'No pudimos conectarnos con el servidor.')
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    // Sesión vencida: se limpia el token acá para que el panel vuelva
    // al login sin que cada pantalla tenga que acordarse.
    if (res.status === 401) token.borrar()

    throw new AdminError(
      res.status,
      data?.error?.codigo || 'error',
      data?.error?.mensaje || `El servidor respondió ${res.status}.`,
      { campos: data?.campos },
    )
  }

  return data
}

/* --- sesión -------------------------------------------------------- */

export async function login(email, password) {
  const data = await pedir('/admin/login', { method: 'POST', body: { email, password } })
  token.guardar(data.token)
  return data.user
}

export async function logout() {
  try {
    await pedir('/admin/logout', { method: 'POST' })
  } finally {
    token.borrar()
  }
}

export const cambiarClave = (actual, nueva) =>
  pedir('/admin/password', { method: 'POST', body: { actual, nueva } })

/* --- el panel entero en una llamada -------------------------------- */

export const cargarPanel = () => pedir('/admin/panel')

/* --- configuración ------------------------------------------------- */

export const guardarSettings = (settings) =>
  pedir('/admin/settings', { method: 'PUT', body: settings })

export const cambiarEstado = (isOpen, closedMessage) =>
  pedir('/admin/estado', { method: 'POST', body: { isOpen, closedMessage } })

/* --- rubros -------------------------------------------------------- */

export const crearCategoria = (datos) =>
  pedir('/admin/categories', { method: 'POST', body: datos })

export const actualizarCategoria = (id, datos) =>
  pedir(`/admin/categories/${id}`, { method: 'PUT', body: datos })

export const borrarCategoria = (id) =>
  pedir(`/admin/categories/${id}`, { method: 'DELETE' })

/* --- platos -------------------------------------------------------- */

export const crearProducto = (datos) =>
  pedir('/admin/products', { method: 'POST', body: datos })

export const actualizarProducto = (id, datos) =>
  pedir(`/admin/products/${id}`, { method: 'PUT', body: datos })

export const cambiarDisponibilidad = (id, isAvailable) =>
  pedir(`/admin/products/${id}/disponibilidad`, { method: 'POST', body: { isAvailable } })

export const borrarProducto = (id) =>
  pedir(`/admin/products/${id}`, { method: 'DELETE' })

export function subirFoto(id, archivo) {
  const form = new FormData()
  form.append('foto', archivo)
  return pedir(`/admin/products/${id}/foto`, { method: 'POST', form })
}

export const quitarFoto = (id) =>
  pedir(`/admin/products/${id}/foto`, { method: 'DELETE' })

/* --- opciones ------------------------------------------------------ */

export const guardarGrupo = (id, datos) =>
  id
    ? pedir(`/admin/option-groups/${id}`, { method: 'PUT', body: datos })
    : pedir('/admin/option-groups', { method: 'POST', body: datos })

export const borrarGrupo = (id) =>
  pedir(`/admin/option-groups/${id}`, { method: 'DELETE' })

/* --- promos y cupones ---------------------------------------------- */

export function subirFotoPromo(id, archivo) {
  const form = new FormData()
  form.append('foto', archivo)
  return pedir(`/admin/promos/${id}/foto`, { method: 'POST', form })
}

export const quitarFotoPromo = (id) => pedir(`/admin/promos/${id}/foto`, { method: 'DELETE' })

export const guardarPromo = (id, datos) =>
  id
    ? pedir(`/admin/promos/${id}`, { method: 'PUT', body: datos })
    : pedir('/admin/promos', { method: 'POST', body: datos })

export const borrarPromo = (id) => pedir(`/admin/promos/${id}`, { method: 'DELETE' })

export const guardarCupon = (id, datos) =>
  id
    ? pedir(`/admin/coupons/${id}`, { method: 'PUT', body: datos })
    : pedir('/admin/coupons', { method: 'POST', body: datos })

export const borrarCupon = (id) => pedir(`/admin/coupons/${id}`, { method: 'DELETE' })

/* --- pedidos ------------------------------------------------------- */

export function listarPedidos({ vista, dia, q }) {
  const qs = new URLSearchParams({ vista })
  if (dia) qs.set('dia', dia)
  if (q) qs.set('q', q)
  return pedir(`/admin/orders?${qs}`)
}

export const verPedido = (id) => pedir(`/admin/orders/${encodeURIComponent(id)}`)

export const cambiarEstadoPedido = (id, status, note = '') =>
  pedir(`/admin/orders/${encodeURIComponent(id)}/estado`, { method: 'POST', body: { status, note } })

export const estadisticas = (dias) => pedir(`/admin/stats?dias=${dias}`)
