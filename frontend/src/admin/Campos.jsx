/**
 * Las piezas de formulario del panel.
 *
 * Una sola regla en todas: la etiqueta va arriba del campo y es un
 * <label> de verdad atado por id. Nada de usar el placeholder como
 * etiqueta, que desaparece justo cuando el usuario escribe y deja el
 * formulario sin decir qué era cada cosa.
 */

let n = 0
const nuevoId = (p) => `${p}-${++n}`

export function Campo({ etiqueta, ayuda, error, children, id }) {
  const propio = id || nuevoId('campo')

  return (
    <div className={'ad-campo' + (error ? ' is-error' : '')}>
      <label htmlFor={propio}>{etiqueta}</label>
      {children(propio)}
      {ayuda && !error && <p className="ad-campo__ayuda">{ayuda}</p>}
      {error && (
        <p className="ad-campo__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function Texto({ etiqueta, ayuda, error, valor, alCambiar, ...rest }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(id) => (
        <input
          id={id}
          type="text"
          value={valor ?? ''}
          onChange={(e) => alCambiar(e.target.value)}
          {...rest}
        />
      )}
    </Campo>
  )
}

export function Numero({ etiqueta, ayuda, error, valor, alCambiar, sufijo, ...rest }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(id) => (
        <div className="ad-numero">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            value={valor ?? ''}
            onChange={(e) => alCambiar(e.target.value === '' ? '' : Number(e.target.value))}
            {...rest}
          />
          {sufijo && <span className="ad-numero__sufijo">{sufijo}</span>}
        </div>
      )}
    </Campo>
  )
}

export function Area({ etiqueta, ayuda, error, valor, alCambiar, ...rest }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(id) => (
        <textarea
          id={id}
          rows={3}
          value={valor ?? ''}
          onChange={(e) => alCambiar(e.target.value)}
          {...rest}
        />
      )}
    </Campo>
  )
}

export function Selector({ etiqueta, ayuda, error, valor, alCambiar, opciones, ...rest }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(id) => (
        <select id={id} value={valor ?? ''} onChange={(e) => alCambiar(e.target.value)} {...rest}>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
      )}
    </Campo>
  )
}

/** Interruptor con su etiqueta a la derecha, como un checkbox grande. */
export function Interruptor({ etiqueta, ayuda, valor, alCambiar }) {
  const id = nuevoId('sw')

  return (
    <div className="ad-switch">
      <input id={id} type="checkbox" checked={Boolean(valor)} onChange={(e) => alCambiar(e.target.checked)} />
      <label htmlFor={id}>
        <span className="ad-switch__pista" aria-hidden="true" />
        <span>
          {etiqueta}
          {ayuda && <span className="ad-switch__ayuda">{ayuda}</span>}
        </span>
      </label>
    </div>
  )
}

/** Varias opciones a la vez, como las etiquetas de un plato. */
export function Casilleros({ etiqueta, opciones, valores, alCambiar }) {
  return (
    <div className="ad-campo">
      <span className="ad-campo__label">{etiqueta}</span>
      <div className="ad-casilleros">
        {opciones.map((o) => {
          const id = `chk-${o.valor}-${n++}`
          const puesto = valores.includes(o.valor)

          return (
            <span key={o.valor} className={'ad-casillero' + (puesto ? ' is-puesto' : '')}>
              <input
                id={id}
                type="checkbox"
                checked={puesto}
                onChange={(e) =>
                  alCambiar(
                    e.target.checked
                      ? [...valores, o.valor]
                      : valores.filter((v) => v !== o.valor),
                  )
                }
              />
              <label htmlFor={id}>{o.texto}</label>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** El cartel que aparece cuando una escritura falla. */
export function Alerta({ error, tono = 'error' }) {
  if (!error) return null

  return (
    <p className={`ad-alerta ad-alerta--${tono}`} role="alert">
      {typeof error === 'string' ? error : error.message}
    </p>
  )
}

/** Lo que se ve cuando una lista todavía no tiene nada. */
export function Vacio({ titulo, texto, accion }) {
  return (
    <div className="ad-vacio">
      <p className="ad-vacio__titulo">{titulo}</p>
      {texto && <p>{texto}</p>}
      {accion}
    </div>
  )
}
