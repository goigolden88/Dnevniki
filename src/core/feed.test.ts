import { describe, expect, it } from 'vitest'
import {
  escapeMarkdown,
  feedDateText,
  feedHeading,
  filterFeed,
  groupFeed,
  normalize,
  recordsText,
  type FeedItem,
} from './feed.ts'

function item(date: string, over: Partial<FeedItem> = {}): FeedItem {
  return { kind: 'cycle', id: date || 'пусто', date, title: 'Стрижка', detail: '', link: '/', ...over }
}

const ids = (items: FeedItem[]) => items.map((each) => each.id)

describe('groupFeed', () => {
  it('новые сверху, месяцы заголовками', () => {
    const groups = groupFeed([item('2026-07-01'), item('2026-09-10'), item('2026-09-02')])
    expect(groups.map((group) => group.month)).toEqual(['2026-09', '2026-07'])
    expect(ids(groups[0]?.items ?? [])).toEqual(['2026-09-10', '2026-09-02'])
  })

  it('дата до месяца встаёт в конец своего месяца, а не на первое число — Р-25', () => {
    const groups = groupFeed([item('2026-09', { kind: 'content' }), item('2026-09-01'), item('2026-09-10')])
    expect(groups).toHaveLength(1)
    expect(ids(groups[0]?.items ?? [])).toEqual(['2026-09-10', '2026-09-01', '2026-09'])
  })

  it('нечитаемая дата — своей группой сверху, а не пропадает — Р-34', () => {
    const groups = groupFeed([item('2026-09-01'), item('вчера'), item('')])
    expect(groups[0]?.month).toBeNull()
    expect(groups[0]?.items).toHaveLength(2)
    expect(groups[1]?.month).toBe('2026-09')
  })

  it('внутри одного дня — по названию, а не в порядке базы', () => {
    const groups = groupFeed([
      item('2026-09-01', { id: 'b', title: 'Фильтр' }),
      item('2026-09-01', { id: 'a', title: 'Бритва' }),
    ])
    expect(ids(groups[0]?.items ?? [])).toEqual(['a', 'b'])
  })
})

describe('filterFeed', () => {
  const list = [
    item('2026-09-10', { id: 'cut', detail: 'Гигиена · 700 ₽' }),
    item('2026-07-01', { id: 'cold', kind: 'episode', title: 'ОРВИ', extra: 'горло насморк' }),
    item('2026-03', { id: 'film', kind: 'content', title: 'Ёлки' }),
  ]

  it('без условий — всё', () => {
    expect(filterFeed(list)).toHaveLength(3)
  })

  it('по виду', () => {
    expect(ids(filterFeed(list, { kind: 'episode' }))).toEqual(['cold'])
  })

  it('все слова запроса, в любом порядке, по названию и подписи', () => {
    expect(ids(filterFeed(list, { query: '700 стрижка' }))).toEqual(['cut'])
    expect(filterFeed(list, { query: 'стрижка 800' })).toEqual([])
  })

  it('ищет в том, что не показано: заметках и симптомах', () => {
    expect(ids(filterFeed(list, { query: 'горло' }))).toEqual(['cold'])
  })

  it('регистр и «ё» не в счёт', () => {
    expect(ids(filterFeed(list, { query: 'ЕЛКИ' }))).toEqual(['film'])
  })

  it('ищет по дате в обоих видах', () => {
    expect(ids(filterFeed(list, { query: '01.07' }))).toEqual(['cold'])
    expect(ids(filterFeed(list, { query: '2026-03' }))).toEqual(['film'])
  })

  it('вид и поиск вместе', () => {
    expect(filterFeed(list, { kind: 'content', query: 'стрижка' })).toEqual([])
  })
})

describe('подписи', () => {
  it('день — числом и месяцем, месяц — «без числа», мусор — как есть', () => {
    expect(feedDateText('2026-09-10')).toBe('10.09')
    expect(feedDateText('2026-09')).toBe('без числа')
    expect(feedDateText('вчера')).toBe('вчера')
    expect(feedDateText('')).toBe('нет даты')
  })

  it('заголовок группы', () => {
    expect(feedHeading('2026-09')).toBe('Сентябрь 2026')
    expect(feedHeading(null)).toBe('Дата не читается')
  })

  it('счётчик склоняется', () => {
    expect(recordsText(1)).toBe('1 запись')
    expect(recordsText(3)).toBe('3 записи')
    expect(recordsText(12)).toBe('12 записей')
  })

  it('normalize', () => {
    expect(normalize('  Ёлки   ПАЛКИ ')).toBe('елки палки')
  })
})

describe('escapeMarkdown', () => {
  it('служебные знаки экранируются', () => {
    expect(escapeMarkdown('*Звёздные* войны [2]')).toBe('\\*Звёздные\\* войны \\[2\\]')
    expect(escapeMarkdown('# не заголовок')).toBe('\\# не заголовок')
  })

  it('переносы строк становятся пробелами — пункт списка не рвётся', () => {
    expect(escapeMarkdown('первая\nвторая\n\nтретья ')).toBe('первая вторая третья')
  })
})
