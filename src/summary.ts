/**
 * Срез итогов «Дневников» для метаприложения семьи (Р-91; Я-16…Я-21, Я-26
 * «FamilyCore»).
 *
 * Итоги считают модули своими функциями (Я-11 «FamilyCore»): здесь они
 * только переложены в форму договора — показатель с ключом, подписью,
 * значением и основанием. Состав — таблица «Срез итогов» в 02-Архитектуре:
 * дни болезни и счёт эпизодов (Р-88), тренировки (Р-90), контент по
 * промежутку (Р-89); «требует внимания» — незакрытая болезнь, просроченное
 * в циклах, зависшее в «смотрю».
 *
 * Чего здесь нет никогда (Я-14, Я-19 «FamilyCore»): названий эпизодов,
 * симптомов, `note`, `comment`, названий позиций и записей контента.
 * Измерений и цен отметок — тоже: их не просит ни один потребитель.
 * Настроек устройства — дня прошлого «Ещё смотришь?» и окна напоминаний —
 * тоже: срез считается только из синхронизируемых записей (Я-16).
 *
 * Живёт рядом с `notify.ts`, а не в модуле: знает все три модуля.
 */

import { isDateStr, plural, type DateStr } from './shared/core/dates.ts'
import {
  summaryPeriods,
  type Attention,
  type Metric,
  type PeriodSummary,
  type SummaryBody,
  type SummaryPeriod,
} from './shared/core/summary.ts'
import type { StoreRecord, SyncedStore } from './app/model.ts'
import { contentInPeriod, STALE_AFTER_DAYS, staleWatching } from './modules/content/content.ts'
import { statusLabel, TYPES } from './modules/content/labels.ts'
import { cycleStates, MIN_INTERVALS } from './modules/cycles/cycles.ts'
import { illnessInPeriod, openEpisodes, trainingTotals } from './modules/health/health.ts'

/** Живые записи синхронизируемых хранилищ — то, что даёт срезу ядро. */
export type SummaryData = { [S in SyncedStore]: StoreRecord[S][] }

/** Свои причины «не известно» — сверх общих кодов ядра (Р-90). */
export const OWN_UNKNOWN = {
  /** Тренировки есть, но ни у одной не указана длительность. */
  noDuration: 'no-duration',
  /** Тренировки есть, но ни у одной не указана дистанция. */
  noDistance: 'no-distance',
} as const

// ─── Ключи (Р-91) ──────────────────────────────────────────────────────────

/**
 * Ключи строк. Постоянные: ни один не собирается из названий или id
 * записей, так что переименование и слияние тегов их не меняют. По ним
 * метаприложение ставит строки рядом (Я-17 «FamilyCore», «Цена», п. 3).
 */
export const KEYS = {
  illnessDays: 'illness.days',
  illnessEpisodes: 'illness.episodes',
  trainingCount: 'training.count',
  trainingMinutes: 'training.minutes',
  trainingKm: 'training.km',
  contentStarted: 'content.started',
  contentDone: 'content.done',
  contentDropped: 'content.dropped',
  /** Только у недель: календарный месяц месячную дату кладёт точно (Р-89). */
  contentMonthOnly: 'content.monthOnly',
  illnessOpen: 'illness.open',
  cyclesOverdue: 'cycles.overdue',
  contentStale: 'content.stale',
} as const

// ─── Слова ─────────────────────────────────────────────────────────────────

const EPISODES_DATIVE: [string, string, string] = ['эпизоду', 'эпизодам', 'эпизодам']
const EPISODES: [string, string, string] = ['эпизод', 'эпизода', 'эпизодов']
const TRAININGS_GENITIVE: [string, string, string] = ['тренировки', 'тренировок', 'тренировок']
const ENTRIES: [string, string, string] = ['запись', 'записи', 'записей']
const STARTED: [string, string, string] = ['начата', 'начаты', 'начаты']
const OF_STARTED: [string, string, string] = ['начатого', 'начатых', 'начатых']

/** «аниме, сериалов, фильмов…» — из списка типов, а не буквами (Р-65). */
const CONTENT_KINDS = TYPES.map((type) => type.forms[2]).join(', ')

