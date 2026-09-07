/**
 * Локальное хранилище.
 *
 * Единственное место в приложении, которое знает про IndexedDB. Модули,
 * экраны и синхронизация ходят только сюда — это позволяет заменить
 * хранилище правкой одного файла (docs/02-Архитектура.md, «Правила»).
 *
 * Что здесь важно и почему:
 *
 * — Удаление всегда мягкое. Запись получает `deleted: true` и остаётся
 *   навсегда. Если метки вычищать, второе устройство при следующей
 *   синхронизации воскресит запись (Р-07).
 *
 * — Изменённые записи копятся в хранилище `dirty` ссылками `{store, id}`.
 *   Во что они свернутся — в файлы `cycles/2026.json` или в запросы
 *   к бэкенду — решает `sync`, не `db` (Р-18).
 *
 * — У записи три разных происхождения, и путать их нельзя:
 *   правка на устройстве двигает `updatedAt` и метит запись грязной,
 *   пришедшее с сервера не делает ни того ни другого, загруженное
 *   из файла метится грязным, но `updatedAt` сохраняет чужой.
 *   `updatedAt` — то, на чём держится правило слияния, трогать его
 *   при переносе нельзя.
 */

import { nowIso } from './dates.ts'
import { SCHEMA_VERSION, SYNCED_STORES, migrations } from './model.ts'
import type { StoreRecord, SyncedStore } from './model.ts'

const DB_NAME = 'dnevniki'

/** Индексы сверх `updatedAt`, который заводится на каждом хранилище. */
const INDEXES: Record<SyncedStore, readonly string[]> = {
  items: [],
  tags: [],
  templates: [],
  cycleEvents: ['date', 'itemId'], // itemId — история позиции, Этап 1
  episodes: ['start'],
  measures: ['date', 'metric'],
  sessions: ['date'],
  content: ['start'],
}

/** Откуда пришла запись. Определяет, двигать ли `updatedAt` и метить ли грязной. */
export type Origin =
  /** Правка на этом устройстве */
  | 'local'
  /** Прилетело с сервера при синхронизации */
  | 'remote'
  /** Загружено из файла экспорта */
  | 'imported'

export type DirtyRef = {
  store: SyncedStore
  id: string
  /** `updatedAt` записи на момент пометки. Нужен, чтобы `clearDirty`
   *  не стёр пометку, поставленную уже после начала отправки. */
  at: string
}

export type Snapshot = {
  schemaVersion: number
  exportedAt: string
  data: { [S in SyncedStore]: StoreRecord[S][] }
}

// ─── Соединение ────────────────────────────────────────────────────────────

let connection: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (connection) return connection

  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, SCHEMA_VERSION)

    request.onupgradeneeded = (event) => {
      const tx = request.transaction
      if (!tx) {
        reject(new Error('Обновление базы без транзакции'))
        return
      }
      upgrade(request.result, tx, event.oldVersion)
    }

    request.onsuccess = () => {
      const database = request.result
      // Другая вкладка запросила версию выше. Не отпустим соединение —
      // её обновление зависнет молча, и она останется на старой схеме.
      database.onversionchange = () => {
        database.close()
        connection = null
      }
      resolve(database)
    }

    request.onerror = () => reject(request.error ?? new Error('База не открылась'))
    request.onblocked = () =>
      reject(new Error('База занята другой вкладкой приложения. Закройте её и обновите страницу.'))
  })

  // Провал не кешируем: следующий вызов должен попробовать заново.
  connection.catch(() => {
    connection = null
  })

  return connection
}

/**
 * Свежая база создаётся в раскладке версии 1, после чего к ней применяются
 * все миграции по порядку. Тот же путь, что у базы, приехавшей с версии 1, —
 * значит расхождений между «поставил давно» и «поставил сегодня» не будет.
 */
function upgrade(database: IDBDatabase, tx: IDBTransaction, from: number): void {
  if (from < 1) createStores(database)

  for (const migration of [...migrations].sort((a, b) => a.to - b.to)) {
    if (migration.to > from) migration.run(database, tx)
  }
}

function createStores(database: IDBDatabase): void {
  for (const store of SYNCED_STORES) {
    const created = database.createObjectStore(store, { keyPath: 'id' })
    created.createIndex('updatedAt', 'updatedAt') // нужен слиянию
    for (const field of INDEXES[store]) created.createIndex(field, field)
  }

  database.createObjectStore('meta', { keyPath: 'key' })
  // Настройки не синхронизируются: здесь лежит токен доступа.
  database.createObjectStore('settings', { keyPath: 'key' })
  database.createObjectStore('dirty', { keyPath: ['store', 'id'] })
}

