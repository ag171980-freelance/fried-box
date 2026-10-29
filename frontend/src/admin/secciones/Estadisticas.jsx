import { useEffect, useMemo, useState } from 'react'
import { money } from '../../lib/format.js'
import * as api from '../api.js'
import { Alerta } from '../Campos.jsx'
import Grafico from '../Grafico.jsx'

const RANGOS = [
  { dias: 7, texto: '7 días' },
  { dias: 30, texto: '30 días' },
  { dias: 90, texto: '90 días' },
  { dias: 365, texto: 'Un año' },
]

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «29 oct», sin pasar por Date para no correr el día por la zona horaria. */
const diaCorto = (iso) => {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]}`
}

/** Montos del eje en corto: $ 24k, $ 1,2M. */
const plataCorta = (v) =>
  v >= 1e6
    ? `$ ${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
    : v >= 1e3
      ? `$ ${Math.round(v / 1e3)}k`
      : `$ ${v}`

const unidades = (v) => `${v} ${v === 1 ? 'unidad' : 'unidades'}`
const veces = (v) => `${v} ${v === 1 ? 'vez' : 'veces'}`
const entero = (v) => String(v)
const pedidos = (v) => `${v} ${v === 1 ? 'pedido' : 'pedidos'}`

/**
 * Los números del local, arriba del historial.
 *
 * Los totales (hoy, mes, desde siempre) son fijos; los gráficos miran el
 * rango elegido. Cada gráfico tiene su tabla, para leer el número exacto
 * o copiarlo.
 */
export default function Estadisticas({ cambios }) {
  const [dias, setDias] = useState(30)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    api
      .estadisticas(dias)
      .then((res) => {
        if (!vigente) return
        setError(null)
        setDatos(res)
      })
      .catch((e) => vigente && setError(e))
    return () => {
      vigente = false
    }
  }, [dias, cambios])

  // Memorizados: Grafico rehace el lienzo cuando cambian sus props.
  const ventasDia = useMemo(() => {
    if (!datos) return null
    return {
      etiquetas: datos.porDia.map((d) => diaCorto(d.dia)),
      valores: datos.porDia.map((d) => d.ventas),
      detalle: (i) => pedidos(datos.porDia[i].pedidos),
    }
  }, [datos])

  const masPedido = useMemo(() => {
    if (!datos) return null
    const top = datos.productos.slice(0, 10)
    return {
      etiquetas: top.map((p) => p.nombre),
      valores: top.map((p) => p.unidades),
      detalle: (i) => money(top[i].ventas),
    }
  }, [datos])

  const opciones = useMemo(() => {
    if (!datos) return null
    const top = datos.opciones.slice(0, 10)
    return { etiquetas: top.map((o) => o.nombre), valores: top.map((o) => o.veces) }
  }, [datos])

  const porHora = useMemo(() => {
    if (!datos) return null
    return {
      etiquetas: datos.porHora.map((h) => `${h.hora} h`),
      valores: datos.porHora.map((h) => h.pedidos),
    }
  }, [datos])

  if (!datos) return error ? <Alerta error={error} /> : null

  const t = datos.totales
  const sinVentas = datos.porDia.every((d) => d.pedidos === 0)

  return (
    <section className="ad-stats">
      <dl className="ad-resumen">
        <div>
          <dt>Vendido hoy</dt>
          <dd>{money(t.hoy.ventas)}</dd>
          <p className="ad-resumen__sub">
            {pedidos(t.hoy.pedidos)}
            {t.canceladosHoy > 0 && ` · ${t.canceladosHoy} cancelado${t.canceladosHoy === 1 ? '' : 's'}`}
          </p>
        </div>
        <div>
          <dt>Este mes</dt>
          <dd>{money(t.mes.ventas)}</dd>
          <p className="ad-resumen__sub">{pedidos(t.mes.pedidos)}</p>
        </div>
        <div>
          <dt>Total de ventas</dt>
          <dd>{money(t.total.ventas)}</dd>
          <p className="ad-resumen__sub">desde el primer pedido</p>
        </div>
        <div>
          <dt>Pedidos</dt>
          <dd>{t.total.pedidos}</dd>
          <p className="ad-resumen__sub">en total</p>
        </div>
      </dl>
      <p className="ad-stats__nota">
        Cuenta los pedidos confirmados, en marcha o entregados. No suma cancelados ni pagos sin
        acreditar.
      </p>

      <div className="ad-stats__rango" role="group" aria-label="Período de los gráficos">
        {RANGOS.map((r) => (
          <button
            key={r.dias}
            type="button"
            className="ad-chip-btn"
            aria-pressed={dias === r.dias}
            onClick={() => setDias(r.dias)}
          >
            {r.texto}
          </button>
        ))}
      </div>

      {sinVentas ? (
        <p className="ad-stats__vacio">Todavía no hay ventas en este período.</p>
      ) : (
        <div className="ad-graficos">
          <Tarjeta
            titulo="Ventas por día"
            ancho
            filas={datos.porDia.map((d) => [diaCorto(d.dia), money(d.ventas), d.pedidos])}
            columnas={['Día', 'Vendido', 'Pedidos']}
          >
            <Grafico titulo="Ventas por día" {...ventasDia} formato={plataCorta} />
          </Tarjeta>

          <Tarjeta
            titulo="Lo más pedido"
            filas={datos.productos.map((p) => [p.nombre, p.unidades, money(p.ventas)])}
            columnas={['Producto', 'Unidades', 'Vendido']}
          >
            <Grafico
              titulo="Lo más pedido"
              {...masPedido}
              formato={unidades}
              eje={entero}
              horizontal
              alto={Math.max(160, masPedido.valores.length * 34)}
            />
          </Tarjeta>

          {opciones.valores.length > 0 && (
            <Tarjeta
              titulo="Salsas y opciones más elegidas"
              filas={datos.opciones.map((o) => [o.nombre, o.veces])}
              columnas={['Opción', 'Veces']}
            >
              <Grafico
                titulo="Salsas y opciones más elegidas"
                {...opciones}
                formato={veces}
                eje={entero}
                horizontal
                alto={Math.max(160, opciones.valores.length * 34)}
              />
            </Tarjeta>
          )}

          <Tarjeta
            titulo="A qué hora piden"
            ancho
            filas={datos.porHora.filter((h) => h.pedidos > 0).map((h) => [`${h.hora} h`, h.pedidos])}
            columnas={['Hora', 'Pedidos']}
          >
            <Grafico titulo="A qué hora piden" {...porHora} formato={entero} alto={180} />
          </Tarjeta>
        </div>
      )}
    </section>
  )
}

function Tarjeta({ titulo, ancho = false, filas, columnas, children }) {
  return (
    <figure className={'ad-grafico' + (ancho ? ' is-ancho' : '')}>
      <figcaption className="ad-grafico__titulo">{titulo}</figcaption>
      {children}
      <details className="ad-grafico__tabla">
        <summary>Ver en tabla</summary>
        <table>
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                {f.map((celda, j) => (
                  <td key={j}>{celda}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