// ─── Здоровье ──────────────────────────────────────────────────────────────

function illnessMetrics(data: SummaryData, period: SummaryPeriod, day: DateStr): Metric[] {
  const illness = illnessInPeriod(data.episodes, period, day)
  if (illness.episodes === 0) {
    const none = 'Эпизодов болезни в отрезке нет — по записям здоровья'
    return [
      { key: KEYS.illnessDays, label: 'Дни болезни', value: { n: 0, unit: 'days' }, basis: none },
      { key: KEYS.illnessEpisodes, label: 'Эпизоды болезни', value: { n: 0, unit: 'count' }, basis: none },
    ]
  }
  return [
    {
      key: KEYS.illnessDays,
      label: 'Дни болезни',
      value: { n: illness.days, unit: 'days' },
      basis: [
        `По ${illness.episodes} ${plural(illness.episodes, EPISODES_DATIVE)} в отрезке`,
        ...(illness.episodes > 1 ? ['день с двумя эпизодами — один день'] : []),
        ...(illness.open > 0 ? ['незакрытый — болезнь по день расчёта'] : []),
      ].join('; '),
    },
    {
      key: KEYS.illnessEpisodes,
      label: 'Эпизоды болезни',
      value: { n: illness.episodes, unit: 'count' },
      basis: `Шли в отрезке хотя бы день; из них начались в нём — ${illness.started}`,
    },
  ]
}

// ─── Тренировки ────────────────────────────────────────────────────────────

function trainingMetrics(data: SummaryData, period: SummaryPeriod): Metric[] {
  const totals = trainingTotals(data.sessions, period)
  const count: Metric = {
    key: KEYS.trainingCount,
    label: 'Тренировки',
    value: { n: totals.count, unit: 'count' },
    basis: totals.count === 0 ? 'Тренировок в отрезке нет — по записям' : 'Все виды, по записям тренировок',
  }
  if (totals.count === 0) {
    const none = 'Тренировок в отрезке нет — по записям'
    return [
      count,
      { key: KEYS.trainingMinutes, label: 'Тренировки: минуты', value: { n: 0, unit: 'minutes' }, basis: none },
      { key: KEYS.trainingKm, label: 'Тренировки: км', value: { n: 0, unit: 'km' }, basis: none },
    ]
  }

  const of = `из ${totals.count} ${plural(totals.count, TRAININGS_GENITIVE)}`
  const part = (known: number, what: string) =>
    known === 0
      ? 'По записям тренировок'
      : `${what} указана у ${known} ${of}` + (known < totals.count ? '; без неё — не в сумме' : '')
  const none = (what: string) =>
    totals.count === 1 ? `${what} у тренировки не указана` : `${what} не указана ни у одной ${of}`

  return [
    count,
    {
      key: KEYS.trainingMinutes,
      label: 'Тренировки: минуты',
      value:
        totals.withMinutes === 0
          ? { unknown: OWN_UNKNOWN.noDuration, text: none('Длительность') }
          : { n: totals.minutes, unit: 'minutes' },
      basis: part(totals.withMinutes, 'Длительность'),
    },
    {
      key: KEYS.trainingKm,
      label: 'Тренировки: км',
      value:
        totals.withKm === 0
          ? { unknown: OWN_UNKNOWN.noDistance, text: none('Дистанция') }
          : { n: totals.km, unit: 'km' },
      basis: part(totals.withKm, 'Дистанция'),
    },
  ]
}

// ─── Контент ───────────────────────────────────────────────────────────────

