import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getOrder, settlePayment } from '../api/index.js'
import FoodLoader from '../components/ui/FoodLoader.jsx'
import { money } from '../lib/format.js'
import { useVenue } from '../store/VenueProvider.jsx'

/**
 * Pasarela de pago simulada.
 *
 * El pedido que se está pagando es real y está en la base; lo único
 * simulado es el cobro. Cuando haya credenciales de Mercado Pago,
 * createOrder() va a devolver el init_point de la preferencia, el
 * navegador va a salir de la app y volver por back_urls a /pedido/:id.
 * Esta pantalla se borra ese día.
 */
export default function GatewayPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { restaurant, slug, path } = useVenue()

  const [order, setOrder] = useState(null)
  const [error, setError] = useState(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let vigente = true
    getOrder(id, slug)
      .then((o) => vigente && setOrder(o))
      .catch((e) => vigente && setError(e))
    return () => {
      vigente = false
    }
  }, [id, slug])

  const resolver = async (resultado) => {
    setWorking(true)
    setError(null)
    try {
      await settlePayment(id, resultado, slug)
      navigate(path(`/pedido/${id}`), { replace: true })
    } catch (e) {
      setError(e)
      setWorking(false)
    }
  }

  return (
    <div className="gateway">
      <div className="gateway__card page-enter">
        <span className="gateway__flag">Pasarela simulada</span>

        {order ? (
          <>
            <p className="gateway__amount">{money(order.total)}</p>
            <p className="gateway__ref">
              Pedido #{order.number} · {restaurant.name}
            </p>
          </>
        ) : error ? (
          <p className="gateway__ref">{error.message}</p>
        ) : (
          <FoodLoader label="Buscando el pedido" />
        )}

        <p className="gateway__note">
          Acá va a ir el checkout de Mercado Pago. El backend va a crear la
          preferencia, devolver su <code>init_point</code> y el navegador va a
          salir de la app. Mientras tanto, elegí con qué respuesta querés volver.
        </p>

        <div className="gateway__actions">
          {/* Los valores son los que espera el backend, en castellano. */}
          <button
            type="button"
            className="btn btn--primary"
            disabled={!order || working}
            onClick={() => resolver('aprobado')}
          >
            Volver con el pago aprobado
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!order || working}
            onClick={() => resolver('rechazado')}
          >
            Volver con el pago rechazado
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate(path(`/pedido/${id}`))}
          >
            Ver el pedido sin pagar
          </button>
        </div>
      </div>
    </div>
  )
}
