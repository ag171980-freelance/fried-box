import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../../components/ui/Icon.jsx'
import { clock, money } from '../../lib/format.js'
import * as api from '../api.js'
import { Alerta, Vacio } from '../Campos.jsx'
import ConfirmarCancelacion from '../Confirmar.jsx'
import Estadisticas from './Estadisticas.jsx'

/** Cada cuánto se miran los pedidos en curso. */
const CADA_MS = 15000

const ESTADOS = {
  pendiente_de_pago: 'Esperando pago',
  confirmado: 'Nuevo',
  cocina: 'En la cocina',
  camino: 'En camino',
  listo: 'Listo para retirar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  pago_rechazado: 'Pago rechazado',
}

/** El texto del botón según a dónde lleva. */
const ACCION = {
  confirmado: 'Confirmado',
  cocina: 'Pasar a cocina',
  camino: 'Salió',
  listo: 'Listo para retirar',
  entregado: 'Entregado',
}

/** Las columnas de «En curso», en el orden en que se trabaja. */
const ETAPAS = [
  { id: 'nuevos', titulo: 'Nuevos', estados: ['confirmado'] },
  { id: 'cocina', titulo: 'En la cocina', estados: ['cocina'] },
  { id: 'salida', titulo: 'Para entregar', estados: ['camino', 'listo'] },
  { id: 'pago', titulo: 'Esperando pago', estados: ['pendiente_de_pago'] },
]

const MEDIO = { mercadopago: 'Mercado Pago', efectivo: 'Efectivo', transferencia: 'Transferencia' }

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function haceCuanto(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return `hace ${h} h ${min % 60} min`
}

function pagoTexto(o) {
  if (o.paymentMethod === 'efectivo') {
    if (o.paymentStatus === 'aprobado') return 'Efectivo · cobrado'
    return o.changeFor ? `Efectivo · paga con ${money(o.changeFor)}` : 'Efectivo · cobrar al entregar'
  }
  const estado = { aprobado: 'pagado', pendiente: 'sin pagar', rechazado: 'rechazado' }[o.paymentStatus]
  return `${MEDIO[o.paymentMethod] || o.paymentMethod}${estado ? ` · ${estado}` : ''}`
}

/**
 * Un aviso corto con WebAudio cuando entra un pedido. El navegador sólo
 * deja sonar después de que la persona tocó algo en la página, que en el
 * panel pasa siempre (aunque sea el login).
 */
function sonar() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[880, 1175].forEach((hz, i) => {
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.frequency.value = hz
      vol.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18)
      vol.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02)
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16)
      osc.connect(vol).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.18)
      osc.stop(ctx.currentTime + i * 0.18 + 0.2)
    })
  } catch {
    /* Sin audio no pasa nada: el pedido igual aparece resaltado. */
  }
}

const SONIDO = 'foodix.admin.sonido'
const leerSonido = () => {
  try {
    return localStorage.getItem(SONIDO) !== 'no'
  } catch {
    return true
  }
}

/**
 * Los pedidos: lo que hay que preparar ahora y lo que ya pasó.
 *
 * «En curso» se actualiza solo cada pocos segundos y avisa con un sonido
 * cuando entra uno nuevo. «Historial» es por día, con lo vendido arriba.
 */
export default function Pedidos() {
  // La pestaña queda en la URL: al recargar no se vuelve a «En curso».
  const [vista, setVistaEstado] = useState(() =>
    new URLSearchParams(window.location.search).get('vista') === 'historial' ? 'historial' : 'curso',
  )
  const setVista = (v) => {
    setVistaEstado(v)
    const url = new URL(window.location.href)
    if (v === 'historial') url.searchParams.set('vista', 'historial')
    else url.searchParams.delete('vista')
    window.history.replaceState(null, '', url)
  }
  const [abierto, setAbierto] = useState(null)
  const [enCurso, setEnCurso] = useState(null)
  // Sube cada vez que el detalle mueve un pedido, para que la lista de
  // atrás se recargue en el momento y no al próximo turno.
  const [cambios, setCambios] = useState(0)

  return (
    <>
      <div className="ad-cabecera">
        <h1>Pedidos</h1>
      </div>

      <div className="ad-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'curso'}
          className="ad-tab"
          onClick={() => setVista('curso')}
        >
          En curso
          {enCurso > 0 && <span className="ad-tab__cuenta">{enCurso}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'historial'}
          className="ad-tab"
          onClick={() => setVista('historial')}
        >
          Historial
        </button>
      </div>

      {vista === 'curso' ? (
        <EnCurso alAbrir={setAbierto} alContar={setEnCurso} cambios={cambios} />
      ) : (
        <Historial alAbrir={setAbierto} alContar={setEnCurso} cambios={cambios} />
      )}

      {abierto && (
        <Detalle id={abierto} alCerrar={() => setAbierto(null)} alCambiar={() => setCambios((n) => n + 1)} />
      )}
    </>
  )
}

