import { useRef, useState } from 'react'
import Icon from '../../components/ui/Icon.jsx'
import { PROMO_IMAGE } from '../../brand.js'
import * as api from '../api.js'
import { Alerta, Area, Casilleros, Interruptor, Numero, Selector, Texto, Vacio } from '../Campos.jsx'
import { useAccion, usePanel } from '../PanelProvider.jsx'

const promoVacia = () => ({
  id: null,
  kicker: '',
  title: '',
  body: '',
  productId: null,
  discountPercent: '',
  days: [],
  appliesTo: 'todo',
  categoryIds: [],
  productIds: [],
  isActive: true,
  sortOrder: 999,
})

const DIAS = [
  { valor: 'lun', texto: 'Lunes' },
  { valor: 'mar', texto: 'Martes' },
  { valor: 'mie', texto: 'Miércoles' },
  { valor: 'jue', texto: 'Jueves' },
  { valor: 'vie', texto: 'Viernes' },
  { valor: 'sab', texto: 'Sábado' },
  { valor: 'dom', texto: 'Domingo' },
]

/** «15% · Lunes y jueves · Wings Box», para la fila de la lista. */
function reglas(p, datos) {
  if (!p.discountPercent) return 'Sólo aviso, no descuenta'

  const dias = p.days.length
    ? p.days.map((d) => DIAS.find((x) => x.valor === d)?.texto).join(', ')
    : 'Todos los días'
  const nombres = (ids, lista) =>
    ids.map((id) => lista.find((x) => x.id === id)?.name).filter(Boolean).join(', ')
  const alcance =
    p.appliesTo === 'rubros'
      ? nombres(p.categoryIds, datos.categories)
      : p.appliesTo === 'platos'
        ? nombres(p.productIds, datos.products)
        : 'Toda la carta'

  return `${p.discountPercent}% · ${dias} · ${alcance}`
}

const cuponVacio = () => ({
  id: null,
  code: '',
  type: 'percent',
  value: 10,
  label: '',
  minOrder: '',
  maxUses: '',
  isActive: true,
})

/**
 * Las promos de la carta y los códigos de descuento.
 *
 * Van juntos en una pantalla porque son la misma idea desde el lado del
 * local: las dos formas que tiene de empujar una venta.
 */
export default function Promos() {
  const [promo, setPromo] = useState(null)
  const [cupon, setCupon] = useState(null)

  return (
    <>
      <div className="ad-cabecera">
        <h1>Promos y cupones</h1>
      </div>

      <ListaPromos alEditar={setPromo} alCrear={() => setPromo(promoVacia())} />
      <ListaCupones alEditar={setCupon} alCrear={() => setCupon(cuponVacio())} />

      {promo && <EditorPromo promo={promo} alCerrar={() => setPromo(null)} />}
      {cupon && <EditorCupon cupon={cupon} alCerrar={() => setCupon(null)} />}
    </>
  )
}

