import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Steps } from './CartPage.jsx'
import Ticket from '../components/cart/Ticket.jsx'
import { StepBar } from '../components/Topbar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { money } from '../lib/format.js'
import { useQuote } from '../lib/useQuote.js'
import { createOrder } from '../api/index.js'
import { useCart } from '../store/CartProvider.jsx'
import { useVenue } from '../store/VenueProvider.jsx'

const PAYMENTS = [
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    desc: 'Tarjeta, dinero en cuenta o transferencia. Se paga antes de que salga el pedido.',
    icon: 'card',
  },
  {
    id: 'efectivo',
    name: 'Efectivo al recibir',
    desc: 'Avisanos con cuánto pagás así el repartidor lleva el vuelto.',
    icon: 'cash',
  },
  {
    id: 'transferencia',
    name: 'Transferencia',
    desc: 'Te mandamos el alias por WhatsApp apenas confirmamos el pedido.',
    icon: 'ticket',
  },
]

const empty = { name: '', phone: '', address: '', apt: '', email: '', changeFor: '' }

export default function CheckoutPage() {
  const cart = useCart()
  const navigate = useNavigate()
  const { restaurant, slug, path } = useVenue()
  const { quote, loading } = useQuote(cart)

  const [form, setForm] = useState(empty)
  const [payment, setPayment] = useState('mercadopago')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState({})
  const [aviso, setAviso] = useState(null)
  const [sending, setSending] = useState(false)

  if (cart.isEmpty) return <Navigate to={path()} replace />

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setAviso(null)
    setSending(true)

    try {
      // Quien valida es el servidor. El front no repite las reglas para
      // no terminar con dos versiones de la verdad que se desincronizan.
      const { checkoutUrl } = await createOrder({
        tenant: slug,
        lines: cart.lines,
        mode: cart.mode,
        couponCode: cart.couponCode,
        paymentMethod: payment,
        customer: form,
        note,
      })
      cart.clear()

      // Con Mercado Pago conectado, checkoutUrl va a ser una dirección
      // de otro dominio: ahí hay que salir de la app, no navegar dentro.
      if (/^https?:/i.test(checkoutUrl)) {
        window.location.href = checkoutUrl
        return
      }
      navigate(checkoutUrl, { replace: true })
    } catch (error) {
      setSending(false)

      if (error.campos) {
        setErrors(error.campos)
        document.getElementById(Object.keys(error.campos)[0])?.focus()
        return
      }

      setErrors({})
      setAviso(
        error.issues?.length ? error.issues.map((i) => i.mensaje).join(' ') : error.message,
      )
    }
  }

  const field = (key, label, extra = {}) => (
    <div className="field" data-invalid={Boolean(errors[key])}>
      <label className="field__label" htmlFor={key}>
        {label}
      </label>
      <input id={key} className="field__input" value={form[key]} onChange={set(key)} {...extra} />
      {errors[key] && <p className="field__error">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="shell">
      <StepBar title="Datos y pago" back={path('/pedido')} />

      <form className="checkout page-enter" onSubmit={submit} noValidate>
        <Steps current={2} />

        <section className="block">
          <h2 className="block__title">Cómo lo recibís</h2>
          {restaurant.acceptsDelivery && (
            <label className="pickcard">
              <input
                type="radio"
                name="mode"
                checked={cart.mode === 'delivery'}
                onChange={() => cart.setMode('delivery')}
              />
              <span className="pickcard__text">
                <span className="pickcard__name">
                  <Icon name="bike" size={18} /> Envío a domicilio
                </span>
                <span className="pickcard__desc">Llega en {restaurant.etaDelivery}.</span>
              </span>
              <span className="pickcard__side">{money(restaurant.deliveryFee)}</span>
            </label>
          )}
          {restaurant.acceptsPickup && (
            <label className="pickcard">
              <input
                type="radio"
                name="mode"
                checked={cart.mode === 'pickup'}
                onChange={() => cart.setMode('pickup')}
              />
              <span className="pickcard__text">
                <span className="pickcard__name">
                  <Icon name="store" size={18} /> Retiro por el local
                </span>
                <span className="pickcard__desc">
                  {restaurant.address} · listo en {restaurant.etaPickup}.
                </span>
              </span>
              <span className="pickcard__side">sin cargo</span>
            </label>
          )}
        </section>

        <section className="block">
          <h2 className="block__title">Tus datos</h2>
          <div className="block__grid block__grid--2">
            {field('name', 'Nombre', { autoComplete: 'name', placeholder: 'Como te llamamos' })}
            {field('phone', 'Teléfono', {
              autoComplete: 'tel',
              inputMode: 'tel',
              placeholder: '11 5555 5555',
            })}
          </div>
          {cart.mode === 'delivery' && (
            <div className="block__grid block__grid--2" style={{ marginTop: 'var(--s4)' }}>
              {field('address', 'Dirección', {
                autoComplete: 'street-address',
                placeholder: 'Calle y altura',
              })}
              {field('apt', 'Piso y depto', { placeholder: 'Opcional' })}
            </div>
          )}
          <div style={{ marginTop: 'var(--s4)' }} className="field">
            <label className="field__label" htmlFor="nota">
              Algo que tengamos que saber
            </label>
            <textarea
              id="nota"
              className="field__textarea"
              placeholder="Timbre roto, golpear la puerta, dejar en portería."
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </section>

        <section className="block">
          <h2 className="block__title">Cómo pagás</h2>
          {PAYMENTS.map((option) => (
            <label key={option.id} className="pickcard">
              <input
                type="radio"
                name="payment"
                checked={payment === option.id}
                onChange={() => setPayment(option.id)}
              />
              <span className="pickcard__text">
                <span className="pickcard__name">
                  <Icon name={option.icon} size={18} /> {option.name}
                </span>
                <span className="pickcard__desc">{option.desc}</span>
              </span>
            </label>
          ))}

          {payment === 'efectivo' && (
            <div className="field" style={{ marginTop: 'var(--s4)' }}>
              <label className="field__label" htmlFor="changeFor">
                Pagás con
              </label>
              <input
                id="changeFor"
                className="field__input"
                inputMode="numeric"
                placeholder={`Total ${money(quote?.total || 0)}`}
                value={form.changeFor}
                onChange={set('changeFor')}
              />
            </div>
          )}
        </section>

        <section className="block">
          <h2 className="block__title">Resumen</h2>
          <Ticket quote={quote} mode={cart.mode} title="A confirmar" footer={null} />
        </section>

        {aviso && (
          <div className="notice notice--warn" style={{ marginBottom: 'var(--s5)' }}>
            <Icon name="ticket" size={18} />
            <span>{aviso}</span>
          </div>
        )}

        {!restaurant.isOpen && (
          <div className="notice notice--warn" style={{ marginTop: 'var(--s5)' }}>
            <Icon name="clock" size={18} />
            <span>
              {restaurant.closedMessage ||
                'Ahora estamos cerrados, así que todavía no podemos tomar el pedido.'}
            </span>
          </div>
        )}

        <div className={loading ? 'paybar is-recalc' : 'paybar'}>
          <div className="paybar__row">
            <span className="paybar__label">Total a pagar</span>
            <span className="paybar__total u-price">{money(quote?.total || 0)}</span>
          </div>
          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={sending || !quote || !restaurant.isOpen}
          >
            {sending
              ? 'Confirmando…'
              : payment === 'mercadopago'
                ? 'Pagar con Mercado Pago'
                : 'Confirmar el pedido'}
          </button>
        </div>
      </form>
    </div>
  )
}
