import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const PrefsContext = createContext(null)
const claveDe = (tenant) => 'foodix.prefs.' + (tenant || 'default')

export const LAYOUTS = [
  {
    id: 'lista',
    name: 'Lista',
    blurb: 'Filas con foto chica. La más rápida de escanear y la que mejor aguanta cartas largas.',
    bestFor: 'Delivery con muchos platos',
  },
  {
    id: 'grilla',
    name: 'Grilla',
    blurb: 'Dos columnas de tarjetas con imagen grande. Empuja el apetito antes que el dato.',
    bestFor: 'Cartas cortas y muy visuales',
  },
  {
    id: 'mosaico',
    name: 'Mosaico',
    blurb: 'Grilla despareja: el primer plato de cada rubro ocupa el ancho y el resto va en dos columnas.',
    bestFor: 'Empujar un plato por categoría',
  },
  {
    id: 'vidriera',
    name: 'Vidriera',
    blurb: 'Un plato por fila, a todo el ancho. Cada ítem se lee como una pieza editorial.',
    bestFor: 'Menú del día o carta premium',
  },
  {
    id: 'cinta',
    name: 'Cinta',
    blurb: 'Bandas anchas con la foto de fondo y el texto encima. Muy visual sin ocupar tanto alto.',
    bestFor: 'Cartas con fotos fuertes',
  },
  {
    id: 'carrusel',
    name: 'Carrusel',
    blurb: 'Cada categoría es una fila que se desliza en horizontal. Muestra mucho sin scroll.',
    bestFor: 'Explorar de a poco desde el celular',
  },
]

export const THEMES = [
  {
    id: 'sifon',
    name: 'Sifón',
    blurb: 'Cobalto sobre papel. El azul es la interfaz y la comida pone el calor.',
    bestFor: 'Cocina de barrio, delivery',
    swatch: ['#ebe7dd', '#1f44ff', '#ffb020'],
  },
  {
    id: 'tostado',
    name: 'Tostado',
    blurb: 'Avena, café tostado y caramelo. La paleta de la cafetería de especialidad.',
    bestFor: 'Cafeterías y panaderías',
    swatch: ['#f0e9de', '#3e2417', '#d98e3a'],
  },
  {
    id: 'sal',
    name: 'Sal',
    blurb: 'Cal, azul egeo y limón. Aire de costa sin caer en el marinero de postal.',
    bestFor: 'Pescados, mediterráneo',
    swatch: ['#edf1f0', '#0e6e7a', '#f2c230'],
  },
  {
    id: 'higo',
    name: 'Higo',
    blurb: 'Ciruela y pistacho sobre rosa apagado. Dulce sin volverse infantil.',
    bestFor: 'Pastelería y brunch',
    swatch: ['#f4ebee', '#7a2e56', '#8fa860'],
  },
  {
    id: 'menta',
    name: 'Menta',
    blurb: 'Verde fresco y coral. Empuja lo saludable sin volverse clínico.',
    bestFor: 'Ensaladas, comida sana',
    swatch: ['#e8f1ea', '#0f7a56', '#ff7a4d'],
  },
  {
    id: 'fuego',
    name: 'Fuego',
    blurb: 'Rojo y blanco, alto contraste. El código visual clásico del delivery.',
    bestFor: 'Pizza, burgers, rotisería',
    swatch: ['#ffffff', '#ef3320', '#17110f'],
  },
  {
    id: 'vermut',
    name: 'Vermut',
    blurb: 'Oxblood, hueso y naranja de aperitivo. Luz baja, mesa de bodegón de noche.',
    bestFor: 'Bares y bodegones',
    swatch: ['#1a0f12', '#d4552f', '#e9c46a'],
  },
  {
    id: 'carbon',
    name: 'Carbón',
    blurb: 'Nocturno y neutro. Para salón con luz baja y para quien usa el celular en modo oscuro.',
    bestFor: 'Cualquier carta, de noche',
    swatch: ['#0b0e15', '#5c78ff', '#ffb020'],
  },
]

/** Último recurso si la API no contestó todavía. Tiene que coincidir con
    el data-theme de index.html, o la primera pintada cambia de color. */
const fallback = { layout: 'grilla', theme: 'fuego' }

/**
 * Se puede forzar una combinación por URL para compartirla:
 *   ?estilo=vidriera&paleta=tostado
 */
function fromQuery() {
  const params = new URLSearchParams(window.location.search)
  const picked = {}
  const estilo = params.get('estilo')
  const paleta = params.get('paleta')
  if (LAYOUTS.some((l) => l.id === estilo)) picked.layout = estilo
  if (THEMES.some((t) => t.id === paleta)) picked.theme = paleta
  return picked
}

function loadStored(STORAGE_KEY) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      // La elección a mano ya no se guarda ni se lee: no hay panel en la
      // carta para cambiarla ni para deshacerla, así que una preferencia
      // vieja dejaría a alguien mirando una paleta que su local no eligió.
      choice: {},
      // Copia de lo último que mandó la API, para que al recargar la
      // paleta correcta esté puesta antes de que llegue la respuesta.
      cache: saved.cache ?? {},
    }
  } catch {
    return { choice: {}, cache: {} }
  }
}

const existe = (lista, id) => lista.some((x) => x.id === id)

export function PrefsProvider({ tenant, children }) {
  const storageKey = claveDe(tenant)
  const [stored, setStored] = useState(() => loadStored(storageKey))
  const [venue, setVenue] = useState({})
  const query = useMemo(fromQuery, [])

  /* URL > elección en memoria > lo que configuró el local > fallback.
     Hoy la carta no tiene con qué tocar la elección en memoria: eso pasa
     al panel de administración del local. */
  const resolved = useMemo(() => {
    const pick = (clave, lista) => {
      for (const valor of [query[clave], stored.choice[clave], venue[clave], stored.cache[clave]]) {
        if (valor && existe(lista, valor)) return valor
      }
      return fallback[clave]
    }

    return { layout: pick('layout', LAYOUTS), theme: pick('theme', THEMES) }
  }, [query, stored, venue])

  useEffect(() => {
    // Si la combinación vino por URL no se guarda: preview.html abre
    // varias vistas a la vez y no queremos que se pisen entre ellas.
    if (!Object.keys(query).length) {
      localStorage.setItem(storageKey, JSON.stringify({ cache: stored.cache }))
    }
    const root = document.documentElement
    root.dataset.theme = resolved.theme
    root.dataset.layout = resolved.layout
  }, [storageKey, stored, resolved, query])

  const value = useMemo(
    () => ({
      ...resolved,
      set: (patch) => setStored((s) => ({ ...s, choice: { ...s.choice, ...patch } })),
      /** Lo que el local tiene configurado en la base. */
      setVenueDefaults: (patch) => {
        setVenue(patch)
        setStored((s) => ({ ...s, cache: { ...s.cache, ...patch } }))
      },
      /** Vuelve a lo que configuró el local. */
      reset: () => setStored((s) => ({ ...s, choice: {} })),
      esDelLocal: !stored.choice.layout && !stored.choice.theme,
    }),
    [resolved, stored],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs() {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs necesita estar dentro de <PrefsProvider>')
  return ctx
}
