import { useState } from 'react'
import { filterEntries, finished, planned, watching, type EntryType } from './content.ts'
import { entryText, plannedText, statusLabel, TYPES } from './labels.ts'
import { ContentStats } from './ContentStats.tsx'
import { EntryForm } from './EntryForm.tsx'
import { currentMonth, useContent, type Content } from './useContent.ts'
import type { ContentEntry } from '../../core/model.ts'

/**
 * Экран контента: что смотрю, что посмотрел, что собираюсь.
 *
 * Порядок блоков тот же, что в здоровье, и по той же причине: сверху то,
 * с чем работают каждый день. Здесь это «смотрю сейчас» — досмотрел
 * и поставил оценку, единственное регулярное действие модуля.
 *
 * Отдельного экрана записи нет: карточка разворачивается на месте.
 * Записей под сотню, и уход на свой маршрут ради двух строк комментария
 * стоил бы дороже, чем даёт.
 */
export function ContentScreen() {
  const content = useContent()

  if (content.status === 'loading') return <p className="muted">Открываю базу…</p>
  if (content.status === 'failed') {
    return <p className="error">База не открылась: {content.error}</p>
  }

  const active = watching(content.entries)
  const wanted = planned(content.entries)
  const archive = finished(content.entries)

  return (
    <>
      <header className="screen-head">
        <h1>Контент</h1>
      </header>

      {content.error && <p className="error">Не сохранилось: {content.error}</p>}

      {active.length > 0 && (
        <section className="block">
          <h2>Смотрю сейчас</h2>
          <ul className="cycles">
            {active.map((entry) => (
              <EntryCard key={entry.id} entry={entry} content={content} />
            ))}
          </ul>
        </section>
      )}

      <NewEntry content={content} />

      <ContentStats entries={content.entries} />

      <Archive entries={archive} content={content} />

      {wanted.length > 0 && (
        <section className="block">
          <h2>К просмотру</h2>
          <p className="muted">{plannedText(wanted.length)}</p>
          <ul className="cycles">
            {wanted.map((entry) => (
              <EntryCard key={entry.id} entry={entry} content={content} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/**
 * Архив: просмотренное и брошенное вместе.
 *
 * Фильтр по типу и поиск по названию — не украшение: за год записей
 * набирается под сотню, и «где-то тут был тот сериал» без них
 * не находится. Отбор считает `filterEntries`, здесь только поля.
 */
function Archive({ entries, content }: { entries: ContentEntry[]; content: Content }) {
  const [type, setType] = useState<EntryType | null>(null)
  const [query, setQuery] = useState('')

  const shown = filterEntries(entries, { type, query })
  const filtered = type !== null || query.trim() !== ''

  return (
    <section className="block">
      <h2>Просмотрено</h2>

      {entries.length === 0 ? (
        <p className="muted">Пока пусто. Первая запись появится, когда что-нибудь досмотришь.</p>
      ) : (
        <>
          <div className="chips">
            <button
              type="button"
              className={type === null ? 'chip chip--on' : 'chip'}
              aria-pressed={type === null}
              onClick={() => setType(null)}
            >
              Всё
            </button>
            {TYPES.map((each) => (
              <button
                key={each.key}
                type="button"
                className={each.key === type ? 'chip chip--on' : 'chip'}
                aria-pressed={each.key === type}
                onClick={() => setType(each.key)}
              >
                {each.label}
              </button>
            ))}
          </div>

          <input
            className="search"
            value={query}
            placeholder="Поиск по названию"
            onChange={(event) => setQuery(event.target.value)}
          />

          {shown.length === 0 ? (
            <p className="muted">Ничего не нашлось.</p>
          ) : (
            <>
              {filtered && (
                <p className="muted">
                  Показано {shown.length} из {entries.length}.
                </p>
              )}
              <ul className="cycles">
                {shown.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} content={content} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}

/** Что предлагается сделать с записью в один тап. Зависит от статуса. */
function actionFor(entry: ContentEntry, content: Content): { label: string; run: () => void } | null {
  if (entry.status === 'active') {
    return { label: 'Досмотрел', run: () => void content.finishEntry(entry.id) }
  }
  if (entry.status === 'planned') {
    return { label: 'Начал', run: () => void content.startEntry(entry.id) }
  }
  return null
}

/**
 * Карточка записи: название, факты, действие в один тап.
 *
 * Название раскрывает подробности, а не ведёт на свой экран. Комментарии
 * в перенесённых записях длинные, и держать их развёрнутыми во всём
 * списке значит сделать список нечитаемым.
 */
function EntryCard({ entry, content }: { entry: ContentEntry; content: Content }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const action = actionFor(entry, content)

  if (editing) {
    return (
      <li className="cycle">
        <EntryForm
          draft={{
            type: entry.type,
            title: entry.title,
            ...(entry.titleOrig === undefined ? {} : { titleOrig: entry.titleOrig }),
            start: entry.start,
            end: entry.end,
            status: entry.status,
            score: entry.score,
            ...(entry.comment === undefined ? {} : { comment: entry.comment }),
          }}
          submitLabel="Сохранить"
          onCancel={() => setEditing(false)}
          onSubmit={async (draft) => {
            await content.updateEntry(entry.id, draft)
            setEditing(false)
          }}
        />
      </li>
    )
  }

  return (
    <li className={entry.status === 'active' ? 'cycle cycle--due' : 'cycle'}>
      <div className="cycle__head">
        <button type="button" className="cycle__name plain-btn" onClick={() => setOpen(!open)}>
          {entry.title}
        </button>
        <span className="cycle__cat muted">{statusLabel(entry.status)}</span>
      </div>

      <div className="cycle__foot">
        <div className="cycle__facts">
          <span className="cycle__status">{entryText(entry)}</span>
          {entry.titleOrig && <span className="muted">{entry.titleOrig}</span>}
        </div>

        {action && (
          <button type="button" className="mark" onClick={action.run}>
            {action.label}
          </button>
        )}
      </div>

      {open && (
        <div className="entry__more">
          {entry.comment ? (
            <p className="entry__comment">{entry.comment}</p>
          ) : (
            <p className="muted">Комментария нет.</p>
          )}

          <div className="row row--end">
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>
              Правка
            </button>
            <button
              type="button"
              className="link-btn btn--danger"
              onClick={() => void content.removeEntry(entry.id)}
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * Заведение записи.
 *
 * По умолчанию — то, что начинают смотреть сейчас: статус «смотрю»,
 * месяц текущий. Это самый частый случай; «к просмотру» и «просмотрено»
 * задним числом переключаются одним тапом в самой форме.
 */
function NewEntry({ content }: { content: Content }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button type="button" className="btn btn--wide" onClick={() => setOpen(true)}>
        Добавить запись
      </button>
    )
  }

  return (
    <EntryForm
      draft={{
        type: 'anime',
        title: '',
        start: currentMonth(),
        end: null,
        status: 'active',
        score: null,
      }}
      submitLabel="Добавить"
      onCancel={() => setOpen(false)}
      onSubmit={async (draft) => {
        await content.addEntry(draft)
        setOpen(false)
      }}
    />
  )
}
