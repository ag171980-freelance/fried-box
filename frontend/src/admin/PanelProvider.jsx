import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from './api.js'

const PanelContext = createContext(null)

/**
 * El estado del panel.
 *
 * Todo baja de una sola llamada a /admin/panel, y cada escritura
 * devuelve la lista que tocó ya actualizada. Así no hay dos versiones
 * de la carta conviviendo: la del servidor es la única.
 */
export function PanelProvider({ children }) {
  const [estado, setEstado] = useState({ cargando: true, error: null, datos: null })

  const cargar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true, error: null }))
    try {
      const datos = await api.cargarPanel()
      setEstado({ cargando: false, error: null, datos })
    } catch (error) {
      setEstado({ cargando: false, error, datos: null })
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  /**
   * Mezcla lo que devolvió una escritura.
   *
   * El backend contesta sólo las colecciones que cambiaron, así que se
   * pisan esas y el resto queda como estaba.
   */
  const aplicar = useCallback((parcial) => {
    setEstado((e) => (e.datos ? { ...e, datos: { ...e.datos, ...parcial } } : e))
  }, [])

  const value = useMemo(
    () => ({
      cargando: estado.cargando,
      error: estado.error,
      datos: estado.datos,
      recargar: cargar,
      aplicar,
    }),
    [estado, cargar, aplicar],
  )

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

export function usePanel() {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel necesita estar dentro de <PanelProvider>')
  return ctx
}

/**
 * Envuelve una escritura: marca ocupado, mezcla el resultado y deja el
 * error a mano para mostrarlo. Lo usan todas las pantallas, así que el
 * manejo de errores queda escrito una sola vez.
 */
export function useAccion() {
  const { aplicar } = usePanel()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  const correr = useCallback(
    async (fn) => {
      setOcupado(true)
      setError(null)
      try {
        const res = await fn()
        if (res && typeof res === 'object') aplicar(res)
        return res
      } catch (e) {
        setError(e)
        return null
      } finally {
        setOcupado(false)
      }
    },
    [aplicar],
  )

  return { correr, ocupado, error, limpiarError: () => setError(null) }
}
