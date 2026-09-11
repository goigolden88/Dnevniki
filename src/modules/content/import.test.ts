import { describe, expect, it } from 'vitest'
import { importContent } from './import.ts'
import type { ContentEntry } from '../../core/model.ts'

/** Раздел «content» импорта записей — Р-60. */

const T = '2026-09-11T10:00:00.000Z'
let counter = 0
const ctx = { newId: () => `id${++counter}`, now: T }

const existing: ContentEntry = {
  id: 'k1',
  updatedAt: T,
  type: 'anime',
  title: 'Магическая битва 3',
  start: '2026-01',
  end: null,
  status: 'done',
  score: 7,
}

describe('импорт контента — Р-60', () => {
  it('совпадение по типу, названию и началу пропускается; другое начало — новая запись', () => {
    const plan = importContent(
      [
        { type: 'anime', title: 'магическая битва 3', start: '2026-01', status: 'done' },
        { type: 'anime', title: 'Магическая битва 3', start: '2026-02', status: 'done' },
        { type: 'film', title: 'Магическая битва 3', start: '2026-01', status: 'done' },
      ],
      { content: [existing] },
      ctx,
    )
    expect(plan.skipped).toBe(1)
    expect(plan.writes.content?.map((entry) => [entry.type, entry.start])).toEqual([
      ['anime', '2026-02'],
      ['film', '2026-01'],
    ])
  })

  it('оценка округляется до десятых, вне шкалы — в отчёт', () => {
    const plan = importContent(
      [
        { type: 'film', title: 'Дюна', status: 'done', score: '8,46' },
        { type: 'film', title: 'Кошки', status: 'done', score: 0 },
      ],
      { content: [] },
      ctx,
    )
    expect(plan.writes.content?.[0]?.score).toBe(8.5)
    expect(plan.issues.map((issue) => issue.title)).toEqual(['Кошки'])
  })

  it('тип и статус — только из списка', () => {
    const plan = importContent(
      [
        { type: 'мультфильм', title: 'Шрек', status: 'done' },
        { type: 'film', title: 'Шрек', status: 'просмотрено' },
      ],
      { content: [] },
      ctx,
    )
    expect(plan.issues.map((issue) => issue.reason)).toEqual([
      'тип «мультфильм» — не из списка',
      'статус «просмотрено» — не из списка',
    ])
  })

  it('месячная дата годится (Р-25), кривая — нет; у намерения даты нет', () => {
    const plan = importContent(
      [
        { type: 'book', title: 'Солярис', start: '2026-03', status: 'done' },
        { type: 'book', title: 'Пикник', start: 'весна 2026', status: 'done' },
        { type: 'book', title: 'Улитка на склоне', status: 'planned' },
      ],
      { content: [] },
      ctx,
    )
    expect(plan.writes.content?.map((entry) => [entry.title, entry.start])).toEqual([
      ['Солярис', '2026-03'],
      ['Улитка на склоне', null],
    ])
    expect(plan.issues.map((issue) => issue.title)).toEqual(['Пикник'])
  })
})
