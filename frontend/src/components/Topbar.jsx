import { useNavigate } from 'react-router-dom'
import { BRAND_NAME } from '../brand.js'
import { useCart } from '../store/CartProvider.jsx'
import { useVenue } from '../store/VenueProvider.jsx'
import Icon from './ui/Icon.jsx'

/**
 * El nombre sale de la base. BRAND_NAME es sólo el puente hasta que la
 * carta baja: la marca aparece en el cartel de carga y en el de error,
 * que se dibujan antes de que haya datos.
 */
export function Brand() {
  const { restaurant } = useVenue()

  return (
    <span className="brand">
      {restaurant?.name || BRAND_NAME}
      <span className="brand__dot" aria-hidden="true" />
    </span>
  )
}

export function ModeSwitch() {
  const cart = useCart()
  return (
    <div className="modeswitch" role="group" aria-label="Cómo lo querés recibir">
      <button
        type="button"
        className="modeswitch__opt"
        aria-pressed={cart.mode === 'delivery'}
        onClick={() => cart.setMode('delivery')}
      >
        Envío
      </button>
      <button
        type="button"
        className="modeswitch__opt"
        aria-pressed={cart.mode === 'pickup'}
        onClick={() => cart.setMode('pickup')}
      >
        Retiro
      </button>
    </div>
  )
}

/** Barra superior de la carta. */
export default function Topbar({ onSearch, searchOpen }) {
  const cart = useCart()
  const navigate = useNavigate()
  const { path } = useVenue()

  return (
    <header className="topbar">
      <Brand />
      <span className="topbar__spacer" />
      <ModeSwitch />
      <button
        type="button"
        className="iconbtn"
        onClick={onSearch}
        aria-pressed={searchOpen}
        aria-label="Buscar en la carta"
      >
        <Icon name="search" />
      </button>
      <button
        type="button"
        className="iconbtn"
        onClick={() => navigate(path('/pedido'))}
        aria-label={`Ver el pedido, ${cart.count} ítems`}
      >
        <Icon name="bag" />
      </button>
    </header>
  )
}

/** Barra superior de las pantallas internas. */
export function StepBar({ title, back = -1 }) {
  const navigate = useNavigate()
  return (
    <header className="topbar">
      <button type="button" className="iconbtn" onClick={() => navigate(back)} aria-label="Volver">
        <Icon name="back" />
      </button>
      <span className="brand" style={{ fontSize: '1.0625rem' }}>
        {title}
      </span>
      <span className="topbar__spacer" />
      <Brand />
    </header>
  )
}
