import { describe, expect, it } from 'vitest'
import { buildSummary, checkSummary, type Metric, type NameList, type PeriodSummary } from './shared/core/summary.ts'
import { dayRandom, KEYS, OWN_UNKNOWN, summary, WATCHING_LIMIT, type SummaryData } from './summary.ts'
import { SUGGEST_COUNT, watching } from './modules/content/content.ts'
import type { ContentEntry, CycleEvent, CycleItem, Episode, Session, Tag } from './app/model.ts'

/**
 * Срез итогов (Р-91). Проверка формы — `checkSummary` ядра, та же, что
 * у прохода синхронизации и у читателя; здесь — на своих данных.
 */

const T = '2026-09-20T10:00:00.000Z'
// Пятница. Недели: 14–20 и 21–27 сентября; месяцы: август и сентябрь.
const DAY = '2026-09-25'

function empty(): SummaryData {
  return {
    items: [],
    categories: [],
    tags: [],
    templates: [],
    cycleEvents: [],
    episodes: [],
    measures: [],
    sessions: [],
    content: [],
  }
}

/** Слово «секрет» — во всём, что в срез не идёт никогда (Я-14, Я-19 «FamilyCore»). */
function filled(): SummaryData {
  const symptom: Tag = { id: 'tag-s', updatedAt: T, name: 'симптом-секрет', scope: 'symptom' }
  const activity: Tag = { id: 'tag-a', updatedAt: T, name: 'вид-секрет', scope: 'activity' }
  const episodes: Episode[] = [
    {
      id: 'ep-open',
      updatedAt: T,
      title: 'болезнь-секрет',
      source: 'doctor',
      start: '2026-09-18',
      end: null,
      symptoms: [symptom.id],
      note: 'заметка-секрет',
    },
    { id: 'ep-closed', updatedAt: T, title: 'ещё-секрет', source: 'self', start: '2026-09-10', end: '2026-09-15', symptoms: [] },
  ]
  const sessions: Session[] = [
    { id: 's1', updatedAt: T, activity: activity.id, date: '2026-09-22', durationMin: 30, distanceKm: 5, note: 'трен-секрет' },
    { id: 's2', updatedAt: T, activity: activity.id, date: '2026-09-23' },
    { id: 's3', updatedAt: T, activity: activity.id, date: '2026-09-15' },
  ]
  // Название записи контента в срез идёт — в списках (Р-94); оригинальное
  // название и комментарий — никогда.
  const content: ContentEntry[] = [
    { id: 'c1', updatedAt: T, type: 'film', title: 'Фильм', titleOrig: 'ориг-секрет', start: '2026-09', end: null, status: 'done', score: 8, comment: 'коммент-секрет' },
    { id: 'c2', updatedAt: T, type: 'game', title: 'Игра', start: '2026-09-22', end: null, status: 'dropped', score: null },
    // Начато в мае и не тронуто с мая — зависло: с 31 мая больше 90 дней.
    { id: 'c3', updatedAt: '2026-05-10T10:00:00.000Z', type: 'anime', title: 'Аниме', titleOrig: 'ориг-секрет', start: '2026-05', end: null, status: 'active', score: null, comment: 'коммент-секрет' },
    { id: 'c4', updatedAt: T, type: 'series', title: 'Сериал', titleOrig: 'ориг-секрет', start: null, end: null, status: 'planned', score: null, comment: 'коммент-секрет' },
  ]
  const item: CycleItem = { id: 'item-1', updatedAt: T, name: 'позиция-секрет', cat: 'Дом', intervalDays: 30, note: 'позиция-заметка-секрет' }
  const events: CycleEvent[] = [{ id: 'ev-1', updatedAt: T, itemId: item.id, date: '2026-08-01', price: 1234, note: 'отметка-секрет' }]
  return { ...empty(), tags: [symptom, activity], episodes, sessions, content, items: [item], cycleEvents: events }
}

function metricsOf(period: PeriodSummary | undefined): Metric[] {
  if (!period || !Array.isArray(period.metrics)) throw new Error('у отрезка нет показателей')
  return period.metrics
}

function metric(period: PeriodSummary | undefined, key: string): Metric {
  const found = metricsOf(period).find((each) => each.key === key)
  if (!found) throw new Error(`нет показателя ${key}`)
  return found
}

