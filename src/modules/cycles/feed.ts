/**
 * Отметки циклов в ленте и в выгрузке markdown (Р-48).
 *
 * Чистые функции, как и расчёт: записи на входе, строки на выходе.
 * Сводит их с соседними модулями `src/registry.ts` — сам модуль про
 * соседей не знает.
 *
 * Справочник позиций приходит вместе с надгробиями. Позиция удаляется
 * мягко, а её отметки остаются (см. `useCycles.removeItem`): прошлое
 * не должно исчезать оттого, что вещь выбросили, и имя у отметки
 * обязано остаться.
 */

import { escapeMarkdown as md, type FeedItem } from '../../core/feed.ts'
import { formatDateLoose, type DateStr } from '../../core/dates.ts'
import type { CycleEvent, CycleItem } from '../../core/model.ts'
import { cycleState, priceOf, spent } from './cycles.ts'
import { CATEGORIES, formatMoney, intervalText, spentText } from './labels.ts'

/** «Гигиена · Барьер» — категория и куст, если он есть. */
function placeOf(item: CycleItem): string {
  const group = item.group?.trim()
  return group ? `${item.cat} · ${group}` : item.cat
}

export function cycleFeed(items: readonly CycleItem[], events: readonly CycleEvent[]): FeedItem[] {
  const byId = new Map(items.map((item) => [item.id, item]))

  return events
    .filter((event) => !event.deleted)
    .map((event) => {
      const item = byId.get(event.itemId)
      const parts: string[] = []
      if (item) parts.push(placeOf(item))
      if (item?.deleted) parts.push('позиция удалена')
      const price = priceOf(event)
      if (price !== null) parts.push(formatMoney(price))

      return {
        kind: 'cycle',
        id: event.id,
        date: event.date,
        // Позиции нет вовсе: отметка приехала с другого устройства раньше
        // неё. Строка всё равно нужна — терять отметку нельзя.
        title: item?.name ?? 'Позиция не найдена',
        detail: parts.join(' · '),
        link: `/cycle/${event.itemId}`,
        ...(event.note ? { extra: event.note } : {}),
      }
    })
}

/**
 * Раздел выгрузки: как дневник, а не как лента. Категория → позиция →
 * даты с ценами. Плоская хроника для этого не годится: из неё не собрать,
 * какие даты у какой позиции, а ради этого дневник и вёлся.
 *
 * Сумма идёт с числом отметок (Р-38). Архивные и удалённые позиции
 * подписаны, но не выброшены: выгрузка — это всё, что есть.
 */
export function cycleMarkdown(
  items: readonly CycleItem[],
  events: readonly CycleEvent[],
  day: DateStr,
): string {
  const live = events.filter((event) => !event.deleted)
  const byItem = new Map<string, CycleEvent[]>()
  for (const event of live) {
    const list = byItem.get(event.itemId)
    if (list) list.push(event)
    else byItem.set(event.itemId, [event])
  }

  // Удалённая позиция без единой отметки — пустое место, её не пишем.
  const shown = items.filter((item) => !item.deleted || byItem.has(item.id))
  const lines = ['## Циклы', '']
  if (shown.length === 0 && live.length === 0) return [...lines, 'Позиций нет.'].join('\n')

  const rank = (cat: string) => {
    const index = (CATEGORIES as readonly string[]).indexOf(cat)
    return index === -1 ? CATEGORIES.length : index
  }
  const cats = [...new Set(shown.map((item) => item.cat))].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b, 'ru'),
  )

  for (const cat of cats) {
    lines.push(`### ${md(cat)}`, '')
    const inCat = shown
      .filter((item) => item.cat === cat)
      .sort(
        (a, b) =>
          (a.group ?? '').localeCompare(b.group ?? '', 'ru') || a.name.localeCompare(b.name, 'ru'),
      )

    for (const item of inCat) {
      const flags = [item.archived ? 'в архиве' : '', item.deleted ? 'удалена' : ''].filter(Boolean)
      lines.push(`#### ${md(item.name)}${flags.length ? ` (${flags.join(', ')})` : ''}`, '')

      const facts: string[] = []
      if (item.group?.trim()) facts.push(`Куст: ${md(item.group)}`)
      const interval = intervalText(cycleState(item, live, day))
      if (interval) facts.push(interval.charAt(0).toUpperCase() + interval.slice(1))
      if (item.note) facts.push(md(item.note))
      if (facts.length) lines.push(facts.join('. '), '')

      lines.push(...marks(byItem.get(item.id) ?? []), '')
    }
  }

  // Отметки, чья позиция не пришла вовсе. Без позиции — но не без записи.
  const known = new Set(items.map((item) => item.id))
  const orphans = live.filter((event) => !known.has(event.itemId))
  if (orphans.length > 0) lines.push('### Без позиции', '', ...marks(orphans), '')

  return lines.join('\n').trimEnd()
}

/** Отметки новыми сверху, с ценой, и сумма под ними. */
function marks(events: readonly CycleEvent[]): string[] {
  if (events.length === 0) return ['Отметок нет.']

  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date))
  const lines = sorted.map((event) => {
    const price = priceOf(event)
    const tail = [price === null ? '' : formatMoney(price), event.note ? md(event.note) : '']
      .filter(Boolean)
      .join(' · ')
    return `- ${formatDateLoose(event.date)}${tail ? ` — ${tail}` : ''}`
  })

  const total = spentText(spent([...events]))
  if (total) lines.push('', `Потрачено: ${total}`)
  return lines
}