/* --- En curso ------------------------------------------------------ */

function EnCurso({ alAbrir, alContar, cambios }) {
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState(null)
  const [nuevos, setNuevos] = useState(() => new Set())
  const [sonido, setSonido] = useState(leerSonido)
  const [aCancelar, setACancelar] = useState(null)
  const [cancelando, setCancelando] = useState(false)
  const [errorCancelar, setErrorCancelar] = useState(null)
  const vistos = useRef(null)

  const cargar = useCallback(async () => {
    try {
      const res = await api.listarPedidos({ vista: 'curso' })
      setError(null)
      setPedidos(res.orders)
      alContar(res.enCurso)

      // La primera carga no avisa: lo que ya estaba no es nuevo.
      const ids = res.orders.filter((o) => o.status === 'confirmado').map((o) => o.id)
      if (vistos.current) {
        const llegaron = ids.filter((id) => !vistos.current.has(id))
        if (llegaron.length) {
          if (leerSonido()) sonar()
          setNuevos((prev) => new Set([...prev, ...llegaron]))
        }
      }
      vistos.current = new Set([...(vistos.current || []), ...ids])
    } catch (e) {
      setError(e)
    }
  }, [alContar])

  useEffect(() => {
    cargar()
    const timer = setInterval(cargar, CADA_MS)
    const alVolver = () => document.visibilityState === 'visible' && cargar()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [cargar])

  useEffect(() => {
    if (cambios) cargar()
  }, [cambios, cargar])

  /* El título de la pestaña cuenta los nuevos: se ve aunque el panel
     esté detrás de otra ventana. */
  const sinVer = pedidos ? pedidos.filter((o) => nuevos.has(o.id) && o.status === 'confirmado').length : 0
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '')
    document.title = sinVer ? `(${sinVer}) ${base}` : base
    return () => {
      document.title = document.title.replace(/^\(\d+\) /, '')
    }
  }, [sinVer])

  const aplicar = async (o, status, note = '') => {
    await api.cambiarEstadoPedido(o.id, status, note)
    setNuevos((prev) => {
      const next = new Set(prev)
      next.delete(o.id)
      return next
    })
    cargar()
  }

  // Cancelar no se hace de una: pide el motivo, que lo lee el cliente.
  const mover = async (o, status) => {
    if (status === 'cancelado') {
      setACancelar(o)
      return
    }
    try {
      await aplicar(o, status)
    } catch (e) {
      setError(e)
      cargar()
    }
  }

  const confirmarCancelacion = async (motivo) => {
    setCancelando(true)
    setErrorCancelar(null)
    try {
      await aplicar(aCancelar, 'cancelado', motivo)
      setACancelar(null)
    } catch (e) {
      setErrorCancelar(e)
    } finally {
      setCancelando(false)
    }
  }

  const alternarSonido = () => {
    const nuevo = !sonido
    setSonido(nuevo)
    try {
      localStorage.setItem(SONIDO, nuevo ? 'si' : 'no')
    } catch {
      /* Si no se puede guardar, vale para esta pestaña nada más. */
    }
    if (nuevo) sonar()
  }

  if (!pedidos) {
    return error ? <Alerta error={error} /> : <p className="ad-pedidos__cargando">Buscando pedidos...</p>
  }

  return (
    <>
      <div className="ad-pedidos__barra">
        <span className="ad-pedidos__vivo">
          <i aria-hidden="true" /> Se actualiza solo
        </span>
        <button type="button" className="ad-btn ad-btn--fantasma" onClick={alternarSonido}>
          {sonido ? 'Sonido activado' : 'Sonido apagado'}
        </button>
      </div>

      <Alerta error={error} />

      {pedidos.length === 0 ? (
        <Vacio titulo="No hay pedidos en curso" texto="Cuando entre uno, aparece acá y suena un aviso." />
      ) : (
        ETAPAS.map((etapa) => {
          const lista = pedidos
            .filter((o) => etapa.estados.includes(o.status))
            // Lo más viejo primero: es lo que hay que sacar antes.
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          if (!lista.length) return null

          return (
            <section key={etapa.id} className="ad-grupo">
              <h2 className="ad-grupo__titulo">
                {etapa.titulo}
                <span className="ad-grupo__cuenta">{lista.length}</span>
              </h2>
              <div className="ad-pedidos">
                {lista.map((o) => (
                  <Tarjeta
                    key={o.id}
                    o={o}
                    nuevo={nuevos.has(o.id)}
                    alAbrir={() => alAbrir(o.id)}
                    alMover={(status) => mover(o, status)}
                  />
                ))}
              </div>
            </section>
          )
        })
      )}

      {aCancelar && (
        <ConfirmarCancelacion
          numero={aCancelar.number}
          ocupado={cancelando}
          error={errorCancelar}
          alConfirmar={confirmarCancelacion}
          alCerrar={() => {
            setACancelar(null)
            setErrorCancelar(null)
          }}
        />
      )}
    </>
  )
}

