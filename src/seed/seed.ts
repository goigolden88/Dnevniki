/**
 * Разовый перенос дневников из Obsidian.
 *
 * На вход — файлы `seed-cycles.json`, `seed-health.json`, `seed-content.json`,
 * подготовленные отдельной беседой по скриншотам (Р-11: парсер markdown мы
 * не пишем). На выход — обычный слепок, который грузится тем же путём, что
 * и ручной перенос между устройствами.
 *
 * Формат файлов человекочитаемый и от модели отвязан намеренно: правится
 * глазами, а ULID, `updatedAt` и связи проставляются здесь кодом.
 *
 * Это временный код одного применения. Когда данные переедут и проверятся,
 * папку можно удалять целиком — на приложение она ничего не завязывает.
 */

import type { Snapshot } from '../core/db.ts'
import { isDateOrMonth, isDateStr } from '../core/dates.ts'
import { SCHEMA_VERSION, SYNCED_STORES } from '../core/model.ts'
import type {
  ContentEntry,
  CycleEvent,
  CycleItem,
  Episode,
  Measure,
  Session,
  Tag,
} from '../core/model.ts'
import { SEED_UPDATED_AT, seedId } from './ids.ts'

// ─── Формат файлов переноса ────────────────────────────────────────────────

export type SeedMark = { date: string; price?: number; note?: string }
export type SeedItem = {
  name: string
  cat: string
  intervalDays: number | null
  note?: string
  marks: SeedMark[]
}
export type SeedCycles = { items: SeedItem[] }

export type SeedEpisode = {
  title: string
  source: 'self' | 'doctor'
  start: string
  end: string | null
  symptoms: string[]
  note?: string
}
export type SeedMeasure = {
  metric: string
  date: string
  value: number
  value2?: number
  note?: string
}
export type SeedSession = {
  activity: string
  date: string
  durationMin?: number
  distanceKm?: number
  note?: string
}
export type SeedHealth = {
  episodes: SeedEpisode[]
  measures: SeedMeasure[]
  sessions: SeedSession[]
}

export type SeedEntry = {
  type: ContentEntry['type']
  title: string
  titleOrig?: string
  start: string | null
  end: string | null
  status: ContentEntry['status']
  score: number | null
  comment?: string
}
export type SeedContent = { entries: SeedEntry[] }

export type SeedFiles = {
  cycles?: SeedCycles
  health?: SeedHealth
  content?: SeedContent
}

/** Что получилось. Показывается после загрузки, чтобы было видно объём. */
export type SeedReport = {
  items: number
  cycleEvents: number
  episodes: number
  measures: number
  sessions: number
  tags: number
  content: number
}

/**
 * Ошибка разбора файла переноса.
 *
 * Отдельный тип, потому что сообщение уходит на экран как есть: человек
 * должен понять, какую строку в JSON править, не открывая исходники.
 */
export class SeedError extends Error {}

function fail(what: string): never {
  throw new SeedError(what)
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${what}: пустое или не строка`)
  return (value as string).trim()
}

function day(value: unknown, what: string): string {
  const raw = text(value, what)
  if (!isDateStr(raw)) fail(`${what}: «${raw}» — не дата вида ГГГГ-ММ-ДД`)
  return raw
}

/** Дата контента: день или месяц. Р-25. */
function dayOrMonth(value: unknown, what: string): string {
  const raw = text(value, what)
  if (!isDateOrMonth(raw)) fail(`${what}: «${raw}» — не дата вида ГГГГ-ММ-ДД или ГГГГ-ММ`)
  return raw
}

function optionalNumber(value: unknown, what: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${what}: не число`)
  return value
}

// ─── Циклы ─────────────────────────────────────────────────────────────────

