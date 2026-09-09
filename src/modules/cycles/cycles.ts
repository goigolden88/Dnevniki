/**
 * Логика циклов: интервалы, медиана, статус, срочность.
 *
 * Чистые функции. Ни React, ни `db` — на вход массивы, на выход числа.
 * Это самая ошибкоопасная часть модуля и единственная, которую можно
 * покрыть тестами по-настоящему.
 *
 * Пороги и правило медианы — Р-22. Они здесь константами в одном месте,
 * отдельного поля в позиции нет: порог общий на всё приложение.
 */

import type { CycleEvent, CycleItem } from '../../core/model.ts'
import { addDays, daysBetween, isDateStr, today, type DateStr } from '../../core/dates.ts'

/** Доля интервала, после которой позиция «подходит к сроку». Р-22. */
export const DUE_RATIO = 0.8

/**
 * Сколько последних интервалов участвует в медиане. Р-22.
 *
 * Скользящее окно, а не вся история: в гигиене отметки обрываются в мае,
 * и медиана по всей истории тянула бы расчёт к привычке полугодовой давности.
 */
export const MEDIAN_WINDOW = 5

/**
 * Сколько интервалов нужно, чтобы вообще считать срок по истории. Р-27.
 *
 * Один интервал — это не медиана, а одно наблюдение, названное сроком.
 * Два — их среднее, и разброс между ними ничем не ограничен. С трёх
 * медиана становится средним элементом, и один выброс её уже не ломает.
 *
 * Ниже порога срок не выводится вовсе: лучше сказать «мало отметок»,
 * чем нарисовать красную полосу на основании одного случая.
 */
export const MIN_INTERVALS = 3

/**
 * Пять статусов из 01-Проект.
 *
 * `never` — записей нет вообще, считать не из чего.
 * `unset` — записи есть, но интервал неизвестен: вручную не задан,
 * а на медиану не хватает истории (нужно хотя бы две отметки).
 */
export type CycleStatus = 'overdue' | 'due' | 'ok' | 'never' | 'unset'

/** Разброс интервалов позиции. Показывается на экране истории. */
export type Spread = {
  min: number
  max: number
  /**
   * Тот же, что управляет статусом: по окну, а не по всей истории.
   * Null, пока интервалов меньше `MIN_INTERVALS` — считать не из чего,
   * а показать число, похожее на срок, хуже, чем не показать ничего.
   */
  median: number | null
  /** Сколько интервалов посчитано — на единицу меньше числа отметок. */
  count: number
}

export type CycleState = {
  item: CycleItem
  status: CycleStatus
  /** Сколько отметок у позиции. Ниже порога срок не считается. */
  marks: number
  /** Последняя отметка. */
  last: DateStr | null
  /** Дней с последней отметки. Отрицательное — отметка датирована вперёд. */
  daysSince: number | null
  /** Действующий интервал в днях. */
  interval: number | null
  /** Откуда взят интервал: задан руками или посчитан по истории. */
  intervalSource: 'manual' | 'median' | null
  /**
   * Что выходит по истории, даже когда действует ручной интервал.
   * Null, пока отметок меньше порога. Р-29.
   */
  byHistory: number | null
  /** Когда ожидается следующий раз. */
  next: DateStr | null
  /** Доля пройденного интервала: 1 — ровно срок, больше — перебор. Для полосы. */
  ratio: number | null
  /** Дней сверх срока. Ноль, если не просрочено. */
  overdueDays: number
  spread: Spread | null
}

/**
 * Даты отметок: живые, без мусора, без повторов, по возрастанию.
 *
 * Три вещи, которые здесь происходят, и почему:
 *
 * Мягко удалённые отбрасываются, хотя `db.getAll` их и так не отдаёт —
 * страховка на случай вызова с `includeDeleted`.
 *
 * Нечитаемые даты отбрасываются молча. После импорта из Obsidian одна
 * битая строка иначе роняла бы весь экран, а не одну позицию.
 *
 * Повторы в один день схлопываются: две отметки за день — это один раз,
 * а не интервал в ноль дней, который утащил бы медиану вниз.
 * Дубль в разные дни (блок питания, купленный дважды за 51 день) остаётся
 * как есть — это настоящие данные, и в разбросе он должен быть виден.
 */
