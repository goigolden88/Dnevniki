/**
 * Данные модуля контента: чтение из `db`, правки.
 *
 * Устроен так же, как `useCycles` и `useHealth`: расчёт живёт в
 * `content.ts`, хранилище за `db`, здесь только связывание и
 * оптимистичные правки. Экран получает список и не знает про `db` вовсе.
 *
 * Хранилище одно, и грузится оно целиком: записей контента за год
 * набегает под сотню, выборка по индексу окупится нескоро.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../core/db.ts'
import { nowIso, today } from '../../core/dates.ts'
import { ulid } from '../../core/id.ts'
import type { ContentEntry } from '../../core/model.ts'

export type Status = 'loading' | 'ready' | 'failed'

/** Что задаётся при заведении записи. */
export type EntryDraft = {
  type: ContentEntry['type']
  title: string
  titleOrig?: string
  /** `YYYY-MM-DD` или `YYYY-MM` (Р-25). null — ещё не начато. */
  start: string | null
  end: string | null
  status: ContentEntry['status']
  score: number | null
  comment?: string
}

export type Content = {
  status: Status
  error: string
  /** Живые записи как есть. Выборки и сортировку делает `content.ts`. */
  entries: ContentEntry[]
  entryOf: (id: string) => ContentEntry | null
  addEntry: (draft: EntryDraft) => Promise<ContentEntry | null>
  updateEntry: (id: string, patch: Partial<EntryDraft>) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  /** Начать смотреть: статус `active` и дата начала, если её ещё нет. */
  startEntry: (id: string) => Promise<void>
  /** Досмотрел. Оценка ставится отдельно — её в момент нажатия ещё нет. */
  finishEntry: (id: string) => Promise<void>
  /** Бросил. Это результат, а не пауза (Р-42). */
  dropEntry: (id: string) => Promise<void>
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Месяц по умолчанию для новой записи.
 *
 * Месяц, а не день: во всех 72 записях, перенесённых из Obsidian, дня нет
 * вовсе — дневник вёлся помесячно. Точность до дня доступна в форме
 * отдельно, но навязывать её значит записывать выдумку фактом (Р-25).
 */
export function currentMonth(): string {
  return today().slice(0, 7)
}

export function useContent(): Content {
  const [entries, setEntries] = useState<ContentEntry[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await db.ready()
        const loaded = await db.getAll('content')
        if (cancelled) return
        setEntries(loaded)
        setStatus('ready')
      } catch (failure) {
        if (!cancelled) {
          setError(describe(failure))
          setStatus('failed')
        }
      }
    }

    void load()

    // Чужие записи приезжают прямо в базу, мимо этого состояния: без
    // перечитывания запись, заведённая на телефоне, появилась бы здесь
    // только после перезапуска приложения.
    const unsubscribe = db.onChange((event) => {
      if (event.origin === 'remote' && event.store === 'content') void load()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  /** Сначала состояние, потом база: правка должна отзываться в том же кадре. */
  const apply = useCallback(
    async <T>(optimistic: () => void, revert: () => void, write: () => Promise<T>) => {
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
    },
    [],
  )

  const live = useMemo(() => entries.filter((entry) => !entry.deleted), [entries])

  const entryOf = useCallback(
    (id: string) => live.find((entry) => entry.id === id) ?? null,
    [live],
  )

  const addEntry = useCallback(
    async (draft: EntryDraft) => {
      const previous = entries
      const entry: ContentEntry = { id: ulid(), updatedAt: nowIso(), ...draft }
      const saved = await apply(
        () => setEntries([...previous, entry]),
        () => setEntries(previous),
        () => db.put('content', entry),
      )
      if (saved) {
        setEntries((all) => all.map((each) => (each.id === saved.id ? saved : each)))
      }
      return saved
    },
    [entries, apply],
  )

  const updateEntry = useCallback(
    async (id: string, patch: Partial<EntryDraft>) => {
      const previous = entries
      const current = previous.find((each) => each.id === id)
      if (!current) return

      const updated: ContentEntry = { ...current, ...patch, updatedAt: nowIso() }
      const saved = await apply(
        () => setEntries(previous.map((each) => (each.id === id ? updated : each))),
        () => setEntries(previous),
        () => db.put('content', updated),
      )
      if (saved) setEntries((all) => all.map((each) => (each.id === saved.id ? saved : each)))
    },
    [entries, apply],
  )

  const removeEntry = useCallback(
    async (id: string) => {
      const previous = entries
      await apply(
        () =>
          setEntries(previous.map((each) => (each.id === id ? { ...each, deleted: true } : each))),
        () => setEntries(previous),
        () => db.remove('content', id),
      )
    },
    [entries, apply],
  )

  const startEntry = useCallback(
    async (id: string) => {
      const current = entries.find((each) => each.id === id)
      // Дата начала проставляется, только когда её не было: у записи из
      // списка «к просмотру» её нет по определению, а у той, что уже
      // начиналась, затирать прежнюю дату нельзя.
      const start = current?.start ?? currentMonth()
      await updateEntry(id, { status: 'active', start })
    },
    [entries, updateEntry],
  )

  const finishEntry = useCallback(
    async (id: string) => updateEntry(id, { status: 'done' }),
    [updateEntry],
  )

  const dropEntry = useCallback(
    async (id: string) => updateEntry(id, { status: 'dropped' }),
    [updateEntry],
  )

  return {
    status,
    error,
    entries: live,
    entryOf,
    addEntry,
    updateEntry,
    removeEntry,
    startEntry,
    finishEntry,
    dropEntry,
  }
}
