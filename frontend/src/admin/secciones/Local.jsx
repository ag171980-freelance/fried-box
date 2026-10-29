import { useState } from 'react'
import { LAYOUTS, THEMES } from '../../store/PrefsProvider.jsx'
import * as api from '../api.js'
import { Alerta, Area, Interruptor, Numero, Texto } from '../Campos.jsx'
import { useAccion, usePanel } from '../PanelProvider.jsx'

/**
 * La configuración del local.
 *
 * Tres bloques: cómo se entrega (envío, retiro, demoras, mínimo), los
 * datos de contacto, y cómo se ve la carta. El estilo y la paleta salen
 * del mismo catálogo que usa la app del cliente (LAYOUTS y THEMES), así
 * que lo que se elige acá es exactamente lo que el cliente va a ver.
 */
export default function Local() {
  const { datos } = usePanel()
  const { correr, ocupado, error } = useAccion()
  const [f, setF] = useState(datos.settings)
  const [guardado, setGuardado] = useState(false)

  const set = (k) => (v) => {
    setF((x) => ({ ...x, [k]: v }))
    setGuardado(false)
  }

  async function guardar(e) {
    e.preventDefault()
    const res = await correr(() =>
      api.guardarSettings({
        ...f,
        deliveryFee: Number(f.deliveryFee) || 0,
        minOrder: Number(f.minOrder) || 0,
        etaDeliveryMin: Number(f.etaDeliveryMin) || 0,
        etaDeliveryMax: Number(f.etaDeliveryMax) || 0,
        etaPickupMin: Number(f.etaPickupMin) || 0,
        etaPickupMax: Number(f.etaPickupMax) || 0,
      }),
    )

    if (res) {
      setF(res.settings)
      setGuardado(true)
    }
  }

  return (
    <form onSubmit={guardar}>
      <div className="ad-cabecera">
        <h1>Local</h1>
        <button type="submit" className="ad-btn ad-btn--primario" disabled={ocupado}>
          {ocupado ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <Alerta error={error} />
      {guardado && <Alerta error="Listo, los cambios ya se ven en la carta." tono="ok" />}

      <section className="ad-bloque">
        <h2 className="ad-bloque__titulo">Identidad</h2>
        <Texto etiqueta="Nombre del local" valor={f.name} alCambiar={set('name')} required maxLength={120} />
        <Texto
          etiqueta="Frase"
          ayuda="La línea corta que acompaña al nombre."
          valor={f.tagline}
          alCambiar={set('tagline')}
          maxLength={200}
        />
      </section>

      <section className="ad-bloque">
        <h2 className="ad-bloque__titulo">Entrega</h2>

        <Interruptor
          etiqueta="Hago envíos a domicilio"
          valor={f.acceptsDelivery}
          alCambiar={set('acceptsDelivery')}
        />
        <Interruptor
          etiqueta="Se puede retirar por el local"
          valor={f.acceptsPickup}
          alCambiar={set('acceptsPickup')}
        />

        <div className="ad-fila-campos">
          <Numero
            etiqueta="Costo del envío"
            valor={f.deliveryFee}
            alCambiar={set('deliveryFee')}
            min="0"
            step="100"
            sufijo="$"
          />
          <Numero
            etiqueta="Compra mínima para envío"
            ayuda="Debajo de este monto no se puede pedir a domicilio."
            valor={f.minOrder}
            alCambiar={set('minOrder')}
            min="0"
            step="100"
            sufijo="$"
          />
        </div>

        <div className="ad-fila-campos">
          <Numero
            etiqueta="Demora de envío, desde"
            valor={f.etaDeliveryMin}
            alCambiar={set('etaDeliveryMin')}
            min="0"
            sufijo="min"
          />
          <Numero
            etiqueta="Hasta"
            valor={f.etaDeliveryMax}
            alCambiar={set('etaDeliveryMax')}
            min="0"
            sufijo="min"
          />
        </div>

        <div className="ad-fila-campos">
          <Numero
            etiqueta="Demora de retiro, desde"
            valor={f.etaPickupMin}
            alCambiar={set('etaPickupMin')}
            min="0"
            sufijo="min"
          />
          <Numero
            etiqueta="Hasta"
            valor={f.etaPickupMax}
            alCambiar={set('etaPickupMax')}
            min="0"
            sufijo="min"
          />
        </div>
      </section>

      <section className="ad-bloque">
        <h2 className="ad-bloque__titulo">Dónde y cuándo</h2>

        <Texto
          etiqueta="Dirección"
          ayuda="Es la que se le muestra al cliente que elige retirar por el local."
          valor={f.address}
          alCambiar={set('address')}
          maxLength={200}
        />

        <div className="ad-fila-campos">
          <Texto etiqueta="Teléfono" valor={f.phone} alCambiar={set('phone')} maxLength={40} />
          <Texto etiqueta="WhatsApp" valor={f.whatsapp} alCambiar={set('whatsapp')} maxLength={40} />
        </div>

        <Texto
          etiqueta="Horarios"
          ayuda="Texto libre, como «Todos los días de 11:30 a 00:00»."
          valor={f.hoursText}
          alCambiar={set('hoursText')}
          maxLength={160}
        />
      </section>

      <section className="ad-bloque">
        <h2 className="ad-bloque__titulo">Mientras está cerrado</h2>

        <Area
          etiqueta="Qué lee el cliente"
          ayuda="Aparece sobre la carta cuando el local está cerrado. El interruptor de abrir y cerrar está arriba, en la barra."
          valor={f.closedMessage}
          alCambiar={set('closedMessage')}
          maxLength={160}
        />
      </section>

      <section className="ad-bloque">
        <h2 className="ad-bloque__titulo">Cómo se ve la carta</h2>

        <div className="ad-campo">
          <span className="ad-campo__label">Estilo</span>
          <div className="ad-opciones">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={'ad-opcion' + (f.layout === l.id ? ' is-elegida' : '')}
                onClick={() => set('layout')(l.id)}
                aria-pressed={f.layout === l.id}
              >
                <span className="ad-opcion__nombre">{l.name}</span>
                <span className="ad-opcion__blurb">{l.blurb}</span>
                <span className="ad-opcion__para">{l.bestFor}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ad-campo">
          <span className="ad-campo__label">Paleta</span>
          <div className="ad-paletas">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={'ad-paleta' + (f.theme === t.id ? ' is-elegida' : '')}
                onClick={() => set('theme')(t.id)}
                aria-pressed={f.theme === t.id}
                title={t.blurb}
              >
                <span className="ad-paleta__muestras" aria-hidden="true">
                  {t.swatch.map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
                <span className="ad-paleta__nombre">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="ad-pie-form">
        <button type="submit" className="ad-btn ad-btn--primario" disabled={ocupado}>
          {ocupado ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}
