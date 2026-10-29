import { useState } from 'react'
import * as api from './api.js'

/**
 * La puerta del panel.
 *
 * Un formulario y nada más. El mensaje de error es siempre el mismo que
 * manda el backend, que no distingue entre «ese mail no existe» y «esa
 * clave está mal»: contarlo sería regalar una lista de usuarios.
 */
export default function LoginPage({ onEntrar }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [entrando, setEntrando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setEntrando(true)
    setError(null)
    try {
      onEntrar(await api.login(email.trim(), password))
    } catch (err) {
      setError(err)
      setEntrando(false)
    }
  }

  return (
    <div className="ad-login">
      <form className="ad-login__card" onSubmit={enviar}>
        <p className="ad-login__marca">
          Panel<span className="ad-login__punto" aria-hidden="true" />
        </p>
        <h1 className="ad-login__titulo">Entrá a administrar tu local</h1>

        {error && (
          <p className="ad-alerta ad-alerta--error" role="alert">
            {error.message}
          </p>
        )}

        <div className="ad-campo">
          <label htmlFor="login-email">Mail</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="ad-campo">
          <label htmlFor="login-pass">Contraseña</label>
          <input
            id="login-pass"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="ad-btn ad-btn--primario ad-btn--bloque" disabled={entrando}>
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
