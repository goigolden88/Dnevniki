import { describe, expect, it } from 'vitest'
import { contentFeed, contentMarkdown } from './feed.ts'
import type { ContentEntry } from '../../core/model.ts'

function entry(id: string, over: Partial<ContentEntry> = {}): ContentEntry {
  return {
    id,
    updatedAt: '2026-09-07T00:00:00.000Z',
    type: 'anime',
    title: 'Фрирен',
    start: '2026-09',
    end: null,
    status: 'done',
    score: 8.5,
    ...over,
  }
}

const entries = [
  entry('a', { titleOrig: 'Sousou no Frieren', comment: 'лучшее за год' }),
  entry('b', { title: 'Ведьмак', type: 'series', status: 'dropped', score: null, start: '2026-03-15' }),
  entry('c', { title: 'Дюна', type: 'book', status: 'planned', start: null, score: null }),
  entry('d', { title: 'Кривая', start: 'весной' }),
  entry('e', { title: 'Удалённое', deleted: true }),
  entry('f', { title: 'Смотрю', status: 'active', start: '2026-09-02', score: null }),
]

describe('contentFeed', () => {
  const feed = contentFeed(entries)
  const byId = (id: string) => feed.find((each) => each.id === id)

  it('«к просмотру» и удалённое в ленту не входят — Р-52', () => {
    expect(feed.map((each) => each.id).sort()).toEqual(['a', 'b', 'd', 'f'])
  })

  it('месячная дата остаётся месяцем — Р-25', () => {
    expect(byId('a')?.date).toBe('2026-09')
  })

  it('нечитаемая дата отдаётся как есть — Р-34', () => {
    expect(byId('d')?.date).toBe('весной')
  })

  it('в подписи тип, необычный исход и оценка', () => {
    expect(byId('a')?.detail).toBe('аниме · 8,5')
    expect(byId('b')?.detail).toBe('сериал · брошено')
    expect(byId('f')?.detail).toBe('аниме · смотрю')
  })

  it('оригинальное название и комментарий ищутся', () => {
    expect(byId('a')?.extra).toBe('Sousou no Frieren лучшее за год')
  })

  it('тап ведёт к самой записи, а не просто на вкладку — Р-56', () => {
    expect(byId('a')?.link).toBe('/content?open=a')
  })
})

describe('contentMarkdown', () => {
  const text = contentMarkdown(entries)

  it('разделы по месяцам, новые сверху', () => {
    expect(text).toContain('### Сентябрь 2026')
    expect(text).toContain('### Март 2026')
    expect(text.indexOf('### Сентябрь 2026')).toBeLessThan(text.indexOf('### Март 2026'))
  })

  it('день — только когда известен', () => {
    expect(text).toContain('- 15.03.2026 · Ведьмак — сериал · брошено')
    expect(text).toContain('- Фрирен (Sousou no Frieren) — аниме · 8,5 — просмотрено — лучшее за год')
  })

  it('«к просмотру» — своим разделом в конце', () => {
    expect(text).toContain('### К просмотру')
    expect(text.indexOf('### К просмотру')).toBeGreaterThan(text.indexOf('### Март 2026'))
    expect(text).toContain('- Дюна — книга')
  })

  it('нечитаемая дата названа, а не спрятана', () => {
    expect(text).toContain('### Без даты')
    expect(text).toContain('дата не разобрана: «весной»')
  })

  it('удалённое не выгружается', () => {
    expect(text).not.toContain('Удалённое')
  })
})