// ─── Обёртки над IDBRequest ────────────────────────────────────────────────

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Запрос к базе не прошёл'))
  })
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Транзакция не прошла'))
    tx.onabort = () => reject(tx.error ?? new Error('Транзакция отменена'))
  })
}

// ─── Чтение ────────────────────────────────────────────────────────────────

async function get<S extends SyncedStore>(
  store: S,
  id: string,
): Promise<StoreRecord[S] | undefined> {
  const database = await open()
  const tx = database.transaction(store, 'readonly')
  return req<StoreRecord[S] | undefined>(tx.objectStore(store).get(id))
}

async function getAll<S extends SyncedStore>(
  store: S,
  options: { includeDeleted?: boolean } = {},
): Promise<StoreRecord[S][]> {
  const database = await open()
  const tx = database.transaction(store, 'readonly')
  const all = await req<StoreRecord[S][]>(tx.objectStore(store).getAll())
  return options.includeDeleted ? all : all.filter((record) => !record.deleted)
}

async function count(
  store: SyncedStore,
  options: { includeDeleted?: boolean } = {},
): Promise<number> {
  if (options.includeDeleted) {
    const database = await open()
    const tx = database.transaction(store, 'readonly')
    return req(tx.objectStore(store).count())
  }
  return (await getAll(store)).length
}

// ─── Запись ────────────────────────────────────────────────────────────────

/**
 * Общий путь записи. Разница между происхождениями ровно в двух флагах,
 * и держать её в одном месте надёжнее, чем в трёх похожих функциях.
 */
async function write<S extends SyncedStore>(
  store: S,
  records: readonly StoreRecord[S][],
  origin: Origin,
): Promise<StoreRecord[S][]> {
  if (records.length === 0) return []

  const touch = origin === 'local'
  const markDirty = origin !== 'remote'
  const at = nowIso()

  const saved = records.map((record) =>
    touch ? ({ ...record, updatedAt: at } as StoreRecord[S]) : record,
  )

  const database = await open()
  const stores = markDirty ? [store, 'dirty'] : [store]
  const tx = database.transaction(stores, 'readwrite')
  const target = tx.objectStore(store)
  const dirty = markDirty ? tx.objectStore('dirty') : null

  for (const record of saved) {
    target.put(record)
    dirty?.put({ store, id: record.id, at: record.updatedAt } satisfies DirtyRef)
  }

  await finished(tx)
  return saved
}

/** Правка на этом устройстве: двигает `updatedAt`, метит грязной. */
async function put<S extends SyncedStore>(
  store: S,
  record: StoreRecord[S],
): Promise<StoreRecord[S]> {
  const saved = await write(store, [record], 'local')
  // Ровно один элемент на входе — ровно один на выходе.
  return saved[0] ?? record
}

async function putMany<S extends SyncedStore>(
  store: S,
  records: readonly StoreRecord[S][],
): Promise<StoreRecord[S][]> {
  return write(store, records, 'local')
}

/**
 * Пришло с сервера: `updatedAt` чужой и остаётся как есть, грязной запись
 * не метится. Иначе синхронизация зацикливается сама на себе — отправит
 * то, что только что получила.
 */
async function putRemote<S extends SyncedStore>(
  store: S,
  records: readonly StoreRecord[S][],
): Promise<void> {
  await write(store, records, 'remote')
}

/**
 * Мягкое удаление. Записи не было — вернёт false, надгробие на пустом
 * месте не ставится.
 */
async function remove<S extends SyncedStore>(store: S, id: string): Promise<boolean> {
  const existing = await get(store, id)
  if (!existing) return false
  await put(store, { ...existing, deleted: true })
  return true
}

/**
 * Слияние по правилу Р-07: по `id` побеждает версия с более поздним
 * `updatedAt`. Сравнение по отдельной записи, а не по файлу целиком —
 * иначе запись с телефона затирает запись с компа.
 *
 * Возвращает, сколько записей действительно применилось.
 */
async function merge<S extends SyncedStore>(
  store: S,
  incoming: readonly StoreRecord[S][],
  origin: Exclude<Origin, 'local'>,
): Promise<number> {
  if (incoming.length === 0) return 0

  const local = new Map(
    (await getAll(store, { includeDeleted: true })).map((record) => [record.id, record]),
  )

  const winners = incoming.filter((record) => {
    const current = local.get(record.id)
    return !current || record.updatedAt > current.updatedAt
  })

  await write(store, winners, origin)
  return winners.length
}

