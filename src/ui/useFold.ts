/**
 * Что свёрнуто на экране (Р-55).
 *
 * Помнится на устройстве, в `settings`, а не синхронизируется: свернуть
 * «Дачу» на телефоне не значит свернуть её на компьютере, как и дата
 * последней выгрузки у каждого устройства своя.
 *
 * Состояние общее на все блоки и живёт здесь один раз: иначе каждый блок
 * читал бы и переписывал ключ сам, и два быстрых тапа по соседним
 * заголовкам затёрли бы друг друга.
 */

import { useEffect, useReducer } from 'react'
import { db } from '../core/db.ts'

const KEY = 'folds'

/** id блока → свёрнут ли. Нет ключа — действует умолчание блока. */
let folds: Record<string, boolean> | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function load(): Promise<void> {
  loading ??= db.settings
    .get<Record<string, boolean>>(KEY)
    .then((value) => {
      folds = value ?? {}
    })
    // Не прочиталось — все блоки в умолчании. Сворачивание не повод
    // показывать ошибку.
    .catch(() => {
      folds = {}
    })
    .finally(notify)
  return loading
}

export function useFold(id: string, byDefault: boolean): [boolean, () => void] {
  const [, rerender] = useReducer((count: number) => count + 1, 0)

  useEffect(() => {
    listeners.add(rerender)
    void load()
    return () => {
      listeners.delete(rerender)
    }
  }, [])

  const folded = folds?.[id] ?? byDefault

  function toggle() {
    folds = { ...(folds ?? {}), [id]: !folded }
    notify()
    void db.settings.set(KEY, folds)
  }

  return [folded, toggle]
}
