import { describe, expect, it } from 'vitest'
import {
  contentStats,
  filterEntries,
  finished,
  parseScore,
  planned,
  scoreBucket,
  scoreOf,
  startOf,
  watching,
  yearsOf,
} from './content.ts'
import type { ContentEntry } from '../../core/model.ts'

const T = '2026-09-07T00:00:00.000Z'

function entry(over: Partial<ContentEntry> = {}): ContentEntry {
  return {
    id: 'c1',
    updatedAt: T,
    type: 'anime',
    title: 'Магическая битва 3',
    start: '2026-01',
    end: null,
    status: 'done',
    score: 7,
    ...over,
  }
}

describe('startOf', () => {
  it('берёт и месяц, и полный день — Р-25', () => {
    expect(startOf(entry({ start: '2026-01' }))).toBe('2026-01')
    expect(startOf(entry({ start: '2026-01-05' }))).toBe('2026-01-05')
  })

  it('пустая и испорченная дата — null, а не выдуманный день', () => {
    expect(startOf(entry({ start: null }))).toBeNull()
    expect(startOf(entry({ start: 'когда-то весной' }))).toBeNull()
    expect(startOf(entry({ start: '2026-13' }))).toBeNull()
  })
})

describe('порядок записей', () => {
  it('новые сверху, разная точность даты порядок не ломает', () => {
    const list = finished([
      entry({ id: 'a', start: '2026-02' }),
      entry({ id: 'b', start: '2026-01-05' }),
      entry({ id: 'c', start: '2026-01' }),
    ])
    expect(list.map((each) => each.id)).toEqual(['a', 'b', 'c'])
  })

  it('запись без даты уходит вниз, а не считается самой старой', () => {
    const list = finished([
      entry({ id: 'нет даты', start: null }),
      entry({ id: 'есть', start: '2020-01' }),
    ])
    expect(list.map((each) => each.id)).toEqual(['есть', 'нет даты'])
  })

  it('при одной дате — по названию', () => {
    const list = finished([
      entry({ id: 'я', title: 'Ясон' }),
      entry({ id: 'а', title: 'Аниме' }),
    ])
    expect(list.map((each) => each.id)).toEqual(['а', 'я'])
  })
})

describe('выборки по статусу', () => {
  const all = [
    entry({ id: 'смотрю', status: 'active', score: null }),
    entry({ id: 'хочу', status: 'planned', start: null, score: null, title: 'Берсерк' }),
    entry({ id: 'бросил', status: 'dropped' }),
    entry({ id: 'посмотрел', status: 'done' }),
    entry({ id: 'удалён', status: 'done', deleted: true }),
  ]

  it('«смотрю сейчас» — только active', () => {
    expect(watching(all).map((each) => each.id)).toEqual(['смотрю'])
  })

  it('«к просмотру» — только planned, по алфавиту', () => {
    const list = planned([
      ...all,
      entry({ id: 'второй', status: 'planned', start: null, title: 'Аватар' }),
    ])
    expect(list.map((each) => each.title)).toEqual(['Аватар', 'Берсерк'])
  })

  it('архив — просмотренное и брошенное вместе', () => {
    expect(finished(all).map((each) => each.id).sort()).toEqual(['бросил', 'посмотрел'])
  })

  it('надгробия не попадают никуда', () => {
    expect(finished(all).some((each) => each.deleted)).toBe(false)
    expect(watching([entry({ status: 'active', deleted: true })])).toHaveLength(0)
  })
})

describe('filterEntries', () => {
  const all = [
    entry({ id: 'а', type: 'anime', title: 'Фрирен', titleOrig: 'Frieren' }),
    entry({ id: 'и', type: 'game', title: 'Disco Elysium' }),
    entry({ id: 'к', type: 'book', title: 'Дюна' }),
  ]

  it('без фильтра отдаёт всё', () => {
    expect(filterEntries(all)).toHaveLength(3)
  })

  it('отбирает по типу', () => {
    expect(filterEntries(all, { type: 'game' }).map((each) => each.id)).toEqual(['и'])
  })

  it('ищет по названию без учёта регистра', () => {
    expect(filterEntries(all, { query: 'дюн' }).map((each) => each.id)).toEqual(['к'])
  })

  it('ищет и по оригинальному названию: «Frieren» и «Фрирен» — одна запись', () => {
    expect(filterEntries(all, { query: 'frier' }).map((each) => each.id)).toEqual(['а'])
    expect(filterEntries(all, { query: 'фрир' }).map((each) => each.id)).toEqual(['а'])
  })

  it('пробелы вокруг запроса не мешают', () => {
    expect(filterEntries(all, { query: '  дюна  ' })).toHaveLength(1)
  })
})

describe('yearsOf', () => {
  it('годы новыми сверху, без повторов', () => {
    const years = yearsOf([
      entry({ id: '1', start: '2026-03' }),
      entry({ id: '2', start: '2025-12-31' }),
      entry({ id: '3', start: '2026-01' }),
    ])
    expect(years).toEqual(['2026', '2025'])
  })

  it('записи без даты года не дают', () => {
    expect(yearsOf([entry({ start: null }), entry({ id: '2', start: 'мусор' })])).toEqual([])
  })
})