describe('срез итогов — Р-91', () => {
  it('форма сходится с договором и на пустых, и на заполненных данных', () => {
    for (const data of [empty(), filled()]) {
      expect(() => checkSummary(buildSummary(summary(data, DAY), data, DAY))).not.toThrow()
    }
  })

  it('четыре отрезка ядра; идущие верны по день расчёта, прошедшие — закончились', () => {
    const { periods } = summary(empty(), DAY)
    expect(periods.map(({ grain, from, to, through }) => [grain, from, to, through])).toEqual([
      ['week', '2026-09-14', '2026-09-20', null],
      ['week', '2026-09-21', '2026-09-27', DAY],
      ['month', '2026-08-01', '2026-08-31', null],
      ['month', '2026-09-01', '2026-09-30', DAY],
    ])
  })

  it('ключи постоянные: у недель — со счётом «день не записан», у месяцев — без', () => {
    const { periods } = summary(filled(), DAY)
    const always = [
      KEYS.illnessDays,
      KEYS.illnessEpisodes,
      KEYS.trainingCount,
      KEYS.trainingMinutes,
      KEYS.trainingKm,
      KEYS.contentStarted,
      KEYS.contentDone,
      KEYS.contentDropped,
    ]
    expect(metricsOf(periods[0]).map((each) => each.key)).toEqual([...always, KEYS.contentMonthOnly])
    expect(metricsOf(periods[2]).map((each) => each.key)).toEqual(always)
  })

  it('ничего не известно из названий, заметок, симптомов, комментариев и цен', () => {
    const data = filled()
    const text = JSON.stringify(buildSummary(summary(data, DAY), data, DAY))
    expect(text).not.toMatch(/секрет/)
    expect(text).not.toContain('1234')
    expect(text).not.toContain('tag-')
  })

  it('болезнь: дни по пересечению, наложения склеены, незакрытый — по день расчёта', () => {
    const { periods } = summary(filled(), DAY)
    // Прошлая неделя: закрытый 14–15, незакрытый 18–20.
    expect(metric(periods[0], KEYS.illnessDays).value).toEqual({ n: 5, unit: 'days' })
    expect(metric(periods[0], KEYS.illnessEpisodes).value).toEqual({ n: 2, unit: 'count' })
    expect(metric(periods[0], KEYS.illnessEpisodes).basis).toContain('начались в нём — 1')
    expect(metric(periods[0], KEYS.illnessDays).basis).toBe(
      'По 2 эпизодам в отрезке; день с двумя эпизодами — один день; незакрытый — болезнь по день расчёта',
    )
    // Идущая: незакрытый 21–25, дальше дня расчёта не идёт.
    expect(metric(periods[1], KEYS.illnessDays).value).toEqual({ n: 5, unit: 'days' })
    // Сентябрь: 10–15 и 18–25.
    expect(metric(periods[3], KEYS.illnessDays).value).toEqual({ n: 14, unit: 'days' })
    // Август: эпизодов нет — ноль по записям, а не «не известно» (Р-88).
    expect(metric(periods[2], KEYS.illnessDays).value).toEqual({ n: 0, unit: 'days' })
  })

  it('тренировки: сумма с основанием; ни у одной нет длительности — «не известно», не ноль', () => {
    const { periods } = summary(filled(), DAY)
    const current = periods[1]
    expect(metric(current, KEYS.trainingCount).value).toEqual({ n: 2, unit: 'count' })
    expect(metric(current, KEYS.trainingMinutes).value).toEqual({ n: 30, unit: 'minutes' })
    expect(metric(current, KEYS.trainingMinutes).basis).toBe(
      'Длительность указана у 1 из 2 тренировок; без неё — не в сумме',
    )
    expect(metric(current, KEYS.trainingKm).value).toEqual({ n: 5, unit: 'km' })

    const past = periods[0]
    expect(metric(past, KEYS.trainingMinutes).value).toEqual({
      unknown: OWN_UNKNOWN.noDuration,
      text: 'Длительность у тренировки не указана',
    })
    expect(metric(past, KEYS.trainingKm).value).toMatchObject({ unknown: OWN_UNKNOWN.noDistance })

    // Тренировок нет вовсе — ноль с основанием.
    expect(metric(periods[2], KEYS.trainingMinutes).value).toEqual({ n: 0, unit: 'minutes' })
  })

  it('контент: месячная дата в неделю не кладётся, в месяц — точно', () => {
    const { periods } = summary(filled(), DAY)
    const week = periods[1]
    expect(metric(week, KEYS.contentStarted).value).toEqual({ n: 1, unit: 'count' })
    expect(metric(week, KEYS.contentDropped).value).toEqual({ n: 1, unit: 'count' })
    expect(metric(week, KEYS.contentMonthOnly).value).toEqual({ n: 1, unit: 'count' })
    expect(metric(week, KEYS.contentStarted).basis).toContain('строкой «день не записан»')
    expect(metric(week, KEYS.contentDropped).basis).toBe(
      'Нынешний статус «брошено» у 1 начатого в отрезке, а не дата окончания',
    )

    const september = periods[3]
    expect(metric(september, KEYS.contentStarted).value).toEqual({ n: 2, unit: 'count' })
    expect(metric(september, KEYS.contentDone).value).toEqual({ n: 1, unit: 'count' })
  })

  it('«требует внимания» — из записей: болезнь не закрыта, просрочено, зависло', () => {
    const { attention } = summary(filled(), DAY)
    expect(attention.map(({ key, count, day, link }) => ({ key, count, day, link }))).toEqual([
      { key: KEYS.illnessOpen, count: 1, day: '2026-09-18', link: '/episode/ep-open' },
      { key: KEYS.cyclesOverdue, count: 1, day: DAY, link: '/' },
      { key: KEYS.contentStale, count: 1, day: DAY, link: '/content' },
    ])
  })

  it('нечего звать — пунктов нет; несколько незакрытых — день самого раннего, ссылка на «Здоровье»', () => {
    expect(summary(empty(), DAY).attention).toEqual([])

    const data = filled()
    data.episodes.push({ ...data.episodes[0]!, id: 'ep-early', start: '2026-09-02' })
    const illness = summary(data, DAY).attention.find((each) => each.key === KEYS.illnessOpen)
    expect(illness).toMatchObject({ count: 2, day: '2026-09-02', link: '/health' })
  })
})

