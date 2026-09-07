/**
 * Логика циклов: интервалы, медиана, статус, срочность.
 *
 * Чистые функции. Ни React, ни `db` — на вход массивы, на выход числа.
 * Это самая ошибкоопасная часть модуля и единственная, которую можно
 * покрыть тестами по-настоящему.
 *
 * Пороги и правило медианы — Р-22. Они здесь константами в одном месте,
 * отдельного поля в позиции нет: порог общий на всё приложение.
 */

import type { CycleEvent, CycleItem } from './model.ts'
import { addDays, daysBetween, isDateStr, today, type DateStr } from './dates.ts'

/** Доля интервала, после которой позиция «подходит к сроку». Р-22. */
export const DUE_RATIO = 0.8

/**
 * Сколько последних интервалов участвует в медиане. Р-22.
 *
 * Скользящее окно, а не вся история: в гигиене отметки обрываются в мае,
 * и медиана по всей истории тянула бы расчёт к привычке полугодовой давности.
 */
export const MEDIAN_WINDOW = 5

/**
 * Пять статусов из 01-Проект.
 *
 * `never` — записей нет вообще, считать не из чего.
 * `unset` — записи есть, но интервал неизвестен: вручную не задан,
 * а на медиану не хватает истории (нужно хотя бы две отметки).
 */
export type CycleStatus = 'overdue' | 'due' | 'ok' | 'never' | 'unset'

/** Разброс интервалов позиции. Показывается на экране истории. */
export type Spread = {
  min: number
  max: number
  /** Тот же, что управляет статусом: по окну, а не по всей истории. */
  median: number
  /** Сколько интервалов посчитано — на единицу меньше числа отметок. */
  count: number
}

export type CycleState = {
  item: CycleItem
  status: CycleStatus
  /** Последняя отметка. */
  last: DateStr | null
  /** Дней с последней отметки. Отрицательное — отметка датирована вперёд. */
  daysSince: number | null
  /** Действующий интервал в днях. */
  interval: number | null
  /** Откуда взят интервал: задан руками или посчитан по истории. */
  intervalSource: 'manual' | 'median' | null
  /** Когда ожидается следующий раз. */
  next: DateStr | null
  /** Доля пройденного интервала: 1 — ровно срок, больше — перебор. Для полосы. */
  ratio: number | null
  /** Дней сверх срока. Ноль, если не просрочено. */
  overdueDays: number
  spread: Spread | null
}

/**
 * Даты отметок: живые, без мусора, без повторов, по возрастанию.
 *
 * Три вещи, которые здесь происходят, и почему:
 *
 * Мягко удалённые отбрасываются, хотя `db.getAll` их и так не отдаёт —
 * страховка на случай вызова с `includeDeleted`.
 *
 * Нечитаемые даты отбрасываются молча. После импорта из Obsidian одна
 * битая строка иначе роняла бы весь экран, а не одну позицию.
 *
 * Повторы в один день схлопываются: две отметки за день — это один раз,
 * а не интервал в ноль дней, который утащил бы медиану вниз.
 * Дубль в разные дни (блок питания, купленный дважды за 51 день) остаётся
 * как есть — это настоящие данные, и в разбросе он должен быть виден.
 */
export function markDates(events: CycleEvent[]): DateStr[] {
  const clean = events
    .filter((event) => !event.deleted && isDateStr(event.date))
    .map((event) => event.date)
  // `YYYY-MM-DD` сортируется лексикографически ровно как хронологически.
  return [...new Set(clean)].sort()
}

/** Промежутки между соседними отметками в днях. На входе — выход `markDates`. */
export function intervals(dates: DateStr[]): number[] {
  const result: number[] = []
  for (let i = 1; i < dates.length; i++) {
    const from = dates[i - 1]
    const to = dates[i]
    if (from === undefined || to === undefined) continue
    result.push(daysBetween(from, to))
  }
  return result
}

