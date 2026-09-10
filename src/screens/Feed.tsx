import { useState } from 'react'
import { Link } from 'react-router-dom'
import { feedDateText, feedHeading, filterFeed, groupFeed, recordsText } from '../core/feed.ts'
import type { EventKind } from '../core/model.ts'
import { KIND_ORDER, KINDS } from '../registry.ts'
import { useFeed } from './useFeed.ts'

/**
 * Лента: все записи всех дневников, новые сверху (Р-48, Р-52).
 *
 * «Сейчас» отвечает на вопрос «что делать сегодня», лента — на «что было»:
 * когда в последний раз, что за август, доехало ли с телефона. Отсюда и
 * устройство: хроника за всё время и поиск по всему сразу, без выбора
 * периода — «стрижка» имеет смысл искать именно по всем годам.
 *
 * Списка «к просмотру» здесь нет: это планы, а не события. Об этом сказано
 * под лентой словами, чтобы его отсутствие не читалось как потеря.
 */
export function Feed() {
  const feed = useFeed()
  const [kind, setKind] = useState<EventKind | null>(null)
  const [query, setQuery] = useState('')

  if (feed.status === 'loading') return <p className="muted">Открываю базу…</p>
  if (feed.status === 'failed') return <p className="error">База не открылась: {feed.error}</p>

  const total = feed.items.length
  // Чипы только тех видов, что есть: чип на пустой вид — тап, ведущий
  // к «ничего не нашлось» (то же правило, что у месяцев в контенте, Р-45).
  const present = KIND_ORDER.filter((each) => feed.items.some((item) => item.kind === each))
  const shown = filterFeed(feed.items, { kind, query })
  const groups = groupFeed(shown)

  return (
    <>
      <header className="screen-head">
        <h1>Лента</h1>
        <p className="muted">Все записи всех дневников, новые сверху.</p>
      </header>

      {total === 0 ? (
        <p className="stub">Записей пока нет. Отметки, болезни, измерения и просмотренное появятся здесь сами.</p>
      ) : (
        <>
          {present.length > 1 && (
            <div className="chips">
              <button
                type="button"
                className={kind === null ? 'chip chip--on' : 'chip'}
                aria-pressed={kind === null}
                onClick={() => setKind(null)}
              >
                Всё
              </button>
              {present.map((each) => (
                <button
                  key={each}
                  type="button"
                  className={each === kind ? 'chip chip--on' : 'chip'}
                  aria-pressed={each === kind}
                  onClick={() => setKind(each)}
                >
                  {KINDS[each].label}
                </button>
              ))}
            </div>
          )}

          <input
            className="search"
            value={query}
            placeholder="Поиск: название, заметка, симптом, дата"
            onChange={(event) => setQuery(event.target.value)}
          />

          <p className="muted">
            {shown.length === total ? recordsText(total) : `Показано ${shown.length} из ${total}`}
          </p>

          {shown.length === 0 && <p className="muted">Под фильтры ничего не подошло.</p>}

          {groups.map((group) => (
            <div className="month-group" key={group.month ?? 'нет даты'}>
              <h3
                className={
                  group.month === null ? 'month-group__head month-group__head--warn' : 'month-group__head'
                }
              >
                {feedHeading(group.month)}
                <span className="muted"> · {group.items.length}</span>
              </h3>

              <ul className="feed">
                {group.items.map((item) => (
                  <li key={`${item.kind}:${item.id}`}>
                    <Link className="feed__row" to={item.link}>
                      <span className="feed__date">{feedDateText(item.date)}</span>
                      <span className="feed__main">
                        <span className="feed__title">{item.title}</span>
                        {item.detail && <span className="feed__detail muted">{item.detail}</span>}
                      </span>
                      {kind === null && <span className="feed__kind muted">{KINDS[item.kind].label}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="muted">Список «к просмотру» в ленту не входит: это планы, а не события.</p>
        </>
      )}
    </>
  )
}
