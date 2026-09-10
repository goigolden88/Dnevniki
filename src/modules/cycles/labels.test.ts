import { describe, expect, it } from 'vitest'
import { cyclePreset, cycleState, templateState } from './cycles.ts'
import type { CycleEvent, CycleItem, Template } from '../../core/model.ts'
import {
  divergence,
  formatMoney,
  parsePrice,
  spentText,
  statusText,
  templateButtonText,
  templateLabel,
} from './labels.ts'

function item(over: Partial<CycleItem> = {}): CycleItem {
  return {
    id: 'i1',
    updatedAt: '2026-09-07T00:00:00.000Z',
    name: 'Щётка',
    cat: 'Гигиена',
    intervalDays: null,
    ...over,
  }
}

function event(date: string): CycleEvent {
  return { id: `e${date}`, updatedAt: '2026-09-07T00:00:00.000Z', itemId: 'i1', date }
}

const monthly = [event('2026-06-01'), event('2026-07-01'), event('2026-07-31'), event('2026-08-30')]

describe('divergence', () => {
  it('считает, во сколько раз факт расходится с задуманным', () => {
    const gap = divergence(cycleState(item({ intervalDays: 90 }), monthly, '2026-09-07'))
    expect(gap).toEqual({ manual: 90, history: 30, times: 3 })
  })

  it('молчит, когда интервал не задан руками', () => {
    expect(divergence(cycleState(item(), monthly, '2026-09-07'))).toBeNull()
  })

  it('молчит, когда истории ещё не хватает', () => {
    expect(
      divergence(cycleState(item({ intervalDays: 90 }), [event('2026-08-01')], '2026-09-07')),
    ).toBeNull()
  })

  it('молчит при совпадении день в день', () => {
    expect(divergence(cycleState(item({ intervalDays: 30 }), monthly, '2026-09-07'))).toBeNull()
  })
})

describe('statusText', () => {
  it('различает «нет срока» и «мало отметок» — причины разные', () => {
    const one = cycleState(item(), [event('2026-08-01')], '2026-09-07')
    const three = cycleState(item(), monthly.slice(0, 3), '2026-09-07')
    expect(statusText(one)).toBe('срок не задан')
    expect(statusText(three)).toBe('мало отметок')
  })
})

/** Неразрывный пробел из `formatMoney`. Записан кодом, чтобы не спутать
 *  его в исходнике теста с обычным. */
const NBSP = '\u00A0'

describe('parsePrice', () => {
  it('берёт обычное число', () => {
    expect(parsePrice('700')).toBe(700)
  })

  it('терпит пробелы, запятую и знак рубля — цену вводят так, как в чеке', () => {
    expect(parsePrice('1 829')).toBe(1829)
    expect(parsePrice('1829,50')).toBe(1829.5)
    expect(parsePrice('700 ₽')).toBe(700)
    expect(parsePrice('700 руб.')).toBe(700)
  })

  it('пустое поле — это «цены нет», а не ошибка', () => {
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('   ')).toBeNull()
  })

  it('мусор и отрицательное отвергает, а не превращает в ноль', () => {
    expect(parsePrice('дорого')).toBeNull()
    expect(parsePrice('-100')).toBeNull()
    expect(parsePrice('12abc')).toBeNull()
  })

  it('ноль принимает: замена по гарантии — тоже факт', () => {
    expect(parsePrice('0')).toBe(0)
  })

  it('копейки округляет до двух знаков', () => {
    expect(parsePrice('10,555')).toBe(10.56)
  })
})

describe('formatMoney', () => {
  it('разделяет разряды неразрывным пробелом', () => {
    expect(formatMoney(6118)).toBe(`6${NBSP}118${NBSP}₽`)
    expect(formatMoney(700)).toBe(`700${NBSP}₽`)
    expect(formatMoney(1234567)).toBe(`1${NBSP}234${NBSP}567${NBSP}₽`)
  })

  it('копейки показывает только когда они есть', () => {
    expect(formatMoney(1829)).toBe(`1${NBSP}829${NBSP}₽`)
    expect(formatMoney(1829.5)).toBe(`1${NBSP}829,50${NBSP}₽`)
    expect(formatMoney(0)).toBe(`0${NBSP}₽`)
  })
})

describe('spentText', () => {
  it('называет число отметок и склоняет его', () => {
    expect(spentText({ sum: 700, priced: 1, marks: 1 })).toBe(`700${NBSP}₽ за 1 отметку`)
    expect(spentText({ sum: 2800, priced: 4, marks: 4 })).toBe(`2${NBSP}800${NBSP}₽ за 4 отметки`)
    expect(spentText({ sum: 3500, priced: 5, marks: 5 })).toBe(`3${NBSP}500${NBSP}₽ за 5 отметок`)
  })

  it('говорит «из скольких», когда цена проставлена не везде', () => {
    expect(spentText({ sum: 6118, priced: 4, marks: 33 })).toBe(
      `6${NBSP}118${NBSP}₽ за 4 отметки из 33`,
    )
  })

  it('молчит, когда цен нет ни одной: «0 ₽ за 0 отметок» ничего не сообщает', () => {
    expect(spentText({ sum: 0, priced: 0, marks: 12 })).toBe('')
  })
})

describe('быстрые кнопки — Р-49', () => {
  const cut = item({ id: 'c1', name: 'Стрижка' })
  const filter = item({ id: 'f1', name: 'Барьер 3 стадии' })
  const second = item({ id: 'f2', name: 'Барьер 2 стадия' })

  function template(marks: { itemId: string; price?: number }[], label = ''): Template {
    return {
      id: 't1',
      updatedAt: '2026-09-07T00:00:00.000Z',
      label,
      kind: 'cycle',
      preset: cyclePreset(marks),
      order: 0,
    }
  }

  const state = (t: Template) => templateState(t, [cut, filter, second], [], '2026-09-10')

  it('без своего названия кнопка называется позициями через плюс', () => {
    const both = state(template([{ itemId: 'f1' }, { itemId: 'f2' }]))
    expect(templateLabel(both)).toBe('Барьер 3 стадии + Барьер 2 стадия')
  })

  it('своё название побеждает, пробелы по краям не в счёт', () => {
    const both = state(template([{ itemId: 'f1' }, { itemId: 'f2' }], '  Барьер целиком '))
    expect(templateLabel(both)).toBe('Барьер целиком')
    expect(templateLabel(state(template([{ itemId: 'c1' }], '   ')))).toBe('Стрижка')
  })

  it('цена на кнопке — только у одиночной позиции и только если она есть', () => {
    expect(templateButtonText(state(template([{ itemId: 'c1', price: 700 }])))).toBe(
      `Стрижка · ${formatMoney(700)}`,
    )
    expect(templateButtonText(state(template([{ itemId: 'c1' }])))).toBe('Стрижка')
    expect(
      templateButtonText(state(template([{ itemId: 'f1', price: 2500 }, { itemId: 'f2', price: 1089 }]))),
    ).toBe('Барьер 3 стадии + Барьер 2 стадия')
  })
})
