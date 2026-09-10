import { describe, expect, it } from 'vitest'
import {
  contentStats,
  filterEntries,
  groupByMonth,
  hasUndated,
  monthsOf,
  parseScore,
  scoreBucket,
  sortEntries,
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

describe('sortEntries', () => {
  it('новые сверху, разная точность даты порядок не ломает', () => {
    const list = sortEntries([
      entry({ id: 'c', start: '2026-01' }),
      entry({ id: 'a', start: '2026-02' }),
      entry({ id: 'b', start: '2026-01-05' }),
    ])
    expect(list.map((each) => each.id)).toEqual(['a', 'b', 'c'])
  })

  it('запись без даты уходит вниз, а не считается самой старой', () => {
    const list = sortEntries([
      entry({ id: 'нет даты', start: null }),
      entry({ id: 'есть', start: '2020-01' }),
    ])
    expect(list.map((each) => each.id)).toEqual(['есть', 'нет даты'])
  })

  it('при одной дате — по названию', () => {
    const list = sortEntries([
      entry({ id: 'я', title: 'Ясон' }),
      entry({ id: 'а', title: 'Аниме' }),
    ])
    expect(list.map((each) => each.id)).toEqual(['а', 'я'])
  })

  it('«к просмотру» выходит по алфавиту само собой: даты у намерений нет', () => {
    const list = sortEntries([
      entry({ id: 'б', status: 'planned', start: null, title: 'Берсерк' }),
      entry({ id: 'а', status: 'planned', start: null, title: 'Аватар' }),
    ])
    expect(list.map((each) => each.title)).toEqual(['Аватар', 'Берсерк'])
  })

  it('исходный список не трогается', () => {
    const all = [entry({ id: 'б', start: '2026-01' }), entry({ id: 'а', start: '2026-02' })]
    sortEntries(all)
    expect(all.map((each) => each.id)).toEqual(['б', 'а'])
  })
})

describe('watching', () => {
  const all = [
    entry({ id: 'смотрю', status: 'active', score: null }),
    entry({ id: 'хочу', status: 'planned', start: null, score: null }),
    entry({ id: 'бросил', status: 'dropped' }),
    entry({ id: 'посмотрел', status: 'done' }),
  ]

  it('только active', () => {
    expect(watching(all).map((each) => each.id)).toEqual(['смотрю'])
  })

  it('надгробия не попадают', () => {
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

  it('надгробия отсекаются до фильтра, а не в нём', () => {
    // `filterEntries` работает с тем, что ему дали: живые записи отбирает
    // `useContent`, и второй проверки здесь не нужно.
    expect(filterEntries([entry({ deleted: true })], {})).toHaveLength(1)
  })

  it('отбирает по статусу', () => {
    const mixed = [
      entry({ id: 'п', status: 'done' }),
      entry({ id: 'б', status: 'dropped' }),
      entry({ id: 'х', status: 'planned', start: null }),
    ]
    expect(filterEntries(mixed, { status: 'dropped' }).map((each) => each.id)).toEqual(['б'])
    expect(filterEntries(mixed, { status: 'planned' }).map((each) => each.id)).toEqual(['х'])
  })

  it('отбирает по году и по месяцу, любой точности даты', () => {
    const dated = [
      entry({ id: 'янв', start: '2026-01' }),
      entry({ id: 'апр', start: '2026-04-15' }),
      entry({ id: 'прошлый', start: '2025-04' }),
    ]
    expect(filterEntries(dated, { year: '2026' }).map((each) => each.id)).toEqual(['янв', 'апр'])
    expect(filterEntries(dated, { month: 4 }).map((each) => each.id)).toEqual(['апр', 'прошлый'])
    expect(filterEntries(dated, { year: '2026', month: 4 }).map((each) => each.id)).toEqual(['апр'])
  })

  it('запись без даты не попадает ни в один месяц и ни в один год', () => {
    const mixed = [entry({ id: 'есть', start: '2026-01' }), entry({ id: 'нет', start: null })]
    expect(filterEntries(mixed, { year: '2026' }).map((each) => each.id)).toEqual(['есть'])
    expect(filterEntries(mixed, { month: 1 }).map((each) => each.id)).toEqual(['есть'])
    // Без фильтра периода — на месте.
    expect(filterEntries(mixed, {})).toHaveLength(2)
  })

  it('фильтры складываются', () => {
    const mixed = [
      entry({ id: 'то', type: 'anime', start: '2026-01', title: 'Фрирен' }),
      entry({ id: 'не тот тип', type: 'game', start: '2026-01', title: 'Фрирен' }),
      entry({ id: 'не тот месяц', type: 'anime', start: '2026-05', title: 'Фрирен' }),
    ]
    const found = filterEntries(mixed, { type: 'anime', year: '2026', month: 1, query: 'фри' })
    expect(found.map((each) => each.id)).toEqual(['то'])
  })
})

describe('отбор записей без даты — Р-34', () => {
  const mixed = [
    entry({ id: 'норм', start: '2026-01' }),
    entry({ id: 'пусто', start: null }),
    entry({ id: 'мусор', start: '31.02.2026' }),
  ]

  it('находит и пустую дату, и нечитаемую', () => {
    expect(filterEntries(mixed, { undated: true }).map((each) => each.id)).toEqual([
      'пусто',
      'мусор',
    ])
  })

  it('складывается со статусом и типом', () => {
    const found = filterEntries(
      [...mixed, entry({ id: 'чужой статус', start: null, status: 'dropped' })],
      { undated: true, status: 'done' },
    )
    expect(found.map((each) => each.id)).toEqual(['пусто', 'мусор'])
  })

  it('hasUndated говорит, есть ли такие вообще', () => {
    expect(hasUndated(mixed)).toBe(true)
    expect(hasUndated([entry({ start: '2026-01' })])).toBe(false)
  })

  it('надгробие с битой датой чипа не заводит', () => {
    expect(hasUndated([entry({ start: null, deleted: true })])).toBe(false)
  })
})

describe('groupByMonth', () => {
  it('режет список на месяцы, новыми сверху', () => {
    const groups = groupByMonth([
      entry({ id: '1', start: '2026-03' }),
      entry({ id: '2', start: '2026-01-05' }),
      entry({ id: '3', start: '2026-01' }),
    ])
    expect(groups.map((each) => each.month)).toEqual(['2026-03', '2026-01'])
    expect(groups[1]?.entries.map((each) => each.id)).toEqual(['2', '3'])
  })

  it('день и месяц одного месяца попадают в одну группу — Р-25', () => {
    const groups = groupByMonth([
      entry({ id: 'день', start: '2026-01-05' }),
      entry({ id: 'месяц', start: '2026-01' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.entries).toHaveLength(2)
  })

  it('порядок внутри группы не трогается: список приходит отсортированным', () => {
    const groups = groupByMonth([
      entry({ id: 'я', start: '2026-01', title: 'Ясон' }),
      entry({ id: 'а', start: '2026-01', title: 'Аниме' }),
    ])
    expect(groups[0]?.entries.map((each) => each.id)).toEqual(['я', 'а'])
  })

  it('записи без даты — последней группой, а не первой', () => {
    const groups = groupByMonth([
      entry({ id: 'нет', start: null }),
      entry({ id: 'есть', start: '2020-01' }),
    ])
    expect(groups.map((each) => each.month)).toEqual(['2020-01', null])
  })

  it('пустой список даёт пустую разбивку', () => {
    expect(groupByMonth([])).toEqual([])
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

describe('monthsOf', () => {
  const all = [
    entry({ id: '1', start: '2026-04' }),
    entry({ id: '2', start: '2026-01-05' }),
    entry({ id: '3', start: '2025-09' }),
    entry({ id: '4', start: '2026-04-20' }),
  ]

  it('месяцы по возрастанию — это календарь, а не лента', () => {
    expect(monthsOf(all, '2026')).toEqual([1, 4])
  })

  it('без года — месяцы по всем годам сразу', () => {
    expect(monthsOf(all)).toEqual([1, 4, 9])
  })

  it('повторы схлопываются', () => {
    expect(monthsOf([entry({ id: 'а', start: '2026-04' }), entry({ id: 'б', start: '2026-04' })])).toEqual([4])
  })

  it('записи без даты и надгробия месяцев не дают', () => {
    expect(monthsOf([entry({ start: null }), entry({ id: '2', start: 'мусор' })])).toEqual([])
    expect(monthsOf([entry({ start: '2026-04', deleted: true })])).toEqual([])
  })

  it('пустой год даёт пустой список — чипов не будет вовсе', () => {
    expect(monthsOf(all, '2019')).toEqual([])
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

  it('разбивка по месяцам — двенадцать чисел с января', () => {
    const stats = contentStats(year2026, '2026')
    expect(stats.byMonth).toHaveLength(12)
    expect(stats.byMonth[0]).toBe(1) // январь
    expect(stats.byMonth[3]).toBe(1) // апрель
    expect(stats.byMonth[10]).toBe(0) // ноябрь — он из 2025 года
    expect(stats.byMonth.reduce((all, each) => all + each, 0)).toBe(stats.started)
  })

  it('за всё время месяцы складываются по годам', () => {
    const stats = contentStats(
      [entry({ id: '1', start: '2026-04' }), entry({ id: '2', start: '2025-04' })],
      null,
    )
    expect(stats.byMonth[3]).toBe(2)
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
