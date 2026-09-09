import { describe, expect, it } from 'vitest'
import { blobSha } from './github.ts'
import { buildFiles, canonical, parseFile, parseMeta, storeOf } from './layout.ts'
import { SCHEMA_VERSION, SYNCED_STORES } from './model.ts'
import type { ContentEntry, CycleEvent, StoreRecord, SyncedStore } from './model.ts'

/** Пустая база: все хранилища есть, записей нет. */
function empty(): { [S in SyncedStore]: StoreRecord[S][] } {
  const data = {} as { [S in SyncedStore]: StoreRecord[S][] }
  for (const store of SYNCED_STORES) Object.assign(data, { [store]: [] })
  return data
}

function withData(over: Partial<{ [S in SyncedStore]: StoreRecord[S][] }>) {
  return { ...empty(), ...over }
}

function mark(id: string, date: string, over: Partial<CycleEvent> = {}): CycleEvent {
  return { id, updatedAt: '2026-09-09T10:00:00.000Z', itemId: 'item1', date, ...over }
}

function entry(id: string, start: string | null): ContentEntry {
  return {
    id,
    updatedAt: '2026-09-09T10:00:00.000Z',
    type: 'anime',
    title: 'Тайтл',
    start,
    end: null,
    status: start === null ? 'planned' : 'done',
    score: null,
  }
}

function pathsOf(files: { path: string }[]): string[] {
  return files.map((file) => file.path)
}

describe('раскладка', () => {
  it('пустая база даёт файлы без нарезки и meta', () => {
    expect(pathsOf(buildFiles(empty()))).toEqual([
      'health/episodes.json',
      'health/measures.json',
      'health/sessions.json',
      'items.json',
      'meta.json',
      'tags.json',
      'templates.json',
    ])
  })

  it('отметки циклов режутся по годам', () => {
    const files = buildFiles(
      withData({ cycleEvents: [mark('a', '2025-12-31'), mark('b', '2026-01-01')] }),
    )
    expect(pathsOf(files)).toContain('cycles/2025.json')
    expect(pathsOf(files)).toContain('cycles/2026.json')

    const y2026 = files.find((file) => file.path === 'cycles/2026.json')
    expect(JSON.parse(y2026?.content ?? '[]')).toHaveLength(1)
  })

  it('контент с месячной датой попадает в год месяца', () => {
    // Р-25: у контента дата может быть точностью до месяца.
    const files = buildFiles(withData({ content: [entry('a', '2026-03')] }))
    expect(pathsOf(files)).toContain('content/2026.json')
  })

  it('запись без даты уезжает в undated, а не теряется', () => {
    // Р-34: список «к просмотру» — 72 записи уже в базе, года у них нет.
    const files = buildFiles(withData({ content: [entry('a', null), entry('b', '2026-03')] }))
    expect(pathsOf(files)).toContain('content/undated.json')
    expect(JSON.parse(files.find((f) => f.path === 'content/undated.json')?.content ?? '[]'))
      .toHaveLength(1)
  })

  it('запись с испорченной датой тоже не пропадает', () => {
    const files = buildFiles(withData({ cycleEvents: [mark('a', 'не дата')] }))
    expect(pathsOf(files)).toContain('cycles/undated.json')
  })

  it('надгробия уезжают вместе с живыми записями', () => {
    // Без них второе устройство воскресит удалённое (Р-07).
    const files = buildFiles(
      withData({ cycleEvents: [mark('a', '2026-01-01', { deleted: true })] }),
    )
    const content = files.find((file) => file.path === 'cycles/2026.json')?.content ?? ''
    expect(JSON.parse(content)[0].deleted).toBe(true)
  })

  it('meta.json несёт версию схемы', () => {
    const meta = buildFiles(empty()).find((file) => file.path === 'meta.json')
    expect(parseMeta(meta?.content ?? '')).toBe(SCHEMA_VERSION)
  })
})

describe('опустевший год', () => {
  const before = withData({ cycleEvents: [mark('a', '2025-12-31')] })
  const after = withData({ cycleEvents: [mark('a', '2026-01-01')] })

  it('перезаписывается пустым, если файл читали на этом же проходе', () => {
    // Иначе на сервере навсегда осталась бы копия записи в старом году.
    const files = buildFiles(after, { merged: pathsOf(buildFiles(before)) })
    const old = files.find((file) => file.path === 'cycles/2025.json')
    expect(JSON.parse(old?.content ?? 'null')).toEqual([])
  })

  it('нечитанные пути не трогаются', () => {
    const files = buildFiles(after)
    expect(pathsOf(files)).not.toContain('cycles/2025.json')
  })

  it('чужие файлы в репозитории не затираются', () => {
    const files = buildFiles(after, { merged: ['README.md', '.gitignore'] })
    expect(pathsOf(files)).not.toContain('README.md')
    expect(pathsOf(files)).not.toContain('.gitignore')
  })
})

