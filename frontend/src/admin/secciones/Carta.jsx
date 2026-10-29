import { useMemo, useRef, useState } from 'react'
import Icon from '../../components/ui/Icon.jsx'
import { money } from '../../lib/format.js'
import * as api from '../api.js'
import { Alerta, Area, Casilleros, Interruptor, Numero, Selector, Texto, Vacio } from '../Campos.jsx'
import { useAccion, usePanel } from '../PanelProvider.jsx'

const ETIQUETAS = [
  { valor: 'veg', texto: 'Veggie' },
  { valor: 'hot', texto: 'Picante' },
  { valor: 'sintacc', texto: 'Sin TACC' },
  { valor: 'vegano', texto: 'Vegano' },
]

const vacio = (categoryId) => ({
  id: null,
  categoryId,
  name: '',
  description: '',
  price: '',
  image: null,
  artShape: 'tabla',
  artHue: 30,
  badge: '',
  isPopular: false,
  isAvailable: true,
  sortOrder: 999,
  tags: [],
  optionGroupIds: [],
})

/**
 * La carta: todos los platos, agrupados por rubro.
 *
 * Lo que más se usa está en la fila y no en el formulario: prender y
 * apagar un plato («se acabó la milanesa») es un toque, sin abrir nada.
 * Editar nombre, precio y foto abre el panel lateral.
 */
