/**
 * Разделы здоровья в импорте записей (Р-60): эпизоды, измерения,
 * тренировки.
 *
 * Чистые функции: сырой раздел и то, что есть в базе, на входе, записи
 * к добавлению — на выходе. Симптомы и виды тренировок приходят словами
 * и становятся тегами: знакомый ищется по названию, новый заводится один
 * на весь раздел, сколько бы раз он ни встретился.
 */

import {
  absent,
  dayOf,
  numberOf,
  recordsOf,
  sameText,
  shown,
  textOf,
  type Added,
  type ImportContext,
  type ImportPlan,
  type ImportSpec,
} from '../../core/importing.ts'
import type { Episode, Measure, Session, Tag } from '../../core/model.ts'
import { resolveMetric } from './health.ts'
import { METRICS } from './labels.ts'

/** Тег по названию: имеющийся того же вида или новый — один на весь раздел. */
function tagFor(
  name: string,
  scope: Tag['scope'],
  tags: Tag[],
  created: Tag[],
  ctx: ImportContext,
): Tag {
  const found = tags.find((tag) => !tag.deleted && tag.scope === scope && sameText(tag.name, name))
  if (found) return found
  const tag: Tag = { id: ctx.newId(), updatedAt: ctx.now, name, scope }
  tags.push(tag)
  created.push(tag)
  return tag
}

function counted(count: number, forms: Added['forms']): Added[] {
  return count > 0 ? [{ count, forms }] : []
}

// ─── Эпизоды ───────────────────────────────────────────────────────────────

export const episodeImportSpec: ImportSpec = {
  section: 'episodes',
  about:
    'болезни и травмы: простуда, больное горло, поясница. Одна запись — один эпизод от начала ' +
    'до выздоровления.',
  fields: [
    '"title" — что это было, обязательно',
    '"start" — когда началось, ГГГГ-ММ-ДД, обязательно; точной даты нет — запись не писать',
    '"end" — когда прошло, ГГГГ-ММ-ДД; не писать, только если ещё болеешь — тогда эпизод останется открытым',
    '"source" — "doctor", если диагноз ставил врач; иначе не писать',
    '"symptoms" — симптомы короткими словами: ["насморк", "температура"]',
    '"note" — заметка: лечение, лекарства',
  ],
  example: [
    {
      title: 'ОРВИ',
      start: '2026-02-10',
      end: '2026-02-17',
      source: 'doctor',
      symptoms: ['насморк', 'температура'],
      note: 'Лечился дома',
    },
  ],
}

export function importEpisodes(
  raw: unknown,
  data: { episodes: readonly Episode[]; tags: readonly Tag[] },
  ctx: ImportContext,
): ImportPlan {
  const section = episodeImportSpec.section
  const { records, issues } = recordsOf(section, raw)
  const issue = (title: string, reason: string) => issues.push({ section, title, reason })
  const tags = [...data.tags]
  const newTags: Tag[] = []
  const known = data.episodes.filter((episode) => !episode.deleted)
  const added: Episode[] = []
  let skipped = 0

  for (const { raw: record, index } of records) {
    const title = textOf(record.title)
    if (!title) {
      issue(`запись ${index + 1}`, 'нет названия ("title")')
      continue
    }
    const start = dayOf(record.start)
    if (!start) {
      issue(title, `начало «${shown(record.start)}» — не ГГГГ-ММ-ДД`)
      continue
    }
    const end = absent(record.end) ? null : dayOf(record.end)
    if (!absent(record.end) && end === null) {
      issue(title, `конец «${shown(record.end)}» — не ГГГГ-ММ-ДД`)
      continue
    }
    if (end !== null && end < start) {
      issue(title, `закончилось (${end}) раньше, чем началось (${start})`)
      continue
    }
    const source = absent(record.source) ? 'self' : record.source
    if (source !== 'self' && source !== 'doctor') {
      issue(title, `источник «${shown(record.source)}» — не "doctor" и не "self"`)
      continue
    }

    let names: string[] = []
    if (!absent(record.symptoms)) {
      if (!Array.isArray(record.symptoms)) {
        issue(title, 'симптомы ("symptoms") — не список')
        continue
      }
      names = (record.symptoms as unknown[]).map(textOf).filter((each): each is string => each !== null)
    }

    if ([...known, ...added].some((each) => sameText(each.title, title) && each.start === start)) {
      skipped += 1
      continue
    }

    const symptoms = [...new Set(names.map((name) => tagFor(name, 'symptom', tags, newTags, ctx).id))]
    const note = textOf(record.note)
    added.push({
      id: ctx.newId(),
      updatedAt: ctx.now,
      title,
      source,
      start,
      end,
      symptoms,
      ...(note ? { note } : {}),
    })
  }

  return {
    writes: { episodes: added, tags: newTags },
    added: [
      ...counted(added.length, ['эпизод', 'эпизода', 'эпизодов']),
      ...counted(newTags.length, ['новый симптом', 'новых симптома', 'новых симптомов']),
    ],
    skipped,
    issues,
  }
}

// ─── Измерения ─────────────────────────────────────────────────────────────

