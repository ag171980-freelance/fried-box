import { useEffect, useRef, useState } from 'react'
import { money } from '../../lib/format.js'
import DishArt from '../ui/DishArt.jsx'
import Icon from '../ui/Icon.jsx'

const TAG_LABEL = { veg: 'Veggie', hot: 'Picante' }
const TAG_CLASS = { veg: 'tag tag--veg', hot: 'tag tag--hot' }

function Tags({ item }) {
  if (!item.tags?.length) return null
  return (
    <>
      {item.tags.map((t) => (
        <span key={t} className={TAG_CLASS[t] || 'tag'}>
          {TAG_LABEL[t] || t}
        </span>
      ))}
    </>
  )
}

/* Cuánto espacio ocupa la imagen en pantalla según el estilo de carta.
   Con esto el navegador baja la foto chica donde alcanza. */
const SIZES = {
  lista: '92px',
  grilla: '(min-width: 1040px) 340px, 50vw',
  mosaico: '(min-width: 720px) 400px, 50vw',
  vidriera: '(min-width: 860px) 300px, 100vw',
  cinta: '100vw',
  carrusel: '196px',
}

function Media({ item, inCart, layout, children }) {
  return (
    <div className="dish__media">
      <DishArt item={item} className="dish__art" sizes={SIZES[layout] || '50vw'} />
      {item.badge && <span className="dish__badge">{item.badge}</span>}
      {inCart > 0 && (
        // La key cambia con la cantidad: remonta el nodo y el rebote se
        // vuelve a reproducir en cada agregado.
        <span key={inCart} className="dish__incart" aria-label={`${inCart} en el pedido`}>
          {inCart}
        </span>
      )}
      {children}
    </div>
  )
}

/**
 * Una sola tarjeta que se dibuja distinto según el estilo de carta.
 * El comportamiento no cambia nunca: la tarjeta entera abre el detalle
 * y el botón redondo agrega directo si el plato no pide opciones.
 *
 * La superficie que abre el detalle es una capa aparte (.dish__hit) para
 * no anidar el botón de agregar adentro de otro botón.
 */
export default function DishCard({ item, layout, index = 0, inCart = 0, onOpen, onAdd }) {
  const needsChoice = (item.options || []).some((g) => g.required || g.type === 'multi')
  const [justAdded, setJustAdded] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const add = (event) => {
    event.stopPropagation()
    if (needsChoice) {
      onOpen(item)
      return
    }
    onAdd(item)
    // El botón confirma en el lugar, así el usuario no tiene que mirar la
    // barra de abajo para saber que el toque entró.
    setJustAdded(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setJustAdded(false), 1000)
  }

  const Hit = () => (
    <button type="button" className="dish__hit" onClick={() => onOpen(item)}>
      <span className="u-sr">Ver {item.name}</span>
    </button>
  )

  const AddButton = () => (
    <button
      type="button"
      className={justAdded ? 'addbtn addbtn--done' : 'addbtn'}
      onClick={add}
      aria-label={needsChoice ? `Elegir opciones de ${item.name}` : `Agregar ${item.name}`}
    >
      <span className="addbtn__icon" key={justAdded ? 'ok' : 'add'}>
        <Icon name={justAdded ? 'check' : 'plus'} size={18} strokeWidth={2.4} />
      </span>
    </button>
  )

  const cardProps = { className: 'dish', style: { '--i': index } }

  if (layout === 'cinta') {
    return (
      <div {...cardProps}>
        <Hit />
        <Media item={item} inCart={inCart} layout={layout} />
        <div className="dish__body">
          <h3 className="dish__name">{item.name}</h3>
          <p className="dish__desc">{item.description}</p>
          <div className="dish__foot">
            <span className="dish__price u-price">{money(item.price)}</span>
            <span className="dish__action">
              <AddButton />
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (layout === 'grilla' || layout === 'mosaico' || layout === 'carrusel') {
    return (
      <div {...cardProps}>
        <Hit />
        <Media item={item} inCart={inCart} layout={layout} />
        <div className="dish__body">
          <span className="dish__name">{item.name}</span>
          {layout !== 'carrusel' && <p className="dish__desc">{item.description}</p>}
          <div className="dish__foot">
            <span className="dish__price u-price">{money(item.price)}</span>
            <span className="dish__action">
              <AddButton />
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (layout === 'vidriera') {
    return (
      <div {...cardProps}>
        <Hit />
        <Media item={item} inCart={inCart} layout={layout} />
        <div className="dish__body">
          {item.popular && <p className="u-mono dish__kicker">Muy pedido</p>}
          <h3 className="dish__name">{item.name}</h3>
          <p className="dish__desc">{item.description}</p>
          <div className="dish__foot">
            <span className="dish__price u-price">{money(item.price)}</span>
            <span className="dish__action">
              <button
                type="button"
                className={justAdded ? 'btn btn--sm btn--done' : 'btn btn--primary btn--sm'}
                onClick={add}
              >
                <span className="addbtn__icon" key={justAdded ? 'ok' : 'add'}>
                  <Icon name={justAdded ? 'check' : 'plus'} size={16} strokeWidth={2.4} />
                </span>
                {justAdded ? 'Agregado' : needsChoice ? 'Elegir opciones' : 'Agregar'}
              </button>
            </span>
          </div>
        </div>
      </div>
    )
  }

  // lista (por defecto)
  return (
    <div {...cardProps}>
      <Hit />
      <div>
        <span className="dish__name">{item.name}</span>
        <p className="dish__desc">{item.description}</p>
        <div className="dish__foot">
          <span className="dish__price u-price">{money(item.price)}</span>
          {item.popular && <span className="tag tag--star">Muy pedido</span>}
          <Tags item={item} />
        </div>
      </div>
      <Media item={item} inCart={inCart} layout={layout}>
        <span className="dish__action">
          <AddButton />
        </span>
      </Media>
    </div>
  )
}
