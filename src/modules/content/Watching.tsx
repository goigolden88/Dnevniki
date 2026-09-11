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
 */
export function Watching() {
  const content = useContent()
  if (content.status !== 'ready') return null

  const active = watching(content.entries)
  if (active.length === 0) return null
  const day = today()

  return (
    <Fold id="today:watching" title="Смотрю сейчас" summary={active.length}>
      <ul className="cycles">
        {active.map((entry) => (
          <li className="cycle cycle--due" key={entry.id}>
            <div className="cycle__foot">
              <div className="cycle__facts">
                {/* Название ведёт к самой записи, а не просто на вкладку (Р-56).
                    У зависшей там же ответы на «Ещё смотришь?» (Р-58). */}
                <Link className="cycle__name" to={`/content?open=${entry.id}`}>
                  {entry.title}
                </Link>
                <span className="muted">{entryText(entry)}</span>
                {staleDays(entry, day) !== null && (
                  <span className="error">{staleText(staleDays(entry, day) ?? 0)} — ещё смотришь?</span>
                )}
              </div>
              <button
                type="button"
                className="mark"
                onClick={() => void content.finishEntry(entry.id)}
              >
                Досмотрел
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Fold>
  )
}
