import { Link } from 'react-router-dom'
import { formatDateLong, today } from '../shared/core/dates.ts'
import { feedItems, KIND_ORDER, kindLabel } from '../registry.ts'
import { useFeed } from '../shared/screens/useFeed.ts'
import { Fold } from '../shared/ui/Fold.tsx'
import { yearAgo } from './yearAgo.ts'

/**
 * «Год назад» внизу «Сейчас»: что было в этот день прошлого года.
 *
 * Строки — те же, что в ленте, без даты: она одна на всех и стоит над
 * ними. Блок целиком ведёт в ленту, а не к записи: это повод вспомнить,
 * а не дело на сегодня. Нет записей — блока нет, как у остальных на «Сейчас».
 */
export function YearAgo() {
  const feed = useFeed(feedItems)
  if (feed.status !== 'ready') return null

  const found = yearAgo(feed.items, today(), KIND_ORDER)
  if (found === null) return null

  return (
    <Fold id="today:year-ago" title="Год назад" summary={found.shown.length + found.rest}>
      <Link className="year-ago" to="/feed">
        <span className="muted">{formatDateLong(found.day)}</span>
        <ul className="feed">
          {found.shown.map((item) => (
            <li className="feed__row" key={`${item.kind}:${item.id}`}>
              <span className="feed__main">
                <span className="feed__title">{item.title}</span>
                {item.detail && <span className="feed__detail muted">{item.detail}</span>}
              </span>
              <span className="feed__kind muted">{kindLabel(item.kind)}</span>
            </li>
          ))}
        </ul>
        {found.rest > 0 && <span className="muted">и ещё {found.rest}</span>}
      </Link>
    </Fold>
  )
}
