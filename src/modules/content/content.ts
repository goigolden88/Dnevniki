/**
 * Логика контента: выборки, итоги года, распределение оценок.
 *
 * Чистые функции. Ни React, ни `db` — на вход массивы записей, на выход
 * числа и отсортированные списки (Р-24).
 *
 * Чем этот модуль отличается от соседних. В циклах событие повторяется
 * и вопрос «когда следующий раз». В здоровье событие длится и вопрос
 * «как часто и как долго». Здесь событие происходит один раз и не
 * повторяется вовсе, а вопрос — «что это было и сколько его было за год».
 * Поэтому ни интервалов, ни длительностей тут нет: считаются количества
 * и оценки.
 *
 * Две особенности данных, заданные решениями:
 *
 * - Дата допускает месячную точность (Р-25). Арифметике по дням такая
 *   дата не поддаётся, и здесь она не применяется ни разу: год берётся
 *   первыми четырьмя символами, сравнение — лексикографическое.
 * - Закончено считается по статусу, а не по дате окончания (Р-42).
 */

import { isDateOrMonth } from '../../core/dates.ts'
import type { ContentEntry } from '../../core/model.ts'

export type EntryType = ContentEntry['type']
export type EntryStatus = ContentEntry['status']

/** Границы оценки. Шаг 0.1 — Р-26. */
export const SCORE_MIN = 1
export const SCORE_MAX = 10

// ─── Выборки ───────────────────────────────────────────────────────────────

/** Живые записи: без надгробий. */
function live(entries: readonly ContentEntry[]): ContentEntry[] {
  return entries.filter((entry) => !entry.deleted)
}

/** Дата начала, если она есть и разбирается. Иначе null. */
export function startOf(entry: ContentEntry): string | null {
  return entry.start !== null && isDateOrMonth(entry.start) ? entry.start : null
}

/**
 * Новыми сверху.
 *
 * Дата сравнивается как строка: `2026-01` < `2026-01-05` < `2026-02`,
 * и разная точность порядок не ломает (Р-25). Записи без разбираемой даты
 * уходят вниз — они не «самые старые», у них даты просто нет.
 */
export function byStartDesc(a: ContentEntry, b: ContentEntry): number {
  const first = startOf(a)
  const second = startOf(b)
  if (first !== null && second !== null && first !== second) return second.localeCompare(first)
  if (first === null && second !== null) return 1
  if (first !== null && second === null) return -1
  return a.title.localeCompare(b.title, 'ru')
}

/** Что смотрю прямо сейчас — для главного экрана и верха вкладки. */
export function watching(entries: readonly ContentEntry[]): ContentEntry[] {
  return live(entries)
    .filter((entry) => entry.status === 'active')
    .sort(byStartDesc)
}

/**
 * Список «к просмотру» (Р-21).
 *
 * По алфавиту, а не по дате: даты у этих записей нет по определению,
 * и порядок заведения ничего не говорит о том, что смотреть первым.
 */
export function planned(entries: readonly ContentEntry[]): ContentEntry[] {
  return live(entries)
    .filter((entry) => entry.status === 'planned')
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
}

/** Всё, что уже посмотрено или брошено, — архив. Новыми сверху. */
export function finished(entries: readonly ContentEntry[]): ContentEntry[] {
  return live(entries)
    .filter((entry) => entry.status === 'done' || entry.status === 'dropped')
    .sort(byStartDesc)
}

/**
 * Отбор по типу и подстроке в названии.
 *
 * Поиск идёт и по оригинальному названию: «Frieren» и «Фрирен» — одна
 * запись, и вводят то из них, которое вспомнилось.
 */
export function filterEntries(
  entries: readonly ContentEntry[],
  filter: { type?: EntryType | null; query?: string } = {},
): ContentEntry[] {
  const needle = (filter.query ?? '').trim().toLowerCase()

  return entries.filter((entry) => {
    if (filter.type && entry.type !== filter.type) return false
    if (!needle) return true
    const titles = `${entry.title} ${entry.titleOrig ?? ''}`.toLowerCase()
    return titles.includes(needle)
  })
}

/** Годы, за которые есть записи, новыми сверху. Для переключателя периода. */
export function yearsOf(entries: readonly ContentEntry[]): string[] {
  const years = new Set<string>()
  for (const entry of live(entries)) {
    const start = startOf(entry)
    if (start !== null) years.add(start.slice(0, 4))
  }
  return [...years].sort((a, b) => b.localeCompare(a))
}

// ─── Оценки ────────────────────────────────────────────────────────────────

/**
 * Оценка записи, если она годная.
 *
 * Вне диапазона и нечисловая отбрасываются молча: такая может приехать
 * из файла, поправленного руками, или из чужой версии приложения, и одна
 * кривая оценка не должна ломать среднее по году. То же правило, что
 * у цены в циклах.
 */
export function scoreOf(entry: ContentEntry): number | null {
  const score = entry.score
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  if (score < SCORE_MIN || score > SCORE_MAX) return null
  return score
}

