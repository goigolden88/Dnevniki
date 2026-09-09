import { formatDateLong, today } from '../core/dates.ts'
import { CycleList } from '../modules/cycles/CycleList.tsx'
import { OpenEpisodes } from '../modules/health/OpenEpisodes.tsx'

export function Today() {
  return (
    <>
      <header className="screen-head">
        <h1>Сейчас</h1>
        <p className="muted">{formatDateLong(today())}</p>
      </header>

      {/* Экран — единственное место, где модули встречаются: сами они
          друг про друга не знают (02-Архитектура, «Правила»). */}
      <OpenEpisodes />

      <CycleList />
    </>
  )
}
