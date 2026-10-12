/**
 * Демо-данные «Дневников» (Я-44, Я-45 «FamilyCore»): выдуманные записи
 * каждого хранилища от дня входа в демо — позиции циклов в четырёх
 * категориях с отметками обслуживания (у одной срок прошёл, у пары —
 * подходит), быстрая кнопка, теги, эпизод болезни, ряд измерений,
 * тренировки и контент за последние недели. Даты — от `day`, так демо
 * всегда живое.
 *
 * Ядро кладёт эти записи в свою базу `dnevniki-demo` при её создании;
 * синхронизации у неё нет. Репозиторий публичный — ничего настоящего.
 *
 * Живёт в `screens/`, а не в `app/`: знает все три модуля, как срез итогов.
 * Полноту проверяет `checkDemo` ядра — `demo.test.ts`: новое хранилище
 * без строки здесь — красный тест.
 */

import { addDays, type DateStr } from '../shared/core/dates.ts'
import { ulid } from '../shared/core/id.ts'
import type {
  ContentEntry,
  CycleEvent,
  CycleItem,
  Episode,
  Measure,
  Session,
  StoreRecord,
  Tag,
  Template,
} from '../app/model.ts'
import { cyclePreset, initialCategories } from '../modules/cycles/cycles.ts'
import { CATEGORIES } from '../modules/cycles/labels.ts'

/** Записи демо по хранилищам — форма `AppConfig.demo`. */
export type DemoData = { [S in keyof StoreRecord]: StoreRecord[S][] }

export function demo(day: DateStr): DemoData {
  const at = `${day}T08:00:00.000Z`
  const stamp = Date.parse(at)
  let n = 0
  /** `Base` записи: id по времени входа, по порядку. */
  const base = () => ({ id: ulid(stamp + n++), updatedAt: at })
  const ago = (days: number): DateStr => addDays(day, -days)

  // ─── Циклы ───────────────────────────────────────────────────────────────

  const items: CycleItem[] = []
  const cycleEvents: CycleEvent[] = []
  /** Позиция и её отметки: `back` — сколько дней назад, цена — по желанию. */
  const item = (
    fields: Omit<CycleItem, 'id' | 'updatedAt'>,
    marks: readonly (number | [number, number])[],
  ): CycleItem => {
    const made: CycleItem = { ...base(), ...fields }
    items.push(made)
    for (const mark of marks) {
      const [back, price] = typeof mark === 'number' ? [mark, undefined] : mark
      cycleEvents.push({ ...base(), itemId: made.id, date: ago(back), ...(price === undefined ? {} : { price }) })
    }
    return made
  }

  // Срок прошёл: щётке три месяца и ещё неделя.
  item({ name: 'Зубная щётка', cat: 'Гигиена', intervalDays: 90 }, [[97, 350], [190, 350]])
  // Срок подходит — по истории: стрижка раз в месяц, последняя четыре недели назад.
  item({ name: 'Стрижка', cat: 'Гигиена', intervalDays: null }, [[27, 1200], [58, 1200], [88, 1100], [119, 1100]])
  // Куст из двух картриджей одного фильтра.
  const filter = item(
    { name: 'Картридж, первая ступень', cat: 'Дом', group: 'Фильтр для воды', intervalDays: 90 },
    [[40, 900], [131, 900]],
  )
  item({ name: 'Картридж, вторая ступень', cat: 'Дом', group: 'Фильтр для воды', intervalDays: 180 }, [[131, 1500]])
  // Срок подходит: две недели без двух дней.
  const sheets = item({ name: 'Смена постельного белья', cat: 'Дом', intervalDays: 14 }, [12, 26, 41, 55])
  item({ name: 'Чистка ноутбука от пыли', cat: 'Техника', intervalDays: 180 }, [[103, 1500]])
  item({ name: 'Замена масла', cat: 'Авто', intervalDays: 365, note: 'Каждые 10 тысяч км или раз в год' }, [
    [210, 4500],
  ])
  item({ name: 'Мойка', cat: 'Авто', intervalDays: null }, [[9, 600], [23, 600], [38, 500], [51, 500]])

  // Стартовый набор, как на настоящей пустой базе, и категории позиций.
  const categories = initialCategories(items, CATEGORIES)

  const templates: Template[] = [
    {
      ...base(),
      label: 'Бельё и фильтр',
      kind: 'cycle',
      preset: cyclePreset([{ itemId: sheets.id }, { itemId: filter.id, price: 900 }]),
      order: 0,
    },
  ]

  // ─── Здоровье ────────────────────────────────────────────────────────────

  const tag = (name: string, scope: Tag['scope']): Tag => ({ ...base(), name, scope })
  const runny = tag('Насморк', 'symptom')
  const cough = tag('Кашель', 'symptom')
  const fever = tag('Температура', 'symptom')
  const run = tag('Бег', 'activity')
  const pool = tag('Бассейн', 'activity')
  const tags: Tag[] = [runny, cough, fever, run, pool]

  const episodes: Episode[] = [
    {
      ...base(),
      title: 'Простуда',
      source: 'self',
      start: ago(3),
      end: null,
      symptoms: [runny.id, cough.id],
      note: 'Пью чай с лимоном, сплю побольше',
    },
    {
      ...base(),
      title: 'ОРВИ',
      source: 'doctor',
      start: ago(48),
      end: ago(41),
      symptoms: [fever.id, cough.id],
    },
  ]

  // Вес раз в неделю — шесть недель, понемногу вниз; давление — дважды.
  const weights = [78.4, 78.1, 77.9, 77.6, 77.8, 77.3]
  const measures: Measure[] = [
    ...weights.map((value, week): Measure => ({ ...base(), metric: 'weight', date: ago(35 - week * 7), value })),
    { ...base(), metric: 'bp', date: ago(20), value: 124, value2: 82 },
    { ...base(), metric: 'bp', date: ago(5), value: 118, value2: 76 },
  ]

  const sessions: Session[] = [
    { ...base(), activity: run.id, date: ago(18), durationMin: 30, distanceKm: 4.5 },
    { ...base(), activity: pool.id, date: ago(15), durationMin: 45 },
    { ...base(), activity: run.id, date: ago(12), durationMin: 35, distanceKm: 5 },
    { ...base(), activity: run.id, date: ago(8), durationMin: 40, distanceKm: 6, note: 'Новый круг вокруг парка' },
    { ...base(), activity: pool.id, date: ago(6), durationMin: 50 },
  ]

  // ─── Контент ─────────────────────────────────────────────────────────────

  const entry = (fields: Omit<ContentEntry, 'id' | 'updatedAt'>): ContentEntry => ({ ...base(), ...fields })
  const content: ContentEntry[] = [
    entry({ type: 'anime', title: 'Звёздный почтальон', start: ago(10), end: null, status: 'active', score: null }),
    entry({ type: 'game', title: 'Тихая гавань', start: ago(6), end: null, status: 'active', score: null }),
    entry({
      type: 'series',
      title: 'Северный маяк',
      start: ago(40),
      end: ago(19),
      status: 'done',
      score: 8.5,
      comment: 'Второй сезон слабее первого, но финал хороший',
    }),
    entry({ type: 'film', title: 'Последний трамвай', start: ago(25), end: ago(25), status: 'done', score: 7 }),
    entry({ type: 'book', title: 'Сад камней', start: ago(55), end: ago(30), status: 'dropped', score: 5 }),
    entry({ type: 'course', title: 'Основы фотографии', start: null, end: null, status: 'planned', score: null }),
  ]

  return { items, categories, tags, templates, cycleEvents, episodes, measures, sessions, content }
}
