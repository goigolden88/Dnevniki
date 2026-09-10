/**
 * Контент в ленте и в выгрузке markdown (Р-48).
 *
 * Список «к просмотру» в ленту не входит (Р-52): это намерение без даты
 * (Р-21), а лента — хроника того, что было. В выгрузку он входит: выгрузка —
 * это всё, что есть.
 *
 * Дата отдаётся как лежит — `YYYY-MM` остаётся месяцем (Р-25). Запись,
 * начатая без даты или с испорченной, идёт в ленту с тем, что есть: там
 * она встанет в группу «дата не читается», а не пропадёт (Р-34).
 */

import { escapeMarkdown as md, type FeedItem } from '../../core/feed.ts'
import { formatDate, isDateOrMonth, isDateStr } from '../../core/dates.ts'
import type { ContentEntry } from '../../core/model.ts'
import { groupByMonth, scoreOf, sortEntries } from './content.ts'
import { formatScore, monthHeading, statusLabel, typeLabel } from './labels.ts'

/** «аниме · брошено · 7,5» — тип, исход, если он не обычный, и оценка. */
function detailOf(entry: ContentEntry): string {
  const parts = [typeLabel(entry.type).toLowerCase()]
  if (entry.status === 'active' || entry.status === 'dropped') parts.push(statusLabel(entry.status))
  const score = scoreOf(entry)
  if (score !== null) parts.push(formatScore(score))
  return parts.join(' · ')
}

export function contentFeed(entries: readonly ContentEntry[]): FeedItem[] {
  return entries
    .filter((entry) => !entry.deleted && entry.status !== 'planned')
    .map((entry) => {
      const extra = [entry.titleOrig ?? '', entry.comment ?? ''].filter(Boolean).join(' ')
      return {
        kind: 'content',
        id: entry.id,
        date: entry.start ?? '',
        title: entry.title,
        detail: detailOf(entry),
        // Отдельного экрана записи нет — карточка разворачивается на месте (Р-44).
        link: '/content',
        ...(extra ? { extra } : {}),
      }
    })
}

/**
 * Раздел выгрузки — разделами по месяцам, как дневник вёлся в Obsidian.
 * День у записи называется, только когда он известен (Р-25).
 */
export function contentMarkdown(entries: readonly ContentEntry[]): string {
  const lines = ['## Контент', '']
  const live = entries.filter((entry) => !entry.deleted)
  if (live.length === 0) return [...lines, 'Записей нет.'].join('\n')

  const started = sortEntries(live.filter((entry) => entry.status !== 'planned'))
  for (const group of groupByMonth(started)) {
    lines.push(`### ${monthHeading(group.month)}`, '', ...group.entries.map(line), '')
  }

  const planned = sortEntries(live.filter((entry) => entry.status === 'planned'))
  if (planned.length > 0) lines.push('### К просмотру', '', ...planned.map(line), '')

  return lines.join('\n').trimEnd()
}

function line(entry: ContentEntry): string {
  const day = entry.start !== null && isDateStr(entry.start) ? `${formatDate(entry.start)} · ` : ''
  const orig = entry.titleOrig ? ` (${md(entry.titleOrig)})` : ''
  const parts = [`${md(entry.title)}${orig}`, detailOf(entry)]
  if (entry.status === 'done') parts.push(statusLabel('done'))
  // Нечитаемая дата называется прямо: запись с ней стоит под «Без даты»,
  // и без этой строки непонятно, чем она там провинилась.
  if (entry.start !== null && entry.status !== 'planned' && !isDateOrMonth(entry.start)) {
    parts.push(`дата не разобрана: «${md(entry.start)}»`)
  }
  if (entry.comment) parts.push(md(entry.comment))
  return `- ${day}${parts.join(' — ')}`
}
