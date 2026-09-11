import { describe, expect, it } from 'vitest'
import {
  compareUrgency,
  cyclePreset,
  cycleState,
  cycleStates,
  cycleTemplates,
  DUE_RATIO,
  groupByCategory,
  knownGroups,
  lastPrice,
  MIN_INTERVALS,
  intervals,
  markDates,
  marksOfItem,
  median,
  medianInterval,
  MEDIAN_WINDOW,
  nextOrder,
  sortByUrgency,
  spendTree,
  spent,
  spread,
  templateMarks,
  templateState,
  totalSpent,
  unitsOf,
} from './cycles.ts'
import type { CycleEvent, CycleItem, Template } from '../../core/model.ts'

describe('marksOfItem — Р-74', () => {
  const at = '2026-09-07T00:00:00.000Z'
  const events: CycleEvent[] = [
    { id: 'a', updatedAt: at, itemId: 'i1', date: '2026-01-10' },
    { id: 'b', updatedAt: at, itemId: 'i1', date: '2026-03-10' },
    { id: 'c', updatedAt: at, itemId: 'i1', date: '2026-02-10', deleted: true },
    { id: 'd', updatedAt: at, itemId: 'i2', date: '2026-04-10' },
  ]

  it('живые отметки своей позиции, новые сверху', () => {
    expect(marksOfItem(events, 'i1').map((event) => event.id)).toEqual(['b', 'a'])
  })

  it('надгробия и чужие позиции не попадают', () => {
    expect(marksOfItem(events, 'i2').map((event) => event.id)).toEqual(['d'])
    expect(marksOfItem(events, 'нет-такой')).toEqual([])
  })
})

function item(over: Partial<CycleItem> = {}): CycleItem {
  return {
    id: 'i1',
    updatedAt: '2026-09-07T00:00:00.000Z',
    name: 'Стрижка',
    cat: 'Гигиена',
    intervalDays: null,
    ...over,
  }
}

function event(date: string, over: Partial<CycleEvent> = {}): CycleEvent {
  return {
    id: `e${date}`,
    updatedAt: '2026-09-07T00:00:00.000Z',
    itemId: 'i1',
    date,
    ...over,
  }
}

describe('markDates', () => {
  it('сортирует и схлопывает повторы в один день', () => {
    const dates = markDates([event('2026-03-05'), event('2026-01-10'), event('2026-03-05')])
    expect(dates).toEqual(['2026-01-10', '2026-03-05'])
  })

  it('отбрасывает удалённые и нечитаемые даты, а не падает на них', () => {
    const dates = markDates([
      event('2026-01-10'),
      event('2026-02-10', { deleted: true }),
      event('не дата'),
      event('2026-13-40'),
    ])
    expect(dates).toEqual(['2026-01-10'])
  })
})

describe('intervals', () => {
  it('считает промежутки между соседними отметками', () => {
    expect(intervals(['2026-01-01', '2026-01-06', '2026-01-20'])).toEqual([5, 14])
  })

  it('одна отметка или пусто — интервалов нет', () => {
    expect(intervals(['2026-01-01'])).toEqual([])
    expect(intervals([])).toEqual([])
  })
})

describe('median', () => {
  it('нечётная длина — центральный элемент, чётная — среднее двух', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([1, 2, 4, 5])).toBe(3)
    expect(median([4, 5])).toBe(4.5)
  })

  it('устойчива к выбросу — ради этого она и выбрана вместо среднего', () => {
    expect(median([30, 31, 32, 33, 400])).toBe(32)
  })

  it('пустой массив — null', () => {
    expect(median([])).toBeNull()
  })
})

