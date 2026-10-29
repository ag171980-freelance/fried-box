import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import FoodLoader from '../components/ui/FoodLoader.jsx'
import AdminShell from './AdminShell.jsx'
import LoginPage from './LoginPage.jsx'
import { PanelProvider, usePanel } from './PanelProvider.jsx'
import Carta from './secciones/Carta.jsx'
import Local from './secciones/Local.jsx'
import Opciones from './secciones/Opciones.jsx'
import Promos from './secciones/Promos.jsx'
import Rubros from './secciones/Rubros.jsx'
import * as api from './api.js'

/**
 * El panel.
 *
 * Hay dos estados y nada en el medio: o hay token y se carga el panel,
 * o se muestra el login. La verificación real la hace el backend en
 * cada llamada; acá sólo decidimos qué dibujar.
 */
export default function AdminApp() {
  const [autenticado, setAutenticado] = useState(() => Boolean(api.token.leer()))

  if (!autenticado) {
    return <LoginPage onEntrar={() => setAutenticado(true)} />
  }

  return (
    <PanelProvider>
      <Compuerta onSalir={() => setAutenticado(false)} />
    </PanelProvider>
  )
}

/**
 * Entre el token y las pantallas hay una carga que puede fallar. Si
 * falla por sesión vencida, el token ya se borró en api.js y lo único
 * que queda es volver al login.
 */
function Compuerta({ onSalir }) {
  const panel = usePanel()

  useEffect(() => {
    if (panel.error?.status === 401) onSalir()
  }, [panel.error, onSalir])

  if (panel.cargando) {
    return (
      <div className="ad-cargando">
        <FoodLoader full label="Abriendo el panel" />
      </div>
    )
  }

  if (panel.error) {
    return (
      <div className="ad-login">
        <div className="ad-login__card">
          <h1 className="ad-login__titulo">No pudimos abrir el panel</h1>
          <p className="ad-alerta ad-alerta--error">{panel.error.message}</p>
          <button type="button" className="ad-btn ad-btn--primario ad-btn--bloque" onClick={panel.recargar}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <AdminShell onSalir={onSalir}>
      <Routes>
        <Route path="/" element={<Carta />} />
        <Route path="/rubros" element={<Rubros />} />
        <Route path="/opciones" element={<Opciones />} />
        <Route path="/promos" element={<Promos />} />
        <Route path="/local" element={<Local />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminShell>
  )
}
