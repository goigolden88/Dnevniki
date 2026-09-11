import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { today } from './core/dates.ts'
import { createLegacyBase, db } from './core/db.ts'
import { buildFiles, parseFile, storeOf } from './core/layout.ts'
import { migrations, SCHEMA_VERSION, SYNCED_STORES } from './core/model.ts'
import { contentStats, staleWatching } from './modules/content/content.ts'
import { cycleStates, spendTree } from './modules/cycles/cycles.ts'
import { healthStats, openEpisodes } from './modules/health/health.ts'
import { feedItems, KIND_ORDER, markdownExport } from './registry.ts'

/**
 * Проверка на копии настоящих данных (Р-72).
 *
 * Запуск — `npm run check:data -- <файл-копия>`; без файла пропускается,
 * и обычный `npm run test` её не гоняет. Копия — «Сохранить в файл» или
 * «Поделиться» из «Настроек».
 *
 * Что делает. Строит базу в раскладке той версии схемы, в которой сделана
 * копия, — ровно так база лежит на телефоне до обновления. Открывает её
 * текущим кодом: миграции идут тем же путём, что у человека. Дальше
 * проверяет, что ни одна запись не пропала, а при аддитивных шагах — не
 * изменилась, и что всё, что читает базу, на этих данных не падает: расчёт
 * модулей, лента, markdown, раскладка по файлам синхронизации, повторная
 * выгрузка.
 *
 * Экранов не видит: их на тех же данных обходит `npm run smoke -- --data`.
 */

// Типов Node в проекте нет: тесты пишутся для кода браузера. Здесь нужны
// ровно две вещи из Node — переменная окружения и чтение файла.
declare const process: { env: Record<string, string | undefined> }
const FILE = process.env.DNEVNIKI_DATA
/**
 * Куда положить отчёт. Vitest глотает вывод прошедшего теста, поэтому
 * отчёт пишется файлом, а печатает его `scripts/check-data.mjs`.
 */
const REPORT = process.env.DNEVNIKI_REPORT

type Keyed = { id: string }

describe.skipIf(!FILE)('копия настоящих данных — Р-72', () => {
  it('база версии копии переезжает на текущую, всё читается', async () => {
    const fsModule = 'node:fs'
    const { readFileSync, writeFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
      readFileSync: (path: string, encoding: 'utf8') => string
      writeFileSync: (path: string, text: string, encoding: 'utf8') => void
    }
    const snapshot = db.parseSnapshot(readFileSync(FILE ?? '', 'utf8'))
    const day = today()

    // База как у человека до обновления.
    const skipped = await createLegacyBase(snapshot.schemaVersion, snapshot.data)
    expect(skipped, 'в копии есть хранилища, которых в её схеме не было').toEqual([])

    // Текущий код открывает её — здесь идут миграции.
    await db.ready()
    const after = await db.exportAll()

    const steps = migrations.filter((step) => step.to > snapshot.schemaVersion)
    const additive = steps.every((step) => step.additive)
    const report = [
      `Копия от ${snapshot.exportedAt}: схема ${snapshot.schemaVersion} → ${SCHEMA_VERSION}, ` +
        `шагов миграции ${steps.length}${steps.length > 0 ? (additive ? ', все аддитивные' : ', есть с изменением формы') : ''}`,
    ]

    // Ни одна запись не пропала; при аддитивных шагах — не изменилась.
    for (const store of SYNCED_STORES) {
      const before = (snapshot.data[store] ?? []) as readonly Keyed[]
      const now = after.data[store] as readonly Keyed[]
      const byId = new Map(now.map((record) => [record.id, record]))
      const lost = before.filter((record) => !byId.has(record.id)).map((record) => record.id)
      expect(lost, `${store}: пропали записи`).toEqual([])
      if (additive) {
        for (const record of before) expect(byId.get(record.id), `${store}/${record.id}`).toEqual(record)
      }
      report.push(`  ${store}: ${before.length} → ${now.length}`)
    }

    // Повторная выгрузка принимается своей же проверкой.
    expect(() => db.parseSnapshot(JSON.stringify(after))).not.toThrow()

    // Раскладка по файлам синхронизации: каждая запись — ровно в одном файле.
    const data = after.data
    const files = buildFiles(data)
    for (const store of SYNCED_STORES) {
      const laid = files
        .filter((file) => storeOf(file.path) === store)
        .flatMap((file) => parseFile(file.path, file.content))
      expect(laid.length, `${store}: записей в файлах`).toBe(data[store].length)
    }
    report.push(`Файлов синхронизации: ${files.length}`)

    // Всё, что читает базу, на этих данных не падает.
    const states = cycleStates(data.items, data.cycleEvents, day)
    spendTree(data.items, data.cycleEvents)
    healthStats(data.episodes, {}, day)
    openEpisodes(data.episodes, day)
    contentStats(data.content)
    staleWatching(data.content, day)
    const feed = feedItems(data, day)
    const markdown = markdownExport(data, day, KIND_ORDER)
    expect(markdown.startsWith('# Дневники')).toBe(true)
    report.push(`Позиций на «Сейчас»: ${states.length}, строк ленты: ${feed.length}, markdown: ${markdown.length} знаков`)

    if (REPORT) writeFileSync(REPORT, report.join('\n'), 'utf8')
  })
})
