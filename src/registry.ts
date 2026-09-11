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
import type { EventKind } from './core/model.ts'
import { contentFeed, contentMarkdown } from './modules/content/feed.ts'
import { cycleFeed, cycleMarkdown } from './modules/cycles/feed.ts'
import {
  episodeFeed,
  episodeMarkdown,
  measureFeed,
  measureMarkdown,
  sessionFeed,
  sessionMarkdown,
} from './modules/health/feed.ts'

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
}

export const KINDS: { readonly [K in EventKind]: KindEntry } = {
  cycle: {
    label: 'Циклы',
    feed: (data) => cycleFeed(data.items, data.cycleEvents),
    markdown: (data, day) => cycleMarkdown(data.items, data.cycleEvents, day, data.categories),
  },
  episode: {
    label: 'Болезни',
    feed: (data, day) => episodeFeed(data.episodes, data.tags, day),
    markdown: (data, day) => episodeMarkdown(data.episodes, data.tags, day),
  },
  measure: {
    label: 'Измерения',
    feed: (data) => measureFeed(data.measures),
    markdown: (data) => measureMarkdown(data.measures),
  },
  session: {
    label: 'Тренировки',
    feed: (data) => sessionFeed(data.sessions, data.tags),
    markdown: (data) => sessionMarkdown(data.sessions, data.tags),
  },
  content: {
    label: 'Контент',
    feed: (data) => contentFeed(data.content),
    markdown: (data) => contentMarkdown(data.content),
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
export function markdownExport(data: Data, day: DateStr): string {
  const head = [
    '# Дневники',
    '',
    `Выгрузка от ${formatDate(day)}. Для чтения: обратно в приложение этот файл не загружается,`,
    'для переноса данных есть выгрузка в JSON.',
  ].join('\n')
  const sections = KIND_ORDER.map((kind) => KINDS[kind].markdown(data, day))
  return `${[head, ...sections].join('\n\n')}\n`
}
