/**
 * Логика здоровья: длительности, промежутки, частота, ряды измерений.
 *
 * Чистые функции. Ни React, ни `db` — на вход массивы записей, на выход
 * числа. Модуль знает только про свои три сущности из `core/model.ts`
 * и ничего про экраны (Р-24).
 *
 * Главное отличие от циклов: там события повторяются и вопрос «когда
 * следующий раз», здесь события длятся и вопрос «как часто и как долго».
 * Общего расчёта у них нет, и сводить их в одну механику незачем.
 */

import { daysBetween, isDateStr, today, type DateStr } from '../../core/dates.ts'
import type { Episode, Measure, Session } from '../../core/model.ts'

// ─── Эпизоды ───────────────────────────────────────────────────────────────

export type EpisodeState = {
  episode: Episode
  /** Открыт — то есть болею прямо сейчас. */
  open: boolean
  /**
   * Длительность в днях, начало и конец включительно: заболел и выздоровел
   * в один день — это один день, а не ноль. У открытого считается по
   * сегодняшний день. Null — начало нечитаемо.
   */
  durationDays: number | null
}

/** Живые эпизоды: без надгробий и с разбираемым началом. */
function liveEpisodes(episodes: Episode[]): Episode[] {
  return episodes.filter((episode) => !episode.deleted)
}

/** Конец эпизода, если он есть и читается. */
function endOf(episode: Episode): DateStr | null {
  return episode.end !== null && isDateStr(episode.end) ? episode.end : null
}

export function episodeState(episode: Episode, now: DateStr = today()): EpisodeState {
  const open = episode.end === null
  if (!isDateStr(episode.start)) return { episode, open, durationDays: null }

  const finish = endOf(episode) ?? now
  // Открытый эпизод, начатый «завтра», дал бы отрицательную длительность.
  // Такое бывает от опечатки в дате, и ноль здесь честнее минуса.
  const span = daysBetween(episode.start, finish) + 1
  return { episode, open, durationDays: Math.max(span, 0) }
}

/**
 * Эпизоды новыми сверху. Открытые идут первыми при любой дате начала:
 * «болею сейчас» — это то, ради чего экран открывают.
 */
export function episodeStates(episodes: Episode[], now: DateStr = today()): EpisodeState[] {
  return liveEpisodes(episodes)
    .map((episode) => episodeState(episode, now))
    .sort((a, b) => {
      if (a.open !== b.open) return a.open ? -1 : 1
      return b.episode.start.localeCompare(a.episode.start)
    })
}

/** Только открытые — для главного экрана. */
export function openEpisodes(episodes: Episode[], now: DateStr = today()): EpisodeState[] {
  return episodeStates(episodes, now).filter((state) => state.open)
}

// ─── Аналитика эпизодов ────────────────────────────────────────────────────

export type Period = { from?: DateStr; to?: DateStr }

/**
 * Эпизод относится к периоду по дате начала.
 *
 * Не по пересечению: эпизод, начавшийся в декабре и закончившийся в январе,
 * считается один раз и в том году, когда заболел. Иначе он попал бы в оба
 * года и сумма по годам перестала бы сходиться с общим числом.
 */
function inPeriod(episode: Episode, period: Period): boolean {
  if (!isDateStr(episode.start)) return false
  if (period.from !== undefined && episode.start < period.from) return false
  if (period.to !== undefined && episode.start > period.to) return false
  return true
}

export type SymptomCount = { tagId: string; count: number }

