import { describe, expect, it } from 'vitest'
import { importCycles } from './import.ts'
import type { CycleCategory, CycleEvent, CycleItem } from '../../core/model.ts'

/** Раздел «cycles» импорта записей — Р-60. */

const T = '2026-09-11T10:00:00.000Z'
let counter = 0
const ctx = { newId: () => `id${++counter}`, now: T }

const cat = (name: string, order: number): CycleCategory => ({
  id: `cat:${name.toLowerCase()}`,
  updatedAt: T,
  name,
  order,
})
const item = (id: string, name: string, category: string): CycleItem => ({
  id,
  updatedAt: T,
  name,
  cat: category,
  intervalDays: null,
})
const mark = (id: string, itemId: string, date: string): CycleEvent => ({ id, updatedAt: T, itemId, date })

const base = () => ({
  categories: [cat('Гигиена', 0), cat('Дом', 1)],
  items: [item('cut', 'Стрижка', 'Гигиена')],
  cycleEvents: [mark('m1', 'cut', '2026-01-24')],
})

describe('импорт циклов — Р-60', () => {
  it('знакомая позиция не перезаписывается — дописываются только новые даты', () => {
    const plan = importCycles(
      [{ name: 'стрижка', cat: 'Другое', marks: ['2026-01-24', { date: '2026-03-02', price: '700' }] }],
      base(),
      ctx,
    )
    expect(plan.writes.items).toEqual([])
    expect(plan.writes.categories).toEqual([])
    expect(plan.writes.cycleEvents?.map((event) => [event.itemId, event.date, event.price])).toEqual([
      ['cut', '2026-03-02', 700],
    ])
    expect(plan.skipped).toBe(2)
  })

  it('новая позиция берёт написание знакомой категории, незнакомую заводит в конец', () => {
    const plan = importCycles(
      [
        { name: 'Фильтр', cat: 'дом' },
        { name: 'Масло', cat: 'Авто', intervalDays: 300 },
      ],
      base(),
      ctx,
    )
    expect(plan.writes.items?.map((each) => [each.name, each.cat, each.intervalDays])).toEqual([
      ['Фильтр', 'Дом', null],
      ['Масло', 'Авто', 300],
    ])
    expect(plan.writes.categories?.map((each) => [each.name, each.order])).toEqual([['Авто', 2]])
  })

  it('кривое — в отчёт с причиной, остальное проходит', () => {
    const plan = importCycles(
      [
        { cat: 'Дом' },
        { name: 'Фильтр' },
        {
          name: 'Масло',
          cat: 'Авто',
          marks: [{ date: '03.03.2026' }, { date: '2026-03-04', price: -5 }, { date: '2026-03-05' }],
        },
      ],
      base(),
      ctx,
    )
    expect(plan.issues.map((issue) => `${issue.title}: ${issue.reason}`)).toEqual([
      'запись 1: нет названия ("name")',
      'Фильтр: нет категории ("cat")',
      'Масло: дата «03.03.2026» — не ГГГГ-ММ-ДД',
      'Масло: цена «-5» у 2026-03-04 — не число',
    ])
    expect(plan.writes.cycleEvents?.map((event) => event.date)).toEqual(['2026-03-05'])
  })

  it('одна и та же позиция дважды в файле не заводится дважды', () => {
    const plan = importCycles(
      [
        { name: 'Масло', cat: 'Авто', marks: ['2026-01-01'] },
        { name: 'масло', cat: 'Авто', marks: ['2026-01-01', '2026-06-01'] },
      ],
      base(),
      ctx,
    )
    expect(plan.writes.items).toHaveLength(1)
    expect(plan.writes.cycleEvents?.map((event) => event.date)).toEqual(['2026-01-01', '2026-06-01'])
  })

  it('раздел не список — в отчёт целиком', () => {
    expect(importCycles({ name: 'Стрижка' }, base(), ctx).issues[0]?.reason).toContain('не список')
  })
})
