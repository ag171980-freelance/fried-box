import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AdminApp from './admin/AdminApp.jsx'
import App from './App.jsx'
import { BRAND } from './brand.js'
import { CartProvider } from './store/CartProvider.jsx'
import { PrefsProvider } from './store/PrefsProvider.jsx'
import { VenueProvider } from './store/VenueProvider.jsx'
import './styles/index.css'

/**
 * Dos aplicaciones en el mismo árbol.
 *
 *   /        la carta, para el cliente
 *   /admin   el panel, para el local
 *
 * El panel cuelga aparte y no comparte proveedores con la carta: no
 * necesita carrito ni preferencias de estilo, y pedirle la carta al
 * backend dos veces sería trabajo de más. Lo único que comparten son
 * los tokens de CSS y el catálogo de estilos y paletas.
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route
          path="/*"
          element={
            <VenueProvider>
              <PrefsProvider tenant={BRAND}>
                <CartProvider tenant={BRAND}>
                  <App />
                </CartProvider>
              </PrefsProvider>
            </VenueProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
