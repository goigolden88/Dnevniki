/**
 * Данные модуля циклов: чтение из `db`, отметки, управление позициями.
 *
 * Экран сюда за состоянием не лезет напрямую — он получает готовый список
 * `CycleState`. Расчёт живёт в `cycles.ts`, хранилище за `db`,
 * здесь только связывание и оптимистичные правки.
 *
 * Хук грузит все позиции и все отметки целиком, и каждый экран делает это
 * заново. На десятках позиций и сотнях отметок это доли миллисекунды,
 * а общего хранилища на приложение не заводится: оно понадобится не раньше,
 * чем появится второй модуль, читающий те же данные.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  cyclePreset,
  cycleState,
  cycleStates,
  cycleTemplates,
  lastPrice,
  nextOrder,
  templateState,
  type CycleState,
  type TemplateMark,
  type TemplateState,
} from './cycles.ts'
import { db } from '../../core/db.ts'
import { nowIso, today, type DateStr } from '../../core/dates.ts'
import { ulid } from '../../core/id.ts'
import type { CycleEvent, CycleItem, Template } from '../../core/model.ts'

export type Status = 'loading' | 'ready' | 'failed'

/** Что можно править у позиции. Остальные поля меняются только кодом. */
export type ItemDraft = {
  name: string
  cat: string
  group?: string
  intervalDays: number | null
  note?: string
}