describe('medianInterval', () => {
  it('берёт последние пять интервалов, а не всю историю', () => {
    // Шесть интервалов: первый — разрыв в данных, остальные ровные по 30.
    const dates = [
      '2026-01-01',
      '2026-05-01', // +120, обрыв
      '2026-05-31',
      '2026-06-30',
      '2026-07-30',
      '2026-08-29',
      '2026-09-28',
    ]
    expect(intervals(dates)).toEqual([120, 30, 30, 30, 30, 30])
    expect(medianInterval(dates)).toBe(30)
  })

  it('при коротком окне заметно, что 120 из истории не выкинут', () => {
    const dates = ['2026-01-01', '2026-05-01', '2026-05-31']
    expect(medianInterval(dates)).toBe(75)
  })

  it('меньше пяти интервалов — считает по всем', () => {
    expect(medianInterval(['2026-01-01', '2026-01-11', '2026-01-31'])).toBe(15)
  })

  it('округляет до целого дня', () => {
    expect(medianInterval(['2026-01-01', '2026-01-06', '2026-01-16'])).toBe(8)
  })

  it('одна отметка — интервал неизвестен', () => {
    expect(medianInterval(['2026-01-01'])).toBeNull()
  })

  it('окно по умолчанию — пять', () => {
    expect(MEDIAN_WINDOW).toBe(5)
  })
})

describe('spread', () => {
  it('min и max по всей истории, медиана — по окну', () => {
    const dates = [
      '2026-01-01',
      '2026-05-01', // +120
      '2026-05-31',
      '2026-06-30',
      '2026-07-30',
      '2026-08-29',
      '2026-09-28',
    ]
    expect(spread(dates)).toEqual({ min: 30, max: 120, median: 30, count: 6 })
  })

  it('минимум и максимум есть с первого интервала, медианы ещё нет', () => {
    const two = spread(['2026-01-01', '2026-01-11', '2026-02-10'])
    expect(two).toEqual({ min: 10, max: 30, median: null, count: 2 })
  })

  it('без интервалов — null', () => {
    expect(spread(['2026-01-01'])).toBeNull()
  })
})

describe('cycleState — статусы', () => {
  it('нет записей', () => {
    const state = cycleState(item({ intervalDays: 30 }), [], '2026-09-07')
    expect(state.status).toBe('never')
    expect(state.last).toBeNull()
    expect(state.next).toBeNull()
    expect(state.ratio).toBeNull()
  })

  it('срок не задан: одна отметка и нет ручного интервала', () => {
    const state = cycleState(item(), [event('2026-09-01')], '2026-09-07')
    expect(state.status).toBe('unset')
    expect(state.interval).toBeNull()
    expect(state.intervalSource).toBeNull()
    expect(state.daysSince).toBe(6)
  })

  it('в норме', () => {
    const state = cycleState(item({ intervalDays: 30 }), [event('2026-09-01')], '2026-09-07')
    expect(state.status).toBe('ok')
    expect(state.ratio).toBeCloseTo(6 / 30)
    expect(state.next).toBe('2026-10-01')
    expect(state.overdueDays).toBe(0)
  })

  it('подходит к сроку ровно на пороге 80%', () => {
    const state = cycleState(item({ intervalDays: 10 }), [event('2026-09-01')], '2026-09-09')
    expect(state.ratio).toBe(DUE_RATIO)
    expect(state.status).toBe('due')
  })

  it('на день раньше порога — ещё в норме', () => {
    const state = cycleState(item({ intervalDays: 10 }), [event('2026-09-01')], '2026-09-08')
    expect(state.status).toBe('ok')
  })

  it('в день срока уже просрочено, а не «подходит»', () => {
    const state = cycleState(item({ intervalDays: 10 }), [event('2026-09-01')], '2026-09-11')
    expect(state.ratio).toBe(1)
    expect(state.status).toBe('overdue')
    expect(state.overdueDays).toBe(0)
  })

  it('перебор считается днями сверх срока', () => {
    const state = cycleState(item({ intervalDays: 10 }), [event('2026-09-01')], '2026-09-20')
    expect(state.status).toBe('overdue')
    expect(state.overdueDays).toBe(9)
    expect(state.ratio).toBeCloseTo(1.9)
  })
})

