/**
 * Модель данных.
 *
 * Источник истины — docs/02-Архитектура.md, раздел «Модель данных».
 * Имена полей и опциональность взяты оттуда дословно. Если модель меняется,
 * сначала правится документ, потом этот файл, а не наоборот.
 *
 * Приложение целиком — типы записей, хранилища, версия схемы и миграции
 * (Р-81). Договор семьи — `Base`, `Migration` и механика миграций — в ядре,
 * `shared/core/model.ts`; ядро получает всё это конфигом из `app/config.ts`.
 */

import type { Base, Migration } from '../shared/core/model.ts'

/**
 * Версия схемы. Растёт с каждым шагом в `migrations` — и с добавлением
 * хранилища тоже: IndexedDB заводит хранилище только при смене версии.
 */
export const SCHEMA_VERSION = 2

// ─── Справочники ───────────────────────────────────────────────────────────

export type CycleItem = Base & {
  name: string
  /**
   * Название категории — строкой, а не ссылкой на `CycleCategory` (Р-59):
   * ссылка по id поменяла бы форму всех позиций и сделала нечитаемыми
   * прежние выгрузки.
   */
  cat: string
  /**
   * Куст внутри категории: одна вещь или один смысл, обслуживаемый
   * несколькими позициями. «Барьер Эксперт» для трёх стадий и второй
   * стадии отдельно, «Зарядки» для блока питания и зарядки ноутбука.
   *
   * Свободная строка, как и `cat`. Отдельной сущности «вещь» нет
   * намеренно — см. Р-30.
   */
  group?: string
  /** null → считаем медиану по истории */
  intervalDays: number | null
  archived?: boolean
  note?: string
}

/**
 * Категория позиций циклов (Р-59). Своя запись, чтобы категории можно было
 * заводить, убирать, переименовывать и расставлять — раньше пять названий
 * жили константой в коде.
 */
export type CycleCategory = Base & {
  name: string
  /** Место на «Сейчас», в тратах и в выгрузке. */
  order: number
}

export type Tag = Base & {
  name: string
  scope: 'symptom' | 'activity'
}

export type Template = Base & {
  label: string
  kind: EventKind
  preset: Record<string, unknown>
  order: number
}

/**
 * Какого типа событие создаёт шаблон быстрого ввода.
 * Ровно пять событийных сущностей ниже. См. Р-19.
 */
export type EventKind = 'cycle' | 'episode' | 'measure' | 'session' | 'content'

// ─── События ───────────────────────────────────────────────────────────────

export type CycleEvent = Base & {
  itemId: string
  /** YYYY-MM-DD, дата события, не дата ввода */
  date: string
  price?: number
  note?: string
  refs?: string[]
}

export type Episode = Base & {
  title: string
  source: 'self' | 'doctor'
  start: string
  /** null → эпизод продолжается */
  end: string | null
  /** id тегов */
  symptoms: string[]
  note?: string
  refs?: string[]
}

export type Measure = Base & {
  /** weight | height | bp | произвольная */
  metric: string
  date: string
  value: number
  /** второе значение, например диастолическое давление */
  value2?: number
  note?: string
}

export type Session = Base & {
  /** id тега */
  activity: string
  date: string
  durationMin?: number
  distanceKm?: number
  note?: string
  refs?: string[]
}

export type ContentEntry = Base & {
  type: 'anime' | 'series' | 'film' | 'game' | 'book' | 'course'
  title: string
  titleOrig?: string
  /** null → лежит в списке «к просмотру», ещё не начато */
  start: string | null
  end: string | null
  status: 'planned' | 'active' | 'done' | 'dropped'
  /** 1..10 */
  score: number | null
  comment?: string
  ext?: { source: string; id: string; cover?: string }
  refs?: string[]
}

// ─── Хранилища ─────────────────────────────────────────────────────────────

/**
 * Хранилища, которые уезжают в синхронизацию. Менять имена нельзя — они
 * в базе на устройстве. Порядок — тот, в котором ядро пишет импорт и слепок
 * (`stores` конфига, Р-81); он прежний, и файл-копия выходит тем же.
 * Локальные `meta`, `settings`, `dirty` — ядра, одинаковы у всей семьи.
 */
export const SYNCED_STORES = [
  'items',
  'categories',
  'tags',
  'templates',
  'cycleEvents',
  'episodes',
  'measures',
  'sessions',
  'content',
] as const

export type SyncedStore = (typeof SYNCED_STORES)[number]

/**
 * Что лежит в каком хранилище. Позволяет db.get('tags') возвращать Tag;
 * это и есть таблица `R` для `AppConfig<R>` ядра.
 */
export type StoreRecord = {
  items: CycleItem
  categories: CycleCategory
  tags: Tag
  templates: Template
  cycleEvents: CycleEvent
  episodes: Episode
  measures: Measure
  sessions: Session
  content: ContentEntry
}

/** Любая синхронизируемая запись. */
export type AnyRecord = StoreRecord[SyncedStore]

/**
 * Где лежат записи человека — по ним пустая база отличается от установленной
 * копии (Р-69). Категории, теги и шаблоны не в счёт: категории заводятся сами
 * при первом запуске (Р-59), теги и шаблоны — только вслед за записями.
 */
export const OWN_STORES = [
  'items',
  'cycleEvents',
  'episodes',
  'measures',
  'sessions',
  'content',
] as const satisfies readonly SyncedStore[]

// ─── Миграции ──────────────────────────────────────────────────────────────

/**
 * Шаги схемы. Шаг сам создаёт своё хранилище и его индексы — `v1Stores`
 * в `app/config.ts` заморожен (Р-59). Что такое шаг и как он применяется —
 * `Migration` ядра.
 */
export const migrations: Migration[] = [
  {
    to: 2,
    note: 'добавлено хранилище categories — категории циклов своими записями (Р-59)',
    // Позиции по-прежнему хранят категорию названием: форма прежних записей
    // не меняется, и выгрузки версии 1 читаются как были.
    additive: true,
    run: (database) => {
      const store = database.createObjectStore('categories', { keyPath: 'id' })
      store.createIndex('updatedAt', 'updatedAt') // нужен слиянию
    },
  },
]
