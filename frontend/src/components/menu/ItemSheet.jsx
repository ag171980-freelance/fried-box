import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { money } from '../../lib/format.js'
import DishArt from '../ui/DishArt.jsx'
import Icon from '../ui/Icon.jsx'

function initialSelection(item) {
  const picked = {}
  for (const group of item.options || []) {
    if (group.type === 'single') {
      const def = group.choices.find((c) => c.default) || group.choices[0]
      picked[group.id] = def ? [def.id] : []
    } else {
      picked[group.id] = []
    }
  }
  return picked
}

const EXIT_MS = 220

export default function ItemSheet({ item, onClose, onConfirm }) {
  const [picked, setPicked] = useState(() => initialSelection(item))
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [closing, setClosing] = useState(false)
  const dialogRef = useRef(null)
  const exitTimer = useRef(null)

  /* La hoja se desmonta recién cuando termina de bajar, así la salida no
     es un corte seco. Ver .sheet-backdrop.is-closing en motion.css. */
  const dismiss = useCallback(
    (after) => {
      if (exitTimer.current) return
      setClosing(true)
      exitTimer.current = setTimeout(() => (after ? after() : onClose()), EXIT_MS)
    },
    [onClose],
  )

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && dismiss()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      clearTimeout(exitTimer.current)
    }
  }, [dismiss])

  const { optionIds, unitPrice, extrasLabel } = useMemo(() => {
    const ids = Object.values(picked).flat()
    let extra = 0
    const names = []
    for (const group of item.options || []) {
      for (const choice of group.choices) {
        if (ids.includes(choice.id)) {
          extra += choice.price
          if (choice.price > 0 || group.type === 'single') names.push(choice.name)
        }
      }
    }
    return { optionIds: ids, unitPrice: item.price + extra, extrasLabel: names.join(' · ') }
  }, [picked, item])

  const toggle = (group, choiceId) => {
    setPicked((prev) => {
      if (group.type === 'single') return { ...prev, [group.id]: [choiceId] }
      const current = prev[group.id] || []
      const next = current.includes(choiceId)
        ? current.filter((id) => id !== choiceId)
        : [...current, choiceId].slice(0, group.max || 99)
      return { ...prev, [group.id]: next }
    })
  }

  const confirm = () => {
    const payload = {
      itemId: item.id,
      qty,
      optionIds,
      note,
      snapshot: { name: item.name, unitPrice, extrasLabel, art: item.art },
    }
    dismiss(() => onConfirm(payload))
  }

  return (
    <div
      className={closing ? 'sheet-backdrop is-closing' : 'sheet-backdrop'}
      onClick={() => dismiss()}
      role="presentation"
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="sheet__grab" aria-hidden="true" />
        <button type="button" className="sheet__close" onClick={() => dismiss()} aria-label="Cerrar">
          <Icon name="close" size={18} strokeWidth={2} />
        </button>

        <div className="sheet__scroll">
          <div className="sheet__hero">
            <DishArt item={item} eager sizes="(min-width: 720px) 560px, 100vw" />
          </div>

          <div className="sheet__body">
            <h2 className="sheet__title">{item.name}</h2>
            <p className="sheet__desc">{item.description}</p>
            <p className="sheet__price u-price">{money(item.price)}</p>

            {(item.options || []).map((group) => (
              <fieldset key={group.id} className="optgroup">
                <div className="optgroup__head">
                  <legend className="optgroup__name">{group.name}</legend>
                  <span className="optgroup__rule u-mono">
                    {group.required
                      ? 'Elegí una'
                      : `Hasta ${group.max || group.choices.length}`}
                  </span>
                </div>

                {group.choices.map((choice) => (
                  <label key={choice.id} className="opt">
                    <input
                      type={group.type === 'single' ? 'radio' : 'checkbox'}
                      name={`${item.id}-${group.id}`}
                      checked={(picked[group.id] || []).includes(choice.id)}
                      onChange={() => toggle(group, choice.id)}
                    />
                    <span className="opt__name">{choice.name}</span>
                    <span className="opt__price">
                      {choice.price > 0 ? `+ ${money(choice.price)}` : 'sin cargo'}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}

            <div className="sheet__note field">
              <label className="field__label" htmlFor={`note-${item.id}`}>
                Aclaración para la cocina
              </label>
              <textarea
                id={`note-${item.id}`}
                className="field__textarea"
                placeholder="Sin cebolla, cortada al medio, lo que necesites."
                value={note}
                maxLength={140}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="sheet__foot">
          <div className="qty">
            <button
              type="button"
              className="qty__btn"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Quitar uno"
            >
              <Icon name="minus" size={16} strokeWidth={2.2} />
            </button>
            <span className="qty__n">{qty}</span>
            <button
              type="button"
              className="qty__btn"
              onClick={() => setQty((q) => q + 1)}
              aria-label="Sumar uno"
            >
              <Icon name="plus" size={16} strokeWidth={2.2} />
            </button>
          </div>
          <button type="button" className="btn btn--primary" onClick={confirm}>
            Agregar {money(unitPrice * qty)}
          </button>
        </div>
      </div>
    </div>
  )
}
