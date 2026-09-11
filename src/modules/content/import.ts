/**
 * Раздел «content» импорта записей (Р-60).
 *
 * Чистая функция: сырой раздел и имеющиеся записи на входе, новые записи
 * на выходе. Совпавшая по типу, названию и началу запись пропускается,
 * а не перезаписывается: повторная загрузка того же файла ничего не
 * удваивает и не затирает правок, сделанных в приложении.
 */

import {
  absent,
  dayOrMonthOf,
  numberOf,
  recordsOf,
  sameText,
  shown,
  textOf,
  type ImportContext,
  type ImportPlan,
  type ImportSpec,
} from '../../core/importing.ts'
import type { ContentEntry } from '../../core/model.ts'
import { SCORE_MAX, SCORE_MIN } from './content.ts'

const SECTION = 'content'

const TYPES: readonly ContentEntry['type'][] = ['anime', 'series', 'film', 'game', 'book', 'course']
const STATUSES: readonly ContentEntry['status'][] = ['planned', 'active', 'done', 'dropped']

export const contentImportSpec: ImportSpec = {
  section: SECTION,
  about:
    'что смотрел, читал, во что играл, какие курсы проходил. Одна запись — одно произведение; ' +
    'сезон сериала или аниме — отдельной записью, если так было в заметках.',
  fields: [
    '"type" — обязательно: "anime" аниме, "series" сериал, "film" фильм, "game" игра, "book" книга, "course" курс',
    '"title" — название, обязательно; "titleOrig" — оригинальное, если есть',
    '"status" — обязательно: "done" досмотрел / прочитал / прошёл, "active" смотрю сейчас, "dropped" бросил, "planned" хочу посмотреть',
    '"start" — когда начал: ГГГГ-ММ-ДД, или ГГГГ-ММ, если известен только месяц; у "planned" не писать',
    '"end" — когда закончил, в том же виде; не знаешь — не писать',
    `"score" — оценка от ${SCORE_MIN} до ${SCORE_MAX}, можно с одним знаком после точки; нет — не писать`,
    '"comment" — впечатления, если есть',
  ],
  example: [
    { type: 'anime', title: 'Магическая битва 3', start: '2026-01', status: 'done', score: 7.5, comment: 'Бои лучше сюжета' },
    {
      type: 'film',
      title: 'Дюна: Часть вторая',
      titleOrig: 'Dune: Part Two',
      start: '2026-03-14',
      end: '2026-03-14',
      status: 'done',
      score: 9,
    },
    { type: 'book', title: 'Задача трёх тел', status: 'planned' },
  ],
}

/** Одна ли это запись: тип, название без учёта регистра и начало (Р-60). */
function sameEntry(a: ContentEntry, b: ContentEntry): boolean {
  return a.type === b.type && sameText(a.title, b.title) && (a.start ?? '') === (b.start ?? '')
}

export function importContent(
  raw: unknown,
  data: { content: readonly ContentEntry[] },
  ctx: ImportContext,
): ImportPlan {
  const { records, issues } = recordsOf(SECTION, raw)
  const issue = (title: string, reason: string) => issues.push({ section: SECTION, title, reason })
  const known = data.content.filter((entry) => !entry.deleted)
  const added: ContentEntry[] = []
  let skipped = 0

  for (const { raw: record, index } of records) {
    const title = textOf(record.title)
    if (!title) {
      issue(`запись ${index + 1}`, 'нет названия ("title")')
      continue
    }

    const type = TYPES.find((each) => each === record.type)
    if (!type) {
      issue(title, `тип «${shown(record.type)}» — не из списка`)
      continue
    }
    const status = STATUSES.find((each) => each === record.status)
    if (!status) {
      issue(title, `статус «${shown(record.status)}» — не из списка`)
      continue
    }

    const start = absent(record.start) ? null : dayOrMonthOf(record.start)
    if (!absent(record.start) && start === null) {
      issue(title, `начало «${shown(record.start)}» — не ГГГГ-ММ-ДД и не ГГГГ-ММ`)
      continue
    }
    const end = absent(record.end) ? null : dayOrMonthOf(record.end)
    if (!absent(record.end) && end === null) {
      issue(title, `конец «${shown(record.end)}» — не ГГГГ-ММ-ДД и не ГГГГ-ММ`)
      continue
    }

    let score: number | null = null
    if (!absent(record.score)) {
      const value = numberOf(record.score)
      if (value === null || value < SCORE_MIN || value > SCORE_MAX) {
        issue(title, `оценка «${shown(record.score)}» — не от ${SCORE_MIN} до ${SCORE_MAX}`)
        continue
      }
      score = Math.round(value * 10) / 10
    }

    const titleOrig = textOf(record.titleOrig)
    const comment = textOf(record.comment)
    const entry: ContentEntry = {
      id: ctx.newId(),
      updatedAt: ctx.now,
      type,
      title,
      start,
      end,
      status,
      score,
      ...(titleOrig ? { titleOrig } : {}),
      ...(comment ? { comment } : {}),
    }

    if ([...known, ...added].some((each) => sameEntry(each, entry))) {
      skipped += 1
      continue
    }
    added.push(entry)
  }

  return {
    writes: { content: added },
    added:
      added.length > 0
        ? [{ count: added.length, forms: ['запись контента', 'записи контента', 'записей контента'] }]
        : [],
    skipped,
    issues,
  }
}
