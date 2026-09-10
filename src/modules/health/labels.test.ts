import { describe, expect, it } from 'vitest'
import { episodeState, recentSymptoms } from './health.ts'
import {
  episodeText,
  gapText,
  healthyText,
  illnessNotice,
  measureText,
  statsText,
  symptomNames,
} from './labels.ts'
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
    expect(gapText(healthStats(year, {}, NOW))).toBe(
      'Между эпизодами проходило в среднем 42 дня — по 1 промежутку',
    )
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

describe('healthyText', () => {
  it('называет полосу здоровья и дату, с которой она идёт', () => {
    const stats = healthStats([episode({ start: '2025-09-01', end: '2025-09-05' })], {}, NOW)
    expect(healthyText(stats)).toBe('Не болел 369 дней — с 05.09.2025')
  })

  it('в день выздоровления говорит об этом прямо', () => {
    const stats = healthStats([episode({ start: '2026-09-01', end: NOW })], {}, NOW)
    expect(healthyText(stats)).toBe('Выздоровел сегодня')
  })

  it('молчит, пока болеешь', () => {
    const stats = healthStats([episode({ start: '2026-09-01', end: null })], {}, NOW)
    expect(healthyText(stats)).toBe('')
  })
})

describe('gapText называет число промежутков', () => {
  it('среднее по двум наблюдениям сообщает, что их два', () => {
    const three = [
      episode({ id: 'a', start: '2026-01-05', end: '2026-01-09' }),
      episode({ id: 'b', start: '2026-02-20', end: '2026-02-21' }),
      episode({ id: 'c', start: '2026-04-01', end: '2026-04-03' }),
    ]
    expect(gapText(healthStats(three, {}, NOW))).toBe(
      'Между эпизодами проходило в среднем 40,5 дня — по 2 промежуткам',
    )
  })

  it('один промежуток склоняется правильно', () => {
    const two = [
      episode({ id: 'a', start: '2026-01-05', end: '2026-01-09' }),
      episode({ id: 'b', start: '2026-02-20', end: '2026-02-21' }),
    ]
    expect(gapText(healthStats(two, {}, NOW))).toContain('по 1 промежутку')
  })
})

describe('давление без нижнего числа — Р-56', () => {
  it('показывается с прочерком, а не голым числом', () => {
    expect(measureText('bp', 120)).toBe('120/—')
    expect(measureText('bp', 120, 80)).toBe('120/80')
  })

  it('у метрик с одним числом прочерка нет', () => {
    expect(measureText('weight', 75)).toBe('75 кг')
    expect(measureText('пульс', 60)).toBe('60')
  })
})

describe('illnessNotice — Р-54', () => {
  it('все эпизоды закрыты — напоминать не о чем', () => {
    expect(illnessNotice([])).toBeNull()
  })

  it('одна болезнь — названа с длительностью, тап ведёт к ней', () => {
    const open = episodeState(episode({ title: 'Поясница', start: '2026-09-04', end: null }), NOW)
    expect(illnessNotice([open])).toEqual({
      title: 'Всё ещё болеешь?',
      body: 'Поясница — 6-й день. Если уже здоров, отметь выздоровление.',
      target: '/episode/e1',
    })
  })

  it('заведённая сегодня — «первый день», а не «1-й день»', () => {
    const open = episodeState(episode({ start: NOW, end: null }), NOW)
    expect(illnessNotice([open])?.body).toBe('ОРВИ — первый день. Если уже здоров, отметь выздоровление.')
  })

  it('несколько — списком, тап ведёт на «Здоровье»', () => {
    const one = episodeState(episode({ id: 'a', title: 'ОРВИ', start: '2026-09-08', end: null }), NOW)
    const two = episodeState(episode({ id: 'b', title: 'Поясница', start: 'кривая', end: null }), NOW)
    expect(illnessNotice([one, two])).toEqual({
      title: 'Всё ещё болеешь?',
      body: 'ОРВИ — 2-й день\nПоясница — дата начала не читается\nЕсли уже здоров, отметь выздоровление.',
      target: '/health',
    })
  })
})
