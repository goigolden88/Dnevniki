import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Строка таблицы, которая при появлении прокручивается к себе, если `scroll`.
 * Нужна правке записи, к которой пришли из ленты (Р-97): блок мог быть
 * свёрнут, и строка появляется только после его разворота — прокрутить
 * к ней раньше нечего.
 */
export function ScrollRow({ scroll, children }: { scroll: boolean; children: ReactNode }) {
  const row = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    if (scroll) row.current?.scrollIntoView({ block: 'center' })
  }, [scroll])

  return <tr ref={row}>{children}</tr>
}
