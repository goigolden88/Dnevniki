/**
 * Данные модуля здоровья: чтение из `db`, правки, теги.
 *
 * Устроен так же, как `useCycles`: расчёт живёт в `health.ts`, хранилище
 * за `db`, здесь только связывание и оптимистичные правки. Экран получает
 * готовые списки и не знает про `db` вовсе.
 *
 * Хранилищ здесь четыре против двух у циклов — эпизоды, измерения,
 * тренировки и общие теги, — но грузятся они так же целиком: записей
 * здоровья за год набегают сотни, и выборка по индексу окупится нескоро.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { episodeStates, openEpisodes, type EpisodeState } from './health.ts'
import { db } from '../../core/db.ts'
import { nowIso, today, type DateStr } from '../../core/dates.ts'
import { ulid } from '../../core/id.ts'
import type { Episode, Measure, Session, Tag } from '../../core/model.ts'

export type Status = 'loading' | 'ready' | 'failed'

/** Что задаётся при заведении эпизода. */
export type EpisodeDraft = {
  title: string
  source: Episode['source']
  start: DateStr
  end: string | null
  symptoms: string[]
  note?: string
}

export type MeasureDraft = {
  metric: string
  date: DateStr
  value: number
  value2?: number
  note?: string
}

export type SessionDraft = {
  activity: string
  date: DateStr
  durationMin?: number
  distanceKm?: number
  note?: string
}