describe('cycleState — интервал', () => {
  it('ручной интервал побеждает медиану', () => {
    const events = [event('2026-08-01'), event('2026-08-11'), event('2026-08-21')]
    const state = cycleState(item({ intervalDays: 30 }), events, '2026-09-07')
    expect(state.interval).toBe(30)
    expect(state.intervalSource).toBe('manual')
    expect(state.next).toBe('2026-09-20')
  })

  it('без ручного интервала берётся медиана истории', () => {
    const events = [
      event('2026-07-01'),
      event('2026-07-11'),
      event('2026-07-21'),
      event('2026-07-31'),
    ]
    const state = cycleState(item(), events, '2026-09-07')
    expect(state.interval).toBe(10)
    expect(state.intervalSource).toBe('median')
    expect(state.next).toBe('2026-08-10')
    expect(state.status).toBe('overdue')
  })

  it('двух интервалов мало: срок не выводится, статус «срок не задан»', () => {
    const events = [event('2026-08-01'), event('2026-08-11'), event('2026-08-21')]
    const state = cycleState(item(), events, '2026-09-07')
    expect(state.marks).toBe(3)
    expect(state.interval).toBeNull()
    expect(state.intervalSource).toBeNull()
    expect(state.status).toBe('unset')
    expect(state.next).toBeNull()
  })

  it('ручной интервал работает и с одной отметкой — срок назвал человек', () => {
    const state = cycleState(item({ intervalDays: 30 }), [event('2026-08-01')], '2026-09-07')
    expect(state.interval).toBe(30)
    expect(state.intervalSource).toBe('manual')
    expect(state.status).toBe('overdue')
  })

  it('порог — три интервала', () => {
    expect(MIN_INTERVALS).toBe(3)
  })

  it('нулевой и отрицательный интервал считаются не заданными', () => {
    expect(cycleState(item({ intervalDays: 0 }), [event('2026-09-01')], '2026-09-07').status).toBe(
      'unset',
    )
    expect(cycleState(item({ intervalDays: -5 }), [event('2026-09-01')], '2026-09-07').interval)
      .toBeNull()
  })

  it('чужие события в расчёт не идут', () => {
    const events = [event('2026-08-01'), event('2026-09-06', { itemId: 'другой' })]
    const state = cycleState(item({ intervalDays: 30 }), events, '2026-09-07')
    expect(state.last).toBe('2026-08-01')
    expect(state.daysSince).toBe(37)
  })

  it('отметка, датированная вперёд, даёт отрицательный возраст и статус «в норме»', () => {
    const state = cycleState(item({ intervalDays: 10 }), [event('2026-09-20')], '2026-09-07')
    expect(state.daysSince).toBe(-13)
    expect(state.status).toBe('ok')
  })
})

