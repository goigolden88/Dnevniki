import { describe, expect, it } from 'vitest'
import { episodeState, recentSymptoms } from './health.ts'
import { episodeText, measureText, statsText, symptomNames, gapText } from './labels.ts'
import { healthStats } from './health.ts'
import type { Episode, Tag } from '../../core/model.ts'

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

function tag(id: string, name: string): Tag {
  return { id, updatedAt: T, name, scope: 'symptom' }
}

describe('episodeText', () => {
  it('у закрытого — сколько длился и когда', () => {
    expect(episodeText(episodeState(episode(), NOW))).toBe('5 дней · 01.09.2026 — 05.09.2026')
  })

  it('у открытого — какой день идёт: болезнь длится, и это главное про неё', () => {
    const state = episodeState(episode({ start: '2026-09-07', end: null }), NOW)
    expect(episodeText(state)).toBe('идёт 3-й день, с 07.09.2026')
  })

  it('первый день называет словом, а не «1-й»', () => {
    const state = episodeState(episode({ start: NOW, end: null }), NOW)
    expect(episodeText(state)).toBe('идёт первый день, с 09.09.2026')
  })

  it('нечитаемую дату показывает как есть, а не прячет', () => {
    const state = episodeState(episode({ start: 'когда-то' }), NOW)
    expect(episodeText(state)).toContain('когда-то')
  })
})

describe('symptomNames', () => {
  const tags = [tag('t1', 'горло'), tag('t2', 'жар')]

  it('переводит id в имена, сохраняя порядок', () => {
    expect(symptomNames(['t2', 't1'], tags)).toEqual(['жар', 'горло'])
  })

  it('незнакомый id не теряет место в списке', () => {
    // Тег мог приехать с другого устройства позже своего эпизода.
    expect(symptomNames(['t1', 'чужой'], tags)).toEqual(['горло', '?'])
  })
})

describe('measureText', () => {
  it('добавляет единицу измерения', () => {
    expect(measureText('weight', 75)).toBe('75 кг')
  })

  it('давление пишет дробью', () => {
    expect(measureText('bp', 120, 80)).toBe('120/80')
  })

  it('своя метрика идёт без единицы', () => {
    expect(measureText('пульс', 60)).toBe('60')
  })
})

describe('statsText и gapText', () => {
  const year = [
    episode({ id: 'a', start: '2026-01-05', end: '2026-01-09' }),
    episode({ id: 'b', start: '2026-02-20', end: '2026-02-21' }),
  ]

  it('называет число эпизодов и среднюю длительность', () => {
    expect(statsText(healthStats(year, {}, NOW))).toBe('2 эпизода · в среднем по 3,5 дня')
  })

  it('говорит, сколько из них закрыто, когда закрыты не все', () => {
    const withOpen = [...year, episode({ id: 'c', start: '2026-09-01', end: null })]
    expect(statsText(healthStats(withOpen, {}, NOW))).toContain('(закрыто 2)')
  })

  it('без закрытых эпизодов не выдумывает среднюю длительность', () => {
    const open = [episode({ start: '2026-09-01', end: null })]
    expect(statsText(healthStats(open, {}, NOW))).toBe('1 эпизод, ни один пока не закрыт')
  })

  it('молчит, когда эпизодов нет вовсе', () => {
    expect(statsText(healthStats([], {}, NOW))).toBe('')
    expect(gapText(healthStats([], {}, NOW))).toBe('')
  })

  it('промежуток здоровья — отдельная строка про другой вопрос', () => {
    expect(gapText(healthStats(year, {}, NOW))).toBe('Между эпизодами в среднем 42 дня без болезни')
  })
})

describe('recentSymptoms', () => {
  it('недавно использованные первыми — ими и болеешь чаще всего', () => {
    const episodes = [
      episode({ id: 'a', start: '2026-01-01', symptoms: ['горло'] }),
      episode({ id: 'b', start: '2026-08-01', symptoms: ['насморк'] }),
    ]
    expect(recentSymptoms(episodes, ['горло', 'насморк'])).toEqual(['насморк', 'горло'])
  })

  it('ни разу не использованные идут следом, а не теряются', () => {
    const episodes = [episode({ id: 'a', start: '2026-01-01', symptoms: ['горло'] })]
    expect(recentSymptoms(episodes, ['новый', 'горло'])).toEqual(['горло', 'новый'])
  })

  it('удалённый эпизод не двигает порядок', () => {
    const episodes = [
      episode({ id: 'a', start: '2026-01-01', symptoms: ['горло'] }),
      episode({ id: 'b', start: '2026-08-01', symptoms: ['жар'], deleted: true }),
    ]
    expect(recentSymptoms(episodes, ['горло', 'жар'])).toEqual(['горло', 'жар'])
  })
})
