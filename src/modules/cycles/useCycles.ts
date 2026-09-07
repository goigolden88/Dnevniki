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
import { cycleState, cycleStates, type CycleState } from './cycles.ts'
import { db } from '../../core/db.ts'
import { nowIso, today, type DateStr } from '../../core/dates.ts'
import { ulid } from '../../core/id.ts'
import type { CycleEvent, CycleItem } from '../../core/model.ts'

export type Status = 'loading' | 'ready' | 'failed'

/** Что можно править у позиции. Остальные поля меняются только кодом. */
export type ItemDraft = {
  name: string
  cat: string
  intervalDays: number | null
  note?: string
}

export type Cycles = {
  status: Status
  /** Живые неархивные позиции по срочности — для экрана «Сейчас». */
  states: CycleState[]
  /** Все живые позиции, включая архивные. */
  items: CycleItem[]
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
  addMark: (itemId: string, date: DateStr) => Promise<void>
  removeMark: (id: string) => Promise<void>
  addItem: (draft: ItemDraft) => Promise<CycleItem | null>
  updateItem: (id: string, patch: Partial<ItemDraft & { archived: boolean }>) => Promise<void>
  removeItem: (id: string) => Promise<void>
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

export function useCycles(): Cycles {
  const [items, setItems] = useState<CycleItem[]>([])
  const [events, setEvents] = useState<CycleEvent[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [day, setDay] = useState<DateStr>(today())

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await db.ready()
        const [loadedItems, loadedEvents] = await Promise.all([
          db.getAll('items'),
          db.getAll('cycleEvents'),
        ])
        if (cancelled) return
        setItems(loadedItems)
        setEvents(loadedEvents)
        setStatus('ready')
      } catch (failure) {
        if (!cancelled) {
          setError(describe(failure))
          setStatus('failed')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
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
    async (itemId: string, date: DateStr) => {
      const previous = events
      const already = previous.some(
        (event) => event.itemId === itemId && event.date === date && !event.deleted,
      )
      if (already) return

      const event: CycleEvent = { id: ulid(), updatedAt: nowIso(), itemId, date }
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

  const live = useMemo(() => items.filter((item) => !item.deleted), [items])

  return {
    status,
    states,
    items: live,
    day,
    error,
    stateOf,
    marksOf,
    mark,
    addMark,
    removeMark,
    addItem,
    updateItem,
    removeItem,
  }
}