export type Cycles = {
  status: Status
  /** Живые неархивные позиции по срочности — для экрана «Сейчас». */
  states: CycleState[]
  /** Все живые позиции, включая архивные. */
  items: CycleItem[]
  /** Все живые отметки. Нужны сложению трат, которое считает по всем позициям. */
  events: CycleEvent[]
  /** Сегодняшняя дата, на которую посчитан экран. */
  day: DateStr
  /** Последняя ошибка. Пусто, когда всё в порядке. */
  error: string
  /** Состояние одной позиции, в том числе архивной. */
  stateOf: (itemId: string) => CycleState | null
  /** Отметки позиции, новые сверху. */
  marksOf: (itemId: string) => CycleEvent[]
  /** Отметить сегодня, а если уже отмечена — снять отметку. */
  mark: (item: CycleItem) => Promise<void>
  /** Отметка задним числом. Повтор в тот же день ничего не меняет. */
  addMark: (itemId: string, date: DateStr, price?: number | null) => Promise<void>
  removeMark: (id: string) => Promise<void>
  /** Цена отметки. `null` убирает её совсем. */
  setMarkPrice: (id: string, price: number | null) => Promise<void>
  addItem: (draft: ItemDraft) => Promise<CycleItem | null>
  updateItem: (id: string, patch: Partial<ItemDraft & { archived: boolean }>) => Promise<void>
  removeItem: (id: string) => Promise<void>
  /** Быстрые кнопки по порядку, с состоянием на сегодня (Р-49). */
  quick: TemplateState[]
  /** Тап по кнопке: отметить все её позиции, а если уже отмечены — снять. */
  pressTemplate: (state: TemplateState) => Promise<void>
  /** Новая кнопка с одной позицией и её последней ценой. */
  addTemplate: (itemId: string) => Promise<void>
  updateTemplate: (id: string, patch: { label?: string; marks?: TemplateMark[] }) => Promise<void>
  removeTemplate: (id: string) => Promise<void>
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

export function useCycles(): Cycles {
  const [items, setItems] = useState<CycleItem[]>([])
  const [events, setEvents] = useState<CycleEvent[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [day, setDay] = useState<DateStr>(today())

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await db.ready()
        const [loadedItems, loadedEvents, loadedTemplates] = await Promise.all([
          db.getAll('items'),
          db.getAll('cycleEvents'),
          db.getAll('templates'),
        ])
        if (cancelled) return
        setItems(loadedItems)
        setEvents(loadedEvents)
        setTemplates(loadedTemplates)
        setStatus('ready')
      } catch (failure) {
        if (!cancelled) {
          setError(describe(failure))
          setStatus('failed')
        }
      }
    }

    void load()

    // Синхронизация вливает чужие записи прямо в базу, мимо этого состояния.
    // Без перечитывания отметка со второго устройства появилась бы только
    // после перезапуска приложения — то есть «не появилась бы».
    const unsubscribe = db.onChange((event) => {
      if (event.origin !== 'remote') return
      if (event.store !== 'items' && event.store !== 'cycleEvents' && event.store !== 'templates') {
        return
      }
      void load()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  /**
   * Приложение живёт установленным и неделями не перезапускается: вкладка
   * просто уходит в фон. Без этого «сегодня» застыло бы на дне установки,
   * и наутро экран показывал бы вчерашнюю срочность.
   */
  useEffect(() => {
    function refreshDay() {
      if (document.visibilityState === 'visible') setDay(today())
    }
    document.addEventListener('visibilitychange', refreshDay)
    return () => document.removeEventListener('visibilitychange', refreshDay)
  }, [])

  const states = useMemo(() => cycleStates(items, events, day), [items, events, day])

  const stateOf = useCallback(
    (itemId: string) => {
      const item = items.find((each) => each.id === itemId && !each.deleted)
      return item ? cycleState(item, events, day) : null
    },
    [items, events, day],
  )

  const marksOf = useCallback(
    (itemId: string) =>
      events
        .filter((event) => event.itemId === itemId && !event.deleted)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [events],
  )

  /**
   * Общий путь оптимистичной записи: сначала состояние, потом база.
   * Тап должен отзываться в том же кадре, а IndexedDB отвечает хоть и
   * быстро, но не мгновенно. Не прошло — состояние откатывается целиком.
   */
  const apply = useCallback(async <T>(optimistic: () => void, revert: () => void, write: () => Promise<T>) => {
    try {
      optimistic()
      const result = await write()
      setError('')
      return result
    } catch (failure) {
      revert()
      setError(describe(failure))
      return null
    }
  }, [])

  const addMark = useCallback(
    async (itemId: string, date: DateStr, price?: number | null) => {
      const previous = events
      const already = previous.some(
        (event) => event.itemId === itemId && event.date === date && !event.deleted,
      )
      if (already) return

      // Цена необязательна, и пустое поле не должно заводить `price: null`
      // в записи: в модели поле или есть, или его нет.
      const event: CycleEvent = {
        id: ulid(),
        updatedAt: nowIso(),
        itemId,
        date,
        ...(price === undefined || price === null ? {} : { price }),
      }
      const saved = await apply(
        () => setEvents([...previous, event]),
        () => setEvents(previous),
        () => db.put('cycleEvents', event),
      )
      if (saved) setEvents((current) => current.map((each) => (each.id === saved.id ? saved : each)))
    },
    [events, apply],
  )

  const removeMark = useCallback(
    async (id: string) => {
      const previous = events
      await apply(
        () =>
          setEvents(previous.map((event) => (event.id === id ? { ...event, deleted: true } : event))),
        () => setEvents(previous),
        () => db.remove('cycleEvents', id),
      )
    },
    [events, apply],
  )

  /**
   * Цена проставляется отдельно от самой отметки: на экране «Сейчас» отметка
   * ставится одним тапом, и формы там нет вовсе. Без этого пути цена не
   * попадала бы почти никуда — а без цен нечего складывать (Р-36).
   */
  const setMarkPrice = useCallback(
    async (id: string, price: number | null) => {
      const previous = events
      const current = previous.find((event) => event.id === id)
      if (!current) return

      const { price: _, ...without } = current
      const updated: CycleEvent = { ...without, ...(price === null ? {} : { price }) }

      const saved = await apply(
        () => setEvents(previous.map((event) => (event.id === id ? updated : event))),
        () => setEvents(previous),
        () => db.put('cycleEvents', updated),
      )
      if (saved) setEvents((all) => all.map((each) => (each.id === saved.id ? saved : each)))
    },
    [events, apply],
  )

  /** Тап по кнопке отметки: поставить сегодняшнюю или снять её. */
  const mark = useCallback(
    async (item: CycleItem) => {
      const markedToday = events.find(
        (event) => event.itemId === item.id && event.date === day && !event.deleted,
      )
      if (markedToday) await removeMark(markedToday.id)
      else await addMark(item.id, day)
    },
    [events, day, addMark, removeMark],
  )

  const addItem = useCallback(
    async (draft: ItemDraft) => {
      const previous = items
      const item: CycleItem = { id: ulid(), updatedAt: nowIso(), ...draft }
      const saved = await apply(
        () => setItems([...previous, item]),
        () => setItems(previous),
        () => db.put('items', item),
      )
      if (saved) setItems((current) => current.map((each) => (each.id === saved.id ? saved : each)))
      return saved
    },
    [items, apply],
  )

  const updateItem = useCallback(
    async (id: string, patch: Partial<ItemDraft & { archived: boolean }>) => {
      const previous = items
      const current = previous.find((each) => each.id === id)
      if (!current) return

      const updated: CycleItem = { ...current, ...patch, updatedAt: nowIso() }
      const saved = await apply(
        () => setItems(previous.map((each) => (each.id === id ? updated : each))),
        () => setItems(previous),
        () => db.put('items', updated),
      )
      if (saved) setItems((all) => all.map((each) => (each.id === saved.id ? saved : each)))
    },
    [items, apply],
  )

  /**
   * Позиция удаляется мягко, отметки остаются как есть: они привязаны к id,
   * который не переиспользуется, и в ленте прошлое должно сохраниться.
   */
  const removeItem = useCallback(
    async (id: string) => {
      const previous = items
      await apply(
        () => setItems(previous.map((each) => (each.id === id ? { ...each, deleted: true } : each))),
        () => setItems(previous),
        () => db.remove('items', id),
      )
    },
    [items, apply],
  )

  // ─── Быстрые кнопки (Р-49) ───────────────────────────────────────────────

  const quick = useMemo(
    () => cycleTemplates(templates).map((each) => templateState(each, items, events, day)),
    [templates, items, events, day],
  )

  /**
   * Тап по быстрой кнопке.
   *
   * Все отметки пишутся одной пачкой и одним обновлением состояния. По одной
   * через `addMark` нельзя: каждая взяла бы список отметок того же кадра,
   * и вторая затёрла бы в состоянии первую — в базе обе, на экране одна.
   *
   * Отмечено уже всё — тап снимает сегодняшние отметки этих позиций, как
   * повторный тап по карточке. Отмечена часть — тап доставляет остальные.
   */
  const pressTemplate = useCallback(
    async (state: TemplateState) => {
      const previous = events
      const ids = new Set(state.marks.map((mark) => mark.item.id))
      const todays = previous.filter(
        (event) => !event.deleted && event.date === day && ids.has(event.itemId),
      )

      if (state.doneToday) {
        const removed = todays.map((event) => ({ ...event, deleted: true }))
        const byId = new Map(removed.map((event) => [event.id, event]))
        await apply(
          () => setEvents(previous.map((event) => byId.get(event.id) ?? event)),
          () => setEvents(previous),
          () => db.putMany('cycleEvents', removed),
        )
        return
      }

      const marked = new Set(todays.map((event) => event.itemId))
      const added: CycleEvent[] = state.marks
        .filter((mark) => !marked.has(mark.item.id))
        .map((mark) => ({
          id: ulid(),
          updatedAt: nowIso(),
          itemId: mark.item.id,
          date: day,
          ...(mark.price === null ? {} : { price: mark.price }),
        }))
      if (added.length === 0) return

      const saved = await apply(
        () => setEvents([...previous, ...added]),
        () => setEvents(previous),
        () => db.putMany('cycleEvents', added),
      )
      if (saved) {
        const byId = new Map(saved.map((event) => [event.id, event]))
        setEvents((current) => current.map((event) => byId.get(event.id) ?? event))
      }
    },
    [events, day, apply],
  )

  const writeTemplate = useCallback(
    async (template: Template, previous: Template[]) => {
      const exists = previous.some((each) => each.id === template.id)
      const saved = await apply(
        () =>
          setTemplates(
            exists
              ? previous.map((each) => (each.id === template.id ? template : each))
              : [...previous, template],
          ),
        () => setTemplates(previous),
        () => db.put('templates', template),
      )
      if (saved) setTemplates((all) => all.map((each) => (each.id === saved.id ? saved : each)))
    },
    [apply],
  )

  /**
   * Кнопка заводится с позиции, а не конструктором (Р-49): цена берётся
   * из последней отметки, название — пустое, то есть из имени позиции.
   */
  const addTemplate = useCallback(
    async (itemId: string) => {
      const price = lastPrice(events, itemId)
      const template: Template = {
        id: ulid(),
        updatedAt: nowIso(),
        label: '',
        kind: 'cycle',
        preset: cyclePreset([price === null ? { itemId } : { itemId, price }]),
        order: nextOrder(templates),
      }
      await writeTemplate(template, templates)
    },
    [events, templates, writeTemplate],
  )

  const updateTemplate = useCallback(
    async (id: string, patch: { label?: string; marks?: TemplateMark[] }) => {
      const current = templates.find((each) => each.id === id)
      if (!current) return
      const updated: Template = {
        ...current,
        ...(patch.label === undefined ? {} : { label: patch.label }),
        // Прочие поля заготовки сохраняются: их мог положить более новый
        // код с другого устройства, и затирать чужое молча нельзя.
        ...(patch.marks === undefined ? {} : { preset: { ...current.preset, ...cyclePreset(patch.marks) } }),
        updatedAt: nowIso(),
      }
      await writeTemplate(updated, templates)
    },
    [templates, writeTemplate],
  )

  const removeTemplate = useCallback(
    async (id: string) => {
      const previous = templates
      await apply(
        () =>
          setTemplates(previous.map((each) => (each.id === id ? { ...each, deleted: true } : each))),
        () => setTemplates(previous),
        () => db.remove('templates', id),
      )
    },
    [templates, apply],
  )

  const live = useMemo(() => items.filter((item) => !item.deleted), [items])
  const liveEvents = useMemo(() => events.filter((event) => !event.deleted), [events])

  return {
    status,
    states,
    items: live,
    events: liveEvents,
    day,
    error,
    stateOf,
    marksOf,
    mark,
    addMark,
    removeMark,
    setMarkPrice,
    addItem,
    updateItem,
    removeItem,
    quick,
    pressTemplate,
    addTemplate,
    updateTemplate,
    removeTemplate,
  }
}
