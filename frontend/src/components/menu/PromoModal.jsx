import { useEffect, useRef } from 'react'
import Icon from '../ui/Icon.jsx'
import { PROMO_IMAGE } from '../../brand.js'

/**
 * Las promos vigentes, apenas se entra a la carta.
 *
 * Se muestra una vez por visita: quien la cerró y sigue mirando la carta
 * no la vuelve a ver al recargar. Si el local cambia sus promos, la
 * firma cambia y aparece de nuevo.
 */
export default function PromoModal({ promos, onClose, onPick }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

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

        <ul className="promomodal__list">
          {promos.map((promo) => (
            <li key={promo.id} className="promomodal__item">
              <PromoImage promo={promo} className="promomodal__img" eager />
              <PromoTag promo={promo} />
              {promo.kicker && <span className="promo__kicker u-mono">{promo.kicker}</span>}
              <span className="promomodal__title">{promo.title}</span>
              {promo.body && <span className="promomodal__body">{promo.body}</span>}
              {promo.itemId && (
                <button
                  type="button"
                  className="btn btn--sm promomodal__go"
                  onClick={() => onPick(promo)}
                >
                  Lo quiero
                  <Icon name="next" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>

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