export function markDates(events: CycleEvent[]): DateStr[] {
  const clean = events
    .filter((event) => !event.deleted && isDateStr(event.date))
    .map((event) => event.date)
  // `YYYY-MM-DD` сортируется лексикографически ровно как хронологически.
  return [...new Set(clean)].sort()
}

/** Промежутки между соседними отметками в днях. На входе — выход `markDates`. */
export function intervals(dates: DateStr[]): number[] {
  const result: number[] = []
  for (let i = 1; i < dates.length; i++) {
    const from = dates[i - 1]
    const to = dates[i]
    if (from === undefined || to === undefined) continue
    result.push(daysBetween(from, to))
  }
  return result
}

/** Медиана. Для чётной длины — среднее двух центральных, может быть дробной. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const hi = sorted[mid]
  if (hi === undefined) return null
  if (sorted.length % 2 === 1) return hi
  const lo = sorted[mid - 1]
  return lo === undefined ? hi : (lo + hi) / 2
}

/**
 * Медианный интервал по последним `MEDIAN_WINDOW` промежуткам.
 * Меньше — считается по всем имеющимся. Ни одного — null.
 *
 * Округляется до целого: интервал измеряется днями и задаёт дату,
 * а «4.5 дня» на экране — шум.
 */
export function medianInterval(dates: DateStr[], window = MEDIAN_WINDOW): number | null {
  const recent = intervals(dates).slice(-window)
  const value = median(recent)
  return value === null ? null : Math.round(value)
}

/**
 * Разброс по всей истории, медиана — по окну и только с `MIN_INTERVALS`.
 * Null, если интервалов нет вовсе.
 *
 * Минимум и максимум показываются с первого же интервала: это факты из
 * истории, а не оценка, и врать они не могут.
 */
export function spread(dates: DateStr[], window = MEDIAN_WINDOW): Spread | null {
  const all = intervals(dates)
  if (all.length === 0) return null
  return {
    min: Math.min(...all),
    max: Math.max(...all),
    median: all.length >= MIN_INTERVALS ? medianInterval(dates, window) : null,
    count: all.length,
  }
}

/**
 * Полное состояние позиции на дату `now`.
 *
 * События фильтруются по `item.id` внутри: так функцию нельзя случайно
 * позвать со всей таблицей событий и получить чужую медиану.
 */
export function cycleState(
  item: CycleItem,
  events: CycleEvent[],
  now: DateStr = today(),
): CycleState {
  const dates = markDates(events.filter((event) => event.itemId === item.id))
  const last = dates.at(-1) ?? null
  const daysSince = last === null ? null : daysBetween(last, now)

  // Ноль и отрицательные значения в `intervalDays` считаются не заданными:
  // интервал в ноль дней сделал бы позицию вечно просроченной.
  const manual = item.intervalDays !== null && item.intervalDays > 0 ? item.intervalDays : null
  // Порог Р-27: пока отметок мало, срок по истории не выводится. Ручной
  // интервал работает всегда — там срок назвал человек, а не статистика.
  const enough = intervals(dates).length >= MIN_INTERVALS
  const computed = enough ? medianInterval(dates) : null
  // Ручной интервал не подменяется медианой молча (Р-29): он говорит «как
  // надо», медиана — «как есть». Расхождение между ними и есть то, ради чего
  // дневник ведётся, и подменять одно другим значило бы его стереть.
  const interval = manual ?? computed
  const intervalSource = manual !== null ? 'manual' : computed !== null ? 'median' : null

  const next = last !== null && interval !== null ? addDays(last, interval) : null
  const ratio = daysSince !== null && interval !== null ? daysSince / interval : null

  let status: CycleStatus
  if (dates.length === 0) status = 'never'
  else if (ratio === null) status = 'unset'
  else if (ratio >= 1) status = 'overdue'
  else if (ratio >= DUE_RATIO) status = 'due'
  else status = 'ok'

  const overdueDays =
    status === 'overdue' && daysSince !== null && interval !== null ? daysSince - interval : 0

  return {
    item,
    status,
    marks: dates.length,
    last,
    daysSince,
    interval,
    intervalSource,
    byHistory: computed,
    next,
    ratio,
    overdueDays,
    spread: spread(dates),
  }
}

/**
 * Порядок статусов на экране «Сейчас».
 *
 * `never` и `unset` уходят вниз, хотя «нет записей» и выглядит требующим
 * внимания: у них нет вычислимой срочности, и наверху они вытесняли бы
 * реально просроченное.
 */