export type Health = {
  status: Status
  error: string
  /** Сегодняшняя дата, на которую посчитан экран. */
  day: DateStr
  /** Все живые эпизоды: открытые сверху, дальше по дате начала. */
  episodes: EpisodeState[]
  /** Только открытые — «болею сейчас». */
  open: EpisodeState[]
  measures: Measure[]
  sessions: Session[]
  tags: Tag[]
  episodeOf: (id: string) => EpisodeState | null
  addEpisode: (draft: EpisodeDraft) => Promise<Episode | null>
  updateEpisode: (id: string, patch: Partial<EpisodeDraft>) => Promise<void>
  /** Закрыть эпизод датой окончания. По умолчанию сегодняшней. */
  closeEpisode: (id: string, end?: DateStr) => Promise<void>
  /** Снова открыть: выздоровление отмечено по ошибке или вернулось. */
  reopenEpisode: (id: string) => Promise<void>
  removeEpisode: (id: string) => Promise<void>
  addMeasure: (draft: MeasureDraft) => Promise<void>
  removeMeasure: (id: string) => Promise<void>
  addSession: (draft: SessionDraft) => Promise<void>
  removeSession: (id: string) => Promise<void>
  /** Id тега по имени. Заводит новый, если такого ещё нет. */
  ensureTag: (name: string, scope: Tag['scope']) => Promise<string | null>
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/** Хранилища, из-за которых экран здоровья надо перечитать. */
const WATCHED = ['episodes', 'measures', 'sessions', 'tags'] as const

export function useHealth(): Health {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [measures, setMeasures] = useState<Measure[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [day, setDay] = useState<DateStr>(today())

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await db.ready()
        const [loadedEpisodes, loadedMeasures, loadedSessions, loadedTags] = await Promise.all([
          db.getAll('episodes'),
          db.getAll('measures'),
          db.getAll('sessions'),
          db.getAll('tags'),
        ])
        if (cancelled) return
        setEpisodes(loadedEpisodes)
        setMeasures(loadedMeasures)
        setSessions(loadedSessions)
        setTags(loadedTags)
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
    // перечитывания эпизод, заведённый на телефоне, появился бы здесь
    // только после перезапуска приложения.
    const unsubscribe = db.onChange((event) => {
      if (event.origin !== 'remote') return
      if (!WATCHED.includes(event.store as (typeof WATCHED)[number])) return
      void load()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // «Сегодня» пересчитывается при возврате вкладки: установленное
  // приложение неделями не перезапускается, и дата иначе застывает.
  useEffect(() => {
    function refreshDay() {
      if (document.visibilityState === 'visible') setDay(today())
    }
    document.addEventListener('visibilitychange', refreshDay)
    return () => document.removeEventListener('visibilitychange', refreshDay)
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

  const states = useMemo(() => episodeStates(episodes, day), [episodes, day])
  const open = useMemo(() => openEpisodes(episodes, day), [episodes, day])

  const episodeOf = useCallback(
    (id: string) => states.find((state) => state.episode.id === id) ?? null,
    [states],
  )

  const addEpisode = useCallback(
    async (draft: EpisodeDraft) => {
      const previous = episodes
      const episode: Episode = { id: ulid(), updatedAt: nowIso(), ...draft }
      const saved = await apply(
        () => setEpisodes([...previous, episode]),
        () => setEpisodes(previous),
        () => db.put('episodes', episode),
      )
      if (saved) {
        setEpisodes((all) => all.map((each) => (each.id === saved.id ? saved : each)))
      }
      return saved
    },
    [episodes, apply],
  )

  const updateEpisode = useCallback(
    async (id: string, patch: Partial<EpisodeDraft>) => {
      const previous = episodes
      const current = previous.find((each) => each.id === id)
      if (!current) return

      const updated: Episode = { ...current, ...patch, updatedAt: nowIso() }
      const saved = await apply(
        () => setEpisodes(previous.map((each) => (each.id === id ? updated : each))),
        () => setEpisodes(previous),
        () => db.put('episodes', updated),
      )
      if (saved) setEpisodes((all) => all.map((each) => (each.id === saved.id ? saved : each)))
    },
    [episodes, apply],
  )

  const closeEpisode = useCallback(
    async (id: string, end?: DateStr) => updateEpisode(id, { end: end ?? day }),
    [updateEpisode, day],
  )

  const reopenEpisode = useCallback(
    async (id: string) => updateEpisode(id, { end: null }),
    [updateEpisode],
  )

  const removeEpisode = useCallback(
    async (id: string) => {
      const previous = episodes
      await apply(
        () =>
          setEpisodes(previous.map((each) => (each.id === id ? { ...each, deleted: true } : each))),
        () => setEpisodes(previous),
        () => db.remove('episodes', id),
      )
    },
    [episodes, apply],
  )

  const addMeasure = useCallback(
    async (draft: MeasureDraft) => {
      const previous = measures
      const measure: Measure = { id: ulid(), updatedAt: nowIso(), ...draft }
      const saved = await apply(
        () => setMeasures([...previous, measure]),
        () => setMeasures(previous),
        () => db.put('measures', measure),
      )
      if (saved) setMeasures((all) => all.map((each) => (each.id === saved.id ? saved : each)))
    },
    [measures, apply],
  )

  const removeMeasure = useCallback(
    async (id: string) => {
      const previous = measures
      await apply(
        () =>
          setMeasures(previous.map((each) => (each.id === id ? { ...each, deleted: true } : each))),
        () => setMeasures(previous),
        () => db.remove('measures', id),
      )
    },
    [measures, apply],
  )

  const addSession = useCallback(
    async (draft: SessionDraft) => {
      const previous = sessions
      const session: Session = { id: ulid(), updatedAt: nowIso(), ...draft }
      const saved = await apply(
        () => setSessions([...previous, session]),
        () => setSessions(previous),
        () => db.put('sessions', session),
      )
      if (saved) setSessions((all) => all.map((each) => (each.id === saved.id ? saved : each)))
    },
    [sessions, apply],
  )

  const removeSession = useCallback(
    async (id: string) => {
      const previous = sessions
      await apply(
        () =>
          setSessions(previous.map((each) => (each.id === id ? { ...each, deleted: true } : each))),
        () => setSessions(previous),
        () => db.remove('sessions', id),
      )
    },
    [sessions, apply],
  )

  /**
   * Тег по имени: находит существующий или заводит новый.
   *
   * Симптом вводится словом прямо в форме эпизода — отдельного экрана
   * «управление тегами» нет и не нужно. Сравнение без учёта регистра
   * и пробелов по краям: «Горло» и «горло » — один симптом, иначе
   * аналитика повторяющихся симптомов рассыплется на синонимы.
   */
  const ensureTag = useCallback(
    async (name: string, scope: Tag['scope']) => {
      const clean = name.trim()
      if (!clean) return null

      const existing = tags.find(
        (tag) =>
          !tag.deleted && tag.scope === scope && tag.name.trim().toLowerCase() === clean.toLowerCase(),
      )
      if (existing) return existing.id

      const tag: Tag = { id: ulid(), updatedAt: nowIso(), name: clean, scope }
      const saved = await apply(
        () => setTags((all) => [...all, tag]),
        () => setTags((all) => all.filter((each) => each.id !== tag.id)),
        () => db.put('tags', tag),
      )
      if (!saved) return null
      setTags((all) => all.map((each) => (each.id === saved.id ? saved : each)))
      return saved.id
    },
    [tags, apply],
  )

  const liveTags = useMemo(() => tags.filter((tag) => !tag.deleted), [tags])
  const liveMeasures = useMemo(() => measures.filter((each) => !each.deleted), [measures])
  const liveSessions = useMemo(() => sessions.filter((each) => !each.deleted), [sessions])

  return {
    status,
    error,
    day,
    episodes: states,
    open,
    measures: liveMeasures,
    sessions: liveSessions,
    tags: liveTags,
    episodeOf,
    addEpisode,
    updateEpisode,
    closeEpisode,
    reopenEpisode,
    removeEpisode,
    addMeasure,
    removeMeasure,
    addSession,
    removeSession,
    ensureTag,
  }
}