function Tarjeta({ o, nuevo, alAbrir, alMover }) {
  const [ocupado, setOcupado] = useState(false)
  const mover = async (status) => {
    setOcupado(true)
    await alMover(status)
    setOcupado(false)
  }

  return (
    <article className={'ad-pedido' + (nuevo ? ' is-nuevo' : '')}>
      <header className="ad-pedido__top">
        <button type="button" className="ad-pedido__num" onClick={alAbrir}>
          #{o.number}
        </button>
        <span className="ad-pedido__hora" title={clock(new Date(o.createdAt))}>
          {haceCuanto(o.createdAt)}
        </span>
        <span className={'ad-pedido__modo' + (o.mode === 'delivery' ? ' is-envio' : '')}>
          <Icon name={o.mode === 'delivery' ? 'bike' : 'store'} size={14} />
          {o.mode === 'delivery' ? 'Envío' : 'Retira'}
        </span>
      </header>

      <p className="ad-pedido__cliente">{o.customer.name}</p>
      {o.mode === 'delivery' && (
        <p className="ad-pedido__dir">
          {o.customer.address}
          {o.customer.apt ? ` · ${o.customer.apt}` : ''}
        </p>
      )}

      <ul className="ad-pedido__items">
        {o.lines.map((l) => (
          <li key={l.key}>
            <b>{l.qty}×</b> {l.name}
            {l.optionsLabel && <span className="ad-pedido__ops">{l.optionsLabel}</span>}
            {l.note && <span className="ad-pedido__nota">«{l.note}»</span>}
          </li>
        ))}
      </ul>

      {o.note && <p className="ad-pedido__aviso">{o.note}</p>}

      <p className="ad-pedido__pago">
        <span>{pagoTexto(o)}</span>
        <b>{money(o.total)}</b>
      </p>

      <div className="ad-pedido__acciones">
        {o.acciones.siguiente && (
          <button
            type="button"
            className="ad-btn ad-btn--primario"
            disabled={ocupado}
            onClick={() => mover(o.acciones.siguiente)}
          >
            {ACCION[o.acciones.siguiente]}
          </button>
        )}
        <button type="button" className="ad-btn ad-btn--fantasma" onClick={alAbrir}>
          Detalle
        </button>
        {o.acciones.cancelar && (
          <button
            type="button"
            className="ad-btn ad-btn--fantasma ad-pedido__cancelar"
            disabled={ocupado}
            onClick={() => mover('cancelado')}
          >
            Cancelar
          </button>
        )}
      </div>
    </article>
  )
}

/* --- Historial ----------------------------------------------------- */