const STATUS_ORDER: Record<CycleStatus, number> = {
  overdue: 0,
  due: 1,
  ok: 2,
  never: 3,
  unset: 4,
}

/** Сначала просроченное, внутри статуса — по перебору, потом по названию. */
export function compareUrgency(a: CycleState, b: CycleState): number {
  const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (byStatus !== 0) return byStatus
  const byRatio = (b.ratio ?? -Infinity) - (a.ratio ?? -Infinity)
  if (byRatio !== 0 && Number.isFinite(byRatio)) return byRatio
  return a.item.name.localeCompare(b.item.name, 'ru')
}

export function sortByUrgency(states: CycleState[]): CycleState[] {
  return [...states].sort(compareUrgency)
}

/** Состояния всех позиций, отсортированные по срочности. */
export function cycleStates(
  items: CycleItem[],
  events: CycleEvent[],
  now: DateStr = today(),
): CycleState[] {
  const live = items.filter((item) => !item.deleted && !item.archived)
  return sortByUrgency(live.map((item) => cycleState(item, events, now)))
}

/**
 * Единица показа внутри категории: либо одна позиция сама по себе,
 * либо куст из нескольких — «Барьер Эксперт» с двумя видами картриджей.
 */
export type CycleUnit = { group: string | null; states: CycleState[] }

export type CycleGroup = { cat: string; units: CycleUnit[] }

/**
 * Собирает позиции категории в кусты по полю `group`.
 *
 * Кусты и одиночки стоят в одном ряду и сортируются по самой срочной
 * позиции внутри. Иначе просроченный картридж уехал бы вниз только
 * потому, что его позиция объединена с соседней.
 *
 * Группа из одной позиции остаётся группой: заголовок не пропадает
 * при удалении второй позиции, и куст не разваливается на глазах.
 */
export function unitsOf(states: CycleState[]): CycleUnit[] {
  const units: CycleUnit[] = []
  const byGroup = new Map<string, CycleUnit>()

  for (const state of sortByUrgency(states)) {
    const group = state.item.group?.trim()
    if (!group) {
      units.push({ group: null, states: [state] })
      continue
    }
    const existing = byGroup.get(group)
    if (existing) {
      existing.states.push(state)
      continue
    }
    // Порядок кустов задаётся первой встреченной позицией, а список уже
    // отсортирован по срочности — значит куст встаёт по самой срочной.
    const unit: CycleUnit = { group, states: [state] }
    byGroup.set(group, unit)
    units.push(unit)
  }

  return units
}

/**
 * Разбивка по категориям для нижней части экрана «Сейчас».
 *
 * Порядок категорий задаётся снаружи: сам расчёт не знает и не должен
 * знать, что они называются по-русски и что «Гигиена» идёт раньше «Дачи».
 * Категории вне списка уходят в конец по алфавиту.
 */
export function groupByCategory(
  states: CycleState[],
  order: readonly string[] = [],
): CycleGroup[] {
  const groups = new Map<string, CycleState[]>()
  for (const state of states) {
    const list = groups.get(state.item.cat)
    if (list) list.push(state)
    else groups.set(state.item.cat, [state])
  }

  const rank = (cat: string) => {
    const index = order.indexOf(cat)
    return index === -1 ? order.length : index
  }

  return [...groups.entries()]
    .map(([cat, list]) => ({ cat, units: unitsOf(list) }))
    .sort((a, b) => rank(a.cat) - rank(b.cat) || a.cat.localeCompare(b.cat, 'ru'))
}

