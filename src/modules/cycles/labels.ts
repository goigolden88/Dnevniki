/**
 * Тексты и числа для экрана циклов.
 *
 * Отделены от `cycles.ts` намеренно: там расчёт, здесь подача.
 * Расчёт не знает, что его читают глазами, и русских строк не содержит.
 */

import {
  MIN_INTERVALS,
  type CycleState,
  type CycleStatus,
  type Spent,
  type TemplateState,
} from './cycles.ts'
import { days, formatDate, plural } from '../../core/dates.ts'

/**
 * Стартовый набор категорий из 01-Проект. С Р-59 категории — записи в базе;
 * этот список только заводит их при первом запуске и задаёт порядок
 * в выгрузке, пока записей нет.
 */
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

// ─── Деньги ────────────────────────────────────────────────────────────────

/** Неразрывный пробел: сумма не должна переноситься между разрядами. */
const NBSP = '\u00A0'

/**
 * Разбор цены из поля ввода.
 *
 * Терпимый нарочно: с телефона прилетает и «1 829», и «1829,50», и «700 ₽» —
 * человек вводит цену так, как видел её в чеке, а не так, как удобно коду.
 *
 * `null` означает «цены нет», и пустая строка сюда попадает штатно: поле
 * необязательное, и пустое оно не ошибка, а обычное состояние. Мусор тоже
 * даёт null, а не ноль: молча записанный ноль соврал бы в сумме.
 * Отрицательная отвергается — возврат денег не отметка цикла.
 */
export function parsePrice(text: string): number | null {
  const clean = text
    .replace(/\s/g, '')
    .replace(/(₽|руб\.?|р\.?)$/i, '')
    .replace(',', '.')
  if (!clean) return null

  const value = Number(clean)
  if (!Number.isFinite(value) || value < 0) return null
  // Копейки округляются сразу: дальше эти числа складываются, и хвост
  // двоичной дроби вылез бы в сумме по категории.
  return Math.round(value * 100) / 100
}

/**
 * Сумма для экрана: разряды разделены, копейки только когда они есть.
 *
 * Intl не берётся намеренно: он даёт узкий пробел и своё расположение знака
 * валюты, а здесь нужна одна предсказуемая строка, которую проверяет тест.
 */
export function formatMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100
  const whole = Math.floor(rounded)
  const kopecks = Math.round((rounded - whole) * 100)

  const digits = String(whole)
  let grouped = ''
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i
    grouped += digits[i]
    if (fromEnd > 1 && fromEnd % 3 === 1) grouped += NBSP
  }

  const tail = kopecks === 0 ? '' : `,${String(kopecks).padStart(2, '0')}`
  return `${grouped}${tail}${NBSP}₽`
}

/**
 * Сумма вместе с числом отметок, из которых она сложена.
 *
 * Числа два, и оба обязательны. «6 118 ₽ за 4 отметки» отвечает на вопрос
 * «дорого ли это»: три тысячи за шесть стрижек и три тысячи за одну — разные
 * новости. «из 33» отвечает на второй вопрос, насколько сумме можно верить:
 * цена стоит у четырёх отметок, остальные в неё не вошли.
 *
 * Пусто, когда цен нет вовсе: «0 ₽ за 0 отметок» ничего не сообщает.
 */
export function spentText(value: Spent): string {
  if (value.priced === 0) return ''

  const marks = `${value.priced} ${plural(value.priced, ['отметку', 'отметки', 'отметок'])}`
  const full = value.marks > value.priced ? ` из ${value.marks}` : ''
  return `${formatMoney(value.sum)} за ${marks}${full}`
}

// ─── Напоминание ───────────────────────────────────────────────────────────

/** Сколько позиций перечислять в уведомлении. Дальше — «и ещё N». */
const NOTICE_LINES = 5

/**
 * Текст уведомления о просроченном (Р-50). Null — напоминать не о чем.
 *
 * Только просроченное, без «подходит к сроку»: уведомление, приходящее
 * каждый день ради жёлтого, быстро перестают читать. Одна позиция
 * называется в заголовке — это ровно то, что надо сделать. Несколько —
 * списком по срочности, с перебором в днях: «перебор 2 дня» и «перебор
 * 40 дней» — разные новости.
 */
export function overdueNotice(states: readonly CycleState[]): { title: string; body: string } | null {
  const overdue = states.filter((state) => state.status === 'overdue')
  const first = overdue[0]
  if (first === undefined) return null
  if (overdue.length === 1) return { title: `Просрочено: ${first.item.name}`, body: statusText(first) }

  const lines = overdue.slice(0, NOTICE_LINES).map((state) => `${state.item.name} — ${statusText(state)}`)
  const rest = overdue.length - NOTICE_LINES
  if (rest > 0) lines.push(`и ещё ${rest}`)

  const count = `${overdue.length} ${plural(overdue.length, ['позиция', 'позиции', 'позиций'])}`
  return { title: `Просрочено ${count}`, body: lines.join('\n') }
}

// ─── Быстрые кнопки ────────────────────────────────────────────────────────

/**
 * Название быстрой кнопки: своё, если его дали, иначе названия позиций
 * через плюс (Р-49).
 *
 * Своё название хранится, а составное — нет: иначе переименование позиции
 * оставило бы кнопку со старым именем, и кнопка врала бы, что она отмечает.
 */
export function templateLabel(state: TemplateState): string {
  const own = state.template.label.trim()
  if (own) return own
  return state.marks.map((mark) => mark.item.name).join(' + ')
}

/**
 * Текст на самой кнопке. Цена дописывается, только когда позиция одна:
 * «Стрижка · 700 ₽» — это то, что кнопка запишет. Складывать цены
 * нескольких позиций в одно число здесь незачем — это не траты, а заготовка,
 * и её состав виден на экране позиции.
 */
export function templateButtonText(state: TemplateState): string {
  const label = templateLabel(state)
  const only = state.marks.length === 1 ? state.marks[0] : undefined
  return only && only.price !== null ? `${label} · ${formatMoney(only.price)}` : label
}
