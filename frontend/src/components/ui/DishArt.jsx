import { useEffect, useRef, useState } from 'react'

/**
 * Imagen del plato.
 *
 * Muestra la foto del plato. Si todavía no tiene una, la dibuja por vector a
 * partir de su `art` ({ shape, hue }), así un plato nuevo nunca queda con un
 * hueco gris hasta que consigan la foto.
 */
function palette(hue) {
  return {
    base: `hsl(${hue} 64% 58%)`,
    dark: `hsl(${hue} 58% 42%)`,
    deep: `hsl(${hue} 54% 30%)`,
    light: `hsl(${hue} 78% 74%)`,
    pale: `hsl(${hue} 70% 88%)`,
  }
}


const CREAM = '#F6E6C8'
const CHEESE = '#F5B93E'
const CHAR = '#3B2415'
const GREEN = '#4E9A4C'
const GREEN_D = '#2F6B33'
const RED = '#D6402A'
const WHITE = '#FFF7EA'

function Burger({ c }) {
  return (
    <>
      <path d="M22 44c0-12 10-20 28-20s28 8 28 20z" fill={c.base} />
      <path d="M22 44c0-12 10-20 28-20s28 8 28 20z" fill={c.light} opacity=".45" />
      <circle cx="38" cy="35" r="1.7" fill={WHITE} />
      <circle cx="50" cy="31" r="1.7" fill={WHITE} />
      <circle cx="62" cy="35" r="1.7" fill={WHITE} />
      <path d="M20 46h60a3 3 0 0 1 0 6H20a3 3 0 0 1 0-6z" fill={GREEN} />
      <path d="M26 50h48l6 8H20z" fill={CHEESE} />
      <rect x="21" y="55" width="58" height="11" rx="5.5" fill={CHAR} />
      <path d="M24 68h52c4 0 7 3 7 6.5S80 80 76 80H24c-4 0-7-2.6-7-5.5S20 68 24 68z" fill={c.dark} />
    </>
  )
}

function Pizza({ c }) {
  return (
    <>
      <circle cx="50" cy="52" r="34" fill={c.pale} />
      <circle cx="50" cy="52" r="34" fill="none" stroke={c.dark} strokeWidth="5" opacity=".5" />
      <circle cx="50" cy="52" r="27" fill={CHEESE} />
      <circle cx="38" cy="43" r="5" fill={RED} />
      <circle cx="61" cy="46" r="4.2" fill={RED} />
      <circle cx="45" cy="63" r="4.6" fill={RED} />
      <circle cx="63" cy="63" r="3.6" fill={GREEN_D} />
      <circle cx="52" cy="52" r="3" fill={GREEN} />
      <path d="M50 25v54" stroke={c.pale} strokeWidth="1.6" opacity=".55" />
      <path d="M23 52h54" stroke={c.pale} strokeWidth="1.6" opacity=".55" />
    </>
  )
}

function Empanada({ c }) {
  return (
    <>
      <path
        d="M26 60c0-16 11-27 24-27s24 11 24 27c0 5-11 8-24 8s-24-3-24-8z"
        fill={c.base}
      />
      <path d="M26 60c0-16 11-27 24-27s24 11 24 27" fill={c.light} opacity=".4" />
      <g fill={c.deep} opacity=".65">
        <circle cx="30" cy="62" r="3" />
        <circle cx="38" cy="65" r="3" />
        <circle cx="46" cy="66" r="3" />
        <circle cx="54" cy="66" r="3" />
        <circle cx="62" cy="65" r="3" />
        <circle cx="70" cy="62" r="3" />
      </g>
      <path d="M42 41c4-3 12-3 16 0" stroke={c.deep} strokeWidth="2.4" fill="none" opacity=".45" strokeLinecap="round" />
    </>
  )
}

function Docena({ c }) {
  const spots = [
    [32, 40], [50, 36], [68, 40],
    [30, 58], [50, 55], [70, 58],
    [38, 74], [62, 74],
  ]
  return (
    <>
      <rect x="14" y="26" width="72" height="58" rx="8" fill={c.deep} opacity=".18" />
      {spots.map(([x, y], i) => (
        <g key={i}>
          <path
            d={`M${x - 13} ${y + 7}c0-8 5.5-13.5 13-13.5S${x + 13} ${y - 1} ${x + 13} ${y + 7}c0 2.6-5.5 4-13 4s-13-1.4-13-4z`}
            fill={i % 3 === 0 ? c.light : c.base}
          />
        </g>
      ))}
    </>
  )
}

function Milanesa({ c }) {
  return (
    <>
      <path d="M18 52c0-14 14-24 32-24s32 10 32 24-14 24-32 24-32-10-32-24z" fill={c.base} />
      <path d="M22 52c0-11 12-19 28-19s28 8 28 19-12 19-28 19-28-8-28-19z" fill={c.light} opacity=".55" />
      <rect x="32" y="44" width="36" height="16" rx="3" fill={RED} opacity=".85" />
      <ellipse cx="50" cy="52" rx="15" ry="8" fill={CHEESE} />
      <g fill={c.deep} opacity=".35">
        <circle cx="28" cy="46" r="1.4" /><circle cx="35" cy="65" r="1.4" />
        <circle cx="66" cy="41" r="1.4" /><circle cx="72" cy="58" r="1.4" />
        <circle cx="50" cy="36" r="1.4" /><circle cx="58" cy="69" r="1.4" />
      </g>
    </>
  )
}

