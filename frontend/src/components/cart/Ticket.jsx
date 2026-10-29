import { clock, money } from '../../lib/format.js'
import { useVenue } from '../../store/VenueProvider.jsx'
import Icon from '../ui/Icon.jsx'

/**
 * La comanda. Es la misma pieza en el carrito, en el checkout y en el
 * pedido confirmado: cambia sólo si se puede editar y qué pie lleva.
 */
export default function Ticket({
  quote,
  mode,
  editable = false,
  onQty,
  onRemove,
  title = 'Comanda',
  reference,
  when,
  footer,
}) {
  const { restaurant } = useVenue()

  if (!quote) return null

  return (
    <div className="ticket">
      <header className="ticket__head">
        <p className="ticket__logo">{restaurant?.name}</p>
        <p className="ticket__meta">
          {title} · {when || clock()} · {mode === 'delivery' ? 'Envío' : 'Retiro'}
        </p>
        {reference && <p className="ticket__meta">Pedido {reference}</p>}
      </header>

      <hr className="ticket__rule" />

      <ul className="ticket__lines">
        {quote.lines.map((line) => (
          <li key={line.key} className="tline">
            <span className="tline__qty">{line.qty}×</span>
            <div>
              <p className="tline__name">{line.name ?? 'Plato no disponible'}</p>
              {line.optionsLabel && <p className="tline__opts">{line.optionsLabel}</p>}
              {line.note && <p className="tline__note">“{line.note}”</p>}
            </div>
            <span className="tline__total">{money(line.total)}</span>

            {editable && (
              <div className="tline__tools">
                <span className="tline__step">
                  <button type="button" onClick={() => onQty(line.key, line.qty - 1)} aria-label={`Quitar uno de ${line.name}`}>
                    <Icon name="minus" size={14} strokeWidth={2.2} />
                  </button>
                  <span>{line.qty}</span>
                  <button type="button" onClick={() => onQty(line.key, line.qty + 1)} aria-label={`Sumar uno de ${line.name}`}>
                    <Icon name="plus" size={14} strokeWidth={2.2} />
                  </button>
                </span>
                <button type="button" className="tline__drop" onClick={() => onRemove(line.key)}>
                  Sacar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <hr className="ticket__rule" style={{ marginTop: 'var(--s4)' }} />

      <div className="ticket__sums">
        <p className="tsum tsum--muted">
          <span>Subtotal</span>
          <span>{money(quote.subtotal)}</span>
        </p>
        {quote.promoDiscount > 0 && (
          <p className="tsum tsum--save">
            <span>Promo {quote.promoLabel ? `(${quote.promoLabel})` : ''}</span>
            <span>− {money(quote.promoDiscount)}</span>
          </p>
        )}
        {quote.discount > 0 && (
          <p className="tsum tsum--save">
            <span>Descuento {quote.coupon ? `(${quote.coupon.code})` : ''}</span>
            <span>− {money(quote.discount)}</span>
          </p>
        )}
        <p className="tsum tsum--muted">
          <span>{mode === 'delivery' ? 'Envío' : 'Retiro en el local'}</span>
          <span>{quote.shipping > 0 ? money(quote.shipping) : 'sin cargo'}</span>
        </p>
        <p className="tsum tsum--total">
          <span>Total</span>
          <span>{money(quote.total)}</span>
        </p>
      </div>

      {footer && <p className="ticket__stamp">{footer}</p>}
    </div>
  )
}
