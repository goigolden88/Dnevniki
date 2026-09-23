import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../shared/core/db.ts'
import { createImporting } from '../shared/core/importing.ts'
import { createLayout } from '../shared/core/layout.ts'
import { LOCAL_STORES } from '../shared/core/model.ts'
import { isEmptyBase } from '../shared/screens/firstRun.ts'
import { config } from './config.ts'
import {
  OWN_STORES,
  SCHEMA_VERSION,
  SYNCED_STORES,
  type CycleCategory,
  type CycleEvent,
  type ContentEntry,
  type StoreRecord,
  type SyncedStore,
} from './model.ts'

/**
 * Конфиг «Дневников» для ядра (Р-81, Р-82).
 *
 * Механику ядра проверяют его тесты на подставной «Полке», в CI ядра. Здесь —
 * своё: то, что до перевода проверялось тестами `core/*` на хранилищах
 * «Дневников» и что лежит на устройствах и в репозитории данных, — имя базы,
 * хранилища, индексы, миграция, раскладка, промпт. И главное для перевода:
 * база, заведённая прежним кодом на версии 2, открывается ядром с прежними
 * записями, а свежая доезжает до версии 2 тем же шагом (Р-81).
 */

const db = createDb(config)
const layout = createLayout(config)
const importing = createImporting(config)

const AT = '2026-09-09T10:00:00.000Z'

beforeEach(async () => {
  await db.close().catch(() => {})
  globalThis.indexedDB = new IDBFactory()
})

afterEach(async () => {
  await db.close().catch(() => {})
})

function mark(id: string, date: string): CycleEvent {
  return { id, updatedAt: AT, itemId: 'i1', date }
}

function entry(id: string, start: string | null): ContentEntry {
  return { id, updatedAt: AT, type: 'anime', title: 'Тайтл', start, end: null, status: 'planned', score: null }
}

function category(id: string): CycleCategory {
  return { id, updatedAt: AT, name: 'Гигиена', order: 0 }
}

function data(parts: { cycleEvents?: CycleEvent[]; content?: ContentEntry[] }): {
  [S in SyncedStore]: StoreRecord[S][]
} {
  return {
    items: [],
    categories: [],
    tags: [],
    templates: [],
    cycleEvents: parts.cycleEvents ?? [],
    episodes: [],
    measures: [],
    sessions: [],
    content: parts.content ?? [],
  }
}

describe('данные не трогаются переводом', () => {
  it('база называется dnevniki — на общем origin только имя разводит приложения семьи', () => {
    expect(config.dbName).toBe('dnevniki')
  })

  it('версия схемы 2, одна миграция — хранилище categories, аддитивная (Р-59)', () => {
    expect(config.schemaVersion).toBe(2)
    expect(SCHEMA_VERSION).toBe(2)
    expect(config.migrations.map((step) => [step.to, step.additive])).toEqual([[2, true]])
  })

  it('девять хранилищ; categories нет в раскладке версии 1 — его заводит миграция', () => {
    expect([...config.stores]).toEqual([
      'items',
      'categories',
      'tags',
      'templates',
      'cycleEvents',
      'episodes',
      'measures',
      'sessions',
      'content',
    ])
    expect([...config.v1Stores]).toEqual(SYNCED_STORES.filter((store) => store !== 'categories'))
  })

  it('формат импорта прежний', () => {
    expect(config.importFormat).toBe('dnevniki-import')
  })

  it('записи человека — позиции, отметки, здоровье, контент; категории, теги и шаблоны не в счёт (Р-69)', () => {
    expect([...OWN_STORES]).toEqual(['items', 'cycleEvents', 'episodes', 'measures', 'sessions', 'content'])
    expect(isEmptyBase({ categories: 5, tags: 3, templates: 1 }, OWN_STORES)).toBe(true)
    expect(isEmptyBase({ content: 1 }, OWN_STORES)).toBe(false)
  })
})

describe('схема базы', () => {
  it('свежая база доезжает до версии 2 тем же шагом: все хранилища, индексы прежние', async () => {
    await db.ready()
    await db.close()
    const raw = await openRaw()
    try {
      expect(raw.version).toBe(2)
      for (const store of [...SYNCED_STORES, ...LOCAL_STORES]) expect(raw.objectStoreNames.contains(store)).toBe(true)
      const tx = raw.transaction([...SYNCED_STORES], 'readonly')
      const indexes = (store: SyncedStore) => [...tx.objectStore(store).indexNames].sort()
      for (const store of SYNCED_STORES) expect(indexes(store)).toEqual(['updatedAt', ...LEGACY_INDEXES[store]].sort())
    } finally {
      raw.close()
    }
  })

  it('база, заведённая прежним кодом на версии 2, открывается с записями, настройкой и очередью отправки', async () => {
    // Ровно так её заводили `createStores` и шаг миграции 2 в `core/db.ts`
    // до перевода: на телефоне лежит именно она, переустанавливать нельзя.
    await legacyBase({ cycleEvents: [mark('m1', '2026-09-10')], categories: [category('c1')] })

    await db.ready()
    expect(await db.get('cycleEvents', 'm1')).toMatchObject({ date: '2026-09-10', itemId: 'i1' })
    expect(await db.get('categories', 'c1')).toMatchObject({ name: 'Гигиена' })
    expect(await db.settings.get('syncRepo')).toBe('me/dnevniki-data')
    expect(await db.settings.get('reminderLastDay')).toBe('2026-09-23')
    // Неотправленное до обновления уедет первым же проходом.
    expect(await db.listDirty()).toEqual([{ store: 'cycleEvents', id: 'm1', at: AT }])
    expect(await db.meta.get('schemaVersion')).toBe(2)
  })
})