// ─── Очередь изменений ─────────────────────────────────────────────────────

async function listDirty(): Promise<DirtyRef[]> {
  const database = await open()
  const tx = database.transaction('dirty', 'readonly')
  return req<DirtyRef[]>(tx.objectStore('dirty').getAll())
}

/**
 * Снимает пометки после успешной отправки.
 *
 * Пометка снимается, только если запись с тех пор не менялась: сравнивается
 * `at`. Без этой проверки правка, сделанная во время отправки, потерялась бы
 * молча — самый неприятный вид потери данных.
 */
async function clearDirty(refs: readonly DirtyRef[]): Promise<void> {
  if (refs.length === 0) return

  const database = await open()
  const tx = database.transaction('dirty', 'readwrite')
  const dirty = tx.objectStore('dirty')

  for (const ref of refs) {
    const key: [string, string] = [ref.store, ref.id]
    const current = await req<DirtyRef | undefined>(dirty.get(key))
    if (current && current.at === ref.at) dirty.delete(key)
  }

  await finished(tx)
}

// ─── Настройки и служебное ─────────────────────────────────────────────────

/** Простое хранилище «ключ — значение» поверх одного объектного хранилища. */
function keyValue(store: 'settings' | 'meta') {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const database = await open()
      const tx = database.transaction(store, 'readonly')
      const row = await req<{ key: string; value: T } | undefined>(tx.objectStore(store).get(key))
      return row?.value
    },

    async set(key: string, value: unknown): Promise<void> {
      const database = await open()
      const tx = database.transaction(store, 'readwrite')
      tx.objectStore(store).put({ key, value })
      await finished(tx)
    },

    async remove(key: string): Promise<void> {
      const database = await open()
      const tx = database.transaction(store, 'readwrite')
      tx.objectStore(store).delete(key)
      await finished(tx)
    },

    async keys(): Promise<string[]> {
      const database = await open()
      const tx = database.transaction(store, 'readonly')
      const keys = await req(tx.objectStore(store).getAllKeys())
      return keys.map(String)
    },
  }
}

const settings = keyValue('settings')
const meta = keyValue('meta')

// ─── Перенос файлом ────────────────────────────────────────────────────────

/**
 * Полный слепок синхронизируемых данных.
 * Удалённые записи включены: без надгробий второе устройство их воскресит.
 */
async function exportAll(): Promise<Snapshot> {
  const data = {} as Snapshot['data']

  for (const store of SYNCED_STORES) {
    // Присваивание через промежуточную переменную — иначе TypeScript
    // не связывает ключ и тип записи.
    Object.assign(data, { [store]: await getAll(store, { includeDeleted: true }) })
  }

  return { schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), data }
}

/**
 * Загрузка слепка. Сливается по Р-07, а не затирает: файл может быть старше
 * того, что уже есть на устройстве.
 *
 * Записи метятся грязными — они пришли из файла, а не с сервера, и должны
 * уехать в синхронизацию.
 */
async function importAll(snapshot: Snapshot): Promise<number> {
  if (snapshot.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Файл сделан в более новой версии приложения (схема ${snapshot.schemaVersion}, ` +
        `здесь ${SCHEMA_VERSION}). Обновите приложение.`,
    )
  }
  if (snapshot.schemaVersion < SCHEMA_VERSION) {
    throw new Error(
      `Файл со схемой ${snapshot.schemaVersion}, здесь ${SCHEMA_VERSION}. ` +
        'Миграция данных при загрузке ещё не написана.',
    )
  }

  let applied = 0
  for (const store of SYNCED_STORES) {
    applied += await merge(store, snapshot.data[store], 'imported')
  }
  return applied
}

// ─── Публичный интерфейс ───────────────────────────────────────────────────

export const db = {
  get,
  getAll,
  count,
  put,
  putMany,
  putRemote,
  remove,
  merge,
  listDirty,
  clearDirty,
  exportAll,
  importAll,
  settings,
  meta,

  /** Открывает базу и отмечает версию схемы. Вызывается на старте. */
  async ready(): Promise<void> {
    await open()
    await meta.set('schemaVersion', SCHEMA_VERSION)
  },

  /** Закрывает соединение. Нужно тестам и переключению вкладок. */
  async close(): Promise<void> {
    if (!connection) return
    const database = await connection
    database.close()
    connection = null
  },
}
