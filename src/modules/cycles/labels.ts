/**
 * Тексты и числа для экрана циклов.
 *
 * Отделены от `cycles.ts` намеренно: там расчёт, здесь подача.
 * Расчёт не знает, что его читают глазами, и русских строк не содержит.
 */

import { MIN_INTERVALS, type CycleState, type CycleStatus } from './cycles.ts'
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
  // «Срок не задан» и «мало отметок» — один статус, но разные причины,
  // и человеку важна именно причина: во втором случае делать ничего не надо,
  // срок появится сам после следующих отметок.
  if (state.status === 'unset') {
    return state.marks >= 2 ? 'мало отметок' : 'срок не задан'
  }
  if (state.status !== 'overdue') return STATUS_TEXT[state.status]
  if (state.overdueDays === 0) return 'срок сегодня'
  return `перебор ${days(state.overdueDays)}`
}

/** Сколько отметок нужно, чтобы срок посчитался сам. */
export const MARKS_FOR_INTERVAL = MIN_INTERVALS + 1

/**
 * Расхождение между тем, как надо, и тем, как есть. Р-29.
 *
 * Возвращает null, когда сравнивать не с чем: интервал не задан руками
 * либо истории ещё не хватает. Совпадение день в день — тоже null,
 * говорить о нём нечего.
 */
export function divergence(
  state: CycleState,
): { manual: number; history: number; times: number } | null {
  if (state.intervalSource !== 'manual' || state.interval === null) return null
  if (state.byHistory === null || state.byHistory === state.interval) return null
  const bigger = Math.max(state.interval, state.byHistory)
  const smaller = Math.min(state.interval, state.byHistory)
  return {
    manual: state.interval,
    history: state.byHistory,
    times: Math.round((bigger / smaller) * 10) / 10,
  }
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

  if (state.next === null) {
    // Молчать здесь нельзя: без объяснения непонятно, приложение сломалось
    // или срок правда ещё не из чего считать.
    if (state.interval === null && state.marks > 0) {
      return `${ago} · отметок ${state.marks} из ${MARKS_FOR_INTERVAL}`
    }
    return ago
  }
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