export default function Carta() {
  const { datos } = usePanel()
  const [editando, setEditando] = useState(null)

  const porRubro = useMemo(() => {
    const mapa = new Map(datos.categories.map((c) => [c.id, { rubro: c, platos: [] }]))
    for (const p of datos.products) mapa.get(p.categoryId)?.platos.push(p)
    return [...mapa.values()]
  }, [datos.categories, datos.products])

  if (datos.categories.length === 0) {
    return (
      <Vacio
        titulo="Todavía no hay rubros"
        texto="Un plato tiene que ir en algún rubro. Creá el primero y volvé."
      />
    )
  }

  return (
    <>
      <div className="ad-cabecera">
        <h1>Carta</h1>
        <button
          type="button"
          className="ad-btn ad-btn--primario"
          onClick={() => setEditando(vacio(datos.categories[0].id))}
        >
          <Icon name="plus" size={18} />
          Nuevo plato
        </button>
      </div>

      {datos.products.length === 0 ? (
        <Vacio titulo="La carta está vacía" texto="Cargá el primer plato para que el local abra con algo." />
      ) : (
        porRubro.map(({ rubro, platos }) => (
          <section key={rubro.id} className="ad-grupo">
            <h2 className="ad-grupo__titulo">
              {rubro.name}
              <span className="ad-grupo__cuenta">{platos.length}</span>
            </h2>

            {platos.length === 0 ? (
              <p className="ad-grupo__vacio">Sin platos en este rubro.</p>
            ) : (
              <ul className="ad-lista">
                {platos.map((p) => (
                  <Fila key={p.id} plato={p} alEditar={() => setEditando(p)} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      {editando && <Editor plato={editando} alCerrar={() => setEditando(null)} />}
    </>
  )
}

function Fila({ plato, alEditar }) {
  const { correr, ocupado } = useAccion()

  return (
    <li className={'ad-fila' + (plato.isAvailable ? '' : ' is-apagado')}>
      <div className="ad-fila__foto">
        {plato.image ? (
          <img src={plato.image} alt="" loading="lazy" />
        ) : (
          <span className="ad-fila__sinfoto" title="Sin foto">
            <Icon name="image" size={18} />
          </span>
        )}
      </div>

      <div className="ad-fila__texto">
        <p className="ad-fila__nombre">{plato.name}</p>
        {plato.description && <p className="ad-fila__desc">{plato.description}</p>}
      </div>

      <p className="ad-fila__precio">{money(plato.price)}</p>

      <button
        type="button"
        className={'ad-pastilla' + (plato.isAvailable ? ' is-si' : ' is-no')}
        disabled={ocupado}
        onClick={() => correr(() => api.cambiarDisponibilidad(plato.id, !plato.isAvailable))}
        title={plato.isAvailable ? 'Tocá para marcarlo como agotado' : 'Tocá para volver a ofrecerlo'}
      >
        {plato.isAvailable ? 'En carta' : 'Agotado'}
      </button>

      <button type="button" className="ad-btn ad-btn--fantasma" onClick={alEditar}>
        <Icon name="edit" size={18} />
        Editar
      </button>
    </li>
  )
}

function Editor({ plato, alCerrar }) {
  const { datos } = usePanel()
  const { correr, ocupado, error } = useAccion()
  const [f, setF] = useState(plato)
  const [subiendo, setSubiendo] = useState(false)
  const [errorFoto, setErrorFoto] = useState(null)
  const archivo = useRef(null)
  const nuevo = !f.id

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))

  async function guardar(e) {
    e.preventDefault()

    const cuerpo = {
      ...f,
      price: Number(f.price) || 0,
      sortOrder: Number(f.sortOrder) || 999,
      artHue: Number(f.artHue) || 0,
    }

    const res = await correr(() =>
      nuevo ? api.crearProducto(cuerpo) : api.actualizarProducto(f.id, cuerpo),
    )

    if (res) alCerrar()
  }

  async function subirFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setSubiendo(true)
    setErrorFoto(null)
    try {
      const res = await api.subirFoto(f.id, file)
      setF((x) => ({ ...x, image: res.image }))
    } catch (err) {
      setErrorFoto(err)
    } finally {
      setSubiendo(false)
      if (archivo.current) archivo.current.value = ''
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar "${f.name}"? Los pedidos viejos no se tocan.`)) return
    const res = await correr(() => api.borrarProducto(f.id))
    if (res) alCerrar()
  }

  return (
    <div className="ad-panel-fondo" role="presentation" onClick={alCerrar}>
      <form
        className="ad-panel"
        onClick={(e) => e.stopPropagation()}
        onSubmit={guardar}
        aria-label={nuevo ? 'Nuevo plato' : `Editar ${f.name}`}
      >
        <header className="ad-panel__top">
          <h2>{nuevo ? 'Nuevo plato' : 'Editar plato'}</h2>
          <button type="button" className="ad-iconbtn" onClick={alCerrar} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="ad-panel__cuerpo">
          <Alerta error={error} />

          <Texto etiqueta="Nombre" valor={f.name} alCambiar={set('name')} required maxLength={160} />

          <Area
            etiqueta="Descripción"
            ayuda="Lo que se lee debajo del nombre en la carta."
            valor={f.description}
            alCambiar={set('description')}
            maxLength={400}
          />

          <div className="ad-fila-campos">
            <Numero etiqueta="Precio" valor={f.price} alCambiar={set('price')} min="0" step="100" sufijo="$" required />
            <Selector
              etiqueta="Rubro"
              valor={String(f.categoryId)}
              alCambiar={(v) => set('categoryId')(Number(v))}
              opciones={datos.categories.map((c) => ({ valor: String(c.id), texto: c.name }))}
            />
          </div>

          {/* La foto sólo se puede subir a un plato que ya existe:
              necesita un id para nombrar el archivo. */}
          <div className="ad-campo">
            <span className="ad-campo__label">Foto</span>

            {nuevo ? (
              <p className="ad-campo__ayuda">
                Guardá el plato primero y después vas a poder subirle la foto.
              </p>
            ) : (
              <div className="ad-foto">
                <div className="ad-foto__vista">
                  {f.image ? (
                    <img src={f.image} alt={`Foto de ${f.name}`} />
                  ) : (
                    <span className="ad-foto__sin">
                      <Icon name="image" size={24} />
                      Sin foto
                    </span>
                  )}
                </div>

                <div className="ad-foto__acciones">
                  <input
                    ref={archivo}
                    id="foto-plato"
                    className="ad-foto__input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={subirFoto}
                  />
                  <label htmlFor="foto-plato" className="ad-btn ad-btn--fantasma">
                    <Icon name="upload" size={18} />
                    {subiendo ? 'Subiendo...' : f.image ? 'Cambiar' : 'Subir foto'}
                  </label>

                  {f.image && (
                    <button
                      type="button"
                      className="ad-btn ad-btn--fantasma"
                      onClick={async () => {
                        await api.quitarFoto(f.id)
                        setF((x) => ({ ...x, image: null }))
                      }}
                    >
                      Quitar
                    </button>
                  )}

                  <p className="ad-campo__ayuda">JPG, PNG o WebP. Hasta 6 MB.</p>
                  <Alerta error={errorFoto} />
                </div>
              </div>
            )}
          </div>

          <Casilleros
            etiqueta="Etiquetas"
            opciones={ETIQUETAS}
            valores={f.tags}
            alCambiar={set('tags')}
          />

          {datos.optionGroups.length > 0 && (
            <Casilleros
              etiqueta="Grupos de opciones"
              opciones={datos.optionGroups.map((g) => ({ valor: g.id, texto: g.name }))}
              valores={f.optionGroupIds}
              alCambiar={set('optionGroupIds')}
            />
          )}

          <div className="ad-fila-campos">
            <Texto
              etiqueta="Sello"
              ayuda="Texto corto sobre la foto, como «Para 2»."
              valor={f.badge}
              alCambiar={set('badge')}
              maxLength={40}
            />
            <Numero
              etiqueta="Orden"
              ayuda="Más chico aparece antes."
              valor={f.sortOrder}
              alCambiar={set('sortOrder')}
              min="0"
            />
          </div>

          <Interruptor
            etiqueta="Marcarlo como muy pedido"
            valor={f.isPopular}
            alCambiar={set('isPopular')}
          />
          <Interruptor
            etiqueta="Disponible"
            ayuda="Apagalo cuando se acabe. Sigue en la carta, pero no se puede pedir."
            valor={f.isAvailable}
            alCambiar={set('isAvailable')}
          />
        </div>

        <footer className="ad-panel__pie">
          {!nuevo && (
            <button type="button" className="ad-btn ad-btn--peligro" onClick={borrar} disabled={ocupado}>
              <Icon name="trash" size={18} />
              Borrar
            </button>
          )}
          <span className="ad-panel__sep" />
          <button type="button" className="ad-btn ad-btn--fantasma" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" className="ad-btn ad-btn--primario" disabled={ocupado}>
            {ocupado ? 'Guardando...' : 'Guardar'}
          </button>
        </footer>
      </form>
    </div>
  )
}