/** Медиана. Для чётной длины — среднее двух центральных, может быть дробной. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const hi = sorted[mid]
  if (hi === undefined) return null
  if (sorted.length % 2 === 1) return hi
  const lo = sorted[mid - 1]
  return lo === undefined ? hi : (lo + hi) / 2
}

/**
 * Медианный интервал по последним `MEDIAN_WINDOW` промежуткам.
 * Меньше — считается по всем имеющимся. Ни одного — null.
 *
 * Округляется до целого: интервал измеряется днями и задаёт дату,
 * а «4.5 дня» на экране — шум.
 */
export function medianInterval(dates: DateStr[], window = MEDIAN_WINDOW): number | null {
  const recent = intervals(dates).slice(-window)
  const value = median(recent)
  return value === null ? null : Math.round(value)
}

/** Разброс по всей истории, медиана — по окну. Null, если интервалов нет. */
export function spread(dates: DateStr[], window = MEDIAN_WINDOW): Spread | null {
  const all = intervals(dates)
  if (all.length === 0) return null
  const med = medianInterval(dates, window)
  if (med === null) return null
  return { min: Math.min(...all), max: Math.max(...all), median: med, count: all.length }
}

/**
 * Полное состояние позиции на дату `now`.
 *
 * События фильтруются по `item.id` внутри: так функцию нельзя случайно
 * позвать со всей таблицей событий и получить чужую медиану.
 */
export function cycleState(
  item: CycleItem,
  events: CycleEvent[],
  now: DateStr = today(),
): CycleState {
  const dates = markDates(events.filter((event) => event.itemId === item.id))
  const last = dates.at(-1) ?? null
  const daysSince = last === null ? null : daysBetween(last, now)

  // Ноль и отрицательные значения в `intervalDays` считаются не заданными:
  // интервал в ноль дней сделал бы позицию вечно просроченной.
  const manual = item.intervalDays !== null && item.intervalDays > 0 ? item.intervalDays : null
  const computed = manual === null ? medianInterval(dates) : null
  const interval = manual ?? computed
  const intervalSource = manual !== null ? 'manual' : computed !== null ? 'median' : null

  const next = last !== null && interval !== null ? addDays(last, interval) : null
  const ratio = daysSince !== null && interval !== null ? daysSince / interval : null

  let status: CycleStatus
  if (dates.length === 0) status = 'never'
  else if (ratio === null) status = 'unset'
  else if (ratio >= 1) status = 'overdue'
  else if (ratio >= DUE_RATIO) status = 'due'
  else status = 'ok'

  const overdueDays =
    status === 'overdue' && daysSince !== null && interval !== null ? daysSince - interval : 0

  return {
    item,
    status,
    last,
    daysSince,
    interval,
    intervalSource,
    next,
    ratio,
    overdueDays,
    spread: spread(dates),
  }
}

/**
 * Порядок статусов на экране «Сейчас».
 *
 * `never` и `unset` уходят вниз, хотя «нет записей» и выглядит требующим
 * внимания: у них нет вычислимой срочности, и наверху они вытесняли бы
 * реально просроченное.
 */
const STATUS_ORDER: Record<CycleStatus, number> = {
  overdue: 0,
  due: 1,
  ok: 2,
  never: 3,
  unset: 4,
}

/** Сначала просроченное, внутри статуса — по перебору, потом по названию. */
export function compareUrgency(a: CycleState, b: CycleState): number {
  const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (byStatus !== 0) return byStatus
  const byRatio = (b.ratio ?? -Infinity) - (a.ratio ?? -Infinity)
  if (byRatio !== 0 && Number.isFinite(byRatio)) return byRatio
  return a.item.name.localeCompare(b.item.name, 'ru')
}

export function sortByUrgency(states: CycleState[]): CycleState[] {
  return [...states].sort(compareUrgency)
}

/** Состояния всех позиций, отсортированные по срочности. */
export function cycleStates(
  items: CycleItem[],
  events: CycleEvent[],
  now: DateStr = today(),
): CycleState[] {
  const live = items.filter((item) => !item.deleted && !item.archived)
  return sortByUrgency(live.map((item) => cycleState(item, events, now)))
}