describe('оценки', () => {
  it('годная оценка проходит, дробная тоже — Р-26', () => {
    expect(scoreOf(entry({ score: 6.5 }))).toBe(6.5)
  })

  it('пустая, нечисловая и вне диапазона отбрасываются молча', () => {
    expect(scoreOf(entry({ score: null }))).toBeNull()
    expect(scoreOf(entry({ score: 0 }))).toBeNull()
    expect(scoreOf(entry({ score: 11 }))).toBeNull()
    expect(scoreOf(entry({ score: Number.NaN }))).toBeNull()
  })

  it('parseScore принимает запятую и пробелы', () => {
    expect(parseScore('7,5')).toBe(7.5)
    expect(parseScore('7.5')).toBe(7.5)
    expect(parseScore(' 8 ')).toBe(8)
  })

  it('parseScore на пустой строке даёт null: оценка необязательна', () => {
    expect(parseScore('')).toBeNull()
    expect(parseScore('   ')).toBeNull()
  })

  it('parseScore не подставляет число вместо мусора и не выпускает за диапазон', () => {
    expect(parseScore('отлично')).toBeNull()
    expect(parseScore('0')).toBeNull()
    expect(parseScore('10.5')).toBeNull()
    expect(parseScore('-7')).toBeNull()
  })

  it('parseScore округляет до шага 0.1, а не хранит хвост дроби', () => {
    expect(parseScore('7,55')).toBe(7.6)
    expect(parseScore('6,04')).toBe(6)
  })

  it('столбик распределения — округление вниз: 6,5 это шестёрка', () => {
    expect(scoreBucket(6)).toBe(5)
    expect(scoreBucket(6.5)).toBe(5)
    expect(scoreBucket(6.9)).toBe(5)
    expect(scoreBucket(7)).toBe(6)
  })

  it('десятка попадает в последний столбик, а не за него', () => {
    expect(scoreBucket(10)).toBe(9)
  })
})

describe('contentStats', () => {
  const year2026 = [
    entry({ id: '1', start: '2026-01', status: 'done', score: 7, type: 'anime' }),
    entry({ id: '2', start: '2026-02', status: 'done', score: 6.5, type: 'anime' }),
    entry({ id: '3', start: '2026-03', status: 'dropped', score: 4, type: 'series' }),
    entry({ id: '4', start: '2026-04', status: 'active', score: null, type: 'game' }),
    entry({ id: '5', start: '2025-11', status: 'done', score: 9, type: 'film' }),
    entry({ id: '6', start: null, status: 'planned', score: null, type: 'book' }),
  ]

  it('считает по году начала', () => {
    const stats = contentStats(year2026, '2026')
    expect(stats.started).toBe(4)
    expect(stats.done).toBe(2)
    expect(stats.dropped).toBe(1)
    expect(stats.active).toBe(1)
  })

  it('закончено — это done и dropped вместе, по статусу, а не по дате конца (Р-42)', () => {
    const stats = contentStats(year2026, '2026')
    expect(stats.finished).toBe(3)
    // Ни у одной записи `end` не заполнен — и это не мешает.
    expect(year2026.every((each) => each.end === null)).toBe(true)
  })

  it('«к просмотру» в итоги не входит даже за всё время: «начато» про него неправда', () => {
    const stats = contentStats(year2026, null)
    expect(stats.started).toBe(5)
    expect(stats.byType.some((each) => each.type === 'book')).toBe(false)
  })

  it('среднее идёт с числом оценённых — Р-38', () => {
    const stats = contentStats(year2026, '2026')
    // (7 + 6.5 + 4) / 3 = 5.833…
    expect(stats.averageScore).toBe(5.8)
    expect(stats.scored).toBe(3)
    expect(stats.started).toBe(4)
  })

  it('среднее не считается, когда оценок нет вовсе', () => {
    const stats = contentStats([entry({ status: 'active', score: null })], null)
    expect(stats.averageScore).toBeNull()
    expect(stats.scored).toBe(0)
  })

  it('распределение оценок — десять столбиков, дробные сгруппированы вниз', () => {
    const stats = contentStats(year2026, '2026')
    expect(stats.byScore).toHaveLength(10)
    expect(stats.byScore[3]).toBe(1) // четвёрка
    expect(stats.byScore[5]).toBe(1) // 6,5 — это шестёрка
    expect(stats.byScore[6]).toBe(1) // семёрка
    expect(stats.byScore.reduce((all, each) => all + each, 0)).toBe(stats.scored)
  })

  it('типы по убыванию частоты', () => {
    const stats = contentStats(year2026, '2026')
    expect(stats.byType[0]).toEqual({ type: 'anime', count: 2 })
    expect(stats.byType.map((each) => each.count).reduce((a, b) => a + b, 0)).toBe(stats.started)
  })

  it('лучшее — до трёх записей, по убыванию оценки', () => {
    const stats = contentStats(year2026, null)
    expect(stats.top.map((each) => each.id)).toEqual(['5', '1', '2'])
  })

  it('лучшего нет, когда оценок нет', () => {
    expect(contentStats([entry({ score: null })], null).top).toEqual([])
  })

  it('надгробия не считаются', () => {
    const stats = contentStats([entry({ score: 7, deleted: true })], null)
    expect(stats.started).toBe(0)
    expect(stats.scored).toBe(0)
  })

  it('пустой период не ломается', () => {
    const stats = contentStats(year2026, '2019')
    expect(stats.started).toBe(0)
    expect(stats.finished).toBe(0)
    expect(stats.averageScore).toBeNull()
    expect(stats.byType).toEqual([])
  })

  it('испорченная дата не роняет расчёт и в год не попадает', () => {
    const stats = contentStats([...year2026, entry({ id: 'битая', start: '31.02.2026' })], '2026')
    expect(stats.started).toBe(4)
  })
})
