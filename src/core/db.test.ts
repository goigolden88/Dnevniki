import { describe, expect, it } from 'vitest'
import { db } from './db.ts'
import { SCHEMA_VERSION, SYNCED_STORES } from './model.ts'

/**
 * Здесь только `parseSnapshot`: он чистый и работает без IndexedDB,
 * которого в node нет. Остальное в `db` проверяется на устройстве.
 */

function snapshot(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '2026-09-07T10:00:00.000Z',
    data: { items: [{ id: 'i1', updatedAt: '2026-09-07T10:00:00.000Z', name: 'Стрижка' }] },
    ...over,
  })
}

describe('parseSnapshot', () => {
  it('разбирает свой же слепок и добивает недостающие хранилища пустыми', () => {
    const parsed = db.parseSnapshot(snapshot())
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION)
    expect(parsed.exportedAt).toBe('2026-09-07T10:00:00.000Z')
    expect(parsed.data.items).toHaveLength(1)
    for (const store of SYNCED_STORES) {
      expect(Array.isArray(parsed.data[store])).toBe(true)
    }
  })

  it('отвергает не JSON и не объект', () => {
    expect(() => db.parseSnapshot('не json')).toThrow('Это не JSON')
    expect(() => db.parseSnapshot('[]')).toThrow('не объект')
    expect(() => db.parseSnapshot('null')).toThrow('не объект')
  })

  it('отвергает чужой файл без версии схемы', () => {
    expect(() => db.parseSnapshot(JSON.stringify({ data: {} }))).toThrow('версии схемы')
  })

  it('отвергает слепок без данных', () => {
    expect(() => db.parseSnapshot(JSON.stringify({ schemaVersion: 1 }))).toThrow('нет данных')
  })

  it('отвергает хранилище не массивом', () => {
    expect(() => db.parseSnapshot(snapshot({ data: { items: 'нет' } }))).toThrow('не массив')
  })

  it('отвергает файл целиком из-за одной записи без id — половина хуже отказа', () => {
    const broken = snapshot({
      data: {
        items: [
          { id: 'i1', updatedAt: '2026-09-07T10:00:00.000Z' },
          { updatedAt: '2026-09-07T10:00:00.000Z' },
        ],
      },
    })
    expect(() => db.parseSnapshot(broken)).toThrow('без id или updatedAt')
  })

  it('подставляет время разбора, если в файле нет exportedAt', () => {
    const parsed = db.parseSnapshot(snapshot({ exportedAt: undefined }))
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