/** Все кусты, какие уже заведены. Для подсказок в форме. */
export function knownGroups(items: { group?: string }[]): string[] {
  const names = new Set<string>()
  for (const item of items) {
    const group = item.group?.trim()
    if (group) names.add(group)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
}

// ─── Траты ─────────────────────────────────────────────────────────────────

/**
 * Сколько потрачено и из скольких отметок это сложено.
 *
 * Три числа, а не одно, и это главное в Р-36 с уточнением: сумма без числа
 * отметок читается как «столько потрачено всего», хотя цена стоит у четырёх
 * отметок из тридцати трёх. С обоими числами то же значение становится
 * правдой — «6 118 ₽ за 4 отметки из 33» — и заодно видно, сколько ещё
 * не заполнено.
 *
 * Стоимости владения в месяц здесь нет намеренно: она делит сумму на
 * интервал, который по Р-27 выводится только с трёх промежутков и есть
 * у одной позиции из девятнадцати.
 */
export type Spent = {
  /** Сумма проставленных цен. */
  sum: number
  /** Отметок, у которых цена есть. */
  priced: number
  /** Отметок всего. Показывает, насколько сумма неполная. */
  marks: number
}

const NOTHING: Spent = { sum: 0, priced: 0, marks: 0 }

/**
 * Цена отметки, если она годная.
 *
 * Отрицательная и нечисловая отбрасываются молча: они могут приехать из
 * файла или из чужой версии приложения, и одна кривая цена не должна
 * ломать сумму по всей категории. Ноль — годная цена: замена по гарантии
 * стоила нисколько, и это тоже факт.
 */
function priceOf(event: CycleEvent): number | null {
  const price = event.price
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null
  return price
}

/** Траты по списку отметок. Удалённые не считаются. */
export function spent(events: CycleEvent[]): Spent {
  let sum = 0
  let priced = 0
  let marks = 0

  for (const event of events) {
    if (event.deleted) continue
    marks += 1
    const price = priceOf(event)
    if (price === null) continue
    sum += price
    priced += 1
  }

  // Копейки складываются с погрешностью двоичной дроби: 0.1 + 0.2 даёт
  // 0.30000000000000004. На экране это вылезло бы хвостом из нулей.
  return { sum: Math.round(sum * 100) / 100, priced, marks }
}

function plus(a: Spent, b: Spent): Spent {
  return {
    sum: Math.round((a.sum + b.sum) * 100) / 100,
    priced: a.priced + b.priced,
    marks: a.marks + b.marks,
  }
}

export type SpentItem = { item: CycleItem; spent: Spent }
export type SpentUnit = { group: string | null; items: SpentItem[]; spent: Spent }
export type SpentCat = { cat: string; units: SpentUnit[]; spent: Spent }

/**
 * Три уровня сложения: категория → куст → позиция (Р-36).
 *
 * Куст здесь главный уровень: «Барьер Эксперт» — это две позиции, и вопрос
 * «сколько стоит этот фильтр» осмыслен на кусте, а не на отдельной стадии.
 *
 * В списки попадает только то, где цена проставлена хоть раз, — иначе
 * экран трат заполнен позициями с нулём. Но в суммы отметки без цены
 * входят числом `marks`: именно оно показывает, чего не хватает.
 *
 * Архивные позиции считаются: деньги на них потрачены, и убирать их из
 * суммы значило бы уменьшать её при уборке экрана.
 */
export function spendTree(
  items: CycleItem[],
  events: CycleEvent[],
  order: readonly string[] = [],
): SpentCat[] {
  const byItem = new Map<string, CycleEvent[]>()
  for (const event of events) {
    if (event.deleted) continue
    const list = byItem.get(event.itemId)
    if (list) list.push(event)
    else byItem.set(event.itemId, [event])
  }

  const cats = new Map<string, Map<string, SpentUnit>>()

  for (const item of items) {
    if (item.deleted) continue
    const own = spent(byItem.get(item.id) ?? [])
    if (own.marks === 0) continue

    const cat = cats.get(item.cat) ?? new Map<string, SpentUnit>()
    cats.set(item.cat, cat)

    // Одиночные позиции не сливаются в общий куст: ключ у каждой свой.
    const group = item.group?.trim() || null
    const key = group ?? ` ${item.id}`
    const unit = cat.get(key) ?? { group, items: [], spent: NOTHING }
    if (own.priced > 0) unit.items.push({ item, spent: own })
    unit.spent = plus(unit.spent, own)
    cat.set(key, unit)
  }

  const rank = (cat: string) => {
    const index = order.indexOf(cat)
    return index === -1 ? order.length : index
  }

  return [...cats.entries()]
    .map(([cat, units]) => ({
      cat,
      units: [...units.values()]
        .filter((unit) => unit.spent.priced > 0)
        .sort((a, b) => b.spent.sum - a.spent.sum),
      spent: [...units.values()].map((unit) => unit.spent).reduce(plus, NOTHING),
    }))
    .filter((cat) => cat.spent.priced > 0)
    .sort((a, b) => rank(a.cat) - rank(b.cat) || a.cat.localeCompare(b.cat, 'ru'))
}

/** Итог по всему экрану трат. */
export function totalSpent(cats: SpentCat[]): Spent {
  return cats.reduce((all, cat) => plus(all, cat.spent), NOTHING)
}
