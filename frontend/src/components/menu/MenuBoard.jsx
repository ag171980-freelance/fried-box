import DishCard from './DishCard.jsx'

/**
 * Dibuja la carta entera con el estilo elegido.
 * Sólo cambia el contenedor: las tarjetas son las mismas.
 */
export default function MenuBoard({
  categories,
  itemsByCategory,
  layout,
  qtyOf,
  onOpen,
  onAdd,
  sectionRefs,
}) {
  const containerClass =
    layout === 'carrusel' ? 'm-carrusel u-scroll-x' : `m-${layout}`

  return (
    <div className="board">
      {categories.map((cat) => {
        const list = itemsByCategory[cat.id] || []
        if (!list.length) return null

        return (
          <section
            key={cat.id}
            id={`rubro-${cat.id}`}
            className="section"
            ref={(el) => {
              if (sectionRefs) sectionRefs.current[cat.id] = el
            }}
          >
            <header className="section__head">
              <h2 className="section__title">{cat.name}</h2>
            </header>

            <div className={containerClass}>
              {list.map((item, i) => (
                <DishCard
                  key={item.id}
                  item={item}
                  layout={layout}
                  index={i}
                  inCart={qtyOf(item.id)}
                  onOpen={onOpen}
                  onAdd={onAdd}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
