import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, SYNCED_STORES } from '../core/model.ts'
import { SEED_UPDATED_AT, seedId } from './ids.ts'
import { SeedError, seedToSnapshot, type SeedFiles } from './seed.ts'

const cycles: SeedFiles['cycles'] = {
  items: [
    {
      name: 'Стрижка',
      cat: 'Гигиена',
      intervalDays: null,
      marks: [{ date: '2026-03-03', note: 'сам себя' }, { date: '2026-05-27', price: 700 }],
    },
  ],
}

const health: SeedFiles['health'] = {
  episodes: [
    {
      title: 'Простуда',
      source: 'self',
      start: '2026-03-02',
      end: '2026-03-04',
      symptoms: ['горло', 'Горло', 'насморк'],
    },
  ],
  measures: [{ metric: 'weight', date: '2025-12-21', value: 68 }],
  sessions: [{ activity: 'бег', date: '2026-03-02', durationMin: 40 }],
}

const content: SeedFiles['content'] = {
  entries: [
    {
      type: 'anime',
      title: 'Магическая битва 3',
      start: '2026-01',
      end: null,
      status: 'done',
      score: 6.5,
    },
  ],
}

describe('seedId', () => {
  it('один и тот же ключ даёт один и тот же id — ради этого всё и затевалось', () => {
    expect(seedId('item:Стрижка')).toBe(seedId('item:Стрижка'))
  })

  it('разные ключи разводятся', () => {
    expect(seedId('item:Стрижка')).not.toBe(seedId('item:Стрижка волос'))
  })

  it('форма ULID: 26 символов из Crockford base32', () => {
    expect(seedId('что угодно')).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})

describe('seedToSnapshot — циклы', () => {
  const { snapshot, report } = seedToSnapshot({ cycles })

  it('версия схемы своя, все хранилища на месте', () => {
    expect(snapshot.schemaVersion).toBe(SCHEMA_VERSION)
    for (const store of SYNCED_STORES) expect(Array.isArray(snapshot.data[store])).toBe(true)
  })

  it('позиция и её отметки связаны по itemId', () => {
    const item = snapshot.data.items[0]
    expect(item?.name).toBe('Стрижка')
    expect(snapshot.data.cycleEvents.every((event) => event.itemId === item?.id)).toBe(true)
    expect(report).toMatchObject({ items: 1, cycleEvents: 2 })
  })

  it('цена и заметка переносятся, пустые поля не появляются', () => {
    const [first, second] = snapshot.data.cycleEvents
    expect(first?.note).toBe('сам себя')
    expect(first && 'price' in first).toBe(false)
    expect(second?.price).toBe(700)
  })

  it('все записи помечены неподвижным временем переноса', () => {
    expect(snapshot.data.items.every((item) => item.updatedAt === SEED_UPDATED_AT)).toBe(true)
  })

  it('повторный прогон даёт те же id — загрузка дважды не плодит дубликаты', () => {
    const again = seedToSnapshot({ cycles })
    expect(again.snapshot.data.items.map((item) => item.id)).toEqual(
      snapshot.data.items.map((item) => item.id),
    )
    expect(again.snapshot.data.cycleEvents.map((event) => event.id)).toEqual(
      snapshot.data.cycleEvents.map((event) => event.id),
    )
  })
})

describe('seedToSnapshot — здоровье', () => {
  const { snapshot, report } = seedToSnapshot({ health })

  it('симптомы становятся тегами, повтор в другом регистре — одним тегом', () => {
    const symptomTags = snapshot.data.tags.filter((tag) => tag.scope === 'symptom')
    expect(symptomTags.map((tag) => tag.name).sort()).toEqual(['горло', 'насморк'])
    expect(snapshot.data.episodes[0]?.symptoms).toHaveLength(3)
    expect(new Set(snapshot.data.episodes[0]?.symptoms).size).toBe(2)
  })

  it('вид тренировки тоже тег, но другой области', () => {
    expect(snapshot.data.tags.some((tag) => tag.scope === 'activity' && tag.name === 'бег')).toBe(
      true,
    )
    expect(report.sessions).toBe(1)
  })

  it('незакрытый эпизод остаётся с end: null', () => {
    const open = seedToSnapshot({
      health: { episodes: [{ ...health!.episodes[0]!, end: null }], measures: [], sessions: [] },
    })
    expect(open.snapshot.data.episodes[0]?.end).toBeNull()
  })
})

describe('seedToSnapshot — контент', () => {
  const { snapshot } = seedToSnapshot({ content })

  it('месячная дата принимается как есть, день не выдумывается', () => {
    expect(snapshot.data.content[0]?.start).toBe('2026-01')
  })

  it('дробная оценка сохраняется', () => {
    expect(snapshot.data.content[0]?.score).toBe(6.5)
  })

  it('оценка вне шкалы или мельче шага 0.1 — отказ с названием записи', () => {
    const bad = (score: number) => () =>
      seedToSnapshot({ content: { entries: [{ ...content!.entries[0]!, score }] } })
    expect(bad(11)).toThrow(SeedError)
    expect(bad(6.55)).toThrow('Магическая битва 3')
  })

  it('неизвестный тип и статус отвергаются', () => {
    expect(() =>
      seedToSnapshot({
        content: { entries: [{ ...content!.entries[0]!, type: 'манга' as never }] },
      }),
    ).toThrow('неизвестный тип')
  })
})

describe('seedToSnapshot — отказы', () => {
  it('битая дата отметки называет позицию и саму дату', () => {
    expect(() =>
      seedToSnapshot({
        cycles: { items: [{ name: 'Стрижка', cat: 'Гигиена', intervalDays: null, marks: [{ date: '03.03.2026' }] }] },
      }),
    ).toThrow('03.03.2026')
  })

  it('месячная дата в циклах не проходит — там точность полная', () => {
    expect(() =>
      seedToSnapshot({
        cycles: { items: [{ name: 'Стрижка', cat: 'Гигиена', intervalDays: null, marks: [{ date: '2026-03' }] }] },
      }),
    ).toThrow(SeedError)
  })

  it('пустых файлов достаточно — переносится то, что дали', () => {
    const { report } = seedToSnapshot({})
    expect(report).toEqual({
      items: 0,
      cycleEvents: 0,
      episodes: 0,
      measures: 0,
      sessions: 0,
      tags: 0,
      content: 0,
    })
  })
})
