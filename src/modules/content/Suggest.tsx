import { useState } from 'react'
import { suggestPlanned } from './content.ts'
import { EntryCard } from './EntryCard.tsx'
import type { Content } from './useContent.ts'
import type { ContentEntry } from '../../app/model.ts'

/**
 * «Что посмотреть?» — случайные записи из «к просмотру».
 *
 * Только показ: набор живёт, пока открыт экран, и никуда не пишется.
 * Каждое нажатие — новый набор. Карточки те же, что в «Записях», и тап
 * по ним делает то же самое.
 *
 * Хранятся номера, а не сами записи: начал смотреть или удалил —
 * запись уходит из набора сразу, без нового нажатия.
 */
export function Suggest({ content }: { content: Content }) {
  const [ids, setIds] = useState<string[]>([])

  const hasPlanned = content.entries.some((entry) => entry.status === 'planned')
  if (!hasPlanned) return null

  const shown = ids
    .map((id) => content.entryOf(id))
    .filter((entry): entry is ContentEntry => entry !== null && entry.status === 'planned')

  return (
    <>
      <button
        type="button"
        className="btn btn--wide"
        onClick={() => setIds(suggestPlanned(content.entries, ids).map((entry) => entry.id))}
      >
        Что посмотреть?
      </button>

      {shown.length > 0 && (
        <ul className="cycles">
          {shown.map((entry) => (
            <EntryCard key={entry.id} entry={entry} content={content} />
          ))}
        </ul>
      )}
    </>
  )
}
