/**
 * Данные модуля циклов: чтение из `db`, отметка, добавление позиции.
 *
 * Экран сюда за состоянием не лезет напрямую — он получает готовый список
 * `CycleState`. Расчёт живёт в `core/cycles.ts`, хранилище за `db`,
 * здесь только связывание и оптимистичные правки.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { cycleStates, type CycleState } from '../../core/cycles.ts'
import { db } from '../../core/db.ts'
import { nowIso, today, type DateStr } from '../../core/dates.ts'
import { ulid } from '../../core/id.ts'
import type { CycleEvent, CycleItem } from '../../core/model.ts'

export type Status = 'loading' | 'ready' | 'failed'

export type Cycles = {
  status: Status
  states: CycleState[]
  /** Сегодняшняя дата, на которую посчитан экран. */
  day: DateStr
  /** Последняя ошибка. Пусто, когда всё в порядке. */
  error: string
  /** Отметить позицию сегодня, а если уже отмечена — снять отметку. */
  mark: (item: CycleItem) => Promise<void>
  addItem: (draft: { name: string; cat: string; intervalDays: number | null }) => Promise<void>
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

  /**
   * Отметка ставится в состояние до записи в базу: тап должен отзываться
   * мгновенно, а IndexedDB отвечает хоть и быстро, но не в том же кадре.
   * Если запись не прошла — состояние откатывается целиком.
   */
  const mark = useCallback(
    async (item: CycleItem) => {
      const previous = events
      const markedToday = previous.find(
        (event) => event.itemId === item.id && event.date === day && !event.deleted,
      )

      try {
        if (markedToday) {
          setEvents(
            previous.map((event) =>
              event.id === markedToday.id ? { ...event, deleted: true } : event,
            ),
          )
          await db.remove('cycleEvents', markedToday.id)
        } else {
          const event: CycleEvent = {
            id: ulid(),
            updatedAt: nowIso(),
            itemId: item.id,
            date: day,
          }
          setEvents([...previous, event])
          const saved = await db.put('cycleEvents', event)
          setEvents((current) =>
            current.map((each) => (each.id === saved.id ? saved : each)),
          )
        }
        setError('')
      } catch (failure) {
        setEvents(previous)
        setError(describe(failure))
      }
    },
    [events, day],
  )

  const addItem = useCallback(
    async (draft: { name: string; cat: string; intervalDays: number | null }) => {
      const previous = items
      const item: CycleItem = { id: ulid(), updatedAt: nowIso(), ...draft }
      try {
        setItems([...previous, item])
        const saved = await db.put('items', item)
        setItems((current) => current.map((each) => (each.id === saved.id ? saved : each)))
        setError('')
      } catch (failure) {
        setItems(previous)
        setError(describe(failure))
      }
    },
    [items],
  )

  return { status, states, day, error, mark, addItem }
}
