import { describe, expect, it } from 'vitest'
import { feedItems, KIND_ORDER, KINDS, markdownExport, type Data } from './registry.ts'

const at = '2026-09-07T00:00:00.000Z'

function empty(): Data {
  return {
    items: [],
    categories: [],
    tags: [],
    templates: [],
    cycleEvents: [],
    episodes: [],
    measures: [],
    sessions: [],
    content: [],
  }
}

describe('реестр видов событий — Р-48', () => {
  it('все пять видов событий на месте, Р-19', () => {
    expect(KIND_ORDER).toEqual(['cycle', 'episode', 'measure', 'session', 'content'])
  })

  it('лента собирает все модули, и у каждой строки вид своего модуля', () => {
    const data = empty()
    data.items.push({ id: 'i1', updatedAt: at, name: 'Стрижка', cat: 'Гигиена', intervalDays: null })
    data.cycleEvents.push({ id: 'c1', updatedAt: at, itemId: 'i1', date: '2026-09-01' })
    data.episodes.push({ id: 'e1', updatedAt: at, title: 'ОРВИ', source: 'self', start: '2026-09-02', end: null, symptoms: [] })
    data.measures.push({ id: 'm1', updatedAt: at, metric: 'weight', date: '2026-09-03', value: 75 })
    data.sessions.push({ id: 's1', updatedAt: at, activity: 'a', date: '2026-09-04' })
    data.content.push({ id: 'k1', updatedAt: at, type: 'film', title: 'Дюна', start: '2026-09', end: null, status: 'done', score: 8 })

    const items = feedItems(data, '2026-09-10')
    expect(items.map((each) => [each.kind, each.id])).toEqual([
      ['cycle', 'c1'],
      ['episode', 'e1'],
      ['measure', 'm1'],
      ['session', 's1'],
      ['content', 'k1'],
    ])
  })

  it('выгрузка — заголовок и раздел на каждый вид даже без данных', () => {
    const text = markdownExport(empty(), '2026-09-10')
    expect(text.startsWith('# Дневники')).toBe(true)
    expect(text).toContain('Выгрузка от 10.09.2026')
    for (const heading of ['## Циклы', '## Болезни', '## Измерения', '## Тренировки', '## Контент']) {
      expect(text).toContain(heading)
    }
  })

  it('подписи видов не пустые', () => {
    for (const kind of KIND_ORDER) expect(KINDS[kind].label).not.toBe('')
  })
})
