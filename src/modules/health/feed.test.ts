import { describe, expect, it } from 'vitest'
import {
  episodeFeed,
  episodeMarkdown,
  measureFeed,
  measureMarkdown,
  sessionFeed,
  sessionMarkdown,
} from './feed.ts'
import type { Episode, Measure, Session, Tag } from '../../core/model.ts'

const at = '2026-09-07T00:00:00.000Z'
const day = '2026-09-10'

const tags: Tag[] = [
  { id: 't1', updatedAt: at, name: 'горло', scope: 'symptom' },
  { id: 't2', updatedAt: at, name: 'насморк', scope: 'symptom', deleted: true },
  { id: 'a1', updatedAt: at, name: 'бег', scope: 'activity' },
]

function episode(id: string, over: Partial<Episode> = {}): Episode {
  return {
    id,
    updatedAt: at,
    title: 'ОРВИ',
    source: 'self',
    start: '2026-09-01',
    end: '2026-09-05',
    symptoms: ['t1', 't2'],
    ...over,
  }
}

describe('episodeFeed', () => {
  const feed = episodeFeed(
    [episode('e1', { note: 'после дождя' }), episode('e2', { end: null, start: '2026-09-08' }), episode('e3', { deleted: true })],
    tags,
    day,
  )

  it('строка на живой эпизод, по дате начала', () => {
    expect(feed.map((each) => [each.id, each.date])).toEqual([
      ['e1', '2026-09-01'],
      ['e2', '2026-09-08'],
    ])
  })

  it('в подписи длительность и источник диагноза', () => {
    expect(feed[0]?.detail).toBe('5 дней · 01.09.2026 — 05.09.2026 · диагноз: сам')
    expect(feed[1]?.detail).toContain('идёт 3-й день')
  })

  it('симптомы ищутся, в том числе с удалённым тегом', () => {
    expect(feed[0]?.extra).toBe('горло насморк после дождя')
    expect(feed[0]?.link).toBe('/episode/e1')
  })

  it('markdown — хронология с симптомами', () => {
    const text = episodeMarkdown([episode('e1')], tags, day)
    expect(text).toContain('## Болезни')
    expect(text).toContain('- ОРВИ — 5 дней · 01.09.2026 — 05.09.2026; диагноз: сам; симптомы: горло, насморк')
    expect(episodeMarkdown([], tags, day)).toContain('Эпизодов нет.')
  })
})

describe('measureFeed', () => {
  const measures: Measure[] = [
    { id: 'm1', updatedAt: at, metric: 'weight', date: '2026-09-02', value: 75 },
    { id: 'm2', updatedAt: at, metric: 'bp', date: '2026-09-03', value: 120, value2: 80, note: 'утром' },
    { id: 'm3', updatedAt: at, metric: 'weight', date: '2026-08-01', value: 76, deleted: true },
  ]

  it('название — метрика со значением', () => {
    const feed = measureFeed(measures)
    expect(feed.map((each) => each.title)).toEqual(['Вес 75 кг', 'Давление 120/80'])
    expect(feed[1]?.detail).toBe('утром')
  })

  it('markdown — по метрикам', () => {
    const text = measureMarkdown(measures)
    expect(text).toContain('### Вес')
    expect(text).toContain('- 02.09.2026 — 75 кг')
    expect(text).toContain('- 03.09.2026 — 120/80 · утром')
    expect(text).not.toContain('76')
  })
})

describe('sessionFeed', () => {
  const sessions: Session[] = [
    { id: 's1', updatedAt: at, activity: 'a1', date: '2026-09-04', durationMin: 40, distanceKm: 7.5 },
    { id: 's2', updatedAt: at, activity: 'нет-такого', date: '2026-09-05' },
    { id: 's3', updatedAt: at, activity: 'a1', date: '2026-09-06', deleted: true },
  ]

  it('вид по тегу, длительность и дистанция в подписи', () => {
    const feed = sessionFeed(sessions, tags)
    expect(feed.map((each) => [each.title, each.detail])).toEqual([
      ['бег', '40 мин · 7.5 км'],
      ['Вид не найден', ''],
    ])
  })

  it('markdown — новыми сверху', () => {
    const text = sessionMarkdown(sessions, tags)
    expect(text.indexOf('05.09.2026')).toBeLessThan(text.indexOf('04.09.2026'))
    expect(text).toContain('- 04.09.2026 — бег · 40 мин · 7.5 км')
  })
})
