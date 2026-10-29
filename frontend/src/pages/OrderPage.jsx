import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Ticket from '../components/cart/Ticket.jsx'
import { StepBar } from '../components/Topbar.jsx'
import Icon from '../components/ui/Icon.jsx'
import FoodLoader from '../components/ui/FoodLoader.jsx'
import { clock } from '../lib/format.js'
import { getOrder, payOrder, syncPayment } from '../api/index.js'
import { useVenue } from '../store/VenueProvider.jsx'

export default function OrderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { restaurant, slug, path } = useVenue()

  const [order, setOrder] = useState(null)
  const [error, setError] = useState(null)
  const [pagando, setPagando] = useState(false)
  const [avisoPago, setAvisoPago] = useState(null)

  // Al volver de Mercado Pago la URL trae ?payment_id=…&status=…. No se
  // le cree: sólo sirve para decir «estamos confirmando» mientras el
  // backend le pregunta a Mercado Pago.
  const volviendoDePagar = new URLSearchParams(window.location.search).has('payment_id')

  /** Un pedido de Mercado Pago sin pagar se pregunta a Mercado Pago. */
  const esperaPago = (o) =>
    o.paymentMethod === 'mercadopago' && ['pendiente_de_pago', 'pago_rechazado'].includes(o.status)

  useEffect(() => {
    let vigente = true
    getOrder(id, slug)
      .then((o) => (esperaPago(o) ? syncPayment(id, slug).catch(() => o) : o))
      .then((o) => vigente && setOrder(o))
      .catch((e) => vigente && setError(e))
    return () => {
      vigente = false
    }
  }, [id, slug])

  /* Mientras el pedido esté en marcha se vuelve a mirar cada tanto: el
     local lo mueve desde su panel y el cliente lo ve sin recargar. Si
     está esperando el pago, se mira más seguido y preguntando a Mercado
     Pago: el pago tarda unos segundos en acreditarse. */
  const terminado = order && ['entregado', 'cancelado', 'pago_rechazado'].includes(order.status)
  const pagoPendiente = order && order.status === 'pendiente_de_pago' && order.paymentMethod === 'mercadopago'
  useEffect(() => {
    if (!order || terminado) return
    const timer = setInterval(
      () => {
        if (document.visibilityState !== 'visible') return
        ;(pagoPendiente ? syncPayment(id, slug) : getOrder(id, slug)).then(setOrder).catch(() => {
          /* Un corte de red no borra lo que ya se ve. */
        })
      },
      pagoPendiente ? 6000 : 20000,
    )
    return () => clearInterval(timer)
  }, [id, slug, order, terminado, pagoPendiente])

  const irAPagar = async () => {
    setPagando(true)
    setAvisoPago(null)
    try {
      const url = await payOrder(id, slug)
      // Mercado Pago es otro dominio; el simulador vive en la app.
      if (/^https?:/i.test(url)) {
        window.location.href = url
        return
      }
      navigate(path(url))
    } catch (e) {
      setAvisoPago(e.message)
      setPagando(false)
    }
  }

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
  const cancelado = order.status === 'cancelado'
  const entregado = order.status === 'entregado'
  const paso = order.flowIndex >= 0 ? order.flow[order.flowIndex] : null
  // El motivo que escribió el local, si escribió uno.
  const motivo = cancelado
    ? [...order.events].reverse().find((e) => e.status === 'cancelado')?.note
    : null
  const cuando = order.createdAt ? clock(new Date(order.createdAt)) : ''

  return (
    <div className="shell">
      <StepBar title={`Pedido #${order.number}`} back={path()} />

      <div className="orderview page-enter">
        <div className="orderview__hero">
          <div
            className={
              rechazado || cancelado
                ? 'orderview__mark orderview__mark--bad'
                : pendiente
                  ? 'orderview__mark orderview__mark--wait'
                  : 'orderview__mark'
            }
          >
            <Icon
              name={rechazado || cancelado ? 'close' : pendiente ? 'clock' : 'check'}
              size={30}
              strokeWidth={2.4}
            />
          </div>
          <h1 className="orderview__title">
            {cancelado
              ? 'Pedido cancelado'
              : rechazado
                ? 'El pago no pasó'
                : pendiente
                  ? 'Falta el pago'
                  : entregado
                    ? '¡Que lo disfrutes!'
                    : paso?.name || 'Pedido confirmado'}
          </h1>
          <p className="orderview__sub">
            {cancelado
              ? motivo ||
                `Si tenés dudas, escribinos${restaurant.phone ? ` al ${restaurant.phone}` : ''}.`
              : entregado
                ? 'El pedido ya está entregado. Gracias por elegirnos.'
                : rechazado
                  ? 'No se descontó nada. Probá con otro medio de pago o pagá al recibir.'
                  : pendiente
                    ? volviendoDePagar
                      ? 'Estamos confirmando tu pago con Mercado Pago. Tarda unos segundos.'
                      : 'Te reservamos el pedido hasta que se acredite el pago.'
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
            cancelado
              ? 'Pedido cancelado'
              : rechazado
                ? 'Pago rechazado'
                : pendiente
                  ? 'A la espera del pago'
                  : `Gracias, ${order.customer.name}`
          }
        />

        <div style={{ display: 'grid', gap: 'var(--s3)', marginTop: 'var(--s6)' }}>
          {avisoPago && (
            <div className="notice notice--warn">
              <Icon name="ticket" size={18} />
              <span>{avisoPago}</span>
            </div>
          )}
          {(rechazado || pendiente) && (
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={irAPagar}
              disabled={pagando}
            >
              {pagando ? 'Abriendo Mercado Pago…' : rechazado ? 'Reintentar el pago' : 'Ir a pagar'}
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
