/**
 * Раздел «cycles» импорта записей (Р-60): позиции циклов со всеми датами.
 *
 * Чистая функция, как расчёт: сырой раздел и то, что уже есть в базе, на
 * входе, записи к добавлению — на выходе. Импорт только добавляет: позиция,
 * совпавшая по названию, не перезаписывается, к ней лишь дописываются
 * отметки с новыми датами.
 */

import {
  absent,
  dayOf,
  numberOf,
  recordsOf,
  shown,
  textOf,
  type ImportContext,
  type ImportPlan,
  type ImportSpec,
} from '../../core/importing.ts'
import type { CycleCategory, CycleEvent, CycleItem } from '../../core/model.ts'
import { categoryIdFor, findCategory, nextCategoryOrder, sameName } from './cycles.ts'
import { CATEGORIES } from './labels.ts'

const SECTION = 'cycles'

export const cycleImportSpec: ImportSpec = {
  section: SECTION,
  about:
    'повторяющиеся дела и расходники: стрижка, замена фильтра, батарейки, ТО машины. Одна запись — ' +
    'одна вещь или процедура со всеми датами, когда её делали.',
  fields: [
    '"name" — название, обязательно',
    `"cat" — категория, обязательно: ${CATEGORIES.join(', ')} или своя`,
    '"group" — группа внутри категории, если несколько позиций про одну вещь (стадии одного фильтра); иначе не писать',
    '"intervalDays" — через сколько дней повторять, если это прямо сказано; иначе не писать — срок посчитается по датам',
    '"note" — заметка, если есть',
    '"marks" — когда делал: [{ "date": "ГГГГ-ММ-ДД", "price": 500 }]; "price" — цена в рублях, если есть',
  ],
  // Примеры выдуманные, а не чьи-то записи: промпт уезжает к любому,
  // кто открыл приложение (Р-68).
  example: [
    { name: 'Замена масла', cat: 'Авто', marks: [{ date: '2026-01-20', price: 4500 }, { date: '2026-07-05' }] },
    {
      name: 'Картридж, 1-я стадия',
      cat: 'Дом',
      group: 'Фильтр для воды',
      intervalDays: 180,
      marks: [{ date: '2026-02-10', price: 950 }],
    },
  ],
}

export function importCycles(
  raw: unknown,
  data: {
    items: readonly CycleItem[]
    categories: readonly CycleCategory[]
    cycleEvents: readonly CycleEvent[]
  },
  ctx: ImportContext,
): ImportPlan {
  const { records, issues } = recordsOf(SECTION, raw)
  const issue = (title: string, reason: string) => issues.push({ section: SECTION, title, reason })

  // С надгробиями: по ним видно, какие id категорий заняты.
  const categories = [...data.categories]
  const items = data.items.filter((item) => !item.deleted)
  const events = data.cycleEvents.filter((event) => !event.deleted)
  const newCats: CycleCategory[] = []
  const newItems: CycleItem[] = []
  const newEvents: CycleEvent[] = []
  let skipped = 0

  for (const { raw: record, index } of records) {
    const name = textOf(record.name)
    if (!name) {
      issue(`запись ${index + 1}`, 'нет названия ("name")')
      continue
    }

    let item = [...items, ...newItems].find((each) => sameName(each.name, name))
    if (item) {
      // Позиция уже есть — её не трогаем, только дописываем новые даты.
      skipped += 1
    } else {
      const cat = textOf(record.cat)
      if (!cat) {
        issue(name, 'нет категории ("cat")')
        continue
      }

      let intervalDays: number | null = null
      if (!absent(record.intervalDays)) {
        const value = numberOf(record.intervalDays)
        if (value === null || value <= 0) {
          issue(name, `интервал «${shown(record.intervalDays)}» — не число дней`)
          continue
        }
        intervalDays = Math.round(value)
      }

      const known = findCategory(categories, cat)
      if (!known) {
        const created: CycleCategory = {
          id: categoryIdFor(categories, cat, ctx.newId()),
          updatedAt: ctx.now,
          name: cat,
          order: nextCategoryOrder(categories),
        }
        categories.push(created)
        newCats.push(created)
      }

      const group = textOf(record.group)
      const note = textOf(record.note)
      item = {
        id: ctx.newId(),
        updatedAt: ctx.now,
        name,
        cat: known?.name ?? cat,
        intervalDays,
        ...(group ? { group } : {}),
        ...(note ? { note } : {}),
      }
      newItems.push(item)
    }

    if (absent(record.marks)) continue
    if (!Array.isArray(record.marks)) {
      issue(name, 'даты ("marks") — не список')
      continue
    }

    const itemId = item.id
    for (const entry of record.marks as unknown[]) {
      // Даты голыми строками тоже годятся: ["2026-01-24", "2026-03-02"].
      const mark = (typeof entry === 'object' && entry !== null ? entry : { date: entry }) as Record<string, unknown>
      const date = dayOf(mark.date)
      if (!date) {
        issue(name, `дата «${shown(mark.date)}» — не ГГГГ-ММ-ДД`)
        continue
      }

      let price: number | null = null
      if (!absent(mark.price)) {
        const value = numberOf(mark.price)
        if (value === null || value < 0) {
          issue(name, `цена «${shown(mark.price)}» у ${date} — не число`)
          continue
        }
        // Копейки округляются сразу: дальше эти числа складываются (Р-38).
        price = Math.round(value * 100) / 100
      }

      if ([...events, ...newEvents].some((event) => event.itemId === itemId && event.date === date)) {
        skipped += 1
        continue
      }

      const note = textOf(mark.note)
      newEvents.push({
        id: ctx.newId(),
        updatedAt: ctx.now,
        itemId,
        date,
        ...(price === null ? {} : { price }),
        ...(note ? { note } : {}),
      })
    }
  }

  return {
    writes: { categories: newCats, items: newItems, cycleEvents: newEvents },
    added: [
      { count: newItems.length, forms: ['позиция', 'позиции', 'позиций'] as [string, string, string] },
      { count: newEvents.length, forms: ['отметка', 'отметки', 'отметок'] as [string, string, string] },
      { count: newCats.length, forms: ['категория', 'категории', 'категорий'] as [string, string, string] },
    ].filter((each) => each.count > 0),
    skipped,
    issues,
  }
}