function Papas({ c }) {
  const sticks = [
    [34, 70, -22], [42, 66, -8], [50, 62, 4], [58, 66, 16], [66, 70, 28],
    [38, 74, -34], [62, 74, 34],
  ]
  return (
    <>
      <path d="M30 60h40l-5 26H35z" fill={RED} />
      <path d="M30 60h40l-1.6 8H31.6z" fill="#B22F1E" />
      {sticks.map(([x, y, r], i) => (
        <rect
          key={i}
          x={x - 4}
          y={y - 34}
          width="8"
          height="34"
          rx="3.5"
          fill={i % 2 ? c.light : c.base}
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
    </>
  )
}

function Provoleta({ c }) {
  return (
    <>
      <circle cx="50" cy="54" r="32" fill={CHAR} opacity=".22" />
      <circle cx="50" cy="52" r="27" fill={c.base} />
      <circle cx="50" cy="52" r="20" fill={c.light} />
      <g stroke={GREEN_D} strokeWidth="2.2" strokeLinecap="round" opacity=".8">
        <path d="M40 44l3 3M56 46l3-3M46 60l3 3M60 58l3 3M50 50l2 2" />
      </g>
    </>
  )
}

function Rabas({ c }) {
  const rings = [[36, 44], [56, 40], [66, 56], [44, 62], [30, 58], [52, 56]]
  return (
    <>
      <path d="M18 58c0-6 14-10 32-10s32 4 32 10-14 22-32 22-32-16-32-22z" fill={WHITE} opacity=".7" />
      {rings.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="9" fill={i % 2 ? c.light : c.base} />
          <circle cx={x} cy={y} r="3.6" fill={WHITE} opacity=".85" />
        </g>
      ))}
      <path d="M70 70a10 10 0 1 0 0-20z" fill="#F2D64B" />
    </>
  )
}

function Tabla({ c }) {
  return (
    <>
      <rect x="12" y="30" width="76" height="46" rx="6" fill={c.deep} opacity=".25" />
      <rect x="16" y="34" width="68" height="38" rx="4" fill={c.base} opacity=".35" />
      <circle cx="32" cy="46" r="9" fill="#E8A0A0" />
      <circle cx="32" cy="46" r="4" fill="#D07070" />
      <rect x="46" y="38" width="18" height="16" rx="2" fill={CHEESE} />
      <rect x="46" y="58" width="18" height="10" rx="2" fill={CREAM} />
      <circle cx="74" cy="44" r="4" fill={GREEN_D} />
      <circle cx="76" cy="56" r="4" fill={GREEN_D} />
      <circle cx="68" cy="62" r="4" fill="#6B4A2B" />
      <path d="M22 60h16v10H22z" fill={CREAM} />
    </>
  )
}

function Ensalada({ c }) {
  return (
    <>
      <path d="M16 52a34 22 0 0 0 68 0z" fill={WHITE} />
      <path d="M16 52a34 22 0 0 1 68 0z" fill={c.pale} opacity=".5" />
      <circle cx="34" cy="46" r="11" fill={GREEN} />
      <circle cx="52" cy="42" r="12" fill={c.base} />
      <circle cx="68" cy="48" r="10" fill={GREEN_D} />
      <circle cx="43" cy="55" r="8" fill={c.light} />
      <circle cx="60" cy="56" r="6" fill={RED} />
      <circle cx="30" cy="57" r="5" fill={RED} opacity=".8" />
      <path d="M46 34c4-6 12-6 15-1" stroke={GREEN_D} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  )
}

function Bowl({ c }) {
  return (
    <>
      <path d="M18 48h64c0 20-14 32-32 32S18 68 18 48z" fill={WHITE} />
      <path d="M22 50h56c0 4-1 8-2 11H24c-1-3-2-7-2-11z" fill={CREAM} />
      <circle cx="34" cy="44" r="9" fill={GREEN} />
      <circle cx="52" cy="41" r="10" fill={c.base} />
      <circle cx="69" cy="45" r="8" fill={CHEESE} />
      <path d="M44 47l8-5 8 5-8 5z" fill={c.light} />
      <rect x="16" y="44" width="68" height="6" rx="3" fill={c.deep} opacity=".2" />
    </>
  )
}

function Flan({ c }) {
  return (
    <>
      <ellipse cx="50" cy="76" rx="32" ry="8" fill={c.deep} opacity=".2" />
      <path d="M28 46h44l-5 28c-.5 3-8 5-17 5s-16.5-2-17-5z" fill={CREAM} />
      <ellipse cx="50" cy="46" rx="22" ry="8" fill="#FFF3DC" />
      <path d="M30 56c6 4 14 5 20 5s14-1 20-5l-1.4 8c-6 3-12 4-18.6 4s-12.6-1-18.6-4z" fill={c.dark} opacity=".8" />
      <path d="M42 38c0-5 4-8 8-8s8 3 8 8c0 3-3.5 5-8 5s-8-2-8-5z" fill={WHITE} />
    </>
  )
}

function Brownie({ c }) {
  return (
    <>
      <path d="M24 52h52v22c0 3-2 5-5 5H29c-3 0-5-2-5-5z" fill="#4A2A18" />
      <path d="M24 52l8-8h44l-8 8z" fill="#5E3720" />
      <path d="M68 44h8v30l-8 5z" fill="#3A1F10" />
      <circle cx="50" cy="38" r="14" fill={WHITE} />
      <circle cx="50" cy="38" r="14" fill={c.pale} opacity=".5" />
      <path d="M40 34c3-5 8-7 12-6" stroke={WHITE} strokeWidth="3" fill="none" strokeLinecap="round" opacity=".9" />
    </>
  )
}

function Botella({ c }) {
  return (
    <>
      <rect x="43" y="14" width="14" height="14" rx="3" fill={c.dark} />
      <path d="M40 28h20l6 12v38a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6V40z" fill={c.base} opacity=".9" />
      <path d="M40 28h8v56h-8a6 6 0 0 1-6-6V40z" fill={c.light} opacity=".5" />
      <rect x="34" y="48" width="32" height="20" rx="3" fill={WHITE} opacity=".92" />
      <rect x="39" y="54" width="22" height="3" rx="1.5" fill={c.deep} opacity=".6" />
      <rect x="39" y="60" width="14" height="3" rx="1.5" fill={c.deep} opacity=".35" />
    </>
  )
}

function Vaso({ c }) {
  return (
    <>
      <path d="M32 24h36l-4 56c-.3 4-6 7-14 7s-13.7-3-14-7z" fill={c.pale} opacity=".55" />
      <path d="M34 40h32l-3 40c-.2 3-5 5-13 5s-12.8-2-13-5z" fill={c.base} />
      <ellipse cx="50" cy="24" rx="18" ry="5" fill={c.light} />
      <circle cx="43" cy="52" r="3.4" fill={WHITE} opacity=".7" />
      <circle cx="56" cy="62" r="2.6" fill={WHITE} opacity=".6" />
      <path d="M62 18l8-6" stroke={c.deep} strokeWidth="4" strokeLinecap="round" />
      <path d="M40 20c-2-6 2-10 6-10" stroke={GREEN_D} strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  )
}

const SHAPES = {
  burger: Burger,
  pizza: Pizza,
  empanada: Empanada,
  docena: Docena,
  milanesa: Milanesa,
  papas: Papas,
  provoleta: Provoleta,
  rabas: Rabas,
  tabla: Tabla,
  ensalada: Ensalada,
  bowl: Bowl,
  flan: Flan,
  brownie: Brownie,
  botella: Botella,
  vaso: Vaso,
}

/**
 * La foto entra con un fundido cuando termina de bajar. Hasta entonces el
 * hueco late (ver .dish__media en motion.css).
 *
 * No alcanza con onLoad: si la imagen ya está en caché, el navegador puede
 * terminarla antes de que React enganche el handler y el fundido nunca
 * arrancaría. Por eso además se consulta `complete` al montar.
 */
function DishPhoto({ item, className, sizes, eager }) {
  const [loaded, setLoaded] = useState(false)
  const ref = useRef(null)
  const small = item.image.replace(/\.jpg$/, '-sm.jpg')

  useEffect(() => {
    if (ref.current?.complete) setLoaded(true)
  }, [item.image])

  return (
    <img
      ref={ref}
      className={`${className} art-img${loaded ? ' is-loaded' : ''}`}
      src={item.image}
      srcSet={`${small} 480w, ${item.image} 1000w`}
      sizes={sizes}
      width="1000"
      height="750"
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
    />
  )
}

/**
 * @param {object}  item
 * @param {string}  className
 * @param {boolean} plate     dibuja el plato blanco detrás de la ilustración
 * @param {string}  sizes     ancho de presentación, para que el navegador elija
 *                            entre la foto chica y la grande
 * @param {boolean} eager     carga la imagen sin esperar al scroll (para el
 *                            detalle del plato, que se abre ya visible)
 */
export default function DishArt({
  item,
  className = '',
  plate = true,
  sizes = '(min-width: 1040px) 400px, 50vw',
  eager = false,
}) {
  if (item?.image) {
    return <DishPhoto item={item} className={className} sizes={sizes} eager={eager} />
  }

  const shape = item?.art?.shape || 'burger'
  const hue = item?.art?.hue ?? 28
  const Shape = SHAPES[shape] || Burger
  const c = palette(hue)

  return (
    <svg className={className} viewBox="0 0 100 100" role="presentation" aria-hidden="true">
      {plate && <circle cx="50" cy="52" r="42" fill="var(--plate)" />}
      <Shape c={c} />
    </svg>
  )
}
