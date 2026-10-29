import { useEffect, useRef } from 'react'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
} from 'chart.js'

// Sólo lo que se usa: el resto de Chart.js no entra al bundle.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

/** Un token del tema activo, para que el gráfico siga la paleta del local. */
function token(nombre, porDefecto) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim()
  return v || porDefecto
}

/**
 * Un gráfico de barras de una sola serie.
 *
 * Una serie no lleva leyenda: el título de la tarjeta dice qué es. Las
 * barras van finas, con la punta redondeada y la base recta, y la grilla
 * apenas se ve. El color sale de --chart-mark (validado contra el fondo
 * claro y el oscuro); si el tema no lo define, usa el de la marca.
 *
 * @param {string[]} etiquetas
 * @param {number[]} valores
 * @param {(v:number) => string} formato     cómo se lee un valor en el tooltip
 * @param {(v:number) => string} [eje]       cómo se lee en el eje; por defecto, igual
 * @param {(i:number) => string} [detalle]   una línea más en el tooltip
 * @param {boolean} [horizontal]             barras acostadas, para rankings
 */
export default function Grafico({
  etiquetas,
  valores,
  formato,
  eje: formatoEje = formato,
  detalle,
  horizontal = false,
  alto = 240,
  titulo,
}) {
  const lienzo = useRef(null)

  useEffect(() => {
    const marca = token('--chart-mark', token('--brand', '#e85d10'))
    const tinta = token('--ink-2', '#5c5652')
    const linea = token('--line', '#f0dfd1')
    const fuente = token('--font-body', 'system-ui')

    const eje = { color: tinta, font: { family: fuente, size: 12 } }
    const valor = {
      beginAtZero: true,
      grid: { color: linea, drawTicks: false },
      border: { display: false },
      ticks: { ...eje, padding: 6, maxTicksLimit: 5, precision: 0, callback: (v) => formatoEje(v) },
    }
    const categoria = {
      grid: { display: false },
      border: { color: linea },
      ticks: { ...eje, autoSkip: true, maxRotation: 0 },
    }

    const grafico = new Chart(lienzo.current, {
      type: 'bar',
      data: {
        labels: etiquetas,
        datasets: [
          {
            data: valores,
            backgroundColor: marca,
            hoverBackgroundColor: marca,
            borderRadius: 4,
            // Redondeada sólo la punta: la base queda recta contra el eje.
            borderSkipped: 'start',
            maxBarThickness: 24,
            categoryPercentage: 0.8,
            barPercentage: 0.9,
          },
        ],
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        // Toda la franja de la barra responde al mouse, no sólo la barra.
        interaction: { mode: 'index', intersect: false },
        scales: horizontal ? { x: valor, y: categoria } : { x: categoria, y: valor },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: token('--ink', '#161618'),
            titleColor: token('--bg', '#ffffff'),
            bodyColor: token('--bg', '#ffffff'),
            titleFont: { family: fuente, weight: '600' },
            bodyFont: { family: fuente },
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: (ctx) => {
                const lineas = [formato(ctx.parsed[horizontal ? 'x' : 'y'])]
                if (detalle) lineas.push(detalle(ctx.dataIndex))
                return lineas
              },
            },
          },
        },
      },
    })

    return () => grafico.destroy()
  }, [etiquetas, valores, formato, formatoEje, detalle, horizontal])

  return (
    <div className="ad-grafico__lienzo" style={{ height: alto }}>
      <canvas ref={lienzo} role="img" aria-label={titulo} />
    </div>
  )
}
