/**
 * Здоровье в ленте и в выгрузке markdown (Р-48).
 *
 * Три вида событий — эпизоды, измерения, тренировки, — и у каждого своя
 * пара функций: в реестре это три строки, лента их различает.
 *
 * Теги приходят вместе с надгробиями: у старого эпизода симптом, чей тег
 * потом удалили, должен остаться с именем.
 */

import { escapeMarkdown as md, type FeedItem } from '../../core/feed.ts'
import { formatDateLoose, type DateStr } from '../../core/dates.ts'
import type { Episode, Measure, Session, Tag } from '../../core/model.ts'
import { episodeState, episodeStates } from './health.ts'
import { episodeText, measureText, metricLabel, sessionText, sourceText, symptomNames } from './labels.ts'

// ─── Эпизоды ───────────────────────────────────────────────────────────────

/**
 * Эпизод — одна строка по дате начала. Длительность в подписи, у открытого
 * «идёт N-й день»: вторая строка на выздоровление удвоила бы болезни
 * в ленте, не сообщив ничего нового.
 */
export function episodeFeed(
  episodes: readonly Episode[],
  tags: readonly Tag[],
  day: DateStr,
): FeedItem[] {
  return episodes
    .filter((episode) => !episode.deleted)
    .map((episode) => {
      const state = episodeState(episode, day)
      const symptoms = symptomNames(episode.symptoms, [...tags])
      const extra = [symptoms.join(' '), episode.note ?? ''].filter(Boolean).join(' ')
      return {
        kind: 'episode',
        id: episode.id,
        date: episode.start,
        title: episode.title,
        detail: `${episodeText(state)} · диагноз: ${sourceText(episode.source)}`,
        link: `/episode/${episode.id}`,
        ...(extra ? { extra } : {}),
      }
    })
}

/** Хронология болезней — то же, что сводка для врача, только текстом. */
export function episodeMarkdown(
  episodes: readonly Episode[],
  tags: readonly Tag[],
  day: DateStr,
): string {
  const lines = ['## Болезни', '']
  const states = episodeStates([...episodes], day)
  if (states.length === 0) return [...lines, 'Эпизодов нет.'].join('\n')

  for (const state of states) {
    const { episode } = state
    const symptoms = symptomNames(episode.symptoms, [...tags])
    const parts = [`${md(episode.title)} — ${episodeText(state)}`, `диагноз: ${sourceText(episode.source)}`]
    if (symptoms.length) parts.push(`симптомы: ${symptoms.map(md).join(', ')}`)
    if (episode.note) parts.push(md(episode.note))
    lines.push(`- ${parts.join('; ')}`)
  }
  return lines.join('\n')
}

// ─── Измерения ─────────────────────────────────────────────────────────────

export function measureFeed(measures: readonly Measure[]): FeedItem[] {
  return measures
    .filter((measure) => !measure.deleted)
    .map((measure) => ({
      kind: 'measure',
      id: measure.id,
      date: measure.date,
      title: `${metricLabel(measure.metric)} ${measureText(measure.metric, measure.value, measure.value2)}`,
      detail: measure.note ?? '',
      link: '/health',
    }))
}

/** По метрике отдельным списком: вес с давлением в одном ряду не читается. */
export function measureMarkdown(measures: readonly Measure[]): string {
  const lines = ['## Измерения', '']
  const live = measures.filter((measure) => !measure.deleted)
  if (live.length === 0) return [...lines, 'Измерений нет.'].join('\n')

  const metrics = [...new Set(live.map((measure) => measure.metric))]
  for (const metric of metrics) {
    lines.push(`### ${md(metricLabel(metric))}`, '')
    const rows = live
      .filter((measure) => measure.metric === metric)
      .sort((a, b) => b.date.localeCompare(a.date))
    for (const measure of rows) {
      const note = measure.note ? ` · ${md(measure.note)}` : ''
      lines.push(`- ${formatDateLoose(measure.date)} — ${measureText(metric, measure.value, measure.value2)}${note}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

// ─── Тренировки ────────────────────────────────────────────────────────────

export function sessionFeed(sessions: readonly Session[], tags: readonly Tag[]): FeedItem[] {
  const names = new Map(tags.map((tag) => [tag.id, tag.name]))
  return sessions
    .filter((session) => !session.deleted)
    .map((session) => ({
      kind: 'session',
      id: session.id,
      date: session.date,
      // Тег приедет позже эпизода или тренировки — строка нужна и без него.
      title: names.get(session.activity) ?? 'Вид не найден',
      detail: sessionText(session.durationMin ?? 0, session.distanceKm ?? 0),
      link: '/health',
      ...(session.note ? { extra: session.note } : {}),
    }))
}

export function sessionMarkdown(sessions: readonly Session[], tags: readonly Tag[]): string {
  const lines = ['## Тренировки', '']
  const rows = sessionFeed(sessions, tags).sort((a, b) => b.date.localeCompare(a.date))
  if (rows.length === 0) return [...lines, 'Тренировок нет.'].join('\n')

  for (const row of rows) {
    const tail = [row.detail, row.extra ? md(row.extra) : ''].filter(Boolean).join(' · ')
    lines.push(`- ${formatDateLoose(row.date)} — ${md(row.title)}${tail ? ` · ${tail}` : ''}`)
  }
  return lines.join('\n')
}
