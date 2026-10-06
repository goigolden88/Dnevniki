import { describe, expect, it } from 'vitest'
import { DAY_KEYS, REMINDER_TAG } from './shared/notify.ts'
import type { ContentEntry } from './app/model.ts'
import {
  CONTENT_EVERY_DAYS,
  CONTENT_KEYS,
  contentDue,
  contentReminder,
  ILLNESS_KEYS,
  lastAsked,
  LEGACY_REMINDER_TAG,
  UNRATED_SINCE_KEY,
} from './notify.ts'

// Механика напоминаний и её тесты — ядра (`shared/notify.test.ts`, Р-82):
// окно со звуком, пробуждение, журнал. Здесь — имена, которые лежат
// на устройствах «Дневников», и своё правило «раз в неделю».
describe('имена напоминаний на устройствах — не меняются никогда', () => {
  it('фоновая проверка — ядра; прежнее имя снимается при включении — Р-85', () => {
    expect(REMINDER_TAG).toBe('remind')
    expect(LEGACY_REMINDER_TAG).toBe('overdue')
  })

  it('дни просроченного — прежние ключи, они же ядра — Р-50, Р-57', () => {
    expect(DAY_KEYS).toEqual({ loud: 'reminderLastDay', quiet: 'reminderQuietDay' })
  })

  it('дни болезни и «Ещё смотришь?» — свои; громкий «Ещё смотришь?» — прежний ключ — Р-85', () => {
    expect(ILLNESS_KEYS).toEqual({ loud: 'reminderIllnessDay', quiet: 'reminderIllnessQuietDay' })
    expect(CONTENT_KEYS).toEqual({ loud: 'reminderContentDay', quiet: 'reminderContentQuietDay' })
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

describe('без оценки — в теме «Ещё смотришь?», неделя общая — Р-95', () => {
  const DAY = '2026-10-12'
  const unrated: ContentEntry = {
    id: 'u1',
    updatedAt: '2026-10-10T12:00:00.000Z',
    type: 'film',
    title: 'Дюна',
    start: '2026-10',
    end: null,
    status: 'done',
    score: null,
  }
  const stale: ContentEntry = {
    ...unrated,
    id: 's1',
    title: 'Забытый сериал',
    status: 'active',
    start: '2026-01',
    updatedAt: '2026-01-10T12:00:00.000Z',
  }

  it('ключ дня включения не меняется никогда', () => {
    expect(UNRATED_SINCE_KEY).toBe('reminderUnratedSince')
  })

  it('свежее без оценки будит тему, неделя та же, что у зависшего', () => {
    expect(contentReminder([unrated], DAY, '2026-10-01', null)?.body).toBe('Без оценки — 1: Дюна. Поставь оценку')
    expect(contentReminder([unrated], DAY, '2026-10-01', '2026-10-06')).toBeNull()
    expect(contentReminder([unrated], DAY, '2026-10-01', '2026-10-05')).not.toBeNull()
    expect(contentReminder([stale], DAY, '2026-10-01', '2026-10-06')).toBeNull()
  })

  it('без оценки до дня включения — не будит', () => {
    expect(contentReminder([unrated], DAY, '2026-10-11', null)).toBeNull()
  })

  it('обе части — одним уведомлением', () => {
    const notice = contentReminder([stale, unrated], DAY, '2026-10-01', null)
    expect(notice?.title).toBe('Ещё смотришь?')
    expect(notice?.body).toContain('Забытый сериал')
    expect(notice?.body).toContain('Без оценки — 1: Дюна')
  })

  it('день прошлого вопроса — поздний из громкого и тихого', () => {
    expect(lastAsked('2026-10-01', '2026-10-06')).toBe('2026-10-06')
    expect(lastAsked(undefined, undefined)).toBeNull()
  })
})
