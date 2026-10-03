/**
 * «Год назад» на «Сейчас»: записи ленты, сделанные в этот день прошлого года.
 *
 * Чистые функции, без React и `db`: строки приходят готовыми из реестра,
 * здесь только какой день искать и сколько показать.
 */

import { compareFeed, type FeedItem } from '../shared/core/feed.ts'
import { isDateStr, type DateStr } from '../shared/core/dates.ts'

/** Сколько строк блок показывает; остальное — «и ещё N». */
export const YEAR_AGO_LIMIT = 3

/**
 * Тот же день и месяц прошлого года. У 29 февраля пары нет — берётся
 * 28-е: прошлый год от високосного всегда невисокосный.
 */
export function yearAgoDay(day: DateStr): DateStr {
  if (!isDateStr(day)) throw new Error(`Не дата: ${day}`)
  const year = String(Number(day.slice(0, 4)) - 1).padStart(4, '0')
  const rest = day.slice(4) === '-02-29' ? '-02-28' : day.slice(4)
  return `${year}${rest}`
}

export type YearAgo = {
  /** День, за которым смотрели. */
  day: DateStr
  /** Что показать, в порядке ленты. */
  shown: FeedItem[]
  /** Сколько не влезло. */
  rest: number
}

/**
 * Записи ровно годичной давности. Только с точным днём: запись, известная
 * до месяца, «в этот день» не была. Нет таких — null, блока нет.
 */
export function yearAgo(
  items: readonly FeedItem[],
  day: DateStr,
  order: readonly string[] = [],
  limit: number = YEAR_AGO_LIMIT,
): YearAgo | null {
  const target = yearAgoDay(day)
  const found = items.filter((item) => item.date === target).sort((a, b) => compareFeed(a, b, order))
  if (found.length === 0) return null
  return { day: target, shown: found.slice(0, limit), rest: Math.max(0, found.length - limit) }
}