function ListaPromos({ alEditar, alCrear }) {
  const { datos } = usePanel()

  return (
    <section className="ad-grupo">
      <h2 className="ad-grupo__titulo">
        Promos
        <button type="button" className="ad-btn ad-btn--fantasma" onClick={alCrear}>
          <Icon name="plus" size={18} />
          Nueva
        </button>
      </h2>

      {datos.promos.length === 0 ? (
        <Vacio titulo="Sin promos" texto="Las promos aparecen en un aviso al entrar a la carta y en su propia sección, arriba de todo." />
      ) : (
        <ul className="ad-lista">
          {datos.promos.map((p) => (
            <li key={p.id} className={'ad-fila' + (p.isActive ? '' : ' is-apagado')}>
              <div className="ad-fila__texto">
                {p.kicker && <p className="ad-fila__kicker">{p.kicker}</p>}
                <p className="ad-fila__nombre">{p.title}</p>
                {p.body && <p className="ad-fila__desc">{p.body}</p>}
                <p className="ad-fila__desc">{reglas(p, datos)}</p>
                {p.productName && <p className="ad-fila__desc">Lleva a: {p.productName}</p>}
              </div>
              <span className={'ad-pastilla' + (p.isActive ? ' is-si' : ' is-no')}>
                {p.isActive ? 'Visible' : 'Oculta'}
              </span>
              <button type="button" className="ad-btn ad-btn--fantasma" onClick={() => alEditar(p)}>
                <Icon name="edit" size={18} />
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ListaCupones({ alEditar, alCrear }) {
  const { datos } = usePanel()

  const descripcion = (c) =>
    c.type === 'percent'
      ? `${c.value}% de descuento`
      : c.type === 'fixed'
        ? `$${c.value} de descuento`
        : 'Envío sin cargo'

  return (
    <section className="ad-grupo">
      <h2 className="ad-grupo__titulo">
        Cupones
        <button type="button" className="ad-btn ad-btn--fantasma" onClick={alCrear}>
          <Icon name="plus" size={18} />
          Nuevo
        </button>
      </h2>

      {datos.coupons.length === 0 ? (
        <Vacio titulo="Sin cupones" texto="Un cupón es un código que el cliente escribe en el carrito." />
      ) : (
        <ul className="ad-lista">
          {datos.coupons.map((c) => (
            <li key={c.id} className={'ad-fila' + (c.isActive ? '' : ' is-apagado')}>
              <div className="ad-fila__texto">
                <p className="ad-fila__nombre ad-mono">{c.code}</p>
                <p className="ad-fila__desc">
                  {descripcion(c)}
                  {c.maxUses ? ` · usado ${c.usedCount} de ${c.maxUses}` : ` · usado ${c.usedCount} veces`}
                </p>
              </div>
              <span className={'ad-pastilla' + (c.isActive ? ' is-si' : ' is-no')}>
                {c.isActive ? 'Activo' : 'Apagado'}
              </span>
              <button type="button" className="ad-btn ad-btn--fantasma" onClick={() => alEditar(c)}>
                <Icon name="edit" size={18} />
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EditorPromo({ promo, alCerrar }) {
  const { datos, aplicar } = usePanel()
  const { correr, ocupado, error } = useAccion()
  const [f, setF] = useState(promo)
  const [subiendo, setSubiendo] = useState(false)
  const [errorFoto, setErrorFoto] = useState(null)
  const archivo = useRef(null)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))

  async function subirFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setSubiendo(true)
    setErrorFoto(null)
    try {
      const res = await api.subirFotoPromo(f.id, file)
      setF((x) => ({ ...x, image: res.image }))
      aplicar({ promos: res.promos })
    } catch (err) {
      setErrorFoto(err)
    } finally {
      setSubiendo(false)
      if (archivo.current) archivo.current.value = ''
    }
  }

  async function quitarFoto() {
    setErrorFoto(null)
    try {
      const res = await api.quitarFotoPromo(f.id)
      setF((x) => ({ ...x, image: null }))
      aplicar({ promos: res.promos })
    } catch (err) {
      setErrorFoto(err)
    }
  }

  async function guardar(e) {
    e.preventDefault()
    const res = await correr(() =>
      api.guardarPromo(f.id, {
        kicker: f.kicker,
        title: f.title,
        body: f.body,
        productId: f.productId ? Number(f.productId) : null,
        discountPercent: Number(f.discountPercent) || null,
        days: f.days,
        appliesTo: f.appliesTo,
        categoryIds: f.categoryIds,
        productIds: f.productIds,
        isActive: f.isActive,
        sortOrder: Number(f.sortOrder) || 999,
      }),
    )
    if (res) alCerrar()
  }

  return (
    <div className="ad-panel-fondo" role="presentation" onClick={alCerrar}>
      <form className="ad-panel" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <header className="ad-panel__top">
          <h2>{f.id ? 'Editar promo' : 'Nueva promo'}</h2>
          <button type="button" className="ad-iconbtn" onClick={alCerrar} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="ad-panel__cuerpo">
          <Alerta error={error} />

          <Texto
            etiqueta="Bajada"
            ayuda="La línea chica de arriba, como «Todos los martes»."
            valor={f.kicker}
            alCambiar={set('kicker')}
            maxLength={80}
          />
          <Texto etiqueta="Título" valor={f.title} alCambiar={set('title')} required maxLength={160} />
          <Area etiqueta="Texto" valor={f.body} alCambiar={set('body')} maxLength={300} />

          {/* Igual que la foto de un plato: necesita un id para nombrar
              el archivo, así que sólo se sube a una promo ya guardada. */}
          <div className="ad-campo">
            <span className="ad-campo__label">Imagen</span>

            {!f.id ? (
              <p className="ad-campo__ayuda">
                Guardá la promo primero y después vas a poder subirle una imagen. Mientras
                tanto usa la imagen genérica.
              </p>
            ) : (
              <div className="ad-foto">
                <div className="ad-foto__vista">
                  <img src={f.image || PROMO_IMAGE} alt={`Imagen de ${f.title}`} />
                </div>

                <div className="ad-foto__acciones">
                  <input
                    ref={archivo}
                    id="foto-promo"
                    className="ad-foto__input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={subirFoto}
                  />
                  <label htmlFor="foto-promo" className="ad-btn ad-btn--fantasma">
                    <Icon name="upload" size={18} />
                    {subiendo ? 'Subiendo...' : f.image ? 'Cambiar' : 'Subir imagen'}
                  </label>

                  {f.image && (
                    <button type="button" className="ad-btn ad-btn--fantasma" onClick={quitarFoto}>
                      Usar la genérica
                    </button>
                  )}

                  <p className="ad-campo__ayuda">
                    {f.image ? '' : 'Ahora muestra la imagen genérica. '}
                    JPG, PNG o WebP, hasta 6 MB. Se ve apaisada (2:1).
                  </p>
                  <Alerta error={errorFoto} />
                </div>
              </div>
            )}
          </div>

          <Numero
            etiqueta="Descuento"
            ayuda="Se descuenta solo en el pedido. Dejalo vacío si la promo es sólo un aviso."
            valor={f.discountPercent ?? ''}
            alCambiar={set('discountPercent')}
            sufijo="%"
            min="0"
            max="100"
            step="any"
          />

          {Number(f.discountPercent) > 0 && (
            <>
              <Casilleros
                etiqueta="Qué días (sin marcar ninguno, todos)"
                opciones={DIAS}
                valores={f.days}
                alCambiar={set('days')}
              />

              <Selector
                etiqueta="Qué platos entran"
                valor={f.appliesTo}
                alCambiar={set('appliesTo')}
                opciones={[
                  { valor: 'todo', texto: 'Toda la carta' },
                  { valor: 'rubros', texto: 'Algunos rubros' },
                  { valor: 'platos', texto: 'Algunos platos' },
                ]}
              />

              {f.appliesTo === 'rubros' && (
                <Casilleros
                  etiqueta="Rubros"
                  opciones={datos.categories.map((c) => ({ valor: c.id, texto: c.name }))}
                  valores={f.categoryIds}
                  alCambiar={set('categoryIds')}
                />
              )}

              {f.appliesTo === 'platos' && (
                <Casilleros
                  etiqueta="Platos"
                  opciones={datos.products.map((p) => ({ valor: p.id, texto: p.name }))}
                  valores={f.productIds}
                  alCambiar={set('productIds')}
                />
              )}
            </>
          )}

          <Selector
            etiqueta="A qué plato lleva"
            ayuda="Al tocar la promo se abre este plato."
            valor={f.productId ? String(f.productId) : ''}
            alCambiar={(v) => set('productId')(v || null)}
            opciones={[
              { valor: '', texto: 'A ninguno' },
              ...datos.products.map((p) => ({ valor: String(p.id), texto: p.name })),
            ]}
          />

          <Numero etiqueta="Orden" valor={f.sortOrder} alCambiar={set('sortOrder')} min="0" />
          <Interruptor etiqueta="Visible en la carta" valor={f.isActive} alCambiar={set('isActive')} />
        </div>

        <footer className="ad-panel__pie">
          {f.id && (
            <button
              type="button"
              className="ad-btn ad-btn--peligro"
              disabled={ocupado}
              onClick={async () => {
                if (!window.confirm('¿Borrar esta promo?')) return
                if (await correr(() => api.borrarPromo(f.id))) alCerrar()
              }}
            >
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

function EditorCupon({ cupon, alCerrar }) {
  const { correr, ocupado, error } = useAccion()
  const [f, setF] = useState(cupon)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))

  async function guardar(e) {
    e.preventDefault()
    const res = await correr(() =>
      api.guardarCupon(f.id, {
        code: f.code,
        type: f.type,
        value: Number(f.value) || 0,
        label: f.label,
        minOrder: f.minOrder === '' ? null : Number(f.minOrder),
        maxUses: f.maxUses === '' ? null : Number(f.maxUses),
        isActive: f.isActive,
      }),
    )
    if (res) alCerrar()
  }

  return (
    <div className="ad-panel-fondo" role="presentation" onClick={alCerrar}>
      <form className="ad-panel" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <header className="ad-panel__top">
          <h2>{f.id ? 'Editar cupón' : 'Nuevo cupón'}</h2>
          <button type="button" className="ad-iconbtn" onClick={alCerrar} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="ad-panel__cuerpo">
          <Alerta error={error} />

          <Texto
            etiqueta="Código"
            ayuda="Sin espacios ni símbolos. Lo escribe el cliente en el carrito."
            valor={f.code}
            alCambiar={(v) => set('code')(v.toUpperCase())}
            required
            maxLength={40}
          />

          <Selector
            etiqueta="Tipo de descuento"
            valor={f.type}
            alCambiar={set('type')}
            opciones={[
              { valor: 'percent', texto: 'Porcentaje' },
              { valor: 'fixed', texto: 'Monto fijo' },
              { valor: 'shipping', texto: 'Envío sin cargo' },
            ]}
          />

          {f.type !== 'shipping' && (
            <Numero
              etiqueta={f.type === 'percent' ? 'Porcentaje' : 'Monto'}
              valor={f.value}
              alCambiar={set('value')}
              min="0"
              max={f.type === 'percent' ? '100' : undefined}
              sufijo={f.type === 'percent' ? '%' : '$'}
            />
          )}

          <div className="ad-fila-campos">
            <Numero
              etiqueta="Compra mínima"
              ayuda="Vacío: sin mínimo."
              valor={f.minOrder}
              alCambiar={set('minOrder')}
              min="0"
              sufijo="$"
            />
            <Numero
              etiqueta="Usos máximos"
              ayuda="Vacío: sin límite."
              valor={f.maxUses}
              alCambiar={set('maxUses')}
              min="0"
            />
          </div>

          <Interruptor etiqueta="Activo" valor={f.isActive} alCambiar={set('isActive')} />
        </div>

        <footer className="ad-panel__pie">
          {f.id && (
            <button
              type="button"
              className="ad-btn ad-btn--peligro"
              disabled={ocupado}
              onClick={async () => {
                if (!window.confirm(`¿Borrar el cupón ${f.code}?`)) return
                if (await correr(() => api.borrarCupon(f.id))) alCerrar()
              }}
            >
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
