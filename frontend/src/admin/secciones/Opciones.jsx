import { useState } from 'react'
import Icon from '../../components/ui/Icon.jsx'
import { money } from '../../lib/format.js'
import * as api from '../api.js'
import { Alerta, Interruptor, Numero, Selector, Texto, Vacio } from '../Campos.jsx'
import { useAccion, usePanel } from '../PanelProvider.jsx'

const vacio = () => ({
  id: null,
  name: '',
  type: 'single',
  isRequired: true,
  minChoices: 1,
  maxChoices: 1,
  sortOrder: 999,
  choices: [{ name: '', priceDelta: 0, isDefault: true }],
})

/**
 * Los grupos de opciones: «Elegí tu salsa», «Punto de cocción».
 *
 * Un grupo es una pregunta y sus respuestas. Cada respuesta puede
 * sumar plata al precio del plato. El plato elige qué grupos le tocan
 * desde la pantalla de Carta.
 */
export default function Opciones() {
  const { datos } = usePanel()
  const [editando, setEditando] = useState(null)

  return (
    <>
      <div className="ad-cabecera">
        <h1>Opciones</h1>
        <button type="button" className="ad-btn ad-btn--primario" onClick={() => setEditando(vacio())}>
          <Icon name="plus" size={18} />
          Nuevo grupo
        </button>
      </div>

      {datos.optionGroups.length === 0 ? (
        <Vacio
          titulo="Todavía no hay grupos de opciones"
          texto="Sirven para que el cliente elija salsa, punto de cocción o guarnición al agregar un plato."
        />
      ) : (
        <ul className="ad-lista">
          {datos.optionGroups.map((g) => (
            <li key={g.id} className="ad-fila">
              <div className="ad-fila__texto">
                <p className="ad-fila__nombre">{g.name}</p>
                <p className="ad-fila__desc">
                  {g.type === 'single' ? 'Elige una' : `Elige hasta ${g.maxChoices}`}
                  {g.isRequired ? ' · obligatorio' : ' · opcional'}
                </p>
                <ul className="ad-chips">
                  {g.choices.map((c) => (
                    <li key={c.id} className="ad-chip">
                      {c.name}
                      {c.priceDelta > 0 && <b> +{money(c.priceDelta)}</b>}
                    </li>
                  ))}
                </ul>
              </div>

              <button type="button" className="ad-btn ad-btn--fantasma" onClick={() => setEditando(g)}>
                <Icon name="edit" size={18} />
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}

      {editando && <EditorGrupo grupo={editando} alCerrar={() => setEditando(null)} />}
    </>
  )
}

function EditorGrupo({ grupo, alCerrar }) {
  const { correr, ocupado, error } = useAccion()
  const [f, setF] = useState({
    ...grupo,
    choices: grupo.choices.length ? grupo.choices : [{ name: '', priceDelta: 0, isDefault: true }],
  })
  const nuevo = !f.id
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))

  const cambiarEleccion = (i, parche) =>
    setF((x) => ({
      ...x,
      choices: x.choices.map((c, j) => (j === i ? { ...c, ...parche } : c)),
    }))

  async function guardar(e) {
    e.preventDefault()

    const choices = f.choices.filter((c) => c.name.trim())
    if (choices.length === 0) return

    const res = await correr(() =>
      api.guardarGrupo(f.id, {
        name: f.name,
        type: f.type,
        isRequired: f.isRequired,
        minChoices: Number(f.minChoices) || 0,
        maxChoices: Number(f.maxChoices) || 1,
        sortOrder: Number(f.sortOrder) || 999,
        choices: choices.map((c) => ({
          name: c.name,
          priceDelta: Number(c.priceDelta) || 0,
          isDefault: Boolean(c.isDefault),
        })),
      }),
    )

    if (res) alCerrar()
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar el grupo "${f.name}"? Se saca de todos los platos que lo usan.`)) return
    const res = await correr(() => api.borrarGrupo(f.id))
    if (res) alCerrar()
  }

  return (
    <div className="ad-panel-fondo" role="presentation" onClick={alCerrar}>
      <form className="ad-panel" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <header className="ad-panel__top">
          <h2>{nuevo ? 'Nuevo grupo' : 'Editar grupo'}</h2>
          <button type="button" className="ad-iconbtn" onClick={alCerrar} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="ad-panel__cuerpo">
          <Alerta error={error} />

          <Texto
            etiqueta="Pregunta"
            ayuda="Es lo que lee el cliente, como «Elegí tu salsa»."
            valor={f.name}
            alCambiar={set('name')}
            required
            maxLength={120}
          />

          <Selector
            etiqueta="Cuántas puede elegir"
            valor={f.type}
            alCambiar={set('type')}
            opciones={[
              { valor: 'single', texto: 'Una sola' },
              { valor: 'multi', texto: 'Varias' },
            ]}
          />

          {f.type === 'multi' && (
            <Numero
              etiqueta="Máximo"
              valor={f.maxChoices}
              alCambiar={set('maxChoices')}
              min="1"
              max="20"
            />
          )}

          <Interruptor
            etiqueta="Obligatorio"
            ayuda="Si está puesto, no puede agregar el plato sin elegir."
            valor={f.isRequired}
            alCambiar={set('isRequired')}
          />

          <div className="ad-campo">
            <span className="ad-campo__label">Opciones</span>

            <ul className="ad-elecciones">
              {f.choices.map((c, i) => (
                <li key={i} className="ad-eleccion">
                  <input
                    type="text"
                    aria-label={`Nombre de la opción ${i + 1}`}
                    value={c.name}
                    onChange={(e) => cambiarEleccion(i, { name: e.target.value })}
                    placeholder="Barbacoa"
                    maxLength={120}
                  />
                  <div className="ad-numero ad-numero--chico">
                    <input
                      type="number"
                      aria-label={`Precio extra de la opción ${i + 1}`}
                      value={c.priceDelta}
                      onChange={(e) => cambiarEleccion(i, { priceDelta: e.target.value })}
                      min="0"
                      step="100"
                    />
                    <span className="ad-numero__sufijo">$</span>
                  </div>
                  <label className="ad-eleccion__radio">
                    <input
                      type="radio"
                      name="eleccion-default"
                      checked={Boolean(c.isDefault)}
                      onChange={() =>
                        setF((x) => ({
                          ...x,
                          choices: x.choices.map((o, j) => ({ ...o, isDefault: i === j })),
                        }))
                      }
                    />
                    Por defecto
                  </label>
                  <button
                    type="button"
                    className="ad-iconbtn"
                    aria-label={`Quitar la opción ${i + 1}`}
                    onClick={() => setF((x) => ({ ...x, choices: x.choices.filter((_, j) => j !== i) }))}
                    disabled={f.choices.length === 1}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="ad-btn ad-btn--fantasma"
              onClick={() =>
                setF((x) => ({ ...x, choices: [...x.choices, { name: '', priceDelta: 0, isDefault: false }] }))
              }
            >
              <Icon name="plus" size={18} />
              Agregar opción
            </button>
          </div>
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