function convertCycles(seed: SeedCycles, items: CycleItem[], events: CycleEvent[]): void {
  if (!Array.isArray(seed.items)) fail('seed-cycles: нет массива items')

  for (const raw of seed.items) {
    const name = text(raw?.name, 'позиция без названия')
    const item: CycleItem = {
      id: seedId(`item:${name}`),
      updatedAt: SEED_UPDATED_AT,
      name,
      cat: text(raw.cat, `позиция «${name}»: категория`),
      // Ноль и отрицательные значения считаются не заданными — так же,
      // как их понимает расчёт в modules/cycles/cycles.ts.
      intervalDays:
        typeof raw.intervalDays === 'number' && raw.intervalDays > 0 ? raw.intervalDays : null,
      ...(raw.note ? { note: raw.note } : {}),
    }
    items.push(item)

    if (!Array.isArray(raw.marks)) fail(`позиция «${name}»: нет массива marks`)
    for (const mark of raw.marks) {
      const date = day(mark?.date, `позиция «${name}»: отметка`)
      const price = optionalNumber(mark.price, `позиция «${name}», отметка ${date}: цена`)
      events.push({
        id: seedId(`mark:${item.id}:${date}`),
        updatedAt: SEED_UPDATED_AT,
        itemId: item.id,
        date,
        ...(price === undefined ? {} : { price }),
        ...(mark.note ? { note: mark.note } : {}),
      })
    }
  }
}

// ─── Здоровье ──────────────────────────────────────────────────────────────

/**
 * Симптомы в файле — слова, в модели — ссылки на теги. Тег заводится один
 * на слово: в этом и был смысл тегов, иначе повторяющиеся симптомы не
 * собираются в аналитику.
 */
function tagFor(name: string, tags: Map<string, Tag>): string {
  const key = name.trim().toLowerCase()
  const existing = tags.get(key)
  if (existing) return existing.id

  const tag: Tag = {
    id: seedId(`tag:symptom:${key}`),
    updatedAt: SEED_UPDATED_AT,
    name: key,
    scope: 'symptom',
  }
  tags.set(key, tag)
  return tag.id
}

function convertHealth(
  seed: SeedHealth,
  episodes: Episode[],
  measures: Measure[],
  sessions: Session[],
  tags: Map<string, Tag>,
): void {
  for (const raw of seed.episodes ?? []) {
    const title = text(raw?.title, 'эпизод без названия')
    const start = day(raw.start, `эпизод «${title}»: начало`)
    episodes.push({
      id: seedId(`episode:${title}:${start}`),
      updatedAt: SEED_UPDATED_AT,
      title,
      source: raw.source === 'doctor' ? 'doctor' : 'self',
      start,
      end: raw.end === null || raw.end === undefined ? null : day(raw.end, `эпизод «${title}»: конец`),
      symptoms: (raw.symptoms ?? []).map((name) => tagFor(text(name, `эпизод «${title}»: симптом`), tags)),
      ...(raw.note ? { note: raw.note } : {}),
    })
  }

  for (const raw of seed.measures ?? []) {
    const metric = text(raw?.metric, 'измерение без метрики')
    const date = day(raw.date, `измерение ${metric}: дата`)
    const value = optionalNumber(raw.value, `измерение ${metric} ${date}: значение`)
    if (value === undefined) fail(`измерение ${metric} ${date}: нет значения`)
    const value2 = optionalNumber(raw.value2, `измерение ${metric} ${date}: второе значение`)
    measures.push({
      id: seedId(`measure:${metric}:${date}`),
      updatedAt: SEED_UPDATED_AT,
      metric,
      date,
      value,
      ...(value2 === undefined ? {} : { value2 }),
      ...(raw.note ? { note: raw.note } : {}),
    })
  }

  for (const raw of seed.sessions ?? []) {
    const activityName = text(raw?.activity, 'тренировка без вида')
    const date = day(raw.date, `тренировка ${activityName}: дата`)
    const key = activityName.trim().toLowerCase()
    let activity = tags.get(`activity:${key}`)
    if (!activity) {
      activity = {
        id: seedId(`tag:activity:${key}`),
        updatedAt: SEED_UPDATED_AT,
        name: key,
        scope: 'activity',
      }
      tags.set(`activity:${key}`, activity)
    }
    const durationMin = optionalNumber(raw.durationMin, `тренировка ${key} ${date}: длительность`)
    const distanceKm = optionalNumber(raw.distanceKm, `тренировка ${key} ${date}: дистанция`)
    sessions.push({
      id: seedId(`session:${key}:${date}`),
      updatedAt: SEED_UPDATED_AT,
      activity: activity.id,
      date,
      ...(durationMin === undefined ? {} : { durationMin }),
      ...(distanceKm === undefined ? {} : { distanceKm }),
      ...(raw.note ? { note: raw.note } : {}),
    })
  }
}

