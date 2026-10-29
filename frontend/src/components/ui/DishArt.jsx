import { useEffect, useRef, useState } from 'react'

/**
 * Imagen del plato.
 *
 * Muestra la foto si el plato tiene una. Si no, no dibuja nada: el
 * recuadro queda vacío con su fondo hasta que el local suba la foto.
 */

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
/**
 * @param {object}  item
 * @param {string}  className
 * @param {string}  sizes     ancho de presentación, para que el navegador elija
 *                            entre la foto chica y la grande
 * @param {boolean} eager     carga la imagen sin esperar al scroll (para el
 *                            detalle del plato, que se abre ya visible)
 */
export default function DishArt({
  item,
  className = '',
  sizes = '(min-width: 1040px) 400px, 50vw',
  eager = false,
}) {
  if (!item?.image) return null

  return <DishPhoto item={item} className={className} sizes={sizes} eager={eager} />
}
