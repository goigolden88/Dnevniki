/**
 * Тексты и числа для экрана циклов.
 *
 * Отделены от `cycles.ts` намеренно: там расчёт, здесь подача.
 * Расчёт не знает, что его читают глазами, и русских строк не содержит.
 */

import type { CycleState, CycleStatus } from './cycles.ts'
import { days, formatDate } from '../../core/dates.ts'

/** Категории позиций из 01-Проект. Свободная строка, но выбор — из этих. */
export const CATEGORIES = ['Гигиена', 'Дом', 'Техника', 'Авто', 'Дача'] as const

const STATUS_TEXT: Record<CycleStatus, string> = {
  overdue: 'просрочено',
  due: 'подходит к сроку',
  ok: 'в норме',
  never: 'нет записей',
  unset: 'срок не задан',
}

/**
 * Короткая строка состояния.
 *
 * Просроченное показывает перебор в днях, а не слово «просрочено»: разница
 * между «перебор 2 дня» и «перебор 40 дней» — это и есть то, ради чего
 * экран открывают.
 */
export function statusText(state: CycleState): string {
  if (state.status !== 'overdue') return STATUS_TEXT[state.status]
  if (state.overdueDays === 0) return 'срок сегодня'
  return `перебор ${days(state.overdueDays)}`
}

/** `07.09.2026` → `07.09`. Год на экране «Сейчас» только занимает место. */
function shortDate(date: string): string {
  return formatDate(date).slice(0, 5)
}

/** Когда отмечали в прошлый раз и когда ждать следующий. */
export function detailText(state: CycleState): string {
  if (state.last === null || state.daysSince === null) return 'ещё ни разу'

  const ago =
    state.daysSince === 0
      ? 'сегодня'
      : state.daysSince < 0
        ? `отмечено вперёд, ${shortDate(state.last)}`
        : `${days(state.daysSince)} назад`

  if (state.next === null) return ago
  const when = state.status === 'overdue' ? 'срок был' : 'следующий'
  return `${ago} · ${when} ${shortDate(state.next)}`
}

/** Откуда взялся интервал. Пусто, если интервала нет. */
export function intervalText(state: CycleState): string {
  if (state.interval === null) return ''
  const source = state.intervalSource === 'median' ? ' по истории' : ''
  return `раз в ${days(state.interval)}${source}`
}

/**
 * Заполнение полосы в процентах.
 *
 * Обрезается по 100: перебор показывается цветом и текстом, а не полосой,
 * которая уезжает за карточку. Полоса отвечает на вопрос «сколько прошло»,
 * и после срока ответ один — «весь».
 */
export function barPercent(state: CycleState): number {
  if (state.ratio === null) return 0
  return Math.min(Math.max(state.ratio, 0), 1) * 100
}
