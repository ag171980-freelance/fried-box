/**
 * La marca que sirve esta instalación.
 *
 * El backend sigue siendo multi-local: resuelve el local por la cabecera
 * X-Tenant y, si no viene, cae en DEFAULT_TENANT. Acá la mandamos
 * explícita para que el front no dependa de cómo esté configurado el
 * servidor, y para que el slug quede escrito en un solo lugar.
 *
 * Con VITE_BRAND se puede levantar otra marca sin tocar el código:
 *   VITE_BRAND=cafe-rivas npm run dev
 */
export const BRAND = import.meta.env.VITE_BRAND || 'friedbox'

/**
 * Nombre visible mientras la carta todavía no bajó: lo usan el cartel de
 * carga y la pantalla de error, que aparecen antes de que haya datos.
 * Una vez que la API contesta manda `restaurant.name`.
 */
export const BRAND_NAME = import.meta.env.VITE_BRAND_NAME || 'Friedbox'
