import { Link } from 'react-router-dom'
import { watching } from './content.ts'
import { entryText } from './labels.ts'
import { useContent } from './useContent.ts'

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

  return (
    <section className="block">
      <h2>Смотрю сейчас</h2>
      <ul className="cycles">
        {active.map((entry) => (
          <li className="cycle cycle--due" key={entry.id}>
            <div className="cycle__foot">
              <div className="cycle__facts">
                <Link className="cycle__name" to="/content">
                  {entry.title}
                </Link>
                <span className="muted">{entryText(entry)}</span>
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
    </section>
  )
}
