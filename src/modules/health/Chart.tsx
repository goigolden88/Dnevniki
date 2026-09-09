import { formatDate } from '../../core/dates.ts'
import { chart, type Box } from './chart.ts'
import type { Series } from './health.ts'

/**
 * График ряда измерений. Своё на SVG (Р-40).
 *
 * Здесь только рисование: вся арифметика в `chart.ts` и покрыта тестами.
 * Размеры заданы в системе координат `viewBox`, а не в пикселях, —
 * картинка тянется по ширине экрана сама, без замеров и обработчиков.
 */
const BOX: Box = {
  width: 320,
  height: 120,
  // Слева место под подписи значений, снизу — под даты.
  pad: { top: 8, right: 8, bottom: 18, left: 34 },
}

export function Chart({ series }: { series: Series }) {
  const drawing = chart(series.points, BOX)
  if (!drawing) return null

  const { dots, path, low, high, box } = drawing
  const last = dots.at(-1)

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${box.width} ${box.height}`}
      role="img"
      aria-label={`График: ${series.points.length} измерений, от ${series.min} до ${series.max}`}
    >
      {/* Рамка снизу и слева: две линии вместо сетки — на ста двадцати
          пикселях высоты сетка превращается в шум. */}
      <line
        x1={box.pad.left}
        y1={box.height - box.pad.bottom}
        x2={box.width - box.pad.right}
        y2={box.height - box.pad.bottom}
        className="chart__axis"
      />

      <text x="0" y={box.pad.top + 8} className="chart__label">
        {round(high)}
      </text>
      <text x="0" y={box.height - box.pad.bottom} className="chart__label">
        {round(low)}
      </text>

      <path d={path} className="chart__line" />

      {dots.map((dot) => (
        <circle key={dot.point.date} cx={dot.x} cy={dot.y} r="2.5" className="chart__dot" />
      ))}

      {last && <circle cx={last.x} cy={last.y} r="4" className="chart__dot chart__dot--last" />}

      <text x={box.pad.left} y={box.height - 4} className="chart__label">
        {formatDate(series.first.date).slice(0, 5)}
      </text>
      <text x={box.width - box.pad.right} y={box.height - 4} textAnchor="end" className="chart__label">
        {formatDate(series.last.date).slice(0, 5)}
      </text>
    </svg>
  )
}

/** Подпись оси: доли грамма на ней не нужны. */
function round(value: number): string {
  return String(Math.round(value * 10) / 10)
}
