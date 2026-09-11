import { useEffect, useState } from 'react'
import { db } from '../core/db.ts'
import { useInstall } from '../ui/install.ts'
import { iosNote, isEmptyBase, OWN_STORES, type Counts, type IosNoteKind } from './firstRun.ts'

/** Строку про iPhone скрыли насовсем (Р-69). В `settings`: у каждого устройства своё. */
const IOS_NOTE_HIDDEN = 'installNoteHidden'

/**
 * Скрыта ли строка про iPhone в этом открытии. Модульная переменная, а не
 * состояние компонента: переход на другую вкладку и обратно её не
 * возвращает, а новое открытие приложения — возвращает.
 */
let hiddenNow = false

export type FirstRun = {
  /** Посчитано ли, пуста ли база. До этого показывать нечего. */
  ready: boolean
  empty: boolean
  iosNote: IosNoteKind
  hideIosNote: () => void
}

/**
 * Пуста ли база и что из этого следует на «Сейчас» (Р-69). Пересчитывается
 * на любую запись — своей рукой или приехавшую синхронизацией.
 */
export function useFirstRun(): FirstRun {
  const [counts, setCounts] = useState<Counts | null>(null)
  const [hiddenForever, setHiddenForever] = useState(false)
  const [hidden, setHidden] = useState(hiddenNow)
  const { advice } = useInstall()

  useEffect(() => {
    let alive = true

    async function count() {
      try {
        const next: Counts = {}
        for (const store of OWN_STORES) next[store] = await db.count(store)
        if (alive) setCounts(next)
      } catch {
        // База не открылась — об этом скажет экран циклов. Здесь молчим.
      }
    }

    void count()
    void db.settings
      .get<boolean>(IOS_NOTE_HIDDEN)
      .then((value) => {
        if (alive) setHiddenForever(value === true)
      })
      .catch(() => undefined)

    const stores: readonly string[] = OWN_STORES
    const off = db.onChange((event) => {
      if (stores.includes(event.store)) void count()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  const empty = counts === null || isEmptyBase(counts)

  return {
    ready: counts !== null,
    empty,
    iosNote:
      counts === null
        ? null
        : iosNote({ iosTab: advice === 'ios', empty, welcome: false, hiddenNow: hidden, hiddenForever }),
    hideIosNote: () => {
      hiddenNow = true
      setHidden(true)
      if (!empty) {
        setHiddenForever(true)
        void db.settings.set(IOS_NOTE_HIDDEN, true)
      }
    },
  }
}
