import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMenu } from '../api/index.js'
import { BRAND } from '../brand.js'

const VenueContext = createContext(null)

/**
 * El local que se está mirando y su carta.
 *
 * La app sirve una sola marca, así que el slug no sale de la URL: es la
 * constante BRAND. Igual viaja explícito a cada llamada de la API, que
 * sigue siendo multi-local del lado de PHP. Dejarlo explícito es lo que
 * permite que mañana alguien vuelva a montar dos marcas sin reescribir
 * el cliente.
 */
export function VenueProvider({ children }) {
  const [estado, setEstado] = useState({ cargando: true, error: null, data: null })

  const cargar = useCallback(() => {
    let vigente = true
    setEstado((e) => ({ ...e, cargando: true, error: null }))

    getMenu(BRAND)
      .then((data) => vigente && setEstado({ cargando: false, error: null, data }))
      .catch((error) => vigente && setEstado({ cargando: false, error, data: null }))

    return () => {
      vigente = false
    }
  }, [])

  useEffect(cargar, [cargar])

  const value = useMemo(
    () => ({
      slug: BRAND,
      cargando: estado.cargando,
      error: estado.error,
      restaurant: estado.data?.restaurant ?? null,
      categories: estado.data?.categories ?? [],
      items: estado.data?.items ?? [],
      promos: estado.data?.promos ?? [],
      reintentar: cargar,

      /** Arma un enlace de la app: path('/pedido') -> /pedido, path() -> / */
      path: (sub = '') => sub || '/',
    }),
    [estado, cargar],
  )

  return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>
}

export function useVenue() {
  const ctx = useContext(VenueContext)
  if (!ctx) throw new Error('useVenue necesita estar dentro de <VenueProvider>')
  return ctx
}
