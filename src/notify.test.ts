import { describe, expect, it } from 'vitest'
import {
  appendWake,
  CONTENT_EVERY_DAYS,
  contentDue,
  DEFAULT_WINDOW,
  inWindow,
  LOG_SIZE,
  parseWindow,
  planWake,
  type Wake,
} from './notify.ts'

describe('окно со звуком — Р-57', () => {
  it('по умолчанию 12–20', () => {
    expect(DEFAULT_WINDOW).toEqual({ from: 12, to: 20 })
  })

  it('начало включительно, конец исключительно', () => {
    const window = { from: 12, to: 20 }
    expect(inWindow(11, window)).toBe(false)
    expect(inWindow(12, window)).toBe(true)
    expect(inWindow(19, window)).toBe(true)
    expect(inWindow(20, window)).toBe(false)
  })

  it('окно через полночь', () => {
    const night = { from: 22, to: 8 }
    expect(inWindow(23, night)).toBe(true)
    expect(inWindow(3, night)).toBe(true)
    expect(inWindow(8, night)).toBe(false)
    expect(inWindow(12, night)).toBe(false)
  })

  it('равные концы — круглые сутки', () => {
    expect(inWindow(3, { from: 9, to: 9 })).toBe(true)
    expect(inWindow(15, { from: 9, to: 9 })).toBe(true)
  })

  it('кривое окно в настройках даёт умолчание, а не падение', () => {
    expect(parseWindow(undefined)).toEqual(DEFAULT_WINDOW)
    expect(parseWindow({ from: '9', to: 21 })).toEqual(DEFAULT_WINDOW)
    expect(parseWindow({ from: 24, to: 5 })).toEqual(DEFAULT_WINDOW)
    expect(parseWindow({ from: 9.5, to: 21 })).toEqual(DEFAULT_WINDOW)
    expect(parseWindow({ from: 9, to: 21 })).toEqual({ from: 9, to: 21 })
  })
})

describe('что делать при пробуждении — Р-57', () => {
  const base = { day: '2026-09-11', window: DEFAULT_WINDOW, loudDay: null, quietDay: null }

  it('в окне — со звуком', () => {
    expect(planWake({ ...base, hour: 14 })).toBe('loud')
  })

  it('ночью — без звука, а не никогда', () => {
    expect(planWake({ ...base, hour: 3 })).toBe('quiet')
  })

  it('второй раз за ночь не показывает', () => {
    expect(planWake({ ...base, hour: 5, quietDay: '2026-09-11' })).toBe('already')
  })

  it('днём после ночного тихого — повторяет со звуком', () => {
    expect(planWake({ ...base, hour: 13, quietDay: '2026-09-11' })).toBe('loud')
  })

  it('громкое сегодня уже было — молчит и в окне', () => {
    expect(planWake({ ...base, hour: 15, loudDay: '2026-09-11' })).toBe('already')
  })

  it('вчерашнее громкое сегодня не мешает', () => {
    expect(planWake({ ...base, hour: 15, loudDay: '2026-09-10' })).toBe('loud')
  })
})

describe('«Ещё смотришь?» не чаще раза в неделю — Р-58', () => {
  it('ни разу не спрашивали — пора', () => {
    expect(contentDue(null, '2026-09-11')).toBe(true)
  })

  it('через неделю — пора, раньше — нет', () => {
    expect(CONTENT_EVERY_DAYS).toBe(7)
    expect(contentDue('2026-09-04', '2026-09-11')).toBe(true)
    expect(contentDue('2026-09-05', '2026-09-11')).toBe(false)
  })

  it('в тот же день можно: ночное тихое повторяется днём со звуком целиком', () => {
    expect(contentDue('2026-09-11', '2026-09-11')).toBe(true)
  })
})

describe('журнал пробуждений — Р-57', () => {
  const wake = (at: string): Wake => ({ at, result: 'nothing' })

  it('новое пробуждение — первым', () => {
    const log = appendWake([wake('2026-09-10T03:00:00.000Z')], wake('2026-09-11T03:00:00.000Z'))
    expect(log.map((each) => each.at)).toEqual(['2026-09-11T03:00:00.000Z', '2026-09-10T03:00:00.000Z'])
  })

  it('помнит не больше LOG_SIZE', () => {
    const full = Array.from({ length: LOG_SIZE }, (_, index) => wake(`2026-08-${String(index + 1).padStart(2, '0')}T03:00:00.000Z`))
    const log = appendWake(full, wake('2026-09-11T03:00:00.000Z'))
    expect(log).toHaveLength(LOG_SIZE)
    expect(log[0]?.at).toBe('2026-09-11T03:00:00.000Z')
  })

  it('мусор в настройках не роняет журнал', () => {
    expect(appendWake('не массив', wake('2026-09-11T03:00:00.000Z'))).toHaveLength(1)
    const log = appendWake([{ at: 1 }, { at: 'x', result: 'чепуха' }, wake('2026-09-10T03:00:00.000Z')], wake('2026-09-11T03:00:00.000Z'))
    expect(log).toHaveLength(2)
  })
})