export type HealthStats = {
  /** Сколько эпизодов началось за период. */
  count: number
  /** Сколько из них закрыто. Длительности считаются только по ним. */
  closed: number
  /** Средняя длительность закрытых, дней. Null — закрытых нет. */
  averageDays: number | null
  medianDays: number | null
  longestDays: number | null
  /**
   * Промежутки здоровья: от конца одного эпизода до начала следующего.
   *
   * Только между эпизодами. Время после последнего эпизода сюда не входит
   * и войти не может: промежуток нечем закрыть, следующего эпизода нет.
   * Для него есть `healthyDays` — без него год без болезней не был бы
   * виден на экране вовсе.
   */
  gaps: number[]
  /** Средний промежуток между эпизодами. Null — их меньше двух. */
  averageGap: number | null
  /**
   * Сколько дней прошло с последнего выздоровления.
   *
   * Null, если болеешь прямо сейчас или ни один эпизод не закрыт: «не болел
   * столько-то» в этих случаях либо неправда, либо не из чего считать.
   */
  healthyDays: number | null
  /** Дата последнего выздоровления — та, от которой считается `healthyDays`. */
  healthySince: DateStr | null
  /** Сколько эпизодов началось в каждом месяце. Двенадцать чисел с января. */
  byMonth: number[]
  /** Симптомы по убыванию частоты, при равенстве — по id для устойчивости. */
  symptoms: SymptomCount[]
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const hi = sorted[mid]
  if (hi === undefined) return null
  if (sorted.length % 2 === 1) return hi
  const lo = sorted[mid - 1]
  return lo === undefined ? hi : (lo + hi) / 2
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((all, value) => all + value, 0)
  // Десятая доля дня — предел осмысленного: «болел 4.7 дня» читается,
  // «4.7142857 дня» — нет.
  return Math.round((sum / values.length) * 10) / 10
}

/**
 * Всё, что можно сказать про эпизоды за период.
 *
 * Одной функцией, а не пятью: экран показывает эти числа вместе, а считать
 * их по отдельности значит пять раз пройти один и тот же список.
 */
export function healthStats(
  episodes: Episode[],
  period: Period = {},
  now: DateStr = today(),
): HealthStats {
  const taken = liveEpisodes(episodes)
    .filter((episode) => inPeriod(episode, period))
    .sort((a, b) => a.start.localeCompare(b.start))

  const durations: number[] = []
  const byMonth = Array.from({ length: 12 }, () => 0)
  const symptoms = new Map<string, number>()

  for (const episode of taken) {
    const month = Number(episode.start.slice(5, 7))
    // Месяц вне 1..12 сюда не попадёт: `inPeriod` пропускает только
    // разбираемые даты, — но индекс всё равно проверяется.
    if (month >= 1 && month <= 12) byMonth[month - 1] = (byMonth[month - 1] ?? 0) + 1

    if (endOf(episode) !== null) {
      const state = episodeState(episode, now)
      if (state.durationDays !== null) durations.push(state.durationDays)
    }

    for (const tagId of episode.symptoms) {
      symptoms.set(tagId, (symptoms.get(tagId) ?? 0) + 1)
    }
  }

  // Промежуток здоровья — от конца одного эпизода до начала следующего.
  // Наложение (следующий начался раньше, чем кончился прошлый) даёт ноль:
  // болеть двумя вещами разом можно, а отрицательного здоровья не бывает.
  const gaps: number[] = []
  for (let i = 1; i < taken.length; i++) {
    const previous = taken[i - 1]
    const next = taken[i]
    if (!previous || !next) continue
    const finish = endOf(previous)
    if (finish === null) continue
    gaps.push(Math.max(daysBetween(finish, next.start), 0))
  }

  // Сколько дней здоровья идёт прямо сейчас. Считается от самого позднего
  // конца, а не от конца последнего начавшегося: эпизоды могут накладываться,
  // и более ранний по началу иногда кончается позже.
  const ends = taken.map(endOf).filter((end): end is DateStr => end !== null)
  const anyOpen = taken.some((episode) => episode.end === null)
  const healthySince = anyOpen || ends.length === 0 ? null : ends.sort().at(-1) ?? null

  return {
    count: taken.length,
    closed: durations.length,
    averageDays: average(durations),
    medianDays: median(durations),
    longestDays: durations.length === 0 ? null : Math.max(...durations),
    gaps,
    averageGap: average(gaps),
    healthyDays: healthySince === null ? null : Math.max(daysBetween(healthySince, now), 0),
    healthySince,
    byMonth,
    symptoms: [...symptoms.entries()]
      .map(([tagId, count]) => ({ tagId, count }))
      .sort((a, b) => b.count - a.count || a.tagId.localeCompare(b.tagId)),
  }
}

// ─── Измерения ─────────────────────────────────────────────────────────────

export type Point = {
  date: DateStr
  value: number
  /** Второе значение: диастолическое давление. */
  value2?: number
}

export type Series = {
  metric: string
  /** Точки по возрастанию даты. Повтор за один день — последняя правка. */
  points: Point[]
  min: number
  max: number
  first: Point
  last: Point
  /** Насколько ушло от первой точки к последней. */
  delta: number
}

