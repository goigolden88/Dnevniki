import { formatDateLong, today } from '../core/dates.ts'
import { CycleList } from '../modules/cycles/CycleList.tsx'

export function Today() {
  return (
    <>
      <header className="screen-head">
        <h1>Сейчас</h1>
        <p className="muted">{formatDateLong(today())}</p>
      </header>

      <CycleList />
    </>
  )
}
