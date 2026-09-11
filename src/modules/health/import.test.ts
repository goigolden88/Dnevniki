import { describe, expect, it } from 'vitest'
import { importEpisodes, importMeasures, importSessions } from './import.ts'
import type { Tag } from '../../core/model.ts'

/** Разделы здоровья в импорте записей — Р-60. */

const T = '2026-09-11T10:00:00.000Z'
let counter = 0
const ctx = { newId: () => `id${++counter}`, now: T }

const tag = (id: string, name: string, scope: Tag['scope']): Tag => ({ id, updatedAt: T, name, scope })

describe('импорт эпизодов — Р-60', () => {
  it('симптомы словами становятся тегами: знакомый по названию, новый — один на раздел', () => {
    const plan = importEpisodes(
      [
        { title: 'ОРВИ', start: '2026-02-10', end: '2026-02-17', symptoms: ['Насморк', 'кашель'] },
        { title: 'Ангина', start: '2026-03-01', end: '2026-03-06', symptoms: ['кашель', 'горло'] },
      ],
      { episodes: [], tags: [tag('runny', 'насморк', 'symptom'), tag('run', 'кашель', 'activity')] },
      ctx,
    )
    const created = plan.writes.tags ?? []
    expect(created.map((each) => [each.name, each.scope])).toEqual([
      ['кашель', 'symptom'],
      ['горло', 'symptom'],
    ])
    const cough = created[0]?.id
    expect(plan.writes.episodes?.map((each) => each.symptoms)).toEqual([
      ['runny', cough],
      [cough, created[1]?.id],
    ])
  })

  it('без конца — открытый эпизод; конец раньше начала — в отчёт', () => {
    const plan = importEpisodes(
      [
        { title: 'Поясница', start: '2026-09-01' },
        { title: 'Зуб', start: '2026-05-10', end: '2026-05-01' },
      ],
      { episodes: [], tags: [] },
      ctx,
    )
    expect(plan.writes.episodes?.map((each) => [each.title, each.end, each.source])).toEqual([
      ['Поясница', null, 'self'],
    ])
    expect(plan.issues.map((issue) => issue.title)).toEqual(['Зуб'])
  })
})

describe('импорт измерений — Р-60', () => {
  it('«вес» — встроенный вес; повтор метрики и даты пропускается', () => {
    const plan = importMeasures(
      [
        { metric: 'Вес', date: '2026-03-01', value: '74,5' },
        { metric: 'weight', date: '2026-03-01', value: 75 },
        { metric: 'bp', date: '2026-03-01', value: 120, value2: 80 },
        { metric: 'пульс', date: '2026-03-01', value: 'много' },
      ],
      { measures: [] },
      ctx,
    )
    expect(plan.writes.measures?.map((each) => [each.metric, each.value, each.value2])).toEqual([
      ['weight', 74.5, undefined],
      ['bp', 120, 80],
    ])
    expect(plan.skipped).toBe(1)
    expect(plan.issues).toHaveLength(1)
  })
})

describe('импорт тренировок — Р-60', () => {
  it('заводит вид один раз, повтор вида и даты пропускается', () => {
    const plan = importSessions(
      [
        { activity: 'Бег', date: '2026-04-05', durationMin: 35, distanceKm: '6' },
        { activity: 'бег', date: '2026-04-05' },
        { activity: 'бег', date: '2026-04-07', durationMin: 0 },
      ],
      { sessions: [], tags: [] },
      ctx,
    )
    expect(plan.writes.tags?.map((each) => each.name)).toEqual(['Бег'])
    expect(plan.writes.sessions?.map((each) => [each.date, each.durationMin, each.distanceKm])).toEqual([
      ['2026-04-05', 35, 6],
    ])
    expect(plan.issues.map((issue) => issue.title)).toEqual(['бег, 2026-04-07'])
  })
})
