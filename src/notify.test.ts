import { describe, expect, it } from 'vitest'
import { DAY_KEYS, REMINDER_TAG } from './shared/notify.ts'
import type { ContentEntry } from './app/model.ts'
import {
  CONTENT_EVERY_DAYS,
  CONTENT_KEYS,
  contentDue,
  contentTopic,
  ILLNESS_KEYS,
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

describe('просмотренное без оценки — в той же теме и ту же неделю', () => {
  const unrated: ContentEntry = {
    id: 'u1',
    updatedAt: '2026-09-10T10:00:00.000Z',
    type: 'film',
    title: 'Дюна',
    start: '2026-09',
    end: null,
    status: 'done',
    score: null,
  }
  const stale = { entry: { ...unrated, id: 's1', title: 'Шогун', status: 'active' as const }, days: 100 }

  it('день включения — свой ключ устройства', () => {
    expect(UNRATED_SINCE_KEY).toBe('reminderUnratedSince')
  })

  it('без оценки одно — тема срабатывает, когда неделя прошла', () => {
    expect(contentTopic([], [unrated], {}, '2026-09-11')?.body).toBe('Без оценки — 1: Дюна. Поставь оценку')
    expect(contentTopic([], [unrated], { loud: '2026-09-04' }, '2026-09-11')).not.toBeNull()
  })

  it('неделя общая: спросили о зависшем — о без оценки молчит до конца недели', () => {
    expect(contentTopic([], [unrated], { loud: '2026-09-05' }, '2026-09-11')).toBeNull()
    expect(contentTopic([], [unrated], { quiet: '2026-09-06' }, '2026-09-11')).toBeNull()
    expect(contentTopic([stale], [unrated], { loud: '2026-09-05' }, '2026-09-11')).toBeNull()
  })

  it('не о чем — молчит и в срок', () => {
    expect(contentTopic([], [], {}, '2026-09-11')).toBeNull()
  })
})
