import type { ReactNode } from 'react'
import { useFold } from './useFold.ts'

/**
 * Блок экрана, который сворачивается тапом по заголовку (Р-55).
 *
 * Рядом с заголовком всегда стоит итог — число записей или сумма, — и
 * у свёрнутого тоже: «Гигиена · 5», «Требует внимания · 2». Свёрнутое
 * не должно пропадать молча, тот же принцип, что у фильтров (Р-46).
 *
 * Что свёрнуто, помнит устройство. Отдельного выключателя в настройках
 * нет: тап по заголовку короче, чем заход в настройки.
 */
export function Fold({
  id,
  title,
  summary,
  folded: byDefault = false,
  children,
}: {
  /** Постоянный ключ блока: по нему устройство помнит, что свёрнуто. */
  id: string
  title: string
  summary?: ReactNode
  /** Свёрнут ли блок, пока его ни разу не трогали. */
  folded?: boolean
  children: ReactNode
}) {
  const [folded, toggle] = useFold(id, byDefault)

  return (
    <section className="block">
      <h2 className="fold__head">
        <button type="button" className="fold__btn" aria-expanded={!folded} onClick={toggle}>
          {title}
        </button>
        {summary !== undefined && summary !== '' && <span className="fold__summary">· {summary}</span>}
      </h2>
      {!folded && children}
    </section>
  )
}
