import { NavLink, useNavigate } from 'react-router-dom'
import Icon from '../components/ui/Icon.jsx'
import * as api from './api.js'
import { useAccion, usePanel } from './PanelProvider.jsx'

const SECCIONES = [
  { a: '/admin', icono: 'list', texto: 'Carta', exacto: true },
  { a: '/admin/rubros', icono: 'tag', texto: 'Rubros' },
  { a: '/admin/opciones', icono: 'sliders', texto: 'Opciones' },
  { a: '/admin/promos', icono: 'ticket', texto: 'Promos' },
  { a: '/admin/local', icono: 'store', texto: 'Local' },
]

/**
 * El marco del panel: quién sos, el interruptor de abierto/cerrado y la
 * navegación.
 *
 * El interruptor vive acá arriba y no adentro de «Local» a propósito:
 * es lo que más se toca en el día (se abre al mediodía, se cierra
 * cuando se acaba la cocina) y tiene que estar a un toque desde
 * cualquier pantalla.
 */
export default function AdminShell({ children, onSalir }) {
  const { datos } = usePanel()
  const navigate = useNavigate()
  const abierto = datos.settings.isOpen

  async function salir() {
    await api.logout()
    onSalir()
  }

  return (
    <div className="ad">
      <header className="ad-top">
        <div className="ad-top__marca">
          <span className="ad-top__nombre">{datos.settings.name}</span>
          <span className="ad-top__rol">{datos.user.email}</span>
        </div>

        <InterruptorEstado />

        <button type="button" className="ad-btn ad-btn--fantasma" onClick={salir}>
          Salir
        </button>
      </header>

      {!abierto && (
        <p className="ad-aviso" role="status">
          El local está cerrado. La carta se ve, pero nadie puede terminar un pedido.
        </p>
      )}

      <nav className="ad-nav" aria-label="Secciones del panel">
        {SECCIONES.map((s) => (
          <NavLink
            key={s.a}
            to={s.a}
            end={s.exacto}
            className={({ isActive }) => 'ad-nav__item' + (isActive ? ' is-activo' : '')}
          >
            <Icon name={s.icono} size={18} />
            {s.texto}
          </NavLink>
        ))}
        <button
          type="button"
          className="ad-nav__item ad-nav__item--ver"
          onClick={() => navigate('/')}
        >
          <Icon name="next" size={18} />
          Ver la carta
        </button>
      </nav>

      <main className="ad-main">{children}</main>
    </div>
  )
}

/**
 * Abrir y cerrar.
 *
 * Al cerrar se pide un motivo, porque es lo que va a leer el cliente en
 * la carta. Si no se escribe nada, el backend pone un texto neutro.
 */
function InterruptorEstado() {
  const { datos } = usePanel()
  const { correr, ocupado } = useAccion()
  const abierto = datos.settings.isOpen

  async function alternar() {
    if (abierto) {
      const motivo = window.prompt(
        'Vas a cerrar el local. ¿Qué querés que lea el cliente?',
        datos.settings.closedMessage || 'Volvemos a abrir mañana.',
      )
      // Cancelar el cuadro deja todo como estaba; cerrar sin motivo es
      // válido y usa el texto por defecto del backend.
      if (motivo === null) return
      await correr(() => api.cambiarEstado(false, motivo))
    } else {
      await correr(() => api.cambiarEstado(true, ''))
    }
  }

  return (
    <button
      type="button"
      className={'ad-estado' + (abierto ? ' is-abierto' : ' is-cerrado')}
      onClick={alternar}
      disabled={ocupado}
      aria-pressed={abierto}
    >
      <span className="ad-estado__luz" aria-hidden="true" />
      <span className="ad-estado__texto">{abierto ? 'Abierto' : 'Cerrado'}</span>
      <span className="ad-estado__accion">{abierto ? 'Cerrar' : 'Abrir'}</span>
    </button>
  )
}
