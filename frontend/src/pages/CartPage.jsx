import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Ticket from '../components/cart/Ticket.jsx'
import { StepBar, ModeSwitch } from '../components/Topbar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { money } from '../lib/format.js'
import { useQuote } from '../lib/useQuote.js'
import { useCart } from '../store/CartProvider.jsx'
import { useVenue } from '../store/VenueProvider.jsx'

export default function CartPage() {
  const cart = useCart()
  const navigate = useNavigate()
  const { path, restaurant } = useVenue()
  const { quote } = useQuote(cart)
  const [draftCoupon, setDraftCoupon] = useState(cart.couponCode || '')

  if (cart.isEmpty) {
    return (
      <div className="shell">
        <StepBar title="Tu pedido" back={path()} />
        <div className="empty">
          <p className="empty__title">El pedido está vacío</p>
          <p>Elegí algo de la carta y vuelve a aparecer acá.</p>
          <p style={{ marginTop: 'var(--s5)' }}>
            <button type="button" className="btn btn--primary" onClick={() => navigate(path())}>
              Ver la carta
            </button>
          </p>
        </div>
      </div>
    )
  }

  const cerrado = restaurant && !restaurant.isOpen
  const belowMinimum = quote?.belowMinimum
  const faltante = belowMinimum ? quote.minOrder - quote.subtotal : 0

  return (
    <div className="shell">
      <StepBar title="Tu pedido" back={path()} />

      <div className="cartpage page-enter">
        <Steps current={1} />

        <div style={{ marginBottom: 'var(--s5)' }}>
          <ModeSwitch />
        </div>

        <Ticket
          quote={quote}
          mode={cart.mode}
          editable
          onQty={cart.setQty}
          onRemove={cart.remove}
          title="Tu pedido"
        />

        {quote?.coupon ? (
          <div className="coupon__applied">
            <span>
              <Icon name="ticket" size={16} /> {quote.coupon.code} · {quote.coupon.label}
            </span>
            <button
              type="button"
              className="tline__drop"
              title="Sacar el descuento"
              aria-label="Sacar el descuento"
              onClick={() => {
                cart.setCoupon('')
                setDraftCoupon('')
              }}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="coupon">
              <div className="field" style={{ flex: 1 }}>
                <label className="u-sr" htmlFor="cupon">
                  Código de descuento
                </label>
                <input
                  id="cupon"
                  className="field__input"
                  placeholder="CÓDIGO"
                  value={draftCoupon}
                  onChange={(e) => setDraftCoupon(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => cart.setCoupon(draftCoupon)}
                disabled={!draftCoupon.trim()}
              >
                Aplicar
              </button>
            </div>
            {quote?.couponError && <p className="field__error">{quote.couponError}</p>}
            <p className="coupon__hint">Para probar: FRIEDBOX10, PRIMERA o ENVIOGRATIS.</p>
          </>
        )}

        {/* Lo que el servidor encontró mal: un plato que salió de la
            carta, una opción que ya no existe, un grupo sin elegir. */}
        {quote?.issues?.length > 0 && (
          <div className="notice notice--warn" style={{ marginTop: 'var(--s5)' }}>
            <Icon name="ticket" size={18} />
            <span>
              {quote.issues.map((issue, i) => (
                <span key={i} style={{ display: 'block' }}>
                  {issue.mensaje}
                </span>
              ))}
            </span>
          </div>
        )}

        {cerrado && (
          <div className="notice notice--warn" style={{ marginTop: 'var(--s5)' }}>
            <Icon name="clock" size={18} />
            <span>
              {restaurant.closedMessage ||
                'Ahora estamos cerrados. Guardamos tu pedido para cuando abramos.'}
            </span>
          </div>
        )}

        {belowMinimum && (
          <div className="notice notice--warn" style={{ marginTop: 'var(--s5)' }}>
            <Icon name="bike" size={18} />
            <span>
              El envío arranca en {money(quote.minOrder)}. Te faltan {money(faltante)} o podés
              pasar a retirar por el local.
            </span>
          </div>
        )}

        <div className="cartpage__actions">
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={!quote || belowMinimum || !quote.valid || cerrado}
            onClick={() => navigate(path('/checkout'))}
          >
            Continuar · {money(quote ? quote.total : cart.estimate)}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            style={{ marginTop: 'var(--s2)' }}
            onClick={() => navigate(path())}
          >
            Seguir agregando
          </button>
        </div>
      </div>
    </div>
  )
}

export function Steps({ current }) {
  const steps = ['Pedido', 'Datos', 'Pago']
  return (
    <div className="steps" aria-label={`Paso ${current} de 3`}>
      {steps.map((name, i) => {
        const n = i + 1
        const state = n < current ? 'done' : n === current ? 'now' : 'todo'
        return (
          <div key={name} style={{ display: 'contents' }}>
            <span className="steps__item" data-state={state}>
              <span className="steps__bead" />
              {name}
            </span>
            {n < steps.length && <span className="steps__link" />}
          </div>
        )
      })}
    </div>
  )
}
