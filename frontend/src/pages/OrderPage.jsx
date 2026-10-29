import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Ticket from '../components/cart/Ticket.jsx'
import { StepBar } from '../components/Topbar.jsx'
import Icon from '../components/ui/Icon.jsx'
import FoodLoader from '../components/ui/FoodLoader.jsx'
import { clock } from '../lib/format.js'
import { getOrder } from '../api/index.js'
import { useVenue } from '../store/VenueProvider.jsx'

export default function OrderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { restaurant, slug, path } = useVenue()

  const [order, setOrder] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    getOrder(id, slug)
      .then((o) => vigente && setOrder(o))
      .catch((e) => vigente && setError(e))
    return () => {
      vigente = false
    }
  }, [id, slug])

  if (error) {
    return (
      <div className="shell">
        <StepBar title="Pedido" back={path()} />
        <div className="empty page-enter">
          <p className="empty__title">No encontramos ese pedido</p>
          <p>
            El enlace puede estar incompleto, o el pedido se hizo desde otro local.
          </p>
          <p style={{ marginTop: 'var(--s5)' }}>
            <button type="button" className="btn btn--primary" onClick={() => navigate(path())}>
              Volver a la carta
            </button>
          </p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="shell">
        <StepBar title="Pedido" back={path()} />
        <FoodLoader label="Buscando tu pedido" />
      </div>
    )
  }

  const rechazado = order.status === 'pago_rechazado'
  const pendiente = order.status === 'pendiente_de_pago'
  const cuando = order.createdAt ? clock(new Date(order.createdAt)) : ''

  return (
    <div className="shell">
      <StepBar title={`Pedido #${order.number}`} back={path()} />

      <div className="orderview page-enter">
        <div className="orderview__hero">
          <div
            className={
              rechazado
                ? 'orderview__mark orderview__mark--bad'
                : pendiente
                  ? 'orderview__mark orderview__mark--wait'
                  : 'orderview__mark'
            }
          >
            <Icon
              name={rechazado ? 'close' : pendiente ? 'clock' : 'check'}
              size={30}
              strokeWidth={2.4}
            />
          </div>
          <h1 className="orderview__title">
            {rechazado ? 'El pago no pasó' : pendiente ? 'Falta el pago' : 'Pedido confirmado'}
          </h1>
          <p className="orderview__sub">
            {rechazado
              ? 'No se descontó nada. Probá con otro medio de pago o pagá al recibir.'
              : pendiente
                ? 'Te reservamos el pedido hasta que se acredite el pago.'
                : order.mode === 'delivery'
                  ? `Sale para ${order.customer.address} en ${order.eta}.`
                  : `Te esperamos en ${restaurant.address} en ${order.eta}.`}
          </p>
        </div>

        {/* Los pasos, y en cuál va, los decide el servidor: el front no
            tiene que saber qué estado sigue a cuál. */}
        {order.flowIndex >= 0 && (
          <div className="track">
            {order.flow.map((paso, i) => {
              const estado = i < order.flowIndex ? 'done' : i === order.flowIndex ? 'now' : 'todo'
              const evento = order.events.find((e) => e.status === paso.id)
              return (
                <div key={paso.id} className="trackstep" data-state={estado}>
                  <span className="trackstep__bead">
                    {estado === 'done' && <Icon name="check" size={13} strokeWidth={3} />}
                  </span>
                  <div>
                    <p className="trackstep__name">{paso.name}</p>
                    {evento?.at && <p className="trackstep__when">{clock(new Date(evento.at))}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <Ticket
          quote={order}
          mode={order.mode}
          title="Comanda"
          reference={`#${order.number}`}
          when={cuando}
          footer={
            rechazado
              ? 'Pago rechazado'
              : pendiente
                ? 'A la espera del pago'
                : `Gracias, ${order.customer.name}`
          }
        />

        <div style={{ display: 'grid', gap: 'var(--s3)', marginTop: 'var(--s6)' }}>
          {(rechazado || pendiente) && (
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => navigate(path(`/pago-simulado/${order.id}`))}
            >
              {rechazado ? 'Reintentar el pago' : 'Ir a pagar'}
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--block" onClick={() => navigate(path())}>
            Volver a la carta
          </button>
        </div>
      </div>
    </div>
  )
}
