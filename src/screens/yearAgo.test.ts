import { describe, expect, it } from 'vitest'
import type { FeedItem } from '../shared/core/feed.ts'
import { YEAR_AGO_LIMIT, yearAgo, yearAgoDay } from './yearAgo.ts'

function item(id: string, date: string, kind = 'cycle', title = id): FeedItem {
  return { kind, id, date, title, detail: '' }
}

describe('yearAgoDay', () => {
  it('тот же день и месяц прошлого года', () => {
    expect(yearAgoDay('2026-10-03')).toBe('2025-10-03')
    expect(yearAgoDay('2026-01-01')).toBe('2025-01-01')
  })

  it('29 февраля → 28 февраля', () => {
    expect(yearAgoDay('2028-02-29')).toBe('2027-02-28')
  })

  it('кривая дата кидает', () => {
    expect(() => yearAgoDay('2026-02-30')).toThrow()
  })
})

describe('yearAgo', () => {
  it('нет записей в тот день — null', () => {
    expect(yearAgo([item('a', '2025-10-02'), item('b', '2026-10-03')], '2026-10-03')).toBeNull()
  })

  it('берёт только точный день: месяц и кривая дата не в счёт', () => {
    const result = yearAgo([item('a', '2025-10-03'), item('b', '2025-10'), item('c', '')], '2026-10-03')
    expect(result?.shown.map((each) => each.id)).toEqual(['a'])
    expect(result?.rest).toBe(0)
    expect(result?.day).toBe('2025-10-03')
  })

  it('не больше предела, остальное — числом', () => {
    const items = Array.from({ length: YEAR_AGO_LIMIT + 2 }, (_, index) => item(`r${index}`, '2025-10-03'))
    const result = yearAgo(items, '2026-10-03')
    expect(result?.shown).toHaveLength(YEAR_AGO_LIMIT)
    expect(result?.rest).toBe(2)
  })

  it('порядок — как в ленте: вид по реестру, затем название', () => {
    const items = [
      item('1', '2025-10-03', 'content', 'Аниме'),
      item('2', '2025-10-03', 'cycle', 'Стрижка'),
      item('3', '2025-10-03', 'cycle', 'Бритьё'),
    ]
    const result = yearAgo(items, '2026-10-03', ['cycle', 'content'])
    expect(result?.shown.map((each) => each.id)).toEqual(['3', '2', '1'])
  })

  it('в 29 февраля показывает записи 28 февраля', () => {
    const result = yearAgo([item('a', '2027-02-28')], '2028-02-29')
    expect(result?.shown.map((each) => each.id)).toEqual(['a'])
  })
})
