import { describe, expect, it } from 'vitest'
import { config } from '../app/config.ts'
import { SYNCED_STORES } from '../app/model.ts'
import { checkDemo } from '../shared/core/demo.ts'
import { cycleStates, templateMarks } from '../modules/cycles/cycles.ts'
import { demo } from './demo.ts'

/**
 * Демо-данные (Я-44, Я-45 «FamilyCore»). Сторож ядра `checkDemo`: каждое
 * хранилище получает записи, у записей — поля `Base`, id не повторяются.
 * Новое хранилище без строки в `demo.ts` — красный тест здесь.
 */

const DAY = '2026-10-12'

describe('демо «Дневников»', () => {
  it('полное: записи каждому хранилищу, без изъянов', () => {
    expect(checkDemo(config, DAY)).toEqual([])
  })

  it('в конфиге — та же функция', () => {
    expect(config.demo).toBe(demo)
  })

  it('циклы: у одной позиции срок прошёл, у другой подходит', () => {
    const data = demo(DAY)
    const statuses = cycleStates(data.items, data.cycleEvents, DAY).map((state) => state.status)
    expect(statuses).toContain('overdue')
    expect(statuses).toContain('due')
  })

  it('ссылки — на записи того же демо', () => {
    const data = demo(DAY)
    const categories = new Set(data.categories.map((category) => category.name))
    expect(data.items.every((item) => categories.has(item.cat))).toBe(true)
    expect(new Set(data.items.map((item) => item.cat)).size).toBeGreaterThanOrEqual(3)

    const items = new Set(data.items.map((item) => item.id))
    expect(data.cycleEvents.every((event) => items.has(event.itemId))).toBe(true)
    for (const template of data.templates) {
      expect(templateMarks(template.preset).every((mark) => items.has(mark.itemId))).toBe(true)
    }

    const tags = new Map(data.tags.map((tag) => [tag.id, tag.scope]))
    expect(data.episodes.every((episode) => episode.symptoms.every((id) => tags.get(id) === 'symptom'))).toBe(true)
    expect(data.sessions.every((session) => tags.get(session.activity) === 'activity')).toBe(true)
  })

  it('даты не позже дня входа', () => {
    const data = demo(DAY)
    const dates = [
      ...data.cycleEvents.map((event) => event.date),
      ...data.episodes.map((episode) => episode.start),
      ...data.measures.map((measure) => measure.date),
      ...data.sessions.map((session) => session.date),
      ...data.content.flatMap((entry) => (entry.start === null ? [] : [entry.start])),
    ]
    expect(dates.every((date) => date <= DAY)).toBe(true)
  })

  it('другой день — другие даты: демо не стареет', () => {
    const later = '2026-12-01'
    expect(demo(later).episodes.some((episode) => episode.end === null && episode.start > DAY)).toBe(true)
    expect(Object.keys(demo(later)).sort()).toEqual([...SYNCED_STORES].sort())
  })
})
