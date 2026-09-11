import { useState } from 'react'

/**
 * Поле переименования: сохраняет по уходу фокуса и по Enter (Р-59).
 *
 * Пустое или то же самое — возвращает прежнее название, а не сохраняет
 * пустоту. `onCommit` может отказаться — вернуть false, например когда
 * человек не подтвердил слияние, — и поле тоже вернётся к прежнему.
 *
 * Название, пришедшее снаружи, поле само не подхватывает: ставьте ключ
 * по названию, чтобы переименование с другого устройства сбросило поле.
 */
export function RenameField({
  value,
  label,
  onCommit,
}: {
  value: string
  label: string
  onCommit: (name: string) => boolean | undefined
}) {
  const [text, setText] = useState(value)

  function commit() {
    const clean = text.trim()
    if (!clean || clean === value || onCommit(clean) === false) setText(value)
  }

  return (
    <input
      value={text}
      aria-label={label}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}
