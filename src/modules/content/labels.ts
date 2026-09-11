/**
 * Тексты и подписи модуля контента.
 *
 * Отделены от `content.ts` намеренно, как и в двух соседних модулях:
 * там расчёт, здесь подача. Расчёт не знает, что его читают глазами,
 * и русских строк не содержит.
 */

import { days, formatDateOrMonth, formatMonth, MONTHS_SHORT, monthName, plural } from '../../core/dates.ts'
import type { ContentEntry } from '../../core/model.ts'
import {
  monthRanges,
  scoreOf,
  startOf,
  type ContentStats,
  type EntryType,
  type Stale,
  type TypeCount,
} from './content.ts'

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

/** «12 записей» — счётчик, пригодный везде. */
export function entriesText(count: number): string {
  return `${count} ${plural(count, ['запись', 'записи', 'записей'])}`
}

/**
 * Заголовок группы в списке: «Январь 2026».
 *
 * С прописной буквы — это заголовок, а не часть фразы. Записи без даты
 * собираются под своим заголовком, а не прячутся: чаще всего это список
 * «к просмотру», но туда же попадёт и запись с испорченной датой (Р-34),
 * и увидеть её надо.
 */
export function monthHeading(month: string | null): string {
  if (month === null) return 'Без даты'
  const text = formatMonth(month)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Выбранные месяцы одной строкой: `[1,2,3,5]` → «янв–мар, май».
 *
 * Сплошные отрезки склеиваются: перечисление двенадцати сокращений
 * длиннее строки, ради которой затевалось. Пусто — месяцы не выбраны,
 * то есть все, и говорить об этом нечего.
 */
export function monthsText(months: readonly number[]): string {
  return monthRanges(months)
    .map(([from, to]) =>
      from === to ? MONTHS_SHORT[from - 1] : `${MONTHS_SHORT[from - 1]}–${MONTHS_SHORT[to - 1]}`,
    )
    .join(', ')
}

/**
 * Выбранный период человеческими словами — для строки под фильтрами.
 *
 * Она отвечает на вопрос «а что сейчас показано», когда сами ряды чипов
 * свёрнуты. Без неё свёрнутый фильтр молча врал бы: список короткий,
 * а почему — не видно.
 */
export function periodText(year: string | null, months: readonly number[]): string {
  const period = year === null ? 'всё время' : year
  const chosen = monthsText(months)
  return chosen ? `${period}, ${chosen}` : period
}

/**
 * Месяц, в котором начато больше всего.
 *
 * Молчит при ничьей и при единственной записи в месяце: «самый плотный
 * месяц — январь, одна запись» не наблюдение, а пересказ данных. То же
 * правило, по которому молчат среднее без числа записей (Р-38) и срок
 * по одному интервалу (Р-27) — число, посчитанное не из чего, лучше
 * не показывать вовсе.
 */
export function peakMonthText(stats: ContentStats): string {
  const peak = Math.max(...stats.byMonth)
  if (peak < 2) return ''
  if (stats.byMonth.filter((count) => count === peak).length > 1) return ''

  const month = monthName(stats.byMonth.indexOf(peak) + 1)
  return `Плотнее всего ${month} — ${entriesText(peak)}`
}

// ─── «Ещё смотришь?» (Р-58) ────────────────────────────────────────────────

/** «без новостей 94 дня» — строка на карточке зависшей записи. */
export function staleText(count: number): string {
  return `без новостей ${days(count)}`
}

/** Сколько записей перечислять в уведомлении. Дальше — «и ещё N». */
const NOTICE_LINES = 5

/**
 * Вопрос о записях, зависших в «смотрю» (Р-58). Null — спрашивать не о чем.
 *
 * Вопрос, а не утверждение, как у болезни (Р-54): приложение не знает,
 * досмотрено ли, оно знает только, что давно ничего не менялось. Тап ведёт
 * к самой записи, где есть все три ответа, а при нескольких — на «Контент».
 */
export function staleNotice(
  stale: readonly Stale[],
): { title: string; body: string; target: string } | null {
  const first = stale[0]
  if (first === undefined) return null

  const line = (each: Stale) => `${each.entry.title} — ${staleText(each.days)}`
  const ask = 'Досмотрел, бросил или ещё смотришь?'
  if (stale.length === 1) {
    return {
      title: 'Ещё смотришь?',
      body: `${line(first)}. ${ask}`,
      target: `/content?open=${first.entry.id}`,
    }
  }

  const lines = stale.slice(0, NOTICE_LINES).map(line)
  const rest = stale.length - NOTICE_LINES
  if (rest > 0) lines.push(`и ещё ${rest}`)
  return { title: 'Ещё смотришь?', body: [...lines, ask].join('\n'), target: '/content' }
}
