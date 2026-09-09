import { describe, expect, it } from 'vitest'
import { bounds, chart, type Box } from './chart.ts'
import type { Point } from './health.ts'

const box: Box = { width: 100, height: 100, pad: { top: 0, right: 0, bottom: 0, left: 0 } }

function point(date: string, value: number): Point {
  return { date, value }
}

describe('bounds', () => {
  it('оставляет поле в десятую долю размаха', () => {
    // Без поля вес, гулявший между 74.8 и 75.2, нарисовался бы кривой
    // на весь экран: двести грамм выглядели бы как драма.
    expect(bounds([70, 80])).toEqual({ low: 69, high: 81 })
  })

  it('плоский ряд получает ±1, иначе делить пришлось бы на ноль', () => {
    expect(bounds([75, 75])).toEqual({ low: 74, high: 76 })
  })

  it('пустой ряд не роняет расчёт', () => {
    expect(bounds([])).toEqual({ low: 0, high: 1 })
  })
})

describe('chart', () => {
  it('раскладывает по календарю, а не по номеру точки', () => {
    // Три взвешивания в январе и одно в июне — это три точки слева
    // и одна справа. По номерам они встали бы через равные промежутки,
    // и кривая соврала бы про скорость.
    const result = chart(
      [point('2026-01-01', 80), point('2026-01-03', 79), point('2026-07-01', 75)],
      box,
    )
    const xs = result?.dots.map((dot) => dot.x) ?? []
    expect(xs[0]).toBe(0)
    expect(xs[2]).toBe(100)
    expect(xs[1]).toBeLessThan(5)
  })

  it('большее значение выше: ось Y в SVG растёт вниз, вес на графике вверх', () => {
    const result = chart([point('2026-01-01', 70), point('2026-01-02', 80)], box)
    const [low, high] = result?.dots ?? []
    expect(high && low && high.y < low.y).toBe(true)
  })

  it('крайние значения не прижаты к краям коробки', () => {
    const result = chart([point('2026-01-01', 70), point('2026-01-02', 80)], box)
    for (const dot of result?.dots ?? []) {
      expect(dot.y).toBeGreaterThan(0)
      expect(dot.y).toBeLessThan(100)
    }
  })

  it('одна точка встаёт посередине — наклон ей взять неоткуда', () => {
    const result = chart([point('2026-01-01', 75)], box)
    expect(result?.dots[0]?.x).toBe(50)
  })

  it('несколько измерений в один день не делят на ноль', () => {
    const result = chart([point('2026-01-01', 75), point('2026-01-01', 76)], box)
    expect(result?.dots.every((dot) => Number.isFinite(dot.x) && Number.isFinite(dot.y))).toBe(true)
  })

  it('поля отодвигают кривую от рамки', () => {
    const padded = chart([point('2026-01-01', 70), point('2026-01-02', 80)], {
      width: 100,
      height: 100,
      pad: { top: 10, right: 10, bottom: 20, left: 30 },
    })
    expect(padded?.dots[0]?.x).toBe(30)
    expect(padded?.dots[1]?.x).toBe(90)
    for (const dot of padded?.dots ?? []) {
      expect(dot.y).toBeGreaterThanOrEqual(10)
      expect(dot.y).toBeLessThanOrEqual(80)
    }
  })

  it('путь начинается с M и дальше идёт L на каждую точку', () => {
    const result = chart(
      [point('2026-01-01', 70), point('2026-01-02', 80), point('2026-01-03', 75)],
      box,
    )
    expect(result?.path.startsWith('M')).toBe(true)
    expect(result?.path.match(/L/g)).toHaveLength(2)
  })

  it('пустой ряд рисовать нечем', () => {
    expect(chart([], box)).toBeNull()
  })
})
