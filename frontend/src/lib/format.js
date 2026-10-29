const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** 12900 -> "$ 12.900" */
export function money(value) {
  return arsFormatter.format(Math.round(value || 0)).replace(/\s/g, ' ')
}

/** 12900 -> "12.900" (sin símbolo, para composiciones tipográficas) */
export function amount(value) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(value || 0))
}

export function pluralize(n, one, many) {
  return n === 1 ? one : many
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ')
}

/** Hora corta 24 h, formato local. */
export function clock(date = new Date()) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
