import { useEffect, type ReactNode } from 'react'
import { useFold } from './useFold.ts'

/**
 * Блок экрана, который сворачивается тапом по заголовку (Р-55, Р-61).
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
  reveal = false,
  children,
}: {
  /** Постоянный ключ блока: по нему устройство помнит, что свёрнуто. */
  id: string
  title: string
  summary?: ReactNode
  /** Свёрнут ли блок, пока его ни разу не трогали. */
  folded?: boolean
  /** Внутри — цель перехода: развернуть, даже если свёрнут. */
  reveal?: boolean
  children: ReactNode
}) {
  const { folded, known, toggle, set } = useFold(id, byDefault)

  // Пришли к записи, которая лежит в свёрнутом блоке (Р-56): блок
  // разворачивается и остаётся развёрнутым. Спрятанная цель перехода хуже
  // лишнего раскрытого блока.
  useEffect(() => {
    if (reveal && known && folded) set(false)
  }, [reveal, known, folded, set])

  return (
    <section className="block">
      <h2 className="fold__head">
        <button type="button" className="fold__btn" aria-expanded={!folded} onClick={toggle}>
          {title}
        </button>
        {summary !== undefined && summary !== '' && <span className="fold__summary">· {summary}</span>}
      </h2>
      {/* Пока не прочитано, что свёрнуто, содержимого нет: иначе свёрнутый
          блок на мгновение раскрывался бы и схлопывался, и экран прыгал. */}
      {known && !folded && children}
    </section>
  )
}
