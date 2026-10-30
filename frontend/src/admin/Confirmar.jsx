import { useEffect, useState } from 'react'
import { Alerta, Area } from './Campos.jsx'

/**
 * La confirmación de cancelar un pedido.
 *
 * Reemplaza al window.prompt() del navegador, que no se puede estilar,
 * no avisa cuánto texto entra y aparece pegado al borde de arriba, sin
 * relación con el pedido que el local estaba mirando.
 *
 * El motivo es opcional a propósito: es la misma regla que aplica el
 * backend en PedidosController::estado(), que lo recorta a 200 y, si
 * queda vacío, guarda «El local canceló el pedido».
 */

/** Lo que entra en la columna. Más que esto, el backend lo corta. */
const LIMITE = 200

export default function ConfirmarCancelacion({ numero, ocupado, error, alConfirmar, alCerrar }) {
  const [motivo, setMotivo] = useState('')

  // Mientras se está cancelando no se cierra: el pedido ya salió.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !ocupado) alCerrar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [alCerrar, ocupado])

  // El click no sale de este árbol. El modal se abre desde el panel
  // lateral, que cierra con su propio click al fondo, y si el evento
  // subiera se cerrarían los dos de una.
  const alFondo = (e) => {
    e.stopPropagation()
    if (!ocupado) alCerrar()
  }

  return (
    <div className="ad-modal-fondo" role="presentation" onClick={alFondo}>
      <form
        className="ad-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ad-cancelar-titulo"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          alConfirmar(motivo.trim())
        }}
      >
        <h2 className="ad-modal__titulo" id="ad-cancelar-titulo">
          ¿Cancelar el pedido #{numero}?
        </h2>
        <p className="ad-modal__texto">
          El pedido se cierra y no se puede deshacer. El cliente lo va a ver en la
          pantalla de su pedido.
        </p>

        <Area
          etiqueta="Motivo"
          ayuda={`Lo lee el cliente. Si lo dejás vacío se manda «El local canceló el pedido». ${motivo.length}/${LIMITE}`}
          valor={motivo}
          alCambiar={setMotivo}
          maxLength={LIMITE}
          autoFocus
          placeholder="Nos quedamos sin alitas"
        />

        <Alerta error={error} />

        <div className="ad-modal__pie">
          <button
            type="button"
            className="ad-btn ad-btn--fantasma"
            disabled={ocupado}
            onClick={alCerrar}
          >
            Volver
          </button>
          <button type="submit" className="ad-btn ad-btn--peligro" disabled={ocupado}>
            {ocupado ? 'Cancelando…' : 'Cancelar el pedido'}
          </button>
        </div>
      </form>
    </div>
  )
}
