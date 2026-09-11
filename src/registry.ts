/**
 * Реестр видов событий (Р-48).
 *
 * Таблица, а не механизм: на каждый вид события — подпись, строки ленты
 * и раздел выгрузки в markdown. Сами функции живут в модулях
 * (`modules/<имя>/feed.ts`), здесь они только сведены вместе.
 *
 * Ключ — вид события, а не модуль: лента и выгрузка работают с событиями,
 * а у здоровья их три вида. Тип `{ [K in EventKind]: … }` проверяется
 * компилятором на полноту — новый вид в модели не соберётся, пока здесь
 * нет его строки. Та же манера, что `PLACES` в `core/layout.ts`.
 *
 * Чего здесь нет намеренно: маршрутов, вкладок и блоков «Сейчас». Порядок
 * на «Сейчас» — продуктовое решение, из списка он не выводится.
 *
 * Это одно из немногих мест, которые знают все модули разом, — вместе
 * с `app.tsx`, `notify.ts` и `screens/`. Модули друг про друга не знают.
 */

import type { Snapshot } from './core/db.ts'
import { formatDate, type DateStr } from './core/dates.ts'
import type { FeedItem } from './core/feed.ts'
import {
  buildPrompt,
  mergeResults,
  readImportFile,
  type ImportContext,
  type ImportPlan,
  type ImportSpec,
} from './core/importing.ts'
import type { EventKind } from './core/model.ts'
import { contentFeed, contentMarkdown } from './modules/content/feed.ts'
import { contentImportSpec, importContent } from './modules/content/import.ts'
import { cycleFeed, cycleMarkdown } from './modules/cycles/feed.ts'
import { cycleImportSpec, importCycles } from './modules/cycles/import.ts'
import {
  episodeFeed,
  episodeMarkdown,
  measureFeed,
  measureMarkdown,
  sessionFeed,
  sessionMarkdown,
} from './modules/health/feed.ts'
import {
  episodeImportSpec,
  importEpisodes,
  importMeasures,
  importSessions,
  measureImportSpec,
  sessionImportSpec,
} from './modules/health/import.ts'

/**
 * Все синхронизируемые хранилища, вместе с надгробиями. Надгробия нужны
 * справочникам: у отметки удалённой позиции должно остаться имя. Сами
 * события без надгробий отбирают модули.
 */
export type Data = Snapshot['data']

type KindEntry = {
  /** Подпись чипа в ленте и строки вида. */
  label: string
  feed: (data: Data, day: DateStr) => FeedItem[]
  markdown: (data: Data, day: DateStr) => string
  /** Раздел импорта записей (Р-60): описание для промпта и разбор. */
  import: { spec: ImportSpec; run: (raw: unknown, data: Data, ctx: ImportContext) => ImportPlan }
}

export const KINDS: { readonly [K in EventKind]: KindEntry } = {
  cycle: {
    label: 'Циклы',
    feed: (data) => cycleFeed(data.items, data.cycleEvents),
    markdown: (data, day) => cycleMarkdown(data.items, data.cycleEvents, day, data.categories),
    import: { spec: cycleImportSpec, run: importCycles },
  },
  episode: {
    label: 'Болезни',
    feed: (data, day) => episodeFeed(data.episodes, data.tags, day),
    markdown: (data, day) => episodeMarkdown(data.episodes, data.tags, day),
    import: { spec: episodeImportSpec, run: importEpisodes },
  },
  measure: {
    label: 'Измерения',
    feed: (data) => measureFeed(data.measures),
    markdown: (data) => measureMarkdown(data.measures),
    import: { spec: measureImportSpec, run: importMeasures },
  },
  session: {
    label: 'Тренировки',
    feed: (data) => sessionFeed(data.sessions, data.tags),
    markdown: (data) => sessionMarkdown(data.sessions, data.tags),
    import: { spec: sessionImportSpec, run: importSessions },
  },
  content: {
    label: 'Контент',
    feed: (data) => contentFeed(data.content),
    markdown: (data) => contentMarkdown(data.content),
    import: { spec: contentImportSpec, run: importContent },
  },
}

/** Порядок видов на экране и в выгрузке — порядок строк таблицы. */
export const KIND_ORDER = Object.keys(KINDS) as EventKind[]

/** Все строки ленты, без порядка: порядок — дело `core/feed.ts`. */
export function feedItems(data: Data, day: DateStr): FeedItem[] {
  return KIND_ORDER.flatMap((kind) => KINDS[kind].feed(data, day))
}

/**
 * Выгрузка в markdown одним файлом: раздел на вид события.
 *
 * Читать глазами, а не переносить: обратно файл не загружается (Р-11),
 * для переноса — слепок JSON из тех же «Настроек».
 */
export function markdownExport(
  data: Data,
  day: DateStr,
  /** Какие разделы выгружать (Р-61). Порядок всё равно — порядок таблицы. */
  kinds: readonly EventKind[] = KIND_ORDER,
): string {
  const head = [
    '# Дневники',
    '',
    `Выгрузка от ${formatDate(day)}. Для чтения: обратно в приложение этот файл не загружается,`,
    'для переноса данных есть выгрузка в JSON.',
  ].join('\n')
  const sections = KIND_ORDER.filter((kind) => kinds.includes(kind)).map((kind) =>
    KINDS[kind].markdown(data, day),
  )
  return `${[head, ...sections].join('\n\n')}\n`
}

/**
 * План импорта записей (Р-60): что добавится, что уже есть, что не
 * разобрано. В базу не пишет — сначала сводка, запись только по кнопке.
 * Кидает, если файл не тот вовсе.
 */
export function planImport(text: string, data: Data, ctx: ImportContext): ImportPlan {
  const sections = readImportFile(text)
  const bySection = new Map(KIND_ORDER.map((kind) => [KINDS[kind].import.spec.section, KINDS[kind].import]))

  const results = Object.entries(sections).map(([section, raw]): ImportPlan => {
    const entry = bySection.get(section)
    if (entry) return entry.run(raw, data, ctx)
    return {
      writes: {},
      added: [],
      skipped: 0,
      issues: [{ section, title: `раздел «${section}»`, reason: 'такого раздела нет — пропущен целиком' }],
    }
  })
  return mergeResults(results)
}

/** Промпт для ИИ — из описаний всех разделов, в порядке таблицы. */
export function importPrompt(day: DateStr): string {
  return buildPrompt(
    KIND_ORDER.map((kind) => KINDS[kind].import.spec),
    day,
  )
}
