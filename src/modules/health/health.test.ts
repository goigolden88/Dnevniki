import { describe, expect, it } from 'vitest'
import {
  activityTotals,
  episodeState,
  episodeStates,
  healthStats,
  metricsOf,
  openEpisodes,
  series,
} from './health.ts'
import type { Episode, Measure, Session } from '../../core/model.ts'

const T = '2026-09-07T00:00:00.000Z'
const NOW = '2026-09-09'

function episode(over: Partial<Episode> = {}): Episode {
  return {
    id: 'e1',
    updatedAt: T,
    title: 'ОРВИ',
    source: 'self',
    start: '2026-09-01',
    end: '2026-09-05',
    symptoms: [],
    ...over,
  }
}

function measure(over: Partial<Measure> = {}): Measure {
  return { id: 'm1', updatedAt: T, metric: 'weight', date: '2026-09-01', value: 75, ...over }
}

function session(over: Partial<Session> = {}): Session {
  return { id: 's1', updatedAt: T, activity: 'бег', date: '2026-09-01', ...over }
}

describe('episodeState', () => {
  it('считает длительность включительно: заболел и выздоровел в один день — это день', () => {
    const state = episodeState(episode({ start: '2026-09-01', end: '2026-09-01' }), NOW)
    expect(state.durationDays).toBe(1)
    expect(state.open).toBe(false)
  })

  it('пять дней болезни — это пять, а не четыре', () => {
    expect(episodeState(episode(), NOW).durationDays).toBe(5)
  })

  it('открытый эпизод считается по сегодня и продолжает расти', () => {
    const state = episodeState(episode({ start: '2026-09-07', end: null }), NOW)
    expect(state.open).toBe(true)
    expect(state.durationDays).toBe(3)
  })

  it('нечитаемое начало не роняет расчёт, а даёт null', () => {
    expect(episodeState(episode({ start: 'когда-то' }), NOW).durationDays).toBeNull()
  })

  it('начало в будущем даёт ноль, а не минус', () => {
    expect(episodeState(episode({ start: '2026-12-01', end: null }), NOW).durationDays).toBe(0)
  })
})

describe('episodeStates', () => {
  const list = [
    episode({ id: 'старый', start: '2026-01-01', end: '2026-01-10' }),
    episode({ id: 'открытый', start: '2026-02-01', end: null }),
    episode({ id: 'свежий', start: '2026-08-01', end: '2026-08-03' }),
  ]

  it('открытые первыми, даже если начались давно', () => {
    // «Болею сейчас» — то, ради чего экран открывают. Февральский
    // незакрытый эпизод важнее августовского вылеченного.
    expect(episodeStates(list, NOW).map((state) => state.episode.id)).toEqual([
      'открытый',
      'свежий',
      'старый',
    ])
  })

  it('удалённые не показываются', () => {
    const withGone = [...list, episode({ id: 'удалённый', deleted: true })]
    expect(episodeStates(withGone, NOW).map((state) => state.episode.id)).not.toContain('удалённый')
  })

  it('открытые отбираются отдельно', () => {
    expect(openEpisodes(list, NOW).map((state) => state.episode.id)).toEqual(['открытый'])
  })
})

describe('healthStats', () => {
  const year = [
    episode({ id: 'a', start: '2026-01-05', end: '2026-01-09', symptoms: ['горло', 'жар'] }),
    episode({ id: 'b', start: '2026-02-20', end: '2026-02-21', symptoms: ['горло'] }),
    episode({ id: 'c', start: '2026-09-01', end: null, symptoms: ['насморк'] }),
  ]

  it('считает эпизоды за период по дате начала', () => {
    const stats = healthStats(year, { from: '2026-01-01', to: '2026-12-31' }, NOW)
    expect(stats.count).toBe(3)
    expect(stats.closed).toBe(2)
  })

  it('эпизод, начавшийся до периода, в него не попадает', () => {
    const stats = healthStats(year, { from: '2026-03-01' }, NOW)
    expect(stats.count).toBe(1)
  })

  it('длительности считает только по закрытым', () => {
    // Открытый растёт каждый день, и средняя длительность вместе с ним
    // ползла бы вверх сама собой — это была бы не статистика, а часы.
    const stats = healthStats(year, {}, NOW)
    expect(stats.averageDays).toBe(3.5)
    expect(stats.medianDays).toBe(3.5)
    expect(stats.longestDays).toBe(5)
  })

  it('без закрытых эпизодов длительностей нет вовсе', () => {
    const stats = healthStats([episode({ end: null })], {}, NOW)
    expect(stats.averageDays).toBeNull()
    expect(stats.medianDays).toBeNull()
    expect(stats.longestDays).toBeNull()
  })

  it('промежуток здоровья — от конца одного до начала следующего', () => {
    const stats = healthStats(year, {}, NOW)
    expect(stats.gaps).toEqual([42, 192])
  })

  it('наложение эпизодов даёт ноль, а не отрицательный промежуток', () => {
    const overlap = [
      episode({ id: 'a', start: '2026-01-01', end: '2026-01-20' }),
      episode({ id: 'b', start: '2026-01-10', end: '2026-01-15' }),
    ]
    expect(healthStats(overlap, {}, NOW).gaps).toEqual([0])
  })

  it('открытый эпизод обрывает цепочку промежутков, а не считается нулём', () => {
    const stats = healthStats(
      [
        episode({ id: 'a', start: '2026-01-01', end: null }),
        episode({ id: 'b', start: '2026-03-01', end: '2026-03-05' }),
      ],
      {},
      NOW,
    )
    expect(stats.gaps).toEqual([])
    expect(stats.averageGap).toBeNull()
  })

  it('раскладывает по месяцам — двенадцать чисел с января', () => {
    const stats = healthStats(year, {}, NOW)
    expect(stats.byMonth).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0])
  })

  it('считает симптомы, частые сверху', () => {
    const stats = healthStats(year, {}, NOW)
    expect(stats.symptoms).toEqual([
      { tagId: 'горло', count: 2 },
      { tagId: 'жар', count: 1 },
      { tagId: 'насморк', count: 1 },
    ])
  })

  it('пустая история не роняет расчёт', () => {
    const stats = healthStats([], {}, NOW)
    expect(stats.count).toBe(0)
    expect(stats.byMonth).toHaveLength(12)
    expect(stats.symptoms).toEqual([])
  })
})

