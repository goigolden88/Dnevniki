/**
 * Геометрия графика: точки ряда → координаты в системе SVG.
 *
 * Своё, а не библиотека (Р-40). Здесь только арифметика — ни одного тега,
 * ни одного цвета: рисование живёт в компоненте, а проверяется тестами то,
 * что может соврать, — раскладка точек по осям.
 *
 * Ось X — календарное время, а не порядковый номер точки. Взвешивался
 * трижды в январе и один раз в июне — на графике это должно выглядеть
 * как три точки слева и одна справа, иначе кривая врёт про скорость.
 */

import { daysBetween, type DateStr } from '../../core/dates.ts'
import type { Point } from './health.ts'

export type Box = {
  width: number
  height: number
  /** Поля внутри рамки: под подписи снизу и слева. */
  pad: { top: number; right: number; bottom: number; left: number }
}

export type Dot = {
  x: number
  y: number
  point: Point
}

export type Chart = {
  dots: Dot[]
  /** Готовая `d` для `<path>` — ломаная по точкам. */
  path: string
  /** Границы значений после расширения: по ним подписана ось. */
  low: number
  high: number
  box: Box
}

/**
 * Границы оси значений.
 *
 * Ряд не прижимается к краям: вес, гулявший между 74.8 и 75.2, при точной
 * подгонке нарисовался бы размашистой кривой на весь экран — двести грамм
 * выглядели бы как драма. Поле в десятую долю размаха оставляет масштаб
 * честным, а плоский ряд (все значения равны) получает ±1, иначе делить
 * пришлось бы на ноль.
 */
export function bounds(values: number[]): { low: number; high: number } {
  if (values.length === 0) return { low: 0, high: 1 }

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return { low: min - 1, high: max + 1 }

  const margin = (max - min) * 0.1
  return { low: min - margin, high: max + margin }
}

function round(value: number): number {
  // Тысячная доля пикселя в разметке — мусор, который к тому же делает
  // строку `d` длиннее самой картинки.
  return Math.round(value * 100) / 100
}

/**
 * Раскладка точек по коробке. Одна точка становится ровно посередине:
 * ей неоткуда взять наклон, и прижимать её к левому краю незачем.
 */
export function chart(points: Point[], box: Box): Chart | null {
  if (points.length === 0) return null

  const { low, high } = bounds(points.map((point) => point.value))
  const left = box.pad.left
  const right = box.width - box.pad.right
  const top = box.pad.top
  const bottom = box.height - box.pad.bottom

  const first = points[0]?.date as DateStr
  const last = points.at(-1)?.date as DateStr
  const span = daysBetween(first, last)

  const dots: Dot[] = points.map((point) => {
    const along = span === 0 ? 0.5 : daysBetween(first, point.date) / span
    const up = (point.value - low) / (high - low)
    return {
      x: round(left + along * (right - left)),
      // Ось Y в SVG растёт вниз, а вес на графике — вверх.
      y: round(bottom - up * (bottom - top)),
      point,
    }
  })

  const path = dots.map((dot, index) => `${index === 0 ? 'M' : 'L'}${dot.x} ${dot.y}`).join(' ')
  return { dots, path, low: round(low), high: round(high), box }
}
