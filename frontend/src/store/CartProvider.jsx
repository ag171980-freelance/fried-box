import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'

const CartContext = createContext(null)

// Un carrito por local: si no, mirar la carta de otro restaurante
// arrastra los platos del anterior, que además ya no existen ahí.
const claveDe = (tenant) => 'foodix.cart.' + (tenant || 'default')

/** Dos líneas son la misma si comparten plato, opciones y aclaración. */
function lineKey(itemId, optionIds = [], note = '') {
  return [itemId, [...optionIds].sort().join('+'), note.trim().toLowerCase()].join('|')
}

const emptyState = { lines: [], mode: 'delivery', couponCode: '' }

function load(STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState
    return { ...emptyState, ...JSON.parse(raw) }
  } catch {
    return emptyState
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { itemId, qty = 1, optionIds = [], note = '', snapshot } = action
      const key = lineKey(itemId, optionIds, note)
      const existing = state.lines.find((l) => l.key === key)
      if (existing) {
        return {
          ...state,
          lines: state.lines.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)),
        }
      }
      return {
        ...state,
        lines: [...state.lines, { key, itemId, qty, optionIds, note, snapshot }],
      }
    }
    case 'setQty': {
      const qty = Math.max(0, action.qty)
      if (qty === 0) return { ...state, lines: state.lines.filter((l) => l.key !== action.key) }
      return {
        ...state,
        lines: state.lines.map((l) => (l.key === action.key ? { ...l, qty } : l)),
      }
    }
    case 'remove':
      return { ...state, lines: state.lines.filter((l) => l.key !== action.key) }
    case 'setMode':
      return { ...state, mode: action.mode }
    case 'setCoupon':
      return { ...state, couponCode: action.code }
    case 'clear':
      return { ...emptyState, mode: state.mode }
    default:
      return state
  }
}

export function CartProvider({ tenant, children }) {
  const storageKey = claveDe(tenant)
  const [state, dispatch] = useReducer(reducer, storageKey, load)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, [storageKey, state])

  const value = useMemo(() => {
    const count = state.lines.reduce((sum, l) => sum + l.qty, 0)
    // Estimación optimista para la barra inferior. El total que vale es el que
    // devuelve quoteOrder() desde el servidor.
    const estimate = state.lines.reduce((sum, l) => sum + (l.snapshot?.unitPrice || 0) * l.qty, 0)

    return {
      ...state,
      count,
      estimate,
      isEmpty: state.lines.length === 0,
      qtyOf: (itemId) =>
        state.lines.filter((l) => l.itemId === itemId).reduce((sum, l) => sum + l.qty, 0),
      add: (payload) => dispatch({ type: 'add', ...payload }),
      setQty: (key, qty) => dispatch({ type: 'setQty', key, qty }),
      remove: (key) => dispatch({ type: 'remove', key }),
      setMode: (mode) => dispatch({ type: 'setMode', mode }),
      setCoupon: (code) => dispatch({ type: 'setCoupon', code }),
      clear: () => dispatch({ type: 'clear' }),
    }
  }, [state])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart necesita estar dentro de <CartProvider>')
  return ctx
}
