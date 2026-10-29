/**
 * Cliente de la API. No hay mocks: todo sale de PHP y MySQL.
 *
 * Cada función recibe el slug del local. Es explícito a propósito: con
 * varios locales conviviendo, un valor global escondido es la clase de
 * cosa que termina mostrándole a alguien la carta del restaurante de al
 * lado. Si el slug viene vacío, el backend usa su DEFAULT_TENANT.
 *
 * La base se configura con VITE_API_URL (por defecto /api, que el proxy
 * de Vite manda al backend, ver vite.config.js).
 */

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    Object.assign(this, extra)
  }
}

async function request(path, { method = 'GET', body, tenant } = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(tenant ? { 'X-Tenant': tenant } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    // fetch sólo rechaza cuando no hubo respuesta: servidor caído, red, CORS.
    throw new ApiError(0, 'sin_conexion', 'No pudimos conectarnos con el servidor.')
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.codigo || 'error',
      data?.error?.mensaje || `La API respondió ${res.status}.`,
      // El 422 trae los campos con problemas y el 409 las líneas que ya
      // no se pueden preparar. Las pantallas los necesitan.
      { campos: data?.campos, issues: data?.issues, quote: data?.quote },
    )
  }

  return data
}

/** GET /menu */
export function getMenu(tenant) {
  return request('/menu', { tenant })
}

/** POST /orders/quote — el total lo calcula el servidor. */
export function quoteOrder({ lines, mode, couponCode, tenant }) {
  return request('/orders/quote', {
    method: 'POST',
    tenant,
    body: { mode, couponCode: couponCode || null, lines: lines.map(limpiarLinea) },
  })
}

/** POST /orders */
export function createOrder(payload) {
  return request('/orders', {
    method: 'POST',
    tenant: payload.tenant,
    body: {
      mode: payload.mode,
      couponCode: payload.couponCode || null,
      paymentMethod: payload.paymentMethod,
      note: payload.note,
      customer: payload.customer,
      lines: payload.lines.map(limpiarLinea),
    },
  })
}

/** GET /orders/:id */
export async function getOrder(id, tenant) {
  const data = await request(`/orders/${encodeURIComponent(id)}`, { tenant })
  return data.order
}

/**
 * Cierra el pago sin pasarela. Es el reemplazo del webhook de Mercado
 * Pago hasta que existan las credenciales; el backend lo rechaza con 403
 * si ALLOW_FAKE_PAYMENTS está en false.
 */
export async function settlePayment(id, resultado, tenant) {
  const data = await request(`/orders/${encodeURIComponent(id)}/pago-simulado`, {
    method: 'POST',
    tenant,
    body: { resultado },
  })
  return data.order
}

/** El carrito guarda más cosas de las que al servidor le importan. */
function limpiarLinea(l) {
  return { key: l.key, itemId: l.itemId, qty: l.qty, optionIds: l.optionIds, note: l.note }
}
