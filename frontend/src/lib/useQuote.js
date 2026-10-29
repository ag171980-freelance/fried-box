import { useEffect, useState } from 'react'
import { quoteOrder } from '../api/index.js'
import { useVenue } from '../store/VenueProvider.jsx'

/**
 * Pide el total al servidor cada vez que cambia el pedido.
 *
 * El front nunca calcula el precio final: mientras espera muestra una
 * estimación con los precios que vinieron en la carta, y después la pisa
 * con lo que responde POST /orders/quote.
 */
export function useQuote({ lines, mode, couponCode }) {
  const { slug } = useVenue()
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!lines.length) {
      setQuote(null)
      setLoading(false)
      setError(null)
      return
    }

    let vigente = true
    setLoading(true)

    // Se espera un momento antes de pedir: tocar «+» tres veces seguidas
    // tiene que ser una consulta, no tres.
    const timer = setTimeout(() => {
      quoteOrder({ lines, mode, couponCode, tenant: slug })
        .then((result) => {
          if (!vigente) return
          setQuote(result)
          setError(null)
        })
        .catch((e) => vigente && setError(e))
        .finally(() => vigente && setLoading(false))
    }, 140)

    return () => {
      vigente = false
      clearTimeout(timer)
    }
  }, [lines, mode, couponCode, slug])

  return { quote, loading, error }
}
