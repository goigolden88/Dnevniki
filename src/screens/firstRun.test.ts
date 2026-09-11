import { describe, expect, it } from 'vitest'
import { iosNote, isEmptyBase } from './firstRun.ts'

describe('пустая база — Р-69', () => {
  it('ничего не посчитано — пусто', () => {
    expect(isEmptyBase({})).toBe(true)
  })

  it('категории, теги и шаблоны не в счёт: категории заводятся сами', () => {
    expect(isEmptyBase({ categories: 5, tags: 2, templates: 1 })).toBe(true)
  })

  it('любая запись человека — уже не пусто', () => {
    expect(isEmptyBase({ items: 1 })).toBe(false)
    expect(isEmptyBase({ episodes: 1 })).toBe(false)
    expect(isEmptyBase({ measures: 1 })).toBe(false)
    expect(isEmptyBase({ sessions: 1 })).toBe(false)
    expect(isEmptyBase({ content: 1 })).toBe(false)
  })
})

describe('строка про iPhone — Р-69', () => {
  const base = { iosTab: true, empty: true, welcome: false, hiddenNow: false, hiddenForever: false }

  it('не iPhone во вкладке — строки нет', () => {
    expect(iosNote({ ...base, iosTab: false })).toBeNull()
  })

  it('пусто — «ставь до первых записей»', () => {
    expect(iosNote(base)).toBe('before')
  })

  it('пока пусто, скрытая возвращается при следующем открытии', () => {
    expect(iosNote({ ...base, hiddenNow: true })).toBeNull()
    expect(iosNote({ ...base, hiddenForever: true })).toBe('before')
  })

  it('записи есть — «перенеси копией», скрывается насовсем', () => {
    expect(iosNote({ ...base, empty: false })).toBe('after')
    expect(iosNote({ ...base, empty: false, hiddenForever: true })).toBeNull()
  })

  it('пока на экране приветствие — строки нет, там сказано то же', () => {
    expect(iosNote({ ...base, welcome: true })).toBeNull()
  })
})
