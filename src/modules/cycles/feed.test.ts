import { describe, expect, it } from 'vitest'
import { cycleFeed, cycleMarkdown } from './feed.ts'
import type { CycleEvent, CycleItem } from '../../core/model.ts'

/** Суммы пишутся с неразрывным пробелом; к смыслу проверок он отношения не имеет. */
const flat = (text: string) => text.split(String.fromCharCode(0xa0)).join(' ')

function item(id: string, over: Partial<CycleItem> = {}): CycleItem {
  return {
    id,
    updatedAt: '2026-09-07T00:00:00.000Z',
    name: 'Стрижка',
    cat: 'Гигиена',
    intervalDays: null,
    ...over,
  }
}

function event(id: string, itemId: string, date: string, over: Partial<CycleEvent> = {}): CycleEvent {
  return { id, updatedAt: '2026-09-07T00:00:00.000Z', itemId, date, ...over }
}

const items = [
  item('c1', { intervalDays: 30 }),
  item('g1', { name: 'Старая щётка', deleted: true }),
  item('f1', { name: 'Барьер 3 стадии', cat: 'Дом', group: 'Барьер', archived: true }),
  item('n1', { name: 'Пустая удалённая', deleted: true }),
]

const events = [
  event('e1', 'c1', '2026-09-10', { price: 700 }),
  event('e2', 'c1', '2026-08-11'),
  event('e3', 'g1', '2026-05-01'),
  event('e4', 'c1', '2026-06-01', { deleted: true }),
  event('e5', 'x1', '2026-04-01'),
  event('e6', 'f1', '2026-03-01', { note: 'полная замена' }),
]

describe('cycleFeed', () => {
  const feed = cycleFeed(items, events)
  const byId = (id: string) => feed.find((each) => each.id === id)

  it('строка на каждую живую отметку, удалённая не попадает', () => {
    expect(feed.map((each) => each.id).sort()).toEqual(['e1', 'e2', 'e3', 'e5', 'e6'])
  })

  it('в подписи категория и цена, ссылка — на позицию', () => {
    expect(flat(byId('e1')?.detail ?? '')).toBe('Гигиена · 700 ₽')
    expect(byId('e1')?.link).toBe('/cycle/c1')
    expect(byId('e1')?.date).toBe('2026-09-10')
  })

  it('куст стоит рядом с категорией, заметка ищется', () => {
    expect(byId('e6')?.detail).toBe('Дом · Барьер')
    expect(byId('e6')?.extra).toBe('полная замена')
  })

  it('отметка удалённой позиции сохраняет её имя', () => {
    expect(byId('e3')?.title).toBe('Старая щётка')
    expect(byId('e3')?.detail).toContain('позиция удалена')
  })

  it('отметка без позиции в справочнике — строка всё равно есть', () => {
    expect(byId('e5')?.title).toBe('Позиция не найдена')
  })
})

describe('cycleMarkdown', () => {
  const text = flat(cycleMarkdown(items, events, '2026-09-10', []))

  it('категория → позиция → даты с ценой', () => {
    expect(text).toContain('## Циклы')
    expect(text).toContain('### Гигиена')
    expect(text).toContain('#### Стрижка')
    expect(text).toContain('- 10.09.2026 — 700 ₽')
    expect(text).toContain('- 11.08.2026')
    expect(text.indexOf('### Гигиена')).toBeLessThan(text.indexOf('### Дом'))
  })

  it('сумма — с числом отметок, Р-38', () => {
    expect(text).toContain('Потрачено: 700 ₽ за 1 отметку из 2')
  })

  it('интервал назван словами', () => {
    expect(text).toContain('Раз в 30 дней')
  })

  it('архивная и удалённая с отметками подписаны, удалённая без отметок не пишется', () => {
    expect(text).toContain('#### Барьер 3 стадии (в архиве)')
    expect(text).toContain('Куст: Барьер')
    expect(text).toContain('#### Старая щётка (удалена)')
    expect(text).not.toContain('Пустая удалённая')
  })

  it('отметка без позиции не теряется', () => {
    expect(text).toContain('### Без позиции')
    expect(text).toContain('- 01.04.2026')
  })

  it('удалённая отметка в выгрузку не попадает', () => {
    expect(text).not.toContain('01.06.2026')
  })

  it('пусто — так и сказано', () => {
    expect(cycleMarkdown([], [], '2026-09-10', [])).toContain('Позиций нет.')
  })
})