describe('раскладка репозитория данных', () => {
  it('справочники и здоровье — одним файлом, отметки и контент — по годам', () => {
    const paths = layout
      .buildFiles(data({ cycleEvents: [mark('a', '2025-12-31')], content: [entry('b', '2026-01')] }))
      .map((file) => file.path)
    expect(paths).toEqual([
      'categories.json',
      'content/2026.json',
      'cycles/2025.json',
      'health/episodes.json',
      'health/measures.json',
      'health/sessions.json',
      'items.json',
      'meta.json',
      'tags.json',
      'templates.json',
    ])
  })

  it('без даты и с испорченной датой — в undated, не пропадает (Р-34)', () => {
    const paths = layout
      .buildFiles(data({ cycleEvents: [mark('a', '2026-02-30')], content: [entry('b', null)] }))
      .map((file) => file.path)
    expect(paths).toContain('cycles/undated.json')
    expect(paths).toContain('content/undated.json')
  })

  it('файлы узнаются обратно; чужие — нет', () => {
    expect(layout.storeOf('cycles/2026.json')).toBe('cycleEvents')
    expect(layout.storeOf('content/undated.json')).toBe('content')
    expect(layout.storeOf('health/episodes.json')).toBe('episodes')
    expect(layout.storeOf('content/2026-03.json')).toBeNull()
    expect(layout.storeOf('README.md')).toBeNull()
  })

  it('README называет каждый файл раскладки годами', () => {
    const text = layout.readmeFile().content
    for (const path of [
      'items.json',
      'categories.json',
      'tags.json',
      'templates.json',
      'cycles/ГГГГ.json',
      'cycles/undated.json',
      'health/episodes.json',
      'health/measures.json',
      'health/sessions.json',
      'content/ГГГГ.json',
      'content/undated.json',
    ]) {
      expect(text).toContain(`\`${path}\``)
    }
    expect(text).toContain('# Данные приложения «Дневники»')
    expect(text).toContain('Прошлые годы не переписываются')
  })
})

describe('промпт импорта', () => {
  it('свои правила — первыми, общие ядра — следом, нумерация сплошная', () => {
    const prompt = importing.buildPrompt([], '2026-09-24')
    expect(prompt).toContain('Помоги перенести мои записи в приложение «Дневники».')
    expect(prompt).toContain('мои данные: заметки, таблицы или скриншоты из других сервисов.')
    expect(prompt).toContain('3. Статусы из других сервисов')
    expect(prompt).toContain('4. Скриншоты списков')
    expect(prompt).toContain('5. Разделы, для которых данных нет, не пиши.')
    expect(prompt).toContain('7. После JSON')
  })
})

function openRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dnevniki')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Индексы сверх `updatedAt` — как их заводил прежний код. */
const LEGACY_INDEXES: Record<SyncedStore, readonly string[]> = {
  items: [],
  categories: [],
  tags: [],
  templates: [],
  cycleEvents: ['date', 'itemId'],
  episodes: ['start'],
  measures: ['date', 'metric'],
  sessions: ['date'],
  content: ['start'],
}

const LEGACY_V1 = ['items', 'tags', 'templates', 'cycleEvents', 'episodes', 'measures', 'sessions', 'content'] as const

function legacyBase(records: { cycleEvents: CycleEvent[]; categories: CycleCategory[] }): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dnevniki', 2)
    request.onupgradeneeded = () => {
      const database = request.result
      // Раскладка версии 1…
      for (const store of LEGACY_V1) {
        const created = database.createObjectStore(store, { keyPath: 'id' })
        created.createIndex('updatedAt', 'updatedAt')
        for (const field of LEGACY_INDEXES[store]) created.createIndex(field, field)
      }
      database.createObjectStore('meta', { keyPath: 'key' })
      database.createObjectStore('settings', { keyPath: 'key' })
      database.createObjectStore('dirty', { keyPath: ['store', 'id'] })
      // …и шаг миграции 2.
      database.createObjectStore('categories', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
    }
    request.onsuccess = () => {
      const database = request.result
      const tx = database.transaction(['cycleEvents', 'categories', 'meta', 'settings', 'dirty'], 'readwrite')
      for (const record of records.cycleEvents) tx.objectStore('cycleEvents').put(record)
      for (const record of records.categories) tx.objectStore('categories').put(record)
      tx.objectStore('meta').put({ key: 'schemaVersion', value: 2 })
      tx.objectStore('settings').put({ key: 'syncRepo', value: 'me/dnevniki-data' })
      tx.objectStore('settings').put({ key: 'reminderLastDay', value: '2026-09-23' })
      tx.objectStore('dirty').put({ store: 'cycleEvents', id: 'm1', at: AT })
      tx.oncomplete = () => {
        database.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  })
}
