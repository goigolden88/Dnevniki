import { describe, expect, it } from 'vitest'
import { planTotal, type ImportPlan } from './core/importing.ts'
import {
  feedItems,
  importPrompt,
  KIND_ORDER,
  KINDS,
  markdownExport,
  planImport,
  type Data,
} from './registry.ts'

const at = '2026-09-07T00:00:00.000Z'

function empty(): Data {
  return {
    items: [],
    categories: [],
    tags: [],
    templates: [],
    cycleEvents: [],
    episodes: [],
    measures: [],
    sessions: [],
    content: [],
  }
}

describe('markdown по выбранным разделам — Р-61', () => {
  it('только выбранные разделы, в порядке таблицы', () => {
    const data = empty()
    data.items.push({ id: 'i1', updatedAt: at, name: 'Стрижка', cat: 'Гигиена', intervalDays: null })
    const all = markdownExport(data, '2026-09-10')
    const some = markdownExport(data, '2026-09-10', ['content', 'cycle'])
    expect(all).toContain('## Циклы')
    expect(some).toContain('## Циклы')
    expect(some).not.toContain(KINDS.episode.markdown(data, '2026-09-10'))
    expect(markdownExport(data, '2026-09-10', ['content'])).not.toContain('## Циклы')
  })
})

describe('импорт записей — Р-60', () => {
  let counter = 0
  const ctx = () => ({ newId: () => `n${++counter}`, now: at })

  /** Файл из примеров всех разделов — ровно то, что стоит в промпте. */
  function example(): Record<string, unknown> {
    const file: Record<string, unknown> = { format: 'dnevniki-import', version: 1 }
    for (const kind of KIND_ORDER) file[KINDS[kind].import.spec.section] = KINDS[kind].import.spec.example
    return file
  }

  /** База после записи плана. */
  function applied(data: Data, plan: ImportPlan): Data {
    const next = { ...data } as Record<string, unknown[]>
    for (const [store, records] of Object.entries(plan.writes)) {
      next[store] = [...(next[store] ?? []), ...(records ?? [])]
    }
    return next as unknown as Data
  }

  it('промпт называет все разделы, формат и сегодняшнюю дату', () => {
    const prompt = importPrompt('2026-09-11')
    for (const kind of KIND_ORDER) expect(prompt).toContain(`"${KINDS[kind].import.spec.section}"`)
    expect(prompt).toContain('"format": "dnevniki-import"')
    expect(prompt).toContain('11.09.2026')
  })

  it('пример из промпта проходит собственную проверку без единого замечания', () => {
    const plan = planImport(JSON.stringify(example()), empty(), ctx())
    expect(plan.issues).toEqual([])
    // Каждый раздел примера что-то добавил: ни один не разошёлся со своей проверкой.
    for (const store of ['items', 'cycleEvents', 'episodes', 'measures', 'sessions', 'content'] as const) {
      expect(plan.writes[store]?.length ?? 0).toBeGreaterThan(0)
    }
    expect(planTotal(plan)).toBeGreaterThan(5)
  })

  it('повторная загрузка того же файла ничего не удваивает', () => {
    const text = JSON.stringify(example())
    const first = planImport(text, empty(), ctx())
    const again = planImport(text, applied(empty(), first), ctx())
    expect(planTotal(again)).toBe(0)
    expect(again.skipped).toBeGreaterThan(0)
    expect(again.issues).toEqual([])
  })

  it('JSON в блоке ```json с текстом вокруг — как его отдаёт ИИ', () => {
    const text = `Вот файл:\n\`\`\`json\n${JSON.stringify(example())}\n\`\`\`\nНе разобрал: ничего.`
    expect(planImport(text, empty(), ctx()).issues).toEqual([])
  })

  it('незнакомый раздел — в отчёт, остальные разбираются', () => {
    const text = JSON.stringify({
      format: 'dnevniki-import',
      version: 1,
      food: [],
      content: [{ type: 'film', title: 'Дюна', status: 'done' }],
    })
    const plan = planImport(text, empty(), ctx())
    expect(plan.issues.map((issue) => issue.section)).toEqual(['food'])
    expect(plan.writes.content).toHaveLength(1)
  })

  it('копию приложения отправляет к «Восстановить из копии»', () => {
    expect(() => planImport(JSON.stringify({ schemaVersion: 2, data: {} }), empty(), ctx())).toThrow(
      'Восстановить из копии',
    )
  })

  it('не JSON и чужой JSON — внятный отказ', () => {
    expect(() => planImport('привет', empty(), ctx())).toThrow('не JSON')
    expect(() => planImport('{"items": []}', empty(), ctx())).toThrow('dnevniki-import')
  })
})

describe('реестр видов событий — Р-48', () => {
  it('все пять видов событий на месте, Р-19', () => {
    expect(KIND_ORDER).toEqual(['cycle', 'episode', 'measure', 'session', 'content'])
  })

  it('лента собирает все модули, и у каждой строки вид своего модуля', () => {
    const data = empty()
    data.items.push({ id: 'i1', updatedAt: at, name: 'Стрижка', cat: 'Гигиена', intervalDays: null })
    data.cycleEvents.push({ id: 'c1', updatedAt: at, itemId: 'i1', date: '2026-09-01' })
    data.episodes.push({ id: 'e1', updatedAt: at, title: 'ОРВИ', source: 'self', start: '2026-09-02', end: null, symptoms: [] })
    data.measures.push({ id: 'm1', updatedAt: at, metric: 'weight', date: '2026-09-03', value: 75 })
    data.sessions.push({ id: 's1', updatedAt: at, activity: 'a', date: '2026-09-04' })
    data.content.push({ id: 'k1', updatedAt: at, type: 'film', title: 'Дюна', start: '2026-09', end: null, status: 'done', score: 8 })

    const items = feedItems(data, '2026-09-10')
    expect(items.map((each) => [each.kind, each.id])).toEqual([
      ['cycle', 'c1'],
      ['episode', 'e1'],
      ['measure', 'm1'],
      ['session', 's1'],
      ['content', 'k1'],
    ])
  })

  it('выгрузка — заголовок и раздел на каждый вид даже без данных', () => {
    const text = markdownExport(empty(), '2026-09-10')
    expect(text.startsWith('# Дневники')).toBe(true)
    expect(text).toContain('Выгрузка от 10.09.2026')
    for (const heading of ['## Циклы', '## Болезни', '## Измерения', '## Тренировки', '## Контент']) {
      expect(text).toContain(heading)
    }
  })

  it('подписи видов не пустые', () => {
    for (const kind of KIND_ORDER) expect(KINDS[kind].label).not.toBe('')
  })
})
