import { useState } from 'react'
import Icon from '../../components/ui/Icon.jsx'
import * as api from '../api.js'
import { Alerta, Numero, Texto, Vacio } from '../Campos.jsx'
import { useAccion, usePanel } from '../PanelProvider.jsx'

/**
 * Los rubros de la carta: Boxes, Pollo, Burgers.
 *
 * Son pocos y se tocan poco, así que se editan en la fila misma en vez
 * de abrir un panel. Un rubro con platos adentro no se puede borrar: el
 * backend lo frena y acá se explica por qué antes de que lo intente.
 */
export default function Rubros() {
  const { datos } = usePanel()
  const { correr, ocupado, error } = useAccion()
  const [nuevo, setNuevo] = useState('')

  async function crear(e) {
    e.preventDefault()
    if (!nuevo.trim()) return

    const orden = (datos.categories.at(-1)?.sortOrder ?? 0) + 10
    const res = await correr(() => api.crearCategoria({ name: nuevo.trim(), sortOrder: orden }))
    if (res) setNuevo('')
  }

  return (
    <>
      <div className="ad-cabecera">
        <h1>Rubros</h1>
      </div>

      <Alerta error={error} />

      <form className="ad-agregar" onSubmit={crear}>
        <Texto
          etiqueta="Nuevo rubro"
          valor={nuevo}
          alCambiar={setNuevo}
          placeholder="Postres"
          maxLength={120}
        />
        <button type="submit" className="ad-btn ad-btn--primario" disabled={ocupado || !nuevo.trim()}>
          <Icon name="plus" size={18} />
          Agregar
        </button>
      </form>

      {datos.categories.length === 0 ? (
        <Vacio titulo="Todavía no hay rubros" texto="Creá el primero para poder cargar platos." />
      ) : (
        <ul className="ad-lista">
          {datos.categories.map((c) => (
            <FilaRubro key={c.id} rubro={c} />
          ))}
        </ul>
      )}
    </>
  )
}

function FilaRubro({ rubro }) {
  const { correr, ocupado, error } = useAccion()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(rubro.name)
  const [orden, setOrden] = useState(rubro.sortOrder)

  async function guardar() {
    const res = await correr(() =>
      api.actualizarCategoria(rubro.id, { name: nombre, sortOrder: Number(orden) || 999 }),
    )
    if (res) setEditando(false)
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar el rubro "${rubro.name}"?`)) return
    await correr(() => api.borrarCategoria(rubro.id))
  }

  if (editando) {
    return (
      <li className="ad-fila ad-fila--editando">
        <div className="ad-fila-campos ad-fila-campos--crece">
          <Texto etiqueta="Nombre" valor={nombre} alCambiar={setNombre} maxLength={120} />
          <Numero etiqueta="Orden" valor={orden} alCambiar={setOrden} min="0" />
        </div>
        <button type="button" className="ad-btn ad-btn--fantasma" onClick={() => setEditando(false)}>
          Cancelar
        </button>
        <button type="button" className="ad-btn ad-btn--primario" onClick={guardar} disabled={ocupado}>
          Guardar
        </button>
      </li>
    )
  }

  return (
    <li className="ad-fila">
      <div className="ad-fila__texto">
        <p className="ad-fila__nombre">{rubro.name}</p>
        <p className="ad-fila__desc">
          {rubro.productCount === 0
            ? 'Sin platos'
            : rubro.productCount === 1
              ? '1 plato'
              : `${rubro.productCount} platos`}
        </p>
        <Alerta error={error} />
      </div>

      <button type="button" className="ad-btn ad-btn--fantasma" onClick={() => setEditando(true)}>
        <Icon name="edit" size={18} />
        Editar
      </button>

      <button
        type="button"
        className="ad-btn ad-btn--peligro"
        onClick={borrar}
        disabled={ocupado || rubro.productCount > 0}
        title={
          rubro.productCount > 0
            ? 'Primero movés o borrás los platos que tiene adentro'
            : 'Borrar el rubro'
        }
      >
        <Icon name="trash" size={18} />
      </button>
    </li>
  )
}