describe('срочность', () => {
  const overdue = cycleState(
    item({ id: 'a', name: 'Просрочено', intervalDays: 10 }),
    [event('2026-08-01', { itemId: 'a' })],
    '2026-09-07',
  )
  const overdueMore = cycleState(
    item({ id: 'b', name: 'Просрочено сильнее', intervalDays: 5 }),
    [event('2026-08-01', { itemId: 'b' })],
    '2026-09-07',
  )
  const due = cycleState(
    item({ id: 'c', name: 'Подходит', intervalDays: 40 }),
    [event('2026-08-01', { itemId: 'c' })],
    '2026-09-07',
  )
  const never = cycleState(item({ id: 'd', name: 'Нет записей', intervalDays: 10 }), [], '2026-09-07')

  it('порядок: просроченное, подходящее, потом позиции без расчёта', () => {
    const sorted = sortByUrgency([never, due, overdue, overdueMore])
    expect(sorted.map((state) => state.item.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('внутри статуса сильнее просроченное идёт выше', () => {
    expect(compareUrgency(overdueMore, overdue)).toBeLessThan(0)
  })

  it('при равной срочности сортирует по названию', () => {
    const first = cycleState(item({ id: 'x', name: 'Бритьё', intervalDays: 10 }), [], '2026-09-07')
    const second = cycleState(item({ id: 'y', name: 'Айва', intervalDays: 10 }), [], '2026-09-07')
    expect(compareUrgency(first, second)).toBeGreaterThan(0)
  })

  it('сортировка не трогает исходный массив', () => {
    const source = [never, overdue]
    sortByUrgency(source)
    expect(source.map((state) => state.item.id)).toEqual(['d', 'a'])
  })
})

describe('cycleStates', () => {
  it('пропускает архивные и удалённые позиции', () => {
    const items = [
      item({ id: 'a', name: 'Живая', intervalDays: 10 }),
      item({ id: 'b', name: 'Архивная', intervalDays: 10, archived: true }),
      item({ id: 'c', name: 'Удалённая', intervalDays: 10, deleted: true }),
    ]
    const states = cycleStates(items, [event('2026-08-01', { itemId: 'a' })], '2026-09-07')
    expect(states.map((state) => state.item.id)).toEqual(['a'])
  })
})

describe('groupByCategory', () => {
  const state = (id: string, name: string, cat: string) =>
    cycleState(item({ id, name, cat, intervalDays: 10 }), [], '2026-09-07')

  it('группы идут в заданном порядке, незнакомые категории — в конец', () => {
    const groups = groupByCategory(
      [
        state('a', 'Пылесос', 'Дом'),
        state('b', 'Стрижка', 'Гигиена'),
        state('c', 'Грядки', 'Огород'),
      ],
      ['Гигиена', 'Дом', 'Техника'],
    )
    expect(groups.map((group) => group.cat)).toEqual(['Гигиена', 'Дом', 'Огород'])
  })

  it('внутри категории порядок по срочности', () => {
    const overdue = cycleState(
      item({ id: 'x', name: 'Просрочено', cat: 'Дом', intervalDays: 5 }),
      [event('2026-08-01', { itemId: 'x' })],
      '2026-09-07',
    )
    const groups = groupByCategory([state('a', 'Спокойное', 'Дом'), overdue], ['Дом'])
    expect(groups[0]?.units.flatMap((unit) => unit.states.map((each) => each.item.id))).toEqual([
      'x',
      'a',
    ])
  })

  it('пустой вход — пустой выход', () => {
    expect(groupByCategory([])).toEqual([])
  })
})

describe('расхождение «как надо» и «как есть» (Р-29)', () => {
  // Четыре отметки раз в 30 дней при ручном интервале 90.
  const events = [
    event('2026-06-01'),
    event('2026-07-01'),
    event('2026-07-31'),
    event('2026-08-30'),
  ]

  it('ручной интервал остаётся действующим, медиана его не подменяет', () => {
    const state = cycleState(item({ intervalDays: 90 }), events, '2026-09-07')
    expect(state.interval).toBe(90)
    expect(state.intervalSource).toBe('manual')
  })

  it('но история считается рядом и доступна', () => {
    const state = cycleState(item({ intervalDays: 90 }), events, '2026-09-07')
    expect(state.byHistory).toBe(30)
  })

  it('без ручного интервала действует история, byHistory тот же', () => {
    const state = cycleState(item(), events, '2026-09-07')
    expect(state.interval).toBe(30)
    expect(state.intervalSource).toBe('median')
    expect(state.byHistory).toBe(30)
  })

  it('пока отметок мало, истории нет даже при ручном интервале', () => {
    const state = cycleState(item({ intervalDays: 90 }), [event('2026-08-01')], '2026-09-07')
    expect(state.byHistory).toBeNull()
  })
})

describe('кусты внутри категории (Р-30)', () => {
  const at = (id: string, name: string, group?: string, intervalDays: number | null = 10) =>
    cycleState(
      item({ id, name, cat: 'Дом', intervalDays, ...(group === undefined ? {} : { group }) }),
      [],
      '2026-09-07',
    )

  it('позиции с одной группой собираются вместе', () => {
    const units = unitsOf([
      at('a', 'Три стадии', 'Барьер Эксперт'),
      at('b', 'Пылесос'),
      at('c', 'Вторая стадия', 'Барьер Эксперт'),
    ])
    expect(units).toHaveLength(2)
    expect(units.find((unit) => unit.group === 'Барьер Эксперт')?.states).toHaveLength(2)
    expect(units.find((unit) => unit.group === null)?.states[0]?.item.name).toBe('Пылесос')
  })

  it('куст встаёт по своей самой срочной позиции, а не в конец', () => {
    const overdue = cycleState(
      item({ id: 'z', name: 'Картридж', cat: 'Дом', group: 'Барьер Эксперт', intervalDays: 5 }),
      [event('2026-08-01', { itemId: 'z' })],
      '2026-09-07',
    )
    const units = unitsOf([at('a', 'Спокойное'), overdue, at('b', 'Второй картридж', 'Барьер Эксперт')])
    expect(units[0]?.group).toBe('Барьер Эксперт')
  })

  it('пустая и пробельная группа — это отсутствие группы', () => {
    const units = unitsOf([at('a', 'Раз', ''), at('b', 'Два', '   ')])
    expect(units.every((unit) => unit.group === null)).toBe(true)
    expect(units).toHaveLength(2)
  })

  it('группа из одной позиции остаётся группой', () => {
    const units = unitsOf([at('a', 'Одинокий картридж', 'Барьер Эксперт')])
    expect(units[0]?.group).toBe('Барьер Эксперт')
  })
})

describe('knownGroups', () => {
  it('собирает заведённые кусты без повторов и пустых', () => {
    expect(
      knownGroups([{ group: 'Зарядки' }, { group: 'Барьер' }, { group: 'Зарядки' }, {}, { group: ' ' }]),
    ).toEqual(['Барьер', 'Зарядки'])
  })
})

/**
 * Траты. Сумма всегда идёт вместе с числом отметок, из которых сложена, —
 * это и есть уточнение к Р-36, ради которого расчёт устроен так.
 */
describe('траты', () => {
  function costItem(id: string, over: Partial<CycleItem> = {}): CycleItem {
    return {
      id,
      updatedAt: '2026-09-07T00:00:00.000Z',
      name: id,
      cat: 'Гигиена',
      intervalDays: null,
      ...over,
    }
  }

  function costEvent(itemId: string, date: string, price?: number): CycleEvent {
    return {
      id: `${itemId}-${date}`,
      updatedAt: '2026-09-07T00:00:00.000Z',
      itemId,
      date,
      ...(price === undefined ? {} : { price }),
    }
  }

  describe('spent', () => {
    it('складывает цены и считает, из скольких отметок сумма сложена', () => {
      const value = spent([costEvent('i1', '2026-01-01', 700), costEvent('i1', '2026-03-01', 800)])
      expect(value).toEqual({ sum: 1500, priced: 2, marks: 2 })
    })

    it('отметки без цены попадают в marks, но не в сумму', () => {
      // Ради этого числа всё и затевалось: «6 118 ₽ за 4 отметки из 33» —
      // правда, а те же 6 118 ₽ без «из 33» — вранье о полноте.
      const value = spent([costEvent('i1', '2026-01-01', 700), costEvent('i1', '2026-03-01')])
      expect(value).toEqual({ sum: 700, priced: 1, marks: 2 })
    })

    it('ноль — годная цена: замена по гарантии стоила нисколько', () => {
      expect(spent([costEvent('i1', '2026-01-01', 0)])).toEqual({ sum: 0, priced: 1, marks: 1 })
    })

    it('отрицательная и нечисловая отбрасываются, но отметку не теряют', () => {
      const broken = { ...costEvent('i1', '2026-01-01'), price: -100 }
      const alien = { ...costEvent('i1', '2026-02-01'), price: 'дорого' as unknown as number }
      expect(spent([broken, alien, costEvent('i1', '2026-03-01', 500)])).toEqual({
        sum: 500,
        priced: 1,
        marks: 3,
      })
    })

    it('удалённые не считаются вовсе', () => {
      const gone = { ...costEvent('i1', '2026-01-01', 700), deleted: true }
      expect(spent([gone, costEvent('i1', '2026-02-01', 300)])).toEqual({
        sum: 300,
        priced: 1,
        marks: 1,
      })
    })

    it('копейки складываются без хвоста двоичной дроби', () => {
      const value = spent([costEvent('i1', '2026-01-01', 0.1), costEvent('i1', '2026-02-01', 0.2)])
      expect(value.sum).toBe(0.3)
    })

    it('пустой список — нули', () => {
      expect(spent([])).toEqual({ sum: 0, priced: 0, marks: 0 })
    })
  })

  describe('spendTree', () => {
    const items = [
      costItem('b1', { name: 'Три стадии', cat: 'Дом', group: 'Барьер Эксперт' }),
      costItem('b2', { name: 'Вторая стадия', cat: 'Дом', group: 'Барьер Эксперт' }),
      costItem('h1', { name: 'Стрижка', cat: 'Гигиена' }),
      costItem('p1', { name: 'Педикюр', cat: 'Гигиена' }),
    ]
    const events = [
      costEvent('b1', '2026-02-01', 2500),
      costEvent('b2', '2026-03-01', 1089),
      costEvent('h1', '2026-04-01', 700),
      costEvent('h1', '2026-05-01'),
      costEvent('p1', '2026-06-01'),
    ]
    const order = ['Гигиена', 'Дом']

    it('складывает по кусту — вопрос «сколько стоит фильтр» осмыслен там', () => {
      const dom = spendTree(items, events, order).find((cat) => cat.cat === 'Дом')

      expect(dom?.spent).toEqual({ sum: 3589, priced: 2, marks: 2 })
      expect(dom?.units).toHaveLength(1)
      expect(dom?.units[0]?.group).toBe('Барьер Эксперт')
      expect(dom?.units[0]?.items.map((each) => each.item.id)).toEqual(['b1', 'b2'])
    })

    it('одиночные позиции не сливаются в общий куст', () => {
      const hygiene = spendTree(items, events, order).find((cat) => cat.cat === 'Гигиена')

      expect(hygiene?.units.every((unit) => unit.group === null)).toBe(true)
      expect(hygiene?.units).toHaveLength(1)
    })

    it('позиция без единой цены в список не попадает, но в знаменатель входит', () => {
      const hygiene = spendTree(items, events, order).find((cat) => cat.cat === 'Гигиена')

      // Педикюр отмечен, но цена не проставлена ни разу: показывать нечего,
      // а знаменатель он увеличивает — 700 ₽ за 1 отметку из 3.
      expect(hygiene?.spent).toEqual({ sum: 700, priced: 1, marks: 3 })
      expect(hygiene?.units.flatMap((unit) => unit.items).map((each) => each.item.id)).toEqual([
        'h1',
      ])
    })

    it('категория без цен не показывается вовсе', () => {
      expect(spendTree([costItem('x1', { cat: 'Авто' })], [costEvent('x1', '2026-01-01')])).toEqual(
        [],
      )
    })

    it('порядок категорий задаётся снаружи', () => {
      expect(spendTree(items, events, order).map((cat) => cat.cat)).toEqual(['Гигиена', 'Дом'])
    })

    it('внутри категории сначала то, на что потрачено больше', () => {
      const tree = spendTree(
        [...items, costItem('h2', { name: 'Бритьё', cat: 'Гигиена' })],
        [...events, costEvent('h2', '2026-07-01', 5000)],
        order,
      )
      const hygiene = tree.find((cat) => cat.cat === 'Гигиена')

      expect(hygiene?.units.flatMap((unit) => unit.items).map((each) => each.item.id)).toEqual([
        'h2',
        'h1',
      ])
    })

    it('архивная позиция считается: деньги на неё потрачены', () => {
      const tree = spendTree(
        [costItem('a1', { cat: 'Техника', archived: true })],
        [costEvent('a1', '2026-01-01', 1829)],
      )
      expect(tree[0]?.spent.sum).toBe(1829)
    })

    it('удалённая позиция не считается', () => {
      const tree = spendTree(
        [costItem('d1', { cat: 'Техника', deleted: true })],
        [costEvent('d1', '2026-01-01', 1829)],
      )
      expect(tree).toEqual([])
    })

    it('итог сходится с суммой категорий', () => {
      expect(totalSpent(spendTree(items, events, order))).toEqual({
        sum: 4289,
        priced: 3,
        marks: 5,
      })
    })
  })
})

describe('быстрые кнопки — Р-49', () => {
  function template(over: Partial<Template> = {}): Template {
    return {
      id: 't1',
      updatedAt: '2026-09-07T00:00:00.000Z',
      label: '',
      kind: 'cycle',
      preset: { marks: [{ itemId: 'i1' }] },
      order: 0,
      ...over,
    }
  }

  describe('templateMarks', () => {
    it('разбирает заготовку и отбрасывает кривое поштучно, а не целиком', () => {
      const marks = templateMarks({
        marks: [
          { itemId: 'a', price: 700 },
          { itemId: '' },
          null,
          'b',
          { itemId: 'b', price: -5 },
          { itemId: 'c', price: 'много' },
          { itemId: 'd', price: 0 },
        ],
      })
      expect(marks).toEqual([
        { itemId: 'a', price: 700 },
        { itemId: 'b' },
        { itemId: 'c' },
        { itemId: 'd', price: 0 },
      ])
    })

    it('повтор позиции схлопывается, первая цена побеждает', () => {
      const marks = templateMarks({ marks: [{ itemId: 'a', price: 1 }, { itemId: 'a', price: 2 }] })
      expect(marks).toEqual([{ itemId: 'a', price: 1 }])
    })

    it('заготовка без списка отметок — пустая кнопка, а не исключение', () => {
      expect(templateMarks({})).toEqual([])
      expect(templateMarks({ marks: 'a' })).toEqual([])
    })

    it('сходится с cyclePreset туда и обратно', () => {
      const marks = [{ itemId: 'a', price: 2500 }, { itemId: 'b' }]
      expect(templateMarks(cyclePreset(marks))).toEqual(marks)
    })
  })

  it('cycleTemplates: только живые шаблоны циклов и по порядку', () => {
    const list = cycleTemplates([
      template({ id: 't3', order: 2 }),
      template({ id: 't1', order: 0 }),
      template({ id: 't2', order: 1, deleted: true }),
      template({ id: 't4', order: 0, kind: 'session' }),
    ])
    expect(list.map((each) => each.id)).toEqual(['t1', 't3'])
  })

  it('nextOrder: в конец ряда, в пустом ряду — ноль', () => {
    expect(nextOrder([])).toBe(0)
    expect(nextOrder([template({ order: 0 }), template({ order: 4 })])).toBe(5)
  })

  describe('templateState', () => {
    const filter = item({ id: 'f1', name: 'Барьер 3 стадии' })
    const second = item({ id: 'f2', name: 'Барьер 2 стадия' })
    const both = template({
      preset: cyclePreset([{ itemId: 'f1', price: 2500 }, { itemId: 'f2' }]),
    })

    it('отмечено сегодня — только когда отмечены все позиции кнопки', () => {
      const one = [event('2026-09-10', { itemId: 'f1' })]
      expect(templateState(both, [filter, second], one, '2026-09-10').doneToday).toBe(false)

      const two = [...one, event('2026-09-10', { id: 'x', itemId: 'f2' })]
      expect(templateState(both, [filter, second], two, '2026-09-10').doneToday).toBe(true)
    })

    it('вчерашняя и удалённая отметки сегодняшними не считаются', () => {
      const events = [
        event('2026-09-09', { itemId: 'f1' }),
        event('2026-09-10', { id: 'x', itemId: 'f2', deleted: true }),
      ]
      expect(templateState(both, [filter, second], events, '2026-09-10').doneToday).toBe(false)
    })

    it('цена из заготовки доезжает до позиции, отсутствующая — null', () => {
      const state = templateState(both, [filter, second], [], '2026-09-10')
      expect(state.marks.map((mark) => [mark.item.id, mark.price])).toEqual([
        ['f1', 2500],
        ['f2', null],
      ])
    })

    it('удалённая позиция выпадает из кнопки', () => {
      const state = templateState(both, [filter, { ...second, deleted: true }], [], '2026-09-10')
      expect(state.marks.map((mark) => mark.item.id)).toEqual(['f1'])
    })

    it('кнопка без живых позиций не считается отмеченной', () => {
      const state = templateState(both, [], [], '2026-09-10')
      expect(state.marks).toEqual([])
      expect(state.doneToday).toBe(false)
    })
  })

  it('lastPrice: по дате отметки, удалённые и без цены пропускаются', () => {
    const events = [
      event('2026-03-01', { price: 600 }),
      event('2026-07-01', { price: 700 }),
      event('2026-08-01'),
      event('2026-09-01', { price: 900, deleted: true }),
      event('2026-09-02', { price: 1000, itemId: 'other' }),
    ]
    expect(lastPrice(events, 'i1')).toBe(700)
    expect(lastPrice([event('2026-01-01')], 'i1')).toBeNull()
  })
})