describe('списки названий — Р-94', () => {
  function entry(id: string, status: ContentEntry['status'], start: string | null = null): ContentEntry {
    return { id, updatedAt: T, type: 'film', title: `Название ${id}`, start, end: null, status, score: null }
  }

  function planned(count: number): ContentEntry[] {
    return Array.from({ length: count }, (_, i) => entry(`p${String(i).padStart(2, '0')}`, 'planned'))
  }

  function list(data: SummaryData, key: string, day = DAY): NameList {
    const found = summary(data, day).lists?.find((each) => each.key === key)
    if (!found) throw new Error(`нет списка ${key}`)
    return found
  }

  it('«смотрю» и три случайных; форма сходится с договором', () => {
    const data = filled()
    const body = summary(data, DAY)
    expect(() => checkSummary(buildSummary(body, data, DAY))).not.toThrow()
    expect(body.lists?.map(({ key, names, link }) => ({ key, names, link }))).toEqual([
      { key: KEYS.contentWatching, names: ['Аниме'], link: '/content' },
      { key: KEYS.contentSuggest, names: ['Сериал'], link: '/content' },
    ])
  })

  it('в названиях — только title: без оригинального, комментария, оценки и дат', () => {
    const data = filled()
    const text = JSON.stringify(summary(data, DAY).lists)
    expect(text).not.toMatch(/ориг|коммент|секрет/)
    expect(text).not.toContain('2026-05')
  })

  it('«смотрю» — порядок главного экрана; больше предела — первые и «ещё» в основании', () => {
    const data = empty()
    data.content = Array.from({ length: WATCHING_LIMIT + 4 }, (_, i) =>
      entry(`a${String(i).padStart(2, '0')}`, 'active', `2026-09-${String(i + 1).padStart(2, '0')}`),
    )
    const result = list(data, KEYS.contentWatching)
    expect(result.names).toEqual(watching(data.content).slice(0, WATCHING_LIMIT).map((each) => each.title))
    expect(result.names[0]).toBe(`Название a${WATCHING_LIMIT + 3}`)
    expect(result.basis).toBe(
      `Первые ${WATCHING_LIMIT} из ${WATCHING_LIMIT + 4} в «смотрю», как на главном экране; ещё 4 не вошли`,
    )
  })

  it('тот же день — те же три; порядок входа не влияет', () => {
    const data = empty()
    data.content = planned(20)
    const first = list(data, KEYS.contentSuggest)
    expect(first.names).toHaveLength(SUGGEST_COUNT)
    expect(new Set(first.names).size).toBe(SUGGEST_COUNT)
    expect(list(data, KEYS.contentSuggest)).toEqual(first)

    const reversed = { ...data, content: [...data.content].reverse() }
    expect(list(reversed, KEYS.contentSuggest)).toEqual(first)
    expect(first.basis).toBe(`${SUGGEST_COUNT} из 20 в «к просмотру»; набор меняется со днём расчёта`)
  })

  it('другой день — набор может смениться', () => {
    const data = empty()
    data.content = planned(20)
    const sets = new Set(
      ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'].map((day) =>
        list(data, KEYS.contentSuggest, day).names.join('|'),
      ),
    )
    expect(sets.size).toBeGreaterThan(1)
  })

  it('меньше трёх — все; удалённые и не «к просмотру» не берутся', () => {
    const data = empty()
    data.content = [...planned(2), { ...entry('gone', 'planned'), deleted: true }, entry('x', 'done')]
    const result = list(data, KEYS.contentSuggest)
    expect([...result.names].sort()).toEqual(['Название p00', 'Название p01'])
    expect(result.basis).toBe('2 из 2 в «к просмотру»; набор меняется со днём расчёта')
  })

  it('пустые списки — пустые names с основанием', () => {
    const data = empty()
    const body = summary(data, DAY)
    expect(() => checkSummary(buildSummary(body, data, DAY))).not.toThrow()
    expect(body.lists?.map(({ key, names, basis }) => ({ key, names, basis }))).toEqual([
      { key: KEYS.contentWatching, names: [], basis: 'В «смотрю» ничего нет' },
      { key: KEYS.contentSuggest, names: [], basis: 'Список «к просмотру» пуст' },
    ])
  })
})

describe('генератор от дня', () => {
  it('тот же день — та же последовательность, в [0, 1)', () => {
    const a = dayRandom('2026-09-25')
    const b = dayRandom('2026-09-25')
    const values = Array.from({ length: 50 }, () => a())
    expect(Array.from({ length: 50 }, () => b())).toEqual(values)
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(dayRandom('2026-09-26')()).not.toBe(values[0])
  })
})
