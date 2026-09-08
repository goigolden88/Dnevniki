/**
 * Модель данных.
 *
 * Источник истины — docs/02-Архитектура.md, раздел «Модель данных».
 * Имена полей и опциональность взяты оттуда дословно. Если модель меняется,
 * сначала правится документ, потом этот файл, а не наоборот.
 */

/** Версия схемы. Растёт при каждом несовместимом изменении модели. */
export const SCHEMA_VERSION = 1

// ─── Общая часть ───────────────────────────────────────────────────────────

export type Base = {
  /** ULID, генерируется локально, сортируется по времени */
  id: string
  /** ISO 8601, время последнего изменения записи */
  updatedAt: string
  /** метка удаления, не вычищается никогда */
  deleted?: boolean
}

// ─── Справочники ───────────────────────────────────────────────────────────

export type CycleItem = Base & {
  name: string
  /** Гигиена | Дом | Техника | Авто | Дача */
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
 * Хранилища, которые уезжают в синхронизацию.
 * Порядок значения не имеет, но менять имена нельзя — они в базе на устройстве.
 */
export const SYNCED_STORES = [
  'items',
  'tags',
  'templates',
  'cycleEvents',
  'episodes',
  'measures',
  'sessions',
  'content',
] as const

/**
 * Локальные хранилища. Не синхронизируются никогда:
 * settings держит токен доступа, и ему в общем репозитории не место.
 */
export const LOCAL_STORES = ['meta', 'settings', 'dirty'] as const

export type SyncedStore = (typeof SYNCED_STORES)[number]
export type LocalStore = (typeof LOCAL_STORES)[number]
export type StoreName = SyncedStore | LocalStore

/** Что лежит в каком хранилище. Позволяет db.get('tags') возвращать Tag. */
export type StoreRecord = {
  items: CycleItem
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

// ─── Миграции ──────────────────────────────────────────────────────────────

/**
 * Шаг перехода схемы на версию `to`.
 *
 * Реестр заводится пустым с первого дня. На версии 1 мигрировать нечего,
 * но место для механики нужно сейчас: придумывать её задним числом,
 * когда на устройствах уже лежат данные, заметно дороже.
 *
 * Миграции применяются по порядку `to` внутри транзакции обновления
 * IndexedDB. Внутри доступны только синхронные вызовы — транзакция
 * закрывается на первом же await.
 */
export type Migration = {
  to: number
  /** Что делает и зачем. Читается через год, когда причина забыта. */
  note: string
  /**
   * Изменение только добавляет: новое хранилище, новый индекс, необязательное
   * поле. Форму уже записанных записей не трогает.
   *
   * От этого зависит, примет ли приложение файл-слепок, выгруженный до этой
   * версии. Добавление модуля — ровно такой случай: старые записи от него не
   * меняются, и отвергать из-за него прежние выгрузки незачем (Р-24).
   *
   * Ставить `true`, только если это правда. Ошибка здесь тихо пропустит в базу
   * записи старой формы.
   */
  additive: boolean
  run: (db: IDBDatabase, tx: IDBTransaction) => void
}

export const migrations: Migration[] = []
