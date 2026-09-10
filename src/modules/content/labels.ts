/**
 * Тексты и подписи модуля контента.
 *
 * Отделены от `content.ts` намеренно, как и в двух соседних модулях:
 * там расчёт, здесь подача. Расчёт не знает, что его читают глазами,
 * и русских строк не содержит.
 */

import { formatDateOrMonth, plural } from '../../core/dates.ts'
import type { ContentEntry } from '../../core/model.ts'
import { scoreOf, startOf, type ContentStats, type EntryType, type TypeCount } from './content.ts'

/**
 * Шесть типов из модели. Порядок — тот, в котором они предлагаются
 * в форме и стоят фильтрами: чаще встречающееся раньше.
 *
 * `forms` — склонение по числу для строки «27 аниме», «19 сериалов».
 * Аниме не склоняется вовсе, и три одинаковые формы у него не ошибка.
 */
export const TYPES: { key: EntryType; label: string; forms: [string, string, string] }[] = [
  { key: 'anime', label: 'Аниме', forms: ['аниме', 'аниме', 'аниме'] },
  { key: 'series', label: 'Сериал', forms: ['сериал', 'сериала', 'сериалов'] },
  { key: 'film', label: 'Фильм', forms: ['фильм', 'фильма', 'фильмов'] },
  { key: 'game', label: 'Игра', forms: ['игра', 'игры', 'игр'] },
  { key: 'book', label: 'Книга', forms: ['книга', 'книги', 'книг'] },
  { key: 'course', label: 'Курс', forms: ['курс', 'курса', 'курсов'] },
]

export function typeLabel(type: EntryType): string {
  return TYPES.find((each) => each.key === type)?.label ?? type
}

/** «27 аниме», «19 сериалов» — для разбивки по типам в итогах. */
export function typeCountText(value: TypeCount): string {
  const forms = TYPES.find((each) => each.key === value.type)?.forms
  if (!forms) return `${value.count} ${value.type}`
  return `${value.count} ${plural(value.count, forms)}`
}

/**
 * Четыре статуса из модели.
 *
 * «Бросил» обязателен по 01-Проект: без него курсы бессмысленно считать —
 * брошенный курс, записанный как незаконченный, вечно висел бы в «смотрю».
 */
const STATUS: Record<ContentEntry['status'], string> = {
  planned: 'к просмотру',
  active: 'смотрю',
  done: 'просмотрено',
  dropped: 'брошено',
}

export function statusLabel(status: ContentEntry['status']): string {
  return STATUS[status]
}

/**
 * Оценка на экран: «7», «7,5».
 *
 * Десятичная запятая, а не точка, — по-русски пишут так. Целая оценка
 * показывается без хвоста: «7,0» выглядит как точность, которой нет.
 */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : String(score).replace('.', ',')
}

/**
 * Строка под названием записи: тип, когда это было, оценка.
 *
 * Дата показывается со своей точностью (Р-25) — месяц месяцем. Нечитаемая
 * называется прямо, а не прячется: она пришла из файла, поправленного
 * руками, и её надо увидеть, чтобы поправить.
 */
export function entryText(entry: ContentEntry): string {
  const parts: string[] = [typeLabel(entry.type).toLowerCase()]

  const start = startOf(entry)
  if (start !== null) parts.push(formatDateOrMonth(start))
  else if (entry.start) parts.push(`дата не разобрана: «${entry.start}»`)

  if (entry.status === 'dropped') parts.push(STATUS.dropped)

  const score = scoreOf(entry)
  if (score !== null) parts.push(formatScore(score))

  return parts.join(' · ')
}

/**
 * Сколько за период начато и чем это кончилось.
 *
 * «Закончено» здесь — это `done` и `dropped` вместе, посчитанные по
 * статусу (Р-42). Брошенное называется отдельно: разница между «начал
 * сорок и бросил двадцать» и «начал сорок и досмотрел сорок» — это
 * ровно то, ради чего строка существует.
 *
 * Пусто, когда за период не начато ничего: «начато 0» не сообщает ничего.
 */
export function startedText(stats: ContentStats): string {
  if (stats.started === 0) return ''

  const parts = [`Начато ${stats.started}`, `закончено ${stats.finished}`]
  if (stats.dropped > 0) parts.push(`из них брошено ${stats.dropped}`)
  if (stats.active > 0) parts.push(`смотрю ${stats.active}`)
  return parts.join(' · ')
}

/**
 * Средняя оценка вместе с числом записей, из которых она посчитана.
 *
 * Оба числа обязательны (Р-38). Среднее по трём записям и среднее по
 * семидесяти — разной силы утверждения, а голое «в среднем 6,6» их не
 * различает. «из 72» отвечает на второй вопрос: у пяти записей оценки
 * нет вовсе, и в среднее они не вошли.
 *
 * Пусто, когда оценок нет: «в среднем — по 0 записям» ничего не сообщает.
 */
export function averageText(stats: ContentStats): string {
  if (stats.averageScore === null || stats.scored === 0) return ''

  const by = plural(stats.scored, ['записи', 'записям', 'записям'])
  const full = stats.started > stats.scored ? ` из ${stats.started}` : ''
  return `Средняя оценка ${formatScore(stats.averageScore)} — по ${stats.scored} ${by}${full}`
}

/** «к просмотру: 12 записей» — заголовок блока намерений. */
export function plannedText(count: number): string {
  return `${count} ${plural(count, ['запись', 'записи', 'записей'])}`
}