describe('канонический вид', () => {
  it('порядок ключей в записи не меняет файл', async () => {
    // Запись из формы и запись с сервера собираются по-разному. Разойдись
    // тут байты — каждая синхронизация переписывала бы весь репозиторий (Р-33).
    const one = canonical([{ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z', deleted: false } as never])
    const two = canonical([{ deleted: false, updatedAt: '2026-01-01T00:00:00.000Z', id: 'a' } as never])
    expect(one).toBe(two)
    expect(await blobSha(one)).toBe(await blobSha(two))
  })

  it('порядок записей на входе не меняет файл', () => {
    const a = mark('a', '2026-01-01')
    const b = mark('b', '2026-02-01')
    expect(canonical([a, b])).toBe(canonical([b, a]))
  })

  it('вложенные объекты тоже упорядочиваются', () => {
    const one = { id: 'a', updatedAt: 'x', ext: { source: 's', id: 'i' } } as never
    const two = { id: 'a', updatedAt: 'x', ext: { id: 'i', source: 's' } } as never
    expect(canonical([one])).toBe(canonical([two]))
  })

  it('порядок в массивах сохраняется — это данные', () => {
    const one = { id: 'a', updatedAt: 'x', symptoms: ['b', 'a'] } as never
    const two = { id: 'a', updatedAt: 'x', symptoms: ['a', 'b'] } as never
    expect(canonical([one])).not.toBe(canonical([two]))
  })

  it('файл заканчивается переводом строки', () => {
    expect(canonical([])).toBe('[]\n')
  })
})

describe('storeOf', () => {
  it('узнаёт свои файлы', () => {
    expect(storeOf('items.json')).toBe('items')
    expect(storeOf('health/measures.json')).toBe('measures')
    expect(storeOf('cycles/2026.json')).toBe('cycleEvents')
    expect(storeOf('content/undated.json')).toBe('content')
  })

  it('чужие файлы не признаёт своими', () => {
    expect(storeOf('README.md')).toBeNull()
    expect(storeOf('meta.json')).toBeNull()
    expect(storeOf('cycles/2026.txt')).toBeNull()
    expect(storeOf('cycles/двадцать.json')).toBeNull()
    expect(storeOf('other/2026.json')).toBeNull()
  })

  it('каждый построенный файл, кроме meta, опознаётся обратно', () => {
    const files = buildFiles(
      withData({ cycleEvents: [mark('a', '2026-01-01')], content: [entry('b', null)] }),
    )
    for (const file of files) {
      if (file.path === 'meta.json') continue
      expect(storeOf(file.path), file.path).not.toBeNull()
    }
  })
})

describe('разбор файлов с сервера', () => {
  it('читает список записей', () => {
    const records = parseFile('items.json', '[{"id":"a","updatedAt":"2026-01-01T00:00:00.000Z"}]')
    expect(records).toHaveLength(1)
  })

  it('отвергает не JSON и не список', () => {
    expect(() => parseFile('items.json', 'мусор')).toThrow('не JSON')
    expect(() => parseFile('items.json', '{}')).toThrow('не список')
  })

  it('отвергает записи без id или updatedAt — на них держится слияние', () => {
    expect(() => parseFile('items.json', '[{"id":"a"}]')).toThrow('без id или updatedAt')
    expect(() => parseFile('items.json', '[null]')).toThrow('без id или updatedAt')
  })

  it('meta.json без версии — не наш репозиторий', () => {
    expect(parseMeta('{"schemaVersion":1}')).toBe(1)
    expect(() => parseMeta('{}')).toThrow('не репозиторий Дневников')
    expect(() => parseMeta('{"schemaVersion":"1"}')).toThrow('не репозиторий Дневников')
    expect(() => parseMeta('нет')).toThrow('не JSON')
  })

  it('свой же файл читается обратно', () => {
    const files = buildFiles(withData({ cycleEvents: [mark('a', '2026-01-01')] }))
    const file = files.find((each) => each.path === 'cycles/2026.json')
    expect(parseFile(file?.path ?? '', file?.content ?? '')[0]?.id).toBe('a')
  })
})
