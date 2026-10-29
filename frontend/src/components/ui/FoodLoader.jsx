/**
 * Loader de la casa: un plato con vapor y el aro girando.
 *
 * Aparece con 140 ms de retardo (ver .loader en motion.css). Si la carta
 * llega rápido, el usuario no llega a verlo parpadear.
 */
export default function FoodLoader({ label = 'Poniendo la mesa', full = false }) {
  return (
    <div className={full ? 'loader loader--full' : 'loader'} role="status" aria-live="polite">
      <svg className="loader__art" viewBox="0 0 120 120" aria-hidden="true">
        <g className="loader__steam">
          <path d="M44 42c-7-8 7-13 0-22" />
          <path d="M60 40c-7-9 7-15 0-25" />
          <path d="M76 42c-7-8 7-13 0-22" />
        </g>

        <ellipse className="loader__shadow" cx="60" cy="104" rx="34" ry="7" />
        <circle className="loader__plate" cx="60" cy="74" r="30" />
        <circle className="loader__inner" cx="60" cy="74" r="20" />
        <circle className="loader__arc" cx="60" cy="74" r="36" />
      </svg>

      <p className="loader__label">{label}</p>
    </div>
  )
}