function contentMetrics(data: SummaryData, period: SummaryPeriod): Metric[] {
  const content = contentInPeriod(data.content, period)
  const week = period.grain === 'week'
  // У недели начатое месяцем — своей строкой; у месяца оно точно, и
  // «ещё N» возможно только у отрезка, который месяц не вмещает (Р-89).
  const rule = week
    ? 'по дню начала в неделе; начатые месяцем — строкой «день не записан»'
    : 'по дню или месяцу начала в отрезке'
  const outside =
    !week && content.monthOnly > 0
      ? `; ещё ${content.monthOnly} ${plural(content.monthOnly, ENTRIES)} ${plural(content.monthOnly, STARTED)} месяцем, ` +
        'который задевает отрезок, — не в счёте'
      : ''
  const ofStarted = (status: string) =>
    content.started === 0
      ? 'Начатого в отрезке нет'
      : `Нынешний статус «${status}» у ${content.started} ${plural(content.started, OF_STARTED)} в отрезке, ` +
        'а не дата окончания'

  const metrics: Metric[] = [
    {
      key: KEYS.contentStarted,
      label: 'Контент: начато',
      value: { n: content.started, unit: 'count' },
      basis: `Записи ${CONTENT_KINDS} — ${rule}${outside}`,
    },
    {
      key: KEYS.contentDone,
      label: `Контент: из начатого ${statusLabel('done')}`,
      value: { n: content.done, unit: 'count' },
      basis: ofStarted(statusLabel('done')),
    },
    {
      key: KEYS.contentDropped,
      label: `Контент: из начатого ${statusLabel('dropped')}`,
      value: { n: content.dropped, unit: 'count' },
      basis: ofStarted(statusLabel('dropped')),
    },
  ]
  if (week) {
    metrics.push({
      key: KEYS.contentMonthOnly,
      label: 'Контент: начато в месяце недели, день не записан',
      value: { n: content.monthOnly, unit: 'count' },
      basis:
        'Месяц начала задевает неделю, а дня нет: могли быть начаты в ней, могли — нет. ' +
        'В «начато» не входят',
    })
  }
  return metrics
}

// ─── Требует внимания ──────────────────────────────────────────────────────

function attention(data: SummaryData, day: DateStr): Attention[] {
  const items: Attention[] = []

  const open = openEpisodes(data.episodes, day)
  const first = open[0]
  if (first !== undefined) {
    // Нечитаемое начало — день расчёта: `day` обязан быть днём.
    const starts = open.map((state) => state.episode.start).filter(isDateStr)
    const earliest = starts.sort()[0] ?? day
    items.push({
      key: KEYS.illnessOpen,
      label: 'Болезнь не закрыта',
      count: open.length,
      day: earliest,
      link: open.length === 1 ? `/episode/${first.episode.id}` : '/health',
      basis:
        open.length === 1
          ? 'Эпизод без дня выздоровления; день — его начало'
          : `${open.length} ${plural(open.length, EPISODES)} без дня выздоровления; день — начало самого раннего`,
    })
  }

  const overdue = cycleStates(data.items, data.cycleEvents, day).filter((state) => state.status === 'overdue')
  if (overdue.length > 0) {
    items.push({
      key: KEYS.cyclesOverdue,
      label: 'Просрочено в циклах обслуживания',
      count: overdue.length,
      day,
      link: '/',
      basis:
        'Позиции, у которых с последней отметки прошёл срок — заданный руками или медиана ' +
        `по истории, когда в ней не меньше ${MIN_INTERVALS} промежутков; архивные не считаются. ` +
        'На день расчёта',
    })
  }

  const stale = staleWatching(data.content, day)
  if (stale.length > 0) {
    items.push({
      key: KEYS.contentStale,
      label: `Зависло в «${statusLabel('active')}»`,
      count: stale.length,
      day,
      link: '/content',
      basis:
        `В «${statusLabel('active')}» без начала и правок ${STALE_AFTER_DAYS} дней и дольше, на день расчёта. ` +
        'Когда приложение спрашивало «Ещё смотришь?», не учтено: это хранит устройство',
    })
  }

  return items
}

// ─── Срез ──────────────────────────────────────────────────────────────────

/**
 * Срез на день расчёта (Р-91): все четыре отрезка ядра, у каждого — здоровье,
 * тренировки и контент; идущий отрезок верен по день расчёта.
 */
export function summary(data: SummaryData, day: DateStr): SummaryBody {
  const periods: PeriodSummary[] = summaryPeriods(day).map((period) => ({
    ...period,
    through: day <= period.to ? day : null,
    metrics: [
      ...illnessMetrics(data, period, day),
      ...trainingMetrics(data, period),
      ...contentMetrics(data, period),
    ],
  }))
  return { periods, attention: attention(data, day) }
}
