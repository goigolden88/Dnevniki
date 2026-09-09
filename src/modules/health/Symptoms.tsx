import { useState, type KeyboardEvent } from 'react'
import { recentSymptoms } from './health.ts'
import type { Episode, Tag } from '../../core/model.ts'

/**
 * Выбор симптомов: недавние в один тап, новый — словом.
 *
 * Отдельного экрана управления тегами нет намеренно. Симптом заводится
 * там же, где нужен, а список недавних (Р-39) закрывает почти все случаи:
 * болеешь обычно тем же, чем в прошлый раз. Порядок считает `recentSymptoms`,
 * компонент только рисует.
 */
export function SymptomPicker({
  selected,
  tags,
  episodes,
  onChange,
  onCreate,
}: {
  /** Id выбранных тегов. */
  selected: string[]
  tags: Tag[]
  episodes: Episode[]
  onChange: (ids: string[]) => void
  /** Заводит тег по имени и отдаёт его id. */
  onCreate: (name: string) => Promise<string | null>
}) {
  const [text, setText] = useState('')

  const symptoms = tags.filter((tag) => tag.scope === 'symptom')
  const byId = new Map(symptoms.map((tag) => [tag.id, tag]))
  const order = recentSymptoms(
    episodes,
    symptoms.map((tag) => tag.id),
  )

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((each) => each !== id) : [...selected, id])
  }

  async function add() {
    const name = text.trim()
    if (!name) return
    const id = await onCreate(name)
    setText('')
    // Уже выбранный симптом не добавляется вторым разом: тогда он
    // посчитался бы дважды в аналитике повторяющихся.
    if (id && !selected.includes(id)) onChange([...selected, id])
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    // Иначе Enter отправит форму эпизода вместо добавления симптома.
    event.preventDefault()
    void add()
  }

  return (
    <div className="field">
      <span>Симптомы</span>

      {order.length > 0 && (
        <div className="chips">
          {order.map((id) => {
            const tag = byId.get(id)
            if (!tag) return null
            const on = selected.includes(id)
            return (
              <button
                key={id}
                type="button"
                className={on ? 'chip chip--on' : 'chip'}
                aria-pressed={on}
                onClick={() => toggle(id)}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}

      <div className="row">
        <input
          value={text}
          placeholder="новый симптом"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKey}
        />
        <button type="button" className="btn" onClick={() => void add()}>
          Добавить
        </button>
      </div>
    </div>
  )
}
