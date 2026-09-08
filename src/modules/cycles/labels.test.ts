import { describe, expect, it } from 'vitest'
import { cycleState } from './cycles.ts'
import type { CycleEvent, CycleItem } from '../../core/model.ts'
import { divergence, statusText } from './labels.ts'

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