// ─── Контент ───────────────────────────────────────────────────────────────

const CONTENT_TYPES = ['anime', 'series', 'film', 'game', 'book', 'course'] as const
const CONTENT_STATUSES = ['planned', 'active', 'done', 'dropped'] as const

function convertContent(seed: SeedContent, entries: ContentEntry[]): void {
  if (!Array.isArray(seed.entries)) fail('seed-content: нет массива entries')

  for (const raw of seed.entries) {
    const title = text(raw?.title, 'запись без названия')
    if (!CONTENT_TYPES.includes(raw.type)) fail(`«${title}»: неизвестный тип ${String(raw.type)}`)
    if (!CONTENT_STATUSES.includes(raw.status)) {
      fail(`«${title}»: неизвестный статус ${String(raw.status)}`)
    }

    const score = optionalNumber(raw.score, `«${title}»: оценка`)
    // Шаг 0.1 по Р-26. Хвост длиннее одного знака — почти наверняка опечатка,
    // и лучше сказать о ней, чем молча округлить.
    if (score !== undefined && (score < 1 || score > 10 || Math.round(score * 10) !== score * 10)) {
      fail(`«${title}»: оценка ${score} вне 1..10 или мельче шага 0.1`)
    }

    entries.push({
      id: seedId(`content:${raw.type}:${title}`),
      updatedAt: SEED_UPDATED_AT,
      type: raw.type,
      title,
      ...(raw.titleOrig ? { titleOrig: raw.titleOrig } : {}),
      start: raw.start === null || raw.start === undefined ? null : dayOrMonth(raw.start, `«${title}»: начало`),
      end: raw.end === null || raw.end === undefined ? null : dayOrMonth(raw.end, `«${title}»: конец`),
      status: raw.status,
      score: score === undefined ? null : score,
      ...(raw.comment ? { comment: raw.comment } : {}),
    })
  }
}

/** Какой из трёх файлов перед нами. Различаются составом ключей. */
export function seedKind(value: unknown): keyof SeedFiles {
  if (typeof value !== 'object' || value === null) fail('файл переноса: внутри не объект')
  const raw = value as Record<string, unknown>
  if (Array.isArray(raw.items)) return 'cycles'
  if (Array.isArray(raw.entries)) return 'content'
  if (Array.isArray(raw.episodes) || Array.isArray(raw.measures) || Array.isArray(raw.sessions)) {
    return 'health'
  }
  fail('файл переноса: не похож ни на циклы, ни на здоровье, ни на контент')
}

// ─── Сборка ────────────────────────────────────────────────────────────────

/**
 * Собирает слепок из тех файлов, что дали. Отсутствующий файл — не ошибка:
 * циклы переносятся сейчас, здоровье и контент могут приехать позже.
 */
export function seedToSnapshot(files: SeedFiles): { snapshot: Snapshot; report: SeedReport } {
  const items: CycleItem[] = []
  const cycleEvents: CycleEvent[] = []
  const episodes: Episode[] = []
  const measures: Measure[] = []
  const sessions: Session[] = []
  const content: ContentEntry[] = []
  const tags = new Map<string, Tag>()

  if (files.cycles) convertCycles(files.cycles, items, cycleEvents)
  if (files.health) convertHealth(files.health, episodes, measures, sessions, tags)
  if (files.content) convertContent(files.content, content)

  const tagList = [...tags.values()]
  const data = {
    items,
    tags: tagList,
    templates: [],
    cycleEvents,
    episodes,
    measures,
    sessions,
    content,
  } as Snapshot['data']

  // Страховка на случай, если в модель добавят хранилище, а сюда забудут:
  // слепок обязан содержать все ключи, иначе импорт споткнётся о undefined.
  for (const store of SYNCED_STORES) {
    if (!Array.isArray(data[store])) fail(`перенос не заполнил хранилище «${store}»`)
  }

  return {
    snapshot: { schemaVersion: SCHEMA_VERSION, exportedAt: SEED_UPDATED_AT, data },
    report: {
      items: items.length,
      cycleEvents: cycleEvents.length,
      episodes: episodes.length,
      measures: measures.length,
      sessions: sessions.length,
      tags: tagList.length,
      content: content.length,
    },
  }
}
