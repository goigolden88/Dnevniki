import { useEffect, useRef, useState } from 'react'
import { entryText, statusLabel } from './labels.ts'
import { EntryForm } from './EntryForm.tsx'
import type { Content } from './useContent.ts'
import type { ContentEntry } from '../../core/model.ts'

/** Что предлагается сделать с записью в один тап. Зависит от статуса. */
function actionFor(
  entry: ContentEntry,
  content: Content,
): { label: string; run: () => void } | null {
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
export function EntryCard({
  entry,
  content,
  focused = false,
}: {
  entry: ContentEntry
  content: Content
  /** К этой записи пришли из ленты: развернуть и прокрутить к ней (Р-56). */
  focused?: boolean
}) {
  const [open, setOpen] = useState(focused)
  const [editing, setEditing] = useState(false)
  const action = actionFor(entry, content)
  const card = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (focused) card.current?.scrollIntoView({ block: 'center' })
  }, [focused])

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
    <li
      ref={card}
      className={[
        'cycle',
        entry.status === 'active' ? 'cycle--due' : '',
        focused ? 'cycle--focus' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
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
