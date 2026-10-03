/**
 * Контент в ленте и в выгрузке markdown (Р-48).
 *
 * Запись «к просмотру» входит в ленту строкой в день, когда её добавили
 * (Р-93, пересматривает Р-52): своей даты у намерения нет (Р-21), но
 * добавить в список — тоже событие. День берётся из времени, зашитого
 * в `id`; поля под него нет. `id` без читаемого времени — строки нет: группа
 * «дата не читается» наверху — только для поломок (Р-84). Начатая запись —
 * по дате начала, второй строки «добавлено» у неё нет. В выгрузку список
 * входит своим разделом, как прежде: выгрузка — это всё, что есть.
 *
 * Дата отдаётся как лежит — `YYYY-MM` остаётся месяцем (Р-25). Запись,
 * начатая без даты или с испорченной, идёт в ленту с тем, что есть: там
 * она встанет в группу «дата не читается», а не пропадёт (Р-34).
 */

import { escapeMarkdown as md, type FeedItem } from '../../shared/core/feed.ts'
import { formatDate, isDateOrMonth, isDateStr, toDateStr } from '../../shared/core/dates.ts'
import { ulidTime } from '../../shared/core/id.ts'
import type { ContentEntry } from '../../app/model.ts'
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

/** День добавления записи — из времени в её `id`. null — время не читается. */
function addedOn(entry: ContentEntry): string | null {
  const ms = ulidTime(entry.id)
  if (ms === null) return null
  const day = toDateStr(new Date(ms))
  return isDateStr(day) ? day : null
}

export function contentFeed(entries: readonly ContentEntry[]): FeedItem[] {
  return entries
    .filter((entry) => !entry.deleted)
    .flatMap((entry) => {
      const planned = entry.status === 'planned'
      const date = planned ? addedOn(entry) : (entry.start ?? '')
      if (date === null) return []
      const extra = [entry.titleOrig ?? '', entry.comment ?? ''].filter(Boolean).join(' ')
      return [
        {
          kind: 'content',
          id: entry.id,
          date,
          title: entry.title,
          // «фильм · к просмотру»: оценки у намерения нет (Р-93).
          detail: planned ? `${typeLabel(entry.type).toLowerCase()} · ${statusLabel('planned')}` : detailOf(entry),
          // Отдельного экрана записи нет — карточка разворачивается на месте
          // (Р-44). Номер записи в адресе: вкладка откроет и развернёт её (Р-56).
          link: `/content?open=${entry.id}`,
          ...(extra ? { extra } : {}),
        },
      ]
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