/** Какие метрики вообще заведены. Для выбора на экране. */
export function metricsOf(measures: Measure[]): string[] {
  const names = new Set<string>()
  for (const measure of measures) {
    if (!measure.deleted && measure.metric.trim()) names.add(measure.metric)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
}

/**
 * Ряд одной метрики.
 *
 * Два измерения за один день схлопываются в одно — побеждает то, которое
 * правили позже. Взвешиваться дважды за день нормально, но на графике это
 * вертикальный отрезок, а в дельте — шум.
 *
 * Null, когда точек нет вовсе: пустой ряд нечем рисовать, и вызывающему
 * нужно показать не пустой график, а объяснение.
 */
export function series(measures: Measure[], metric: string): Series | null {
  const byDay = new Map<DateStr, Measure>()

  for (const measure of measures) {
    if (measure.deleted || measure.metric !== metric) continue
    if (!isDateStr(measure.date) || !Number.isFinite(measure.value)) continue
    const kept = byDay.get(measure.date)
    if (!kept || measure.updatedAt > kept.updatedAt) byDay.set(measure.date, measure)
  }

  const points: Point[] = [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((measure) => ({
      date: measure.date,
      value: measure.value,
      ...(measure.value2 === undefined ? {} : { value2: measure.value2 }),
    }))

  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return null

  const values = points.map((point) => point.value)
  return {
    metric,
    points,
    min: Math.min(...values),
    max: Math.max(...values),
    first,
    last,
    delta: Math.round((last.value - first.value) * 100) / 100,
  }
}

// ─── Тренировки ────────────────────────────────────────────────────────────

export type ActivityTotal = {
  /** Id тега активности. */
  activity: string
  sessions: number
  minutes: number
  km: number
}

function positive(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Тренировки по видам, чаще сверху.
 *
 * Длительность и дистанция необязательны в модели: пробежка бывает без
 * секундомера, а зарядка без километров. Отсутствующее считается нулём,
 * но сама тренировка в счёт идёт — иначе выйдет, что её не было.
 */
export function activityTotals(sessions: Session[], period: Period = {}): ActivityTotal[] {
  const totals = new Map<string, ActivityTotal>()

  for (const session of sessions) {
    if (session.deleted || !isDateStr(session.date)) continue
    if (period.from !== undefined && session.date < period.from) continue
    if (period.to !== undefined && session.date > period.to) continue

    const current = totals.get(session.activity) ?? {
      activity: session.activity,
      sessions: 0,
      minutes: 0,
      km: 0,
    }
    current.sessions += 1
    current.minutes += positive(session.durationMin)
    current.km = Math.round((current.km + positive(session.distanceKm)) * 100) / 100
    totals.set(session.activity, current)
  }

  return [...totals.values()].sort(
    (a, b) => b.sessions - a.sessions || a.activity.localeCompare(b.activity),
  )
}

// ─── Теги симптомов ────────────────────────────────────────────────────────

/**
 * Симптомы в порядке «недавно использованные первыми».
 *
 * Это замена шаблонам быстрого ввода (Р-39): у болезней симптомы повторяются,
 * и то, чем болел в прошлый раз, почти всегда есть в списке. Порядок по
 * алфавиту заставлял бы искать «горло» между «головной болью» и «жаром»
 * при каждом вводе.
 *
 * Ни разу не использованные идут следом по алфавиту — они не мусор,
 * их просто ещё не с чем сравнивать.
 */
export function recentSymptoms(episodes: Episode[], tagIds: string[]): string[] {
  const lastUsed = new Map<string, string>()

  for (const episode of liveEpisodes(episodes)) {
    for (const tagId of episode.symptoms) {
      const known = lastUsed.get(tagId)
      if (known === undefined || episode.start > known) lastUsed.set(tagId, episode.start)
    }
  }

  return [...tagIds].sort((a, b) => {
    const usedA = lastUsed.get(a)
    const usedB = lastUsed.get(b)
    if (usedA !== undefined && usedB !== undefined) return usedB.localeCompare(usedA)
    if (usedA !== undefined) return -1
    if (usedB !== undefined) return 1
    return 0
  })
}
