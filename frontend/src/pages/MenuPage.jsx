import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MenuBoard from '../components/menu/MenuBoard.jsx'
import ItemSheet from '../components/menu/ItemSheet.jsx'
import Ticket from '../components/cart/Ticket.jsx'
import Topbar from '../components/Topbar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { money, pluralize } from '../lib/format.js'
import { useQuote } from '../lib/useQuote.js'
import { useCart } from '../store/CartProvider.jsx'
import { usePrefs } from '../store/PrefsProvider.jsx'
import { useVenue } from '../store/VenueProvider.jsx'

export default function MenuPage() {
  const cart = useCart()
  const prefs = usePrefs()
  const navigate = useNavigate()
  const menu = useVenue()

  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [openItem, setOpenItem] = useState(null)
  const [activeCat, setActiveCat] = useState(null)

  const sectionRefs = useRef({})
  const searchRef = useRef(null)
  const { quote, loading } = useQuote(cart)

  /* Enlace directo a un plato: /?plato=b-clasica */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('plato')
    const found = wanted && menu.items.find((i) => i.id === wanted)
    if (found) setOpenItem(found)
  }, [menu.items])

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  /* Resalta el rubro que se está mirando. */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiveCat(visible.target.id.replace('rubro-', ''))
      },
      { rootMargin: '-140px 0px -70% 0px', threshold: 0 },
    )
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [menu.items, prefs.layout, query])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const buckets = {}
    for (const item of menu.items) {
      if (needle) {
        const haystack = `${item.name} ${item.description}`.toLowerCase()
        if (!haystack.includes(needle)) continue
      }
      ;(buckets[item.category] ||= []).push(item)
    }
    return buckets
  }, [menu.items, query])

  const visibleCats = useMemo(
    () => menu.categories.filter((c) => (filtered[c.id] || []).length),
    [menu.categories, filtered],
  )

  const goToCat = (id) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveCat(id)
  }

  const quickAdd = (item) => {
    cart.add({
      itemId: item.id,
      qty: 1,
      optionIds: [],
      note: '',
      snapshot: { name: item.name, unitPrice: item.price, art: item.art },
    })
  }

  const addFromSheet = (payload) => {
    cart.add(payload)
    setOpenItem(null)
  }

  return (
    <div className="shell">
      <Topbar onSearch={() => setSearchOpen((v) => !v)} searchOpen={searchOpen} />

      <h1 className="u-sr">
        {menu.restaurant.name} · {menu.restaurant.tagline}
      </h1>

      {menu.promos.length > 0 && (
        <div className="marquee u-scroll-x enter-1" aria-label="Lo del día">
          {menu.promos.map((promo) => {
            const target = menu.items.find((i) => i.id === promo.itemId)
            return (
              <button
                key={promo.id}
                type="button"
                className="promo"
                onClick={() => target && setOpenItem(target)}
              >
                <span>
                  <span className="promo__kicker u-mono">{promo.kicker}</span>
                  <span className="promo__title">{promo.title}</span>
                  <span className="promo__body">{promo.body}</span>
                </span>
                <span className="promo__go" aria-hidden="true">
                  <Icon name="next" size={18} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!menu.restaurant.isOpen && (
        <p className="cerrado enter-2" role="status">
          <b>Ahora estamos cerrados.</b>{' '}
          {menu.restaurant.closedMessage || 'Podés mirar la carta, pero todavía no se puede pedir.'}
        </p>
      )}

      <dl className="statline enter-2">
        <span className={'statline__open' + (menu.restaurant.isOpen ? '' : ' is-cerrado')}>
          <i aria-hidden="true" />
          {menu.restaurant.isOpen ? 'Abierto' : 'Cerrado'}
        </span>
        <div>
          <dt>Demora</dt>
          <dd>
            {cart.mode === 'delivery' ? menu.restaurant.etaDelivery : menu.restaurant.etaPickup}
          </dd>
        </div>
        <div>
          <dt>{cart.mode === 'delivery' ? 'Envío' : 'Retiro'}</dt>
          <dd>
            {cart.mode === 'delivery' ? money(menu.restaurant.deliveryFee) : 'sin cargo'}
          </dd>
        </div>
        <div>
          <dt>{cart.mode === 'delivery' ? 'Mínimo' : 'Dirección'}</dt>
          <dd>
            {cart.mode === 'delivery' ? money(menu.restaurant.minOrder) : menu.restaurant.address}
          </dd>
        </div>
      </dl>

      <nav className="chips enter-2" aria-label="Rubros de la carta">
        <div className="chips__track u-scroll-x">
          {visibleCats.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="chip"
              aria-current={activeCat === cat.id}
              onClick={() => goToCat(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </nav>

      {searchOpen && (
        <div className="search">
          <div className="search__row field">
            <Icon name="search" size={18} className="search__icon" />
            <input
              ref={searchRef}
              className="field__input"
              type="search"
              placeholder="Buscar un plato"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="layout">
        <main className="main u-page">
          {visibleCats.length === 0 ? (
            query.trim() ? (
              <div className="empty">
                <p className="empty__title">No hay nada con “{query}”</p>
                <p>Probá con otro nombre o mirá la carta completa.</p>
                <p style={{ marginTop: 'var(--s4)' }}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setQuery('')}
                  >
                    Ver la carta completa
                  </button>
                </p>
              </div>
            ) : (
              // Un local recién dado de alta todavía no cargó sus platos.
              <div className="empty">
                <p className="empty__title">{menu.restaurant.name} todavía no publicó su carta</p>
                <p>Volvé en un rato, o escribiles para pedir por teléfono.</p>
                {menu.restaurant.phone && (
                  <p style={{ marginTop: 'var(--s4)' }} className="u-mono">
                    {menu.restaurant.phone}
                  </p>
                )}
              </div>
            )
          ) : (
            <MenuBoard
              categories={visibleCats}
              itemsByCategory={filtered}
              layout={prefs.layout}
              qtyOf={cart.qtyOf}
              onOpen={setOpenItem}
              onAdd={quickAdd}
              sectionRefs={sectionRefs}
            />
          )}
        </main>

        <aside className="sidecart enter-3" aria-label="Tu pedido">
          {cart.isEmpty ? (
            <div className="ticket">
              <p className="ticket__logo">Tu pedido</p>
              <p className="ticket__meta" style={{ textAlign: 'left', marginTop: 8 }}>
                Todavía no elegiste nada. Tocá un plato para empezar.
              </p>
            </div>
          ) : (
            <>
              <Ticket
                quote={quote}
                mode={cart.mode}
                editable
                onQty={cart.setQty}
                onRemove={cart.remove}
                title="Tu pedido"
                footer={null}
              />
              <button
                type="button"
                className="btn btn--primary btn--block"
                style={{ marginTop: 'var(--s4)' }}
                onClick={() => navigate(menu.path('/pedido'))}
              >
                Revisar el pedido
              </button>
            </>
          )}
        </aside>
      </div>

      {!cart.isEmpty && (
        <div className={loading ? 'orderbar is-recalc' : 'orderbar'}>
          <div className="orderbar__inner">
            <button type="button" className="orderbar__btn" onClick={() => navigate(menu.path('/pedido'))}>
              <span key={cart.count} className="orderbar__count">
                {cart.count}
              </span>
              <span className="orderbar__label">
                Ver el pedido
                <span className="u-sr">
                  {' '}
                  con {cart.count} {pluralize(cart.count, 'ítem', 'ítems')}
                </span>
              </span>
              <span className="orderbar__total">{money(quote ? quote.total : cart.estimate)}</span>
            </button>
          </div>
        </div>
      )}

      {openItem && (
        <ItemSheet item={openItem} onClose={() => setOpenItem(null)} onConfirm={addFromSheet} />
      )}
    </div>
  )
}
