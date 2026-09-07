import { formatDateLong, today } from '../core/dates.ts'

export function Today() {
  return (
    <>
      <header className="screen-head">
        <h1>Сейчас</h1>
        <p className="muted">{formatDateLong(today())}</p>
      </header>

      <p className="stub">Просроченное появится на Этапе 1, вместе с модулем циклов.</p>
    </>
  )
}
