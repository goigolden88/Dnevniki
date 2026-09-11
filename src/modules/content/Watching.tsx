import { Link } from 'react-router-dom'
import { today } from '../../core/dates.ts'
import { staleDays, watching } from './content.ts'
import { entryText, staleText } from './labels.ts'
import { useContent } from './useContent.ts'
import { Fold } from '../../ui/Fold.tsx'

/**
 * «Смотрю сейчас» на главном экране.
 *
 * Молчит, когда ничего не начато. Стоит ниже открытых эпизодов и выше
 * циклов: болезнь важнее сериала, а сериал — не срок, который горит.
 *
 * Кнопка ровно одна, и та же, что на вкладке модуля: досмотрел. Это
 * единственное, что делают с записью каждый день, и ради него не должно
 * приходиться никуда заходить — иначе запись зависает в «смотрю»
 * месяцами, ровно как незакрытый эпизод болезни.
 *
 * Строками, а не карточками (Р-73): здесь это напоминание, а пять крупных
 * карточек занимали весь первый экран и уводили просроченное под сгиб.
 * Карточки целиком — на вкладке «Контент».
 */
export function Watching() {
  const content = useContent()
  if (content.status !== 'ready') return null

  const active = watching(content.entries)
  if (active.length === 0) return null
  const day = today()

  return (
    <Fold id="today:watching" title="Смотрю сейчас" summary={active.length}>
      <ul className="watch">
        {active.map((entry) => {
          const stale = staleDays(entry, day)
          return (
            <li className="watch__row" key={entry.id}>
              <div className="watch__main">
                {/* Название ведёт к самой записи, а не просто на вкладку (Р-56).
                    У зависшей там же ответы на «Ещё смотришь?» (Р-58). */}
                <Link className="watch__title" to={`/content?open=${entry.id}`}>
                  {entry.title}
                </Link>
                <span className="muted">{entryText(entry)}</span>
                {stale !== null && <span className="error">{staleText(stale)} — ещё смотришь?</span>}
              </div>
              <button
                type="button"
                className="mark"
                onClick={() => void content.finishEntry(entry.id)}
              >
                Досмотрел
              </button>
            </li>
          )
        })}
      </ul>
    </Fold>
  )
}
