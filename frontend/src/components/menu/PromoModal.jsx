import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon.jsx'
import { PROMO_IMAGE } from '../../brand.js'

/**
 * Las promos vigentes, apenas se entra a la carta.
 *
 * Se muestra una vez por visita: quien la cerró y sigue mirando la carta
 * no la vuelve a ver al recargar. Si el local cambia sus promos, la
 * firma cambia y aparece de nuevo.
 *
 * Van de a una, en horizontal. Antes iban apiladas: tres tarjetas con su
 * foto a sangre, una debajo de la otra, daban casi 800px dentro de un
 * modal que mide 88dvh. O sea que el cliente veía una promo y el borde
 * de la siguiente, sin nada que le avisara que había más, y teniendo que
 * descubrir que se scrollea adentro de un cartel que acaba de aparecer.
 * Encima las tres repetían el mismo bloque naranja a sangre completa.
 *
 * Con una a la vez cada promo ocupa la pantalla entera, se pasa con el
 * dedo como cualquier carrusel, y los puntos dicen cuántas hay sin tener
 * que contarlas.
 */
export default function PromoModal({ promos, onClose, onPick }) {
  const dialogRef = useRef(null)
  const pistaRef = useRef(null)
  const [activa, setActiva] = useState(0)

  // Con una sola promo no hay nada que navegar: ni flechas ni puntos.
  const varias = promos.length > 1

  const irA = useCallback((i) => {
    const pista = pistaRef.current
    if (!pista) return

    const destino = Math.max(0, Math.min(i, pista.children.length - 1))
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Cada promo mide exactamente el ancho de la pista, así que la
    // posición es una multiplicación y no hace falta medir el DOM.
    pista.scrollTo({ left: destino * pista.clientWidth, behavior: quieto ? 'auto' : 'smooth' })
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') return onClose()
      if (!varias) return
      if (e.key === 'ArrowRight') irA(activa + 1)
      if (e.key === 'ArrowLeft') irA(activa - 1)
    }

    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, varias, activa, irA])

  /**
   * Cuál se está viendo. Va con IntersectionObserver y no escuchando el
   * scroll: el scroll dispara en cada cuadro y acá sólo importa cuándo
   * cambia de promo, que son tres veces en toda la vida del modal.
   */
  useEffect(() => {
    const pista = pistaRef.current
    if (!pista || !varias) return

    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setActiva(Number(e.target.dataset.i))
        }
      },
      { root: pista, threshold: 0.6 },
    )

    for (const slide of pista.children) obs.observe(slide)
    return () => obs.disconnect()
  }, [varias, promos.length])

  return (
    <div className="sheet-backdrop promomodal-backdrop" onClick={onClose} role="presentation">
      <div
        className="promomodal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promomodal-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="promomodal__close" onClick={onClose} aria-label="Cerrar">
          <Icon name="close" size={18} strokeWidth={2} />
        </button>

        <p id="promomodal-title" className="promomodal__head u-mono">
          Promos
        </p>

        <ul
          className="promodeck u-scroll-x"
          ref={pistaRef}
          role={varias ? 'group' : undefined}
          aria-roledescription={varias ? 'carrusel' : undefined}
          aria-label={varias ? `${promos.length} promos` : undefined}
        >
          {promos.map((promo, i) => (
            <li
              key={promo.id}
              className="promodeck__slide"
              data-i={i}
              role={varias ? 'group' : undefined}
              aria-label={varias ? `${i + 1} de ${promos.length}` : undefined}
            >
              <PromoImage promo={promo} className="promodeck__img" eager={i === 0} />

              <div className="promodeck__texto">
                <PromoTag promo={promo} />
                {promo.kicker && <span className="promo__kicker u-mono">{promo.kicker}</span>}
                <span className="promodeck__title">{promo.title}</span>
                {promo.body && <span className="promodeck__body">{promo.body}</span>}
                {promo.itemId && (
                  <button
                    type="button"
                    className="btn btn--sm promodeck__go"
                    onClick={() => onPick(promo)}
                  >
                    Lo quiero
                    <Icon name="next" size={16} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {varias && (
          <div className="promonav">
            <button
              type="button"
              className="promonav__flecha"
              onClick={() => irA(activa - 1)}
              disabled={activa === 0}
              aria-label="Promo anterior"
            >
              <Icon name="back" size={18} strokeWidth={2} />
            </button>

            <ol className="promonav__puntos">
              {promos.map((promo, i) => (
                <li key={promo.id}>
                  <button
                    type="button"
                    className={i === activa ? 'promonav__punto is-activo' : 'promonav__punto'}
                    onClick={() => irA(i)}
                    aria-label={`Ir a ${promo.title}`}
                    aria-current={i === activa ? 'true' : undefined}
                  />
                </li>
              ))}
            </ol>

            <button
              type="button"
              className="promonav__flecha"
              onClick={() => irA(activa + 1)}
              disabled={activa === promos.length - 1}
              aria-label="Promo siguiente"
            >
              <Icon name="next" size={18} strokeWidth={2} />
            </button>
          </div>
        )}

        {/* Los puntos se ven; esto es para quien escucha la pantalla. */}
        {varias && (
          <p className="u-sr" aria-live="polite">
            Promo {activa + 1} de {promos.length}: {promos[activa]?.title}
          </p>
        )}

        <button type="button" className="btn btn--ghost btn--block promomodal__skip" onClick={onClose}>
          Ver la carta
        </button>
      </div>
    </div>
  )
}

const DIAS = { lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábados', dom: 'Domingos' }

/** «15% OFF · Lunes», armado de las reglas. Null si es sólo un aviso. */
export function promoTag(promo) {
  if (!promo.percent) return null
  const pct = `${Number(promo.percent).toLocaleString('es-AR')}% OFF`
  if (!promo.days?.length) return pct
  const dias = promo.days.map((d) => DIAS[d]).join(', ').replace(/, ([^,]*)$/, ' y $1')
  return `${pct} · ${dias}`
}

export function PromoTag({ promo }) {
  const tag = promoTag(promo)
  if (!tag) return null
  return (
    <span className={promo.today ? 'promo__tag u-mono is-hoy' : 'promo__tag u-mono'}>
      {tag}
      {promo.today && promo.days?.length > 0 && ' · hoy'}
    </span>
  )
}

/** La imagen de la promo, o la genérica de la marca si no subieron una. */
export function PromoImage({ promo, className, eager = false }) {
  const src = promo.image || PROMO_IMAGE
  const small = src.replace(/\.jpg$/, '-sm.jpg')

  return (
    <img
      className={className}
      src={src}
      srcSet={`${small} 600w, ${src} 1200w`}
      sizes="(min-width: 720px) 440px, 100vw"
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}

/** La misma lista de promos da la misma firma. */
export const promoSignature = (promos) => promos.map((p) => p.id).join('|')
