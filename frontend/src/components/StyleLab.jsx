import { useEffect, useState } from 'react'
import { LAYOUTS, THEMES, usePrefs } from '../store/PrefsProvider.jsx'
import Icon from './ui/Icon.jsx'

/**
 * Panel para comparar estilos de carta y paletas sin recargar.
 *
 * No está montado. La paleta y el estilo de carta los decide el local,
 * no el cliente que abre el menú, así que ese control va al panel de
 * administración del local. Queda acá como referencia de esa pantalla:
 * para volver a verlo, montarlo en App.jsx y reponer el
 * @import './lab.css' en styles/index.css.
 */
export default function StyleLab() {
  const prefs = usePrefs()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const activeLayout = LAYOUTS.find((l) => l.id === prefs.layout)

  if (!open) {
    return (
      <button
        type="button"
        className="lab-fab"
        onClick={() => setOpen(true)}
        aria-label={`Modo diseño, estilo ${activeLayout?.name || 'lista'}`}
      >
        <Icon name="sliders" size={18} />
        <span className="lab-fab__name">{activeLayout?.name || 'Estilos'}</span>
      </button>
    )
  }

  return (
    <div className="lab-backdrop" onClick={() => setOpen(false)} role="presentation">
      <div
        className="lab"
        role="dialog"
        aria-modal="true"
        aria-label="Modo diseño"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="lab__head">
          <div>
            <h2 className="lab__title">Modo diseño</h2>
            <p className="lab__hint">
              Probá combinaciones sobre la carta real. Se guarda en este navegador.
            </p>
          </div>
          <button type="button" className="iconbtn" onClick={() => setOpen(false)} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="lab__scroll">
          <div className="lab__group">
            <span className="lab__legend">Estilo de carta</span>
            {LAYOUTS.map((layout) => (
              <button
                key={layout.id}
                type="button"
                className="labopt"
                aria-pressed={prefs.layout === layout.id}
                onClick={() => prefs.set({ layout: layout.id })}
              >
                <span className="labopt__top">
                  <span className="labopt__name">{layout.name}</span>
                  <span className="labopt__for">{layout.bestFor}</span>
                </span>
                <span className="labopt__blurb">{layout.blurb}</span>
              </button>
            ))}
          </div>

          <div className="lab__group">
            <span className="lab__legend">Paleta</span>
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className="labopt"
                aria-pressed={prefs.theme === theme.id}
                onClick={() => prefs.set({ theme: theme.id })}
              >
                <span className="labopt__top">
                  <span className="labopt__name">{theme.name}</span>
                  <span className="labopt__right">
                    <span className="labopt__for">{theme.bestFor}</span>
                    <span className="swatch">
                      {theme.swatch.map((color) => (
                        <i key={color} style={{ background: color }} />
                      ))}
                    </span>
                  </span>
                </span>
                <span className="labopt__blurb">{theme.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <footer className="lab__foot">
          <button type="button" className="btn btn--ghost" onClick={prefs.reset}>
            Volver al original
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setOpen(false)}>
            Ver la carta
          </button>
        </footer>
      </div>
    </div>
  )
}
