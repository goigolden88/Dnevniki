import { describe, expect, it } from 'vitest'
import {
  categoryGroups,
  categoryIdFor,
  categoryNames,
  renameGroupPlan,
  findCategory,
  initialCategories,
  movePlan,
  nextCategoryOrder,
  removePlan,
  renamePlan,
  SEED_STAMP,
} from './cycles.ts'
import type { CycleCategory, CycleItem } from '../../core/model.ts'

/** Категории своими записями — Р-59. */

const T = '2026-09-11T10:00:00.000Z'
const DEFAULTS = ['Гигиена', 'Дом', 'Техника', 'Авто', 'Дача']

function cat(name: string, order: number, over: Partial<CycleCategory> = {}): CycleCategory {
  return { id: `cat:${name.toLowerCase()}`, updatedAt: T, name, order, ...over }
}

function item(id: string, cat: string, over: Partial<CycleItem> = {}): CycleItem {
  return { id, updatedAt: T, name: id, cat, intervalDays: null, ...over }
}

describe('начальный набор', () => {
  it('прежние пять по порядку, найденные у позиций — следом по алфавиту', () => {
    const seeded = initialCategories([item('a', 'Огород'), item('b', 'Баня'), item('c', 'Дом')], DEFAULTS)
    expect(seeded.map((each) => each.name)).toEqual([...DEFAULTS, 'Баня', 'Огород'])
    expect(seeded.map((each) => each.order)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('регистр и пробелы не заводят вторую категорию', () => {
    const seeded = initialCategories([item('a', ' гигиена '), item('b', 'ОГОРОД'), item('c', 'огород')], DEFAULTS)
    expect(seeded.filter((each) => each.name.toLowerCase() === 'гигиена')).toHaveLength(1)
    expect(seeded.filter((each) => each.name.toLowerCase() === 'огород')).toHaveLength(1)
  })

  it('id постоянный, штамп неподвижный — два устройства заводят одно и то же', () => {
    const first = initialCategories([item('a', 'Огород')], DEFAULTS)
    const second = initialCategories([item('a', 'Огород')], DEFAULTS)
    expect(first).toEqual(second)
    expect(first[0]).toEqual({ id: 'cat:гигиена', updatedAt: SEED_STAMP, name: 'Гигиена', order: 0 })
  })

  it('удалённые позиции категорий не заводят', () => {
    const seeded = initialCategories([item('a', 'Огород', { deleted: true })], DEFAULTS)
    expect(seeded.map((each) => each.name)).toEqual(DEFAULTS)
  })
})

describe('порядок и поиск', () => {
  it('названия по порядку, без надгробий', () => {
    const list = [cat('Дом', 1), cat('Гигиена', 0), cat('Дача', 2, { deleted: true })]
    expect(categoryNames(list)).toEqual(['Гигиена', 'Дом'])
  })

  it('поиск без учёта регистра и только среди живых', () => {
    const list = [cat('Дом', 0), cat('Дача', 1, { deleted: true })]
    expect(findCategory(list, ' дом')?.name).toBe('Дом')
    expect(findCategory(list, 'Дача')).toBeNull()
  })

  it('новая категория встаёт в конец', () => {
    expect(nextCategoryOrder([cat('Дом', 0), cat('Авто', 4), cat('Дача', 9, { deleted: true })])).toBe(5)
    expect(nextCategoryOrder([])).toBe(0)
  })
})

describe('id новой категории', () => {
  it('свободный — по названию', () => {
    expect(categoryIdFor([], 'Огород', 'x')).toBe('cat:огород')
  })

  it('занят надгробием — тот же, категория оживает', () => {
    expect(categoryIdFor([cat('Огород', 0, { deleted: true })], 'Огород', 'x')).toBe('cat:огород')
  })

  it('занят живой переименованной — с добавкой', () => {
    const renamed = cat('Уход', 0, { id: 'cat:гигиена' })
    expect(categoryIdFor([renamed], 'Гигиена', 'x')).toBe('cat:гигиена:x')
  })
})

describe('переименование', () => {
  const list = [cat('Гигиена', 0), cat('Дом', 1)]
  const items = [item('cut', 'Гигиена'), item('brush', 'гигиена'), item('filter', 'Дом')]

  it('правит категорию и все её позиции, в любом регистре', () => {
    const plan = renamePlan(list, items, 'cat:гигиена', 'Уход')
    expect(plan?.merged).toBe(false)
    expect(plan?.categories).toEqual([{ ...list[0], name: 'Уход' }])
    expect(plan?.items.map((each) => [each.id, each.cat])).toEqual([
      ['cut', 'Уход'],
      ['brush', 'Уход'],
    ])
  })

  it('в занятое название — слияние: позиции переезжают, категория уходит надгробием', () => {
    const plan = renamePlan(list, items, 'cat:гигиена', 'дом')
    expect(plan?.merged).toBe(true)
    expect(plan?.categories).toEqual([{ ...list[0], deleted: true }])
    expect(plan?.items.map((each) => each.cat)).toEqual(['Дом', 'Дом'])
  })

  it('то же название или пустое — нечего делать', () => {
    expect(renamePlan(list, items, 'cat:гигиена', 'Гигиена')).toBeNull()
    expect(renamePlan(list, items, 'cat:гигиена', '  ')).toBeNull()
  })
})

describe('удаление', () => {
  const list = [cat('Гигиена', 0), cat('Дом', 1), cat('Дача', 2)]

  it('пустая уходит надгробием', () => {
    expect(removePlan(list, [item('cut', 'Гигиена')], 'cat:дача', null)).toEqual({
      categories: [{ ...list[2], deleted: true }],
      items: [],
    })
  })

  it('с позициями без места для переноса — нельзя', () => {
    expect(removePlan(list, [item('cut', 'Гигиена')], 'cat:гигиена', null)).toBeNull()
    expect(removePlan(list, [item('cut', 'Гигиена')], 'cat:гигиена', 'cat:гигиена')).toBeNull()
  })

  it('с переносом — позиции уезжают в другую', () => {
    const plan = removePlan(list, [item('cut', 'Гигиена'), item('filter', 'Дом')], 'cat:гигиена', 'cat:дом')
    expect(plan?.categories).toEqual([{ ...list[0], deleted: true }])
    expect(plan?.items).toEqual([{ ...item('cut', 'Гигиена'), cat: 'Дом' }])
  })
})

describe('группы', () => {
  const items = [
    item('a', 'Дом', { group: 'Барьер' }),
    item('b', 'Дом', { group: 'барьер ' }),
    item('c', 'Дом', { group: 'Зарядки' }),
    item('d', 'Техника', { group: 'Барьер' }),
    item('e', 'Дом'),
  ]

  it('группы категории с числом позиций, без пустых; регистр не делит группу', () => {
    expect(categoryGroups(items, 'Дом')).toEqual([
      { name: 'Барьер', count: 2 },
      { name: 'Зарядки', count: 1 },
    ])
  })

  it('переименование — все позиции группы в этой категории, в любом регистре', () => {
    const changed = renameGroupPlan(items, 'Дом', 'Барьер', 'Фильтр')
    expect(changed.map((each) => [each.id, each.group])).toEqual([
      ['a', 'Фильтр'],
      ['b', 'Фильтр'],
    ])
  })

  it('в название другой группы — позиции переходят в неё, с её написанием', () => {
    const changed = renameGroupPlan(items, 'Дом', 'Зарядки', 'БАРЬЕР')
    expect(changed.map((each) => [each.id, each.group])).toEqual([['c', 'Барьер']])
  })

  it('пустое название ничего не делает', () => {
    expect(renameGroupPlan(items, 'Дом', 'Барьер', ' ')).toEqual([])
  })
})

describe('перестановка', () => {
  const list = [cat('Гигиена', 0), cat('Дом', 1), cat('Техника', 2)]

  it('меняется местами с соседом, отдаются только изменившиеся', () => {
    const changed = movePlan(list, 'cat:техника', -1)
    expect(changed.map((each) => [each.name, each.order])).toEqual([
      ['Техника', 1],
      ['Дом', 2],
    ])
  })

  it('с краю дальше не едет', () => {
    expect(movePlan(list, 'cat:гигиена', -1)).toEqual([])
    expect(movePlan(list, 'cat:техника', 1)).toEqual([])
  })

  it('дыры в порядке перенумеровываются', () => {
    const sparse = [cat('Гигиена', 0), cat('Дом', 5), cat('Техника', 9)]
    const changed = movePlan(sparse, 'cat:гигиена', 1)
    expect(changed.map((each) => [each.name, each.order])).toEqual([
      ['Дом', 0],
      ['Гигиена', 1],
      ['Техника', 2],
    ])
  })
})