export const measureImportSpec: ImportSpec = {
  section: 'measures',
  about: 'измерения: вес, давление, рост, пульс — любые числа по датам.',
  fields: [
    '"metric" — что измерял, обязательно: "weight" вес в кг, "bp" давление, "height" рост в см, или своё название: "пульс"',
    '"date" — ГГГГ-ММ-ДД, обязательно',
    '"value" — число, обязательно; у давления — верхнее',
    '"value2" — у давления нижнее; у остальных не писать',
    '"note" — заметка, если есть',
  ],
  example: [
    { metric: 'weight', date: '2026-03-01', value: 74.5 },
    { metric: 'bp', date: '2026-03-01', value: 120, value2: 80 },
  ],
}

export function importMeasures(
  raw: unknown,
  data: { measures: readonly Measure[] },
  ctx: ImportContext,
): ImportPlan {
  const section = measureImportSpec.section
  const { records, issues } = recordsOf(section, raw)
  const issue = (title: string, reason: string) => issues.push({ section, title, reason })
  const known = data.measures.filter((measure) => !measure.deleted)
  const added: Measure[] = []
  let skipped = 0

  for (const { raw: record, index } of records) {
    const name = textOf(record.metric)
    if (!name) {
      issue(`запись ${index + 1}`, 'нет метрики ("metric")')
      continue
    }
    const date = dayOf(record.date)
    if (!date) {
      issue(name, `дата «${shown(record.date)}» — не ГГГГ-ММ-ДД`)
      continue
    }
    const value = numberOf(record.value)
    if (value === null) {
      issue(`${name}, ${date}`, `значение «${shown(record.value)}» — не число`)
      continue
    }
    const value2 = absent(record.value2) ? null : numberOf(record.value2)
    if (!absent(record.value2) && value2 === null) {
      issue(`${name}, ${date}`, `второе значение «${shown(record.value2)}» — не число`)
      continue
    }

    const metric = resolveMetric([...known, ...added], name, METRICS)
    if ([...known, ...added].some((each) => each.metric === metric && each.date === date)) {
      skipped += 1
      continue
    }

    const note = textOf(record.note)
    added.push({
      id: ctx.newId(),
      updatedAt: ctx.now,
      metric,
      date,
      value,
      ...(value2 === null ? {} : { value2 }),
      ...(note ? { note } : {}),
    })
  }

  return {
    writes: { measures: added },
    added: counted(added.length, ['измерение', 'измерения', 'измерений']),
    skipped,
    issues,
  }
}

// ─── Тренировки ────────────────────────────────────────────────────────────

export const sessionImportSpec: ImportSpec = {
  section: 'sessions',
  about: 'тренировки: бег, зал, плавание. Одна запись — одна тренировка.',
  fields: [
    '"activity" — вид, обязательно: "бег", "зал"',
    '"date" — ГГГГ-ММ-ДД, обязательно',
    '"durationMin" — сколько минут, если известно',
    '"distanceKm" — сколько километров, если известно',
    '"note" — заметка, если есть',
  ],
  example: [{ activity: 'бег', date: '2026-04-05', durationMin: 35, distanceKm: 6 }],
}

export function importSessions(
  raw: unknown,
  data: { sessions: readonly Session[]; tags: readonly Tag[] },
  ctx: ImportContext,
): ImportPlan {
  const section = sessionImportSpec.section
  const { records, issues } = recordsOf(section, raw)
  const issue = (title: string, reason: string) => issues.push({ section, title, reason })
  const tags = [...data.tags]
  const newTags: Tag[] = []
  const known = data.sessions.filter((session) => !session.deleted)
  const added: Session[] = []
  let skipped = 0

  /** Необязательное положительное число; кривое — отказ записи. */
  const positive = (value: unknown): number | null | false => {
    if (absent(value)) return null
    const parsed = numberOf(value)
    return parsed !== null && parsed > 0 ? parsed : false
  }

  for (const { raw: record, index } of records) {
    const name = textOf(record.activity)
    if (!name) {
      issue(`запись ${index + 1}`, 'нет вида ("activity")')
      continue
    }
    const date = dayOf(record.date)
    if (!date) {
      issue(name, `дата «${shown(record.date)}» — не ГГГГ-ММ-ДД`)
      continue
    }
    const durationMin = positive(record.durationMin)
    const distanceKm = positive(record.distanceKm)
    if (durationMin === false || distanceKm === false) {
      issue(`${name}, ${date}`, 'минуты или километры — не положительное число')
      continue
    }

    const existing = tags.find((tag) => !tag.deleted && tag.scope === 'activity' && sameText(tag.name, name))
    if (existing && [...known, ...added].some((each) => each.activity === existing.id && each.date === date)) {
      skipped += 1
      continue
    }

    const activity = tagFor(name, 'activity', tags, newTags, ctx).id
    const note = textOf(record.note)
    added.push({
      id: ctx.newId(),
      updatedAt: ctx.now,
      activity,
      date,
      ...(durationMin === null ? {} : { durationMin }),
      ...(distanceKm === null ? {} : { distanceKm }),
      ...(note ? { note } : {}),
    })
  }

  return {
    writes: { sessions: added, tags: newTags },
    added: [
      ...counted(added.length, ['тренировка', 'тренировки', 'тренировок']),
      ...counted(newTags.length, ['новый вид тренировок', 'новых вида тренировок', 'новых видов тренировок']),
    ],
    skipped,
    issues,
  }
}