/**
 * Разбор оценки из поля ввода.
 *
 * Терпимый по тем же соображениям, что и цена в циклах: с телефона
 * прилетает и «7,5», и «7.5», и « 8 ». Пустая строка — не ошибка,
 * а обычное состояние: оценка необязательна, у начатого её ещё нет.
 * Мусор и выход за диапазон дают null, а не подставленное число.
 */
export function parseScore(text: string): number | null {
  const clean = text.replace(/\s/g, '').replace(',', '.')
  if (!clean) return null

  const value = Number(clean)
  if (!Number.isFinite(value)) return null
  // Шаг 0.1 (Р-26): всё, что мельче, — это уже не оценка, а иллюзия
  // точности. Округляется сразу, чтобы в базу не попал хвост дроби.
  const rounded = Math.round(value * 10) / 10
  if (rounded < SCORE_MIN || rounded > SCORE_MAX) return null
  return rounded
}

/**
 * В какой столбик распределения попадает оценка. Индекс 0 — единицы.
 *
 * Округление вниз, а не к ближайшему (Р-26 требует группировки по целым,
 * но не говорит какой). «Шестёрки» — это всё от 6,0 до 6,9: так столбик
 * читается как «шестёрка с чем-то», а не как половина шестёрок вперемешку
 * с половиной пятёрок. Дробная часть при этом никуда не девается — она
 * остаётся в карточке записи.
 */
export function scoreBucket(score: number): number {
  return Math.min(Math.floor(score), SCORE_MAX) - SCORE_MIN
}

// ─── Итоги ─────────────────────────────────────────────────────────────────

export type TypeCount = { type: EntryType; count: number }

export type ContentStats = {
  /** Записей с датой начала внутри периода. Знаменатель для всего ниже. */
  started: number
  done: number
  dropped: number
  active: number
  /**
   * Закончено — сумма `done` и `dropped` (Р-42).
   *
   * Считается по статусу, а не по дате окончания: у всех записей,
   * перенесённых из Obsidian, `end` пуст, и по дате вышло бы
   * «начато 72, закончено 0». Брошенное — тоже законченное:
   * решение больше не смотреть — это результат, а не пауза.
   */
  finished: number
  /** Средняя оценка, один знак после запятой. Null — оценённых нет. */
  averageScore: number | null
  /** Сколько записей с оценкой. Без него среднее не показывается (Р-38). */
  scored: number
  /** Десять чисел, от единиц до десяток. Дробные сгруппированы вниз. */
  byScore: number[]
  /** Типы, чаще сверху. Типы без записей в список не попадают. */
  byType: TypeCount[]
  /** Лучшее за период, до трёх записей. Пусто, когда оценок нет. */
  top: ContentEntry[]
}

/** Год записи — по дате начала. */
function inYear(entry: ContentEntry, year: string | null): boolean {
  const start = startOf(entry)
  if (start === null) return false
  if (year === null) return true
  return start.slice(0, 4) === year
}

/**
 * Всё, что можно сказать про период, одной функцией.
 *
 * Период задаётся годом либо null — «всё время». Год берётся по дате
 * начала: сериал, начатый в декабре и досмотренный в январе, считается
 * один раз и в том году, когда начат. То же правило, по которому запись
 * ложится в файл репозитория (`layout.ts`), и то же, по которому эпизод
 * относится к году в здоровье. Иначе год на экране разошёлся бы с годом
 * в файле.
 *
 * Записи без разбираемой даты начала — список «к просмотру» и записи
 * с испорченной датой — в итоги не входят вовсе, даже за «всё время»:
 * «начато» про них неправда.
 */
export function contentStats(
  entries: readonly ContentEntry[],
  year: string | null = null,
): ContentStats {
  const taken = live(entries).filter((entry) => inYear(entry, year))

  const byScore = Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, () => 0)
  const types = new Map<EntryType, number>()
  const scores: number[] = []
  const scored: ContentEntry[] = []
  let done = 0
  let dropped = 0
  let active = 0

  for (const entry of taken) {
    if (entry.status === 'done') done += 1
    else if (entry.status === 'dropped') dropped += 1
    else if (entry.status === 'active') active += 1

    types.set(entry.type, (types.get(entry.type) ?? 0) + 1)

    const score = scoreOf(entry)
    if (score !== null) {
      scores.push(score)
      scored.push(entry)
      const bucket = scoreBucket(score)
      byScore[bucket] = (byScore[bucket] ?? 0) + 1
    }
  }

  const sum = scores.reduce((all, value) => all + value, 0)

  return {
    started: taken.length,
    done,
    dropped,
    active,
    finished: done + dropped,
    // Десятая доля балла — предел осмысленного: «в среднем 6,6»
    // читается, «6,5820895522» — нет.
    averageScore: scores.length === 0 ? null : Math.round((sum / scores.length) * 10) / 10,
    scored: scores.length,
    byScore,
    byType: [...types.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    top: scored
      .sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0) || byStartDesc(a, b))
      .slice(0, 3),
  }
}
