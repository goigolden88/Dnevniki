/**
 * Лента: строка ленты и общие операции над ней (Р-48).
 *
 * Лента — единственное место, где записи разных модулей встречаются.
 * Ядро про модули при этом не знает: вид записи — `EventKind` из модели,
 * а переводят свои записи в строки ленты сами модули, каждый в своём
 * `modules/<имя>/feed.ts`. Сводит их вместе таблица `src/registry.ts`.
 *
 * Здесь только то, что одинаково для всех: порядок дат разной точности,
 * разбивка по месяцам, поиск и подписи. Чистые функции, без React и `db`.
 */

import { formatDate, formatMonth, isDateOrMonth, isDateStr, isMonthStr, plural } from './dates.ts'
import type { EventKind } from './model.ts'

export type FeedItem = {
  kind: EventKind
  /** id записи. Ключ в списке — вид вместе с id: хранилища разные. */
  id: string
  /**
   * Дата события как она лежит в записи: `YYYY-MM-DD`, `YYYY-MM` (Р-25)
   * или нечитаемая строка. Не приводится ни к чему: месяц не становится
   * первым числом, а кривая строка не выбрасывается (Р-34).
   */
  date: string
  title: string
  /** Строка под названием: категория и цена, длительность, тип и оценка. */
  detail: string
  /** Куда ведёт тап. Путь хеш-роутинга. */
  link: string
  /** Что ещё ищется, но не показывается: заметки, симптомы, комментарии. */
  extra?: string
}

/** Дата строки, если она читается — днём или месяцем. Иначе null. */
export function readableDate(item: FeedItem): string | null {
  return isDateOrMonth(item.date) ? item.date : null
}

/**
 * Порядок ленты: нечитаемые даты сверху, дальше новыми вниз по времени.
 *
 * Даты разной точности сравниваются как строки (Р-25): `2026-09-10` больше
 * `2026-09`, так что запись, известная до месяца, встаёт в конец своего
 * месяца — после всех его дней, а не на первое число.
 *
 * Нечитаемые — наверх, а не вниз. В ленте нет списка «к просмотру», так что
 * запись без даты здесь — всегда поломка, которую надо увидеть и поправить
 * (Р-34, Р-52). Внизу длинной ленты её не увидит никто.
 *
 * Внутри одной даты — по названию: порядок хранилища не значит ничего.
 */
export function compareFeed(a: FeedItem, b: FeedItem): number {
  const first = readableDate(a)
  const second = readableDate(b)
  if (first !== second) {
    if (first === null) return -1
    if (second === null) return 1
    return second.localeCompare(first)
  }
  return a.title.localeCompare(b.title, 'ru') || a.id.localeCompare(b.id)
}

export type FeedGroup = {
  /** `YYYY-MM`. null — у строк группы дата не читается. */
  month: string | null
  items: FeedItem[]
}

/** Разбивка по месяцам, как у контента (Р-44). На входе порядок любой. */
export function groupFeed(items: readonly FeedItem[]): FeedGroup[] {
  const groups: FeedGroup[] = []
  for (const item of [...items].sort(compareFeed)) {
    const date = readableDate(item)
    const month = date === null ? null : date.slice(0, 7)
    const last = groups.at(-1)
    if (last && last.month === month) last.items.push(item)
    else groups.push({ month, items: [item] })
  }
  return groups
}

/** Для поиска: регистр, «ё» и лишние пробелы не в счёт. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

export type FeedFilter = {
  /** Вид события. null — все. */
  kind?: EventKind | null
  query?: string
}

/**
 * Отбор по виду и поиск.
 *
 * Слова запроса ищутся по отдельности, и нужны все: «стрижка 700» находит
 * стрижку за 700, в каком бы порядке ни стояли слова в строке. Ищется
 * и то, что на экране не видно, — заметки и симптомы, — и дата в обоих
 * видах: `2026-07` и `01.07`.
 */
export function filterFeed(items: readonly FeedItem[], filter: FeedFilter = {}): FeedItem[] {
  const words = normalize(filter.query ?? '')
    .split(' ')
    .filter(Boolean)

  return items.filter((item) => {
    if (filter.kind && item.kind !== filter.kind) return false
    if (words.length === 0) return true
    const shown = isDateStr(item.date) ? formatDate(item.date) : ''
    const haystack = normalize(`${item.title} ${item.detail} ${item.extra ?? ''} ${item.date} ${shown}`)
    return words.every((word) => haystack.includes(word))
  })
}

/**
 * Дата в строке ленты. Месяц и год уже стоят заголовком группы, так что
 * у дня — только число и месяц.
 *
 * Дата, известная до месяца, называется прямо — «без числа», — а не
 * рисуется первым числом (Р-25). Нечитаемая показывается как есть.
 */
export function feedDateText(date: string): string {
  if (isDateStr(date)) return formatDate(date).slice(0, 5)
  if (isMonthStr(date)) return 'без числа'
  return date || 'нет даты'
}

/** Заголовок группы: «Сентябрь 2026» либо предупреждение о нечитаемой дате. */
export function feedHeading(month: string | null): string {
  if (month === null) return 'Дата не читается'
  const text = formatMonth(month)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** «12 записей» — счётчик под фильтрами. */
export function recordsText(count: number): string {
  return `${count} ${plural(count, ['запись', 'записи', 'записей'])}`
}

/**
 * Текст пользователя для markdown-выгрузки: служебные знаки экранируются,
 * переносы строк становятся пробелами.
 *
 * Название «*Звёздные* войны» иначе стало бы курсивом, а комментарий
 * в три строки разорвал бы пункт списка на куски.
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\`*_[\]#|<>])/g, '\\$1')
}
