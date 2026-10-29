import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import FoodLoader from './components/ui/FoodLoader.jsx'
import { Brand } from './components/Topbar.jsx'
import CartPage from './pages/CartPage.jsx'
import CheckoutPage from './pages/CheckoutPage.jsx'
import GatewayPage from './pages/GatewayPage.jsx'
import MenuPage from './pages/MenuPage.jsx'
import OrderPage from './pages/OrderPage.jsx'
import { usePrefs } from './store/PrefsProvider.jsx'
import { useVenue } from './store/VenueProvider.jsx'

/**
 * Las rutas de la app. Cuelgan de la raíz: / es la carta, /pedido el
 * carrito, /checkout los datos.
 */
export default function App() {
  const venue = useVenue()
  const prefs = usePrefs()

  /* La paleta y el estilo de carta los configura el local en la base. */
  const theme = venue.restaurant?.theme
  const layout = venue.restaurant?.layout
  useEffect(() => {
    if (theme || layout) prefs.setVenueDefaults({ theme, layout })
    // prefs cambia de identidad en cada render; sólo interesa el local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, layout])

  if (venue.cargando) {
    return (
      <div className="shell">
        <header className="topbar">
          <Brand />
        </header>
        <FoodLoader full label="Poniendo la mesa" />
      </div>
    )
  }

  if (venue.error) {
    return <SinCarta error={venue.error} onRetry={venue.reintentar} />
  }

  return (
    <Routes>
      <Route path="/" element={<MenuPage />} />
      <Route path="/pedido" element={<CartPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/pago-simulado/:id" element={<GatewayPage />} />
      <Route path="/pedido/:id" element={<OrderPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function SinCarta({ error, onRetry }) {
  const caido = error.code === 'sin_conexion'

  return (
    <div className="shell">
      <header className="topbar">
        <Brand />
      </header>
      <div className="empty page-enter">
        <p className="empty__title">
          {caido ? 'No pudimos abrir la carta' : 'Algo salió mal'}
        </p>
        <p>{error.message}</p>
        {caido && (
          <p className="coupon__hint" style={{ marginTop: 'var(--s3)' }}>
            Si estás desarrollando: el backend se levanta con
            {' '}<code>php -S 127.0.0.1:8080 index.php</code> desde <code>backend/public</code>.
          </p>
        )}
        <p style={{ marginTop: 'var(--s5)' }}>
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Reintentar
          </button>
        </p>
      </div>
    </div>
  )
}