function Historial({ alAbrir, alContar, cambios }) {
  const [dia, setDia] = useState(hoy)
  const [q, setQ] = useState('')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    // Un respiro antes de buscar, para no consultar por cada tecla.
    const timer = setTimeout(async () => {
      try {
        const res = await api.listarPedidos({ vista: 'historial', dia, q })
        if (!vigente) return
        setError(null)
        setDatos(res)
        alContar(res.enCurso)
      } catch (e) {
        if (vigente) setError(e)
      }
    }, 250)
    return () => {
      vigente = false
      clearTimeout(timer)
    }
  }, [dia, q, alContar, cambios])

  return (
    <>
      <Estadisticas cambios={cambios} />

      <h2 className="ad-grupo__titulo ad-pedidos__deldia">Pedidos del día</h2>
      <div className="ad-pedidos__filtros">
        <label className="ad-campo ad-pedidos__dia">
          <span className="ad-campo__label">Día</span>
          <input type="date" value={dia} max={hoy()} onChange={(e) => setDia(e.target.value || hoy())} />
        </label>
        <label className="ad-campo ad-pedidos__buscar">
          <span className="ad-campo__label">Buscar</span>
          <input
            type="search"
            placeholder="Número, nombre o teléfono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      <Alerta error={error} />


      {!datos ? (
        !error && <p className="ad-pedidos__cargando">Buscando pedidos...</p>
      ) : datos.orders.length === 0 ? (
        <Vacio
          titulo={q ? 'Nada con esa búsqueda' : 'Ningún pedido cerrado ese día'}
          texto="Acá aparecen los entregados y los cancelados. Los que siguen en marcha están en «En curso»."
        />
      ) : (
        <ul className="ad-lista">
          {datos.orders.map((o) => (
            <li key={o.id}>
              <button type="button" className="ad-fila ad-fila--pedido" onClick={() => alAbrir(o.id)}>
                <span className="ad-fila__precio ad-mono">#{o.number}</span>
                <span className="ad-fila__texto">
                  <span className="ad-fila__nombre">{o.customer.name}</span>
                  <span className="ad-fila__desc">
                    {clock(new Date(o.createdAt))} · {o.mode === 'delivery' ? 'Envío' : 'Retiro'} ·{' '}
                    {o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}
                  </span>
                </span>
                <span className={'ad-pastilla' + (o.status === 'entregado' ? ' is-si' : ' is-no')}>
                  {ESTADOS[o.status]}
                </span>
                <span className="ad-fila__precio">{money(o.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* --- Detalle ------------------------------------------------------- */

function Detalle({ id, alCerrar, alCambiar }) {
  const [o, setO] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [errorCancelar, setErrorCancelar] = useState(null)

  useEffect(() => {
    let vigente = true
    api
      .verPedido(id)
      .then((res) => vigente && setO(res.order))
      .catch((e) => vigente && setError(e))
    return () => {
      vigente = false
    }
  }, [id])

  useEffect(() => {
    // Con la confirmación abierta el Escape es de ella, no del panel:
    // si no, una sola tecla cerraría los dos.
    const onKey = (e) => e.key === 'Escape' && !confirmando && alCerrar()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [alCerrar, confirmando])

  // Cancelar pasa por la confirmación, que es la que pide el motivo.
  const mover = async (status) => {
    if (status === 'cancelado') {
      setConfirmando(true)
      return
    }
    setOcupado(true)
    setError(null)
    try {
      const res = await api.cambiarEstadoPedido(id, status, '')
      setO(res.order)
      alCambiar()
    } catch (e) {
      setError(e)
    } finally {
      setOcupado(false)
    }
  }

  // El error de cancelar va aparte: se muestra adentro de la
  // confirmación, no en el cuerpo del panel que quedó atrás.
  const confirmarCancelacion = async (motivo) => {
    setOcupado(true)
    setErrorCancelar(null)
    try {
      const res = await api.cambiarEstadoPedido(id, 'cancelado', motivo)
      setO(res.order)
      alCambiar()
      setConfirmando(false)
    } catch (e) {
      setErrorCancelar(e)
    } finally {
      setOcupado(false)
    }
  }

  const tel = o?.customer.phone.replace(/\D/g, '')
  // Los celulares argentinos en WhatsApp van con 549 adelante.
  const wa = tel && (tel.startsWith('54') ? tel : `549${tel.replace(/^0/, '')}`)

  return (
    <div className="ad-panel-fondo" role="presentation" onClick={alCerrar}>
      <div className="ad-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="ad-panel__top">
          <h2>{o ? `Pedido #${o.number}` : 'Pedido'}</h2>
          {o && <span className="ad-pastilla">{ESTADOS[o.status]}</span>}
          <button type="button" className="ad-iconbtn" onClick={alCerrar} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="ad-panel__cuerpo">
          <Alerta error={error} />
          {!o ? (
            !error && <p className="ad-pedidos__cargando">Buscando el pedido...</p>
          ) : (
            <>
              <section className="ad-bloque">
                <h3 className="ad-bloque__titulo">Cliente</h3>
                <p className="ad-det__linea">
                  <b>{o.customer.name}</b>
                </p>
                <p className="ad-det__linea">
                  <a href={`tel:${tel}`}>{o.customer.phone}</a>
                  {' · '}
                  <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                </p>
                {o.customer.email && <p className="ad-det__linea">{o.customer.email}</p>}
                <p className="ad-det__linea">
                  {o.mode === 'delivery'
                    ? `Envío a ${o.customer.address}${o.customer.apt ? ` · ${o.customer.apt}` : ''}`
                    : 'Retira en el local'}
                </p>
                {o.note && <p className="ad-pedido__aviso">{o.note}</p>}
              </section>

              <section className="ad-bloque">
                <h3 className="ad-bloque__titulo">Qué pidió</h3>
                <ul className="ad-det__items">
                  {o.lines.map((l) => (
                    <li key={l.key}>
                      <span>
                        <b>{l.qty}×</b> {l.name}
                        {l.optionsLabel && <span className="ad-pedido__ops">{l.optionsLabel}</span>}
                        {l.note && <span className="ad-pedido__nota">«{l.note}»</span>}
                      </span>
                      <span className="ad-mono">{money(l.total)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="ad-det__sumas">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{money(o.subtotal)}</dd>
                  </div>
                  {o.promoDiscount > 0 && (
                    <div>
                      <dt>Promo {o.promoLabel ? `(${o.promoLabel})` : ''}</dt>
                      <dd>− {money(o.promoDiscount)}</dd>
                    </div>
                  )}
                  {o.discount > 0 && (
                    <div>
                      <dt>Cupón {o.coupon ? `(${o.coupon.code})` : ''}</dt>
                      <dd>− {money(o.discount)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{o.mode === 'delivery' ? 'Envío' : 'Retiro'}</dt>
                    <dd>{o.shipping > 0 ? money(o.shipping) : 'sin cargo'}</dd>
                  </div>
                  <div className="is-total">
                    <dt>Total</dt>
                    <dd>{money(o.total)}</dd>
                  </div>
                </dl>
                <p className="ad-det__linea">{pagoTexto(o)}</p>
              </section>

              <section className="ad-bloque">
                <h3 className="ad-bloque__titulo">Historial</h3>
                <ol className="ad-det__eventos">
                  {o.events.map((e, i) => (
                    <li key={i}>
                      <span className="ad-mono">{clock(new Date(e.at))}</span>
                      <span>
                        {e.note || ESTADOS[e.status] || e.status}
                        <span className="ad-det__fuente">
                          {{ cliente: 'cliente', local: 'local', pasarela: 'pago', sistema: 'sistema' }[e.source]}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="ad-det__linea">
                  <a href={`/pedido/${o.id}`} target="_blank" rel="noreferrer">
                    Ver lo que ve el cliente
                  </a>
                </p>
              </section>
            </>
          )}
        </div>

        {o && (o.acciones.siguiente || o.acciones.anterior || o.acciones.cancelar) && (
          <footer className="ad-panel__pie">
            {o.acciones.cancelar && (
              <button
                type="button"
                className="ad-btn ad-btn--peligro"
                disabled={ocupado}
                onClick={() => mover('cancelado')}
              >
                Cancelar
              </button>
            )}
            <span className="ad-panel__sep" />
            {o.acciones.anterior && (
              <button
                type="button"
                className="ad-btn ad-btn--fantasma"
                disabled={ocupado}
                onClick={() => mover(o.acciones.anterior)}
                title="Para deshacer un toque de más"
              >
                Volver a «{ESTADOS[o.acciones.anterior] === 'Nuevo' ? 'Confirmado' : ESTADOS[o.acciones.anterior]}»
              </button>
            )}
            {o.acciones.siguiente && (
              <button
                type="button"
                className="ad-btn ad-btn--primario"
                disabled={ocupado}
                onClick={() => mover(o.acciones.siguiente)}
              >
                {ACCION[o.acciones.siguiente]}
              </button>
            )}
          </footer>
        )}

        {confirmando && o && (
          <ConfirmarCancelacion
            numero={o.number}
            ocupado={ocupado}
            error={errorCancelar}
            alConfirmar={confirmarCancelacion}
            alCerrar={() => {
              setConfirmando(false)
              setErrorCancelar(null)
            }}
          />
        )}
      </div>
    </div>
  )
}