describe('series', () => {
  const weights = [
    measure({ id: 'm1', date: '2026-01-01', value: 80 }),
    measure({ id: 'm2', date: '2026-06-01', value: 77.5 }),
    measure({ id: 'm3', date: '2026-09-01', value: 75 }),
  ]

  it('выстраивает точки по возрастанию даты и считает края', () => {
    const row = series(weights, 'weight')
    expect(row?.points.map((point) => point.value)).toEqual([80, 77.5, 75])
    expect(row?.min).toBe(75)
    expect(row?.max).toBe(80)
    expect(row?.delta).toBe(-5)
  })

  it('чужую метрику не берёт', () => {
    const mixed = [...weights, measure({ id: 'bp', metric: 'bp', value: 120, value2: 80 })]
    expect(series(mixed, 'weight')?.points).toHaveLength(3)
    expect(series(mixed, 'bp')?.points[0]?.value2).toBe(80)
  })

  it('два измерения за день схлопываются в позднейшее по правке', () => {
    const twice = [
      measure({ id: 'утро', date: '2026-09-01', value: 75, updatedAt: '2026-09-01T07:00:00.000Z' }),
      measure({ id: 'вечер', date: '2026-09-01', value: 76, updatedAt: '2026-09-01T21:00:00.000Z' }),
    ]
    const row = series(twice, 'weight')
    expect(row?.points).toHaveLength(1)
    expect(row?.points[0]?.value).toBe(76)
  })

  it('удалённые и битые не участвуют', () => {
    const dirty = [
      ...weights,
      measure({ id: 'gone', date: '2026-10-01', value: 60, deleted: true }),
      measure({ id: 'bad', date: 'вчера', value: 60 }),
      measure({ id: 'nan', date: '2026-10-02', value: Number.NaN }),
    ]
    expect(series(dirty, 'weight')?.points).toHaveLength(3)
  })

  it('пустой ряд — null, а не график из нуля точек', () => {
    expect(series([], 'weight')).toBeNull()
  })

  it('перечисляет заведённые метрики', () => {
    const mixed = [...weights, measure({ id: 'bp', metric: 'bp', value: 120 })]
    expect(metricsOf(mixed)).toEqual(['bp', 'weight'])
  })
})

describe('activityTotals', () => {
  const list = [
    session({ id: 's1', activity: 'бег', date: '2026-09-01', durationMin: 30, distanceKm: 5 }),
    session({ id: 's2', activity: 'бег', date: '2026-09-03', durationMin: 40, distanceKm: 7.5 }),
    session({ id: 's3', activity: 'зарядка', date: '2026-09-02', durationMin: 15 }),
  ]

  it('складывает минуты и километры по видам, частые сверху', () => {
    expect(activityTotals(list)).toEqual([
      { activity: 'бег', sessions: 2, minutes: 70, km: 12.5 },
      { activity: 'зарядка', sessions: 1, minutes: 15, km: 0 },
    ])
  })

  it('тренировка без длительности и дистанции всё равно считается', () => {
    const totals = activityTotals([session({ activity: 'йога' })])
    expect(totals[0]).toEqual({ activity: 'йога', sessions: 1, minutes: 0, km: 0 })
  })

  it('период отсекает по дате', () => {
    expect(activityTotals(list, { from: '2026-09-02' })).toEqual([
      { activity: 'бег', sessions: 1, minutes: 40, km: 7.5 },
      { activity: 'зарядка', sessions: 1, minutes: 15, km: 0 },
    ])
  })

  it('удалённые и битые даты не считаются', () => {
    const dirty = [...list, session({ id: 'gone', deleted: true }), session({ id: 'bad', date: '?' })]
    expect(activityTotals(dirty)).toHaveLength(2)
  })
})
