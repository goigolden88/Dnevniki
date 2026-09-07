import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { CycleState } from '../../core/cycles.ts'
import type { CycleItem } from '../../core/model.ts'
import { CategoryField } from './CategoryField.tsx'
import { barPercent, CATEGORIES, detailText, intervalText, statusText } from './labels.ts'
import { useCycles, type ItemDraft } from './useCycles.ts'

export function CycleList() {
  const cycles = useCycles()

  if (cycles.status === 'loading') return <p className="muted">Открываю базу…</p>
  if (cycles.status === 'failed') return <p className="error">База не открылась: {cycles.error}</p>

  const archived = cycles.items.filter((item) => item.archived)

  return (
    <>
      {cycles.error && <p className="error">Не сохранилось: {cycles.error}</p>}

      {cycles.states.length === 0 ? (
        <p className="stub">
          Позиций пока нет. Заведи первую — стрижку, замену фильтра, что угодно повторяющееся.
        </p>
      ) : (
        <ul className="cycles">
          {cycles.states.map((state) => (
            <CycleCard key={state.item.id} state={state} onMark={cycles.mark} />
          ))}
        </ul>
      )}

      <AddItem onAdd={cycles.addItem} />

      {archived.length > 0 && <Archived items={archived} />}
    </>
  )
}

function CycleCard({
  state,
  onMark,
}: {
  state: CycleState
  onMark: (item: CycleItem) => Promise<void>
}) {
  // Отмечено сегодня — единственный случай, когда кнопка снимает отметку.
  // Это и есть отмена ошибочного тапа: другой отмены на экране нет.
  const markedToday = state.daysSince === 0
  const interval = intervalText(state)

  return (
    <li className={`cycle cycle--${state.status}`}>
      <div className="cycle__head">
        <Link className="cycle__name" to={`/cycle/${state.item.id}`}>
          {state.item.name}
        </Link>
        <span className="cycle__cat muted">{state.item.cat}</span>
      </div>

      <div className="bar" aria-hidden="true">
        <span className="bar__fill" style={{ width: `${barPercent(state)}%` }} />
      </div>

      <div className="cycle__foot">
        <div className="cycle__facts">
          <span className="cycle__status">{statusText(state)}</span>
          <span className="muted">
            {detailText(state)}
            {interval && ` · ${interval}`}
          </span>
        </div>

        <button
          type="button"
          className={markedToday ? 'mark mark--done' : 'mark'}
          onClick={() => void onMark(state.item)}
        >
          {markedToday ? 'Отмечено' : 'Отметить'}
        </button>
      </div>
    </li>
  )
}

/** Архивные позиции. Не считаются и не мешают, но должны быть достижимы. */
function Archived({ items }: { items: CycleItem[] }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="block">
      <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
        {open ? 'Скрыть архив' : `Архив (${items.length})`}
      </button>
      {open && (
        <ul className="plain">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/cycle/${item.id}`}>{item.name}</Link>
              <span className="muted"> · {item.cat}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddItem({ onAdd }: { onAdd: (draft: ItemDraft) => Promise<CycleItem | null> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [cat, setCat] = useState<string>(CATEGORIES[0])
  const [interval, setInterval] = useState('')

  if (!open) {
    return (
      <button type="button" className="btn btn--wide" onClick={() => setOpen(true)}>
        Добавить позицию
      </button>
    )
  }

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    // Пустой интервал — не ошибка: тогда он посчитается по истории отметок.
    const parsed = Number(interval)
    const intervalDays = interval.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null

    void onAdd({ name: trimmed, cat: cat.trim(), intervalDays })
    setName('')
    setInterval('')
    setOpen(false)
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>Название</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>

      <CategoryField value={cat} onChange={setCat} />

      <label className="field">
        <span>Интервал, дней</span>
        <input
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          inputMode="numeric"
          placeholder="по истории"
        />
      </label>

      <div className="form__actions">
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Отмена
        </button>
        <button type="submit" className="btn btn--primary">
          Добавить
        </button>
      </div>
    </form>
  )
}
