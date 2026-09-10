import { today, type DateStr } from '../core/dates.ts'

/**
 * Чип «сегодня» рядом с полем даты (Р-51).
 *
 * Виден всегда, а не только когда дата другая: место под пальцем не должно
 * прыгать от того, что выбрано. Когда дата уже сегодняшняя, чип нажат —
 * это заодно и подсказка, какой день сейчас стоит в поле.
 *
 * Лежит в `ui`, потому что им пользуются все модули. Про сами модули
 * ничего не знает: на входе строка, на выходе строка.
 */
export function TodayButton({
  value,
  onPick,
}: {
  value: string | null
  onPick: (day: DateStr) => void
}) {
  const day = today()
  const on = value === day

  return (
    <button
      type="button"
      className={on ? 'chip chip--today chip--on' : 'chip chip--today'}
      aria-pressed={on}
      onClick={() => onPick(day)}
    >
      сегодня
    </button>
  )
}
