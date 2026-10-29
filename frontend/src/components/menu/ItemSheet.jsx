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

  /* En los grupos múltiples una opción puede ir más de una vez: el id
     se repite en la lista tantas veces como se eligió. */
  const { optionIds, unitPrice, extrasLabel } = useMemo(() => {
    const ids = Object.values(picked).flat()
    let extra = 0
    const names = []
    for (const group of item.options || []) {
      const ingroup = picked[group.id] || []
      for (const choice of group.choices) {
        const n = ingroup.filter((id) => id === choice.id).length
        if (n === 0) continue
        extra += choice.price * n
        names.push(n > 1 ? `${choice.name} x${n}` : choice.name)
      }
    }
    return { optionIds: ids, unitPrice: item.price + extra, extrasLabel: names.join(' · ') }
  }, [picked, item])

  const choose = (group, choiceId) =>
    setPicked((prev) => ({ ...prev, [group.id]: [choiceId] }))

  /* Una opción que va sola («Sin salsas») no convive con las demás:
     elegirla vacía el grupo, y sumar otra la saca. */
  const solas = (group) => group.choices.filter((c) => c.exclusive).map((c) => c.id)

  const toggleSola = (group, choiceId) =>
    setPicked((prev) => {
      const current = prev[group.id] || []
      return { ...prev, [group.id]: current.includes(choiceId) ? [] : [choiceId] }
    })

  const add = (group, choiceId) =>
    setPicked((prev) => {
      const current = (prev[group.id] || []).filter((id) => !solas(group).includes(id))
      if (current.length >= (group.max || 99)) return prev
      return { ...prev, [group.id]: [...current, choiceId] }
    })

  const remove = (group, choiceId) =>
    setPicked((prev) => {
      const current = prev[group.id] || []
      const at = current.lastIndexOf(choiceId)
      if (at === -1) return prev
      return { ...prev, [group.id]: current.filter((_, i) => i !== at) }
    })

  /* Los grupos obligatorios sin nada elegido. Mientras haya alguno, el
     botón de agregar queda apagado: el servidor lo rechazaría igual. */
  const faltan = (item.options || []).filter((g) => g.required && !(picked[g.id] || []).length)

  const confirm = () => {
    if (faltan.length) return
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

            {(item.options || []).map((group) => {
              const ingroup = picked[group.id] || []
              const sola = ingroup.find((id) => solas(group).includes(id))
              const elegidas = sola ? 0 : ingroup.length
              const full = elegidas >= (group.max || 99)

              return (
                <fieldset key={group.id} className="optgroup">
                  <div className="optgroup__head">
                    <legend className="optgroup__name">{group.name}</legend>
                    <span className="optgroup__rule u-mono">
                      {group.type === 'single'
                        ? 'Elegí una'
                        : sola
                          ? 'Listo'
                          : group.required && elegidas === 0
                            ? 'Obligatorio'
                            : `${elegidas} de ${group.max || group.choices.length}`}
                    </span>
                  </div>

                  {group.type === 'single'
                    ? group.choices.map((choice) => (
                        <label key={choice.id} className="opt">
                          <input
                            type="radio"
                            name={`${item.id}-${group.id}`}
                            checked={ingroup.includes(choice.id)}
                            onChange={() => choose(group, choice.id)}
                          />
                          <span className="opt__name">{choice.name}</span>
                          {choice.price > 0 && (
                            <span className="opt__price">+ {money(choice.price)}</span>
                          )}
                        </label>
                      ))
                    : group.choices.map((choice) => {
                        const n = ingroup.filter((id) => id === choice.id).length

                        if (choice.exclusive) {
                          return (
                            <label key={choice.id} className="opt opt--sola">
                              <input
                                type="checkbox"
                                checked={n > 0}
                                onChange={() => toggleSola(group, choice.id)}
                              />
                              <span className="opt__name">{choice.name}</span>
                              {choice.price > 0 && (
                                <span className="opt__price">+ {money(choice.price)}</span>
                              )}
                            </label>
                          )
                        }

                        return (
                          <div key={choice.id} className={n > 0 ? 'opt is-picked' : 'opt'}>
                            <span className="opt__name">{choice.name}</span>
                            {choice.price > 0 && (
                              <span className="opt__price">+ {money(choice.price)}</span>
                            )}
                            <div className="qty qty--opt">
                              <button
                                type="button"
                                className="qty__btn"
                                onClick={() => remove(group, choice.id)}
                                disabled={n === 0}
                                aria-label={`Quitar ${choice.name}`}
                              >
                                <Icon name="minus" size={14} strokeWidth={2.2} />
                              </button>
                              <span className="qty__n" aria-live="polite">{n}</span>
                              <button
                                type="button"
                                className="qty__btn"
                                onClick={() => add(group, choice.id)}
                                disabled={full}
                                aria-label={`Sumar ${choice.name}`}
                              >
                                <Icon name="plus" size={14} strokeWidth={2.2} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                </fieldset>
              )
            })}

            <div className="sheet__note field">
              <label className="field__label" htmlFor={`note-${item.id}`}>
                Aclaración para la cocina
              </label>
              <textarea
                id={`note-${item.id}`}
                className="field__textarea"
                placeholder="Bien crocante, las salsas aparte, lo que necesites."
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
          <button
            type="button"
            className="btn btn--primary"
            onClick={confirm}
            disabled={faltan.length > 0}
          >
            {faltan.length > 0 ? 'Elegí una opción para agregar' : `Agregar ${money(unitPrice * qty)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
