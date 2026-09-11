import { Link } from 'react-router-dom'
import { formatDateLong, today } from '../core/dates.ts'
import { CycleList } from '../modules/cycles/CycleList.tsx'
import { OpenEpisodes } from '../modules/health/OpenEpisodes.tsx'
import { Watching } from '../modules/content/Watching.tsx'
import { IosNote } from '../ui/Install.tsx'
import { useSyncStatus } from '../ui/useSync.ts'
import { useFirstRun } from './useFirstRun.ts'
import { useWhatsNew } from './useWhatsNew.ts'
import { Welcome } from './Welcome.tsx'
import { WhatsNew } from './WhatsNew.tsx'

export function Today() {
  const status = useSyncStatus()
  const first = useFirstRun()
  const news = useWhatsNew(first)

  // Синхронизация живёт в фоне, и единственное место, где о ней можно
  // узнать, — «Настройки». Точка на шестерёнке говорит, что туда стоит
  // заглянуть: красная — что-то сломалось, тусклая — очередь не ушла.
  // Раньше она стояла на вкладке настроек; вкладки не стало (Р-43),
  // и здесь её видно даже лучше — это первый экран при запуске.
  const mark = status.state === 'error' ? 'dot dot--error' : status.pending > 0 ? 'dot' : ''

  return (
    <>
      <header className="screen-head">
        <div className="screen-head__row">
          <h1>Сейчас</h1>
          {/* Справка рядом с настройками (Р-63): непонятное случается здесь,
              на главном экране, а не в настройках. */}
          <div className="screen-head__tools">
            <Link className="gear" to="/help" aria-label="Справка">
              <span aria-hidden="true">?</span>
            </Link>
            <Link className="gear" to="/settings" aria-label="Настройки">
              <span aria-hidden="true">⚙</span>
              {mark && <span className={mark} aria-hidden="true" />}
            </Link>
          </div>
        </div>
        <p className="muted">{formatDateLong(today())}</p>
      </header>

      {/* Первый запуск (Р-70): пока база пуста и приветствие не закрыли. */}
      {first.welcome && <Welcome onDone={first.dismissWelcome} />}

      {/* После обновления (Р-71): что поменялось. */}
      {news.show.length > 0 && <WhatsNew changes={news.show} onDone={news.dismiss} />}

      {/* iPhone во вкладке Safari (Р-69): у установленного своё хранилище. */}
      {first.iosNote && (
        <section className="stub block">
          <IosNote empty={first.iosNote === 'before'} />
          <button type="button" className="link-btn" onClick={first.hideIosNote}>
            Скрыть
          </button>
        </section>
      )}

      {/* Экран — единственное место, где модули встречаются: сами они
          друг про друга не знают (02-Архитектура, «Правила»).
          Порядок по срочности: болезнь идёт раньше сериала, сериал —
          раньше сроков, потому что он про сегодня, а срок про календарь. */}
      <OpenEpisodes />

      <Watching />

      <CycleList />
    </>
  )
}
