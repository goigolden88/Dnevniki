import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { daysBetween, days, formatDateLoose, today } from '../../core/dates.ts'
import type { CycleEvent } from '../../core/model.ts'
import { TodayButton } from '../../ui/TodayButton.tsx'
import type { CycleState } from './cycles.ts'
import { knownGroups, lastPrice, MIN_INTERVALS, spent } from './cycles.ts'
import { CategoryField, GroupField } from './CategoryField.tsx'
import { QuickSection } from './Quick.tsx'
import {
  barPercent,
  detailText,
  divergence,
  formatMoney,
  intervalText,
  parsePrice,
  spentText,
  statusText,
} from './labels.ts'
import { useCycles, type ItemDraft } from './useCycles.ts'

/** Позиция целиком: состояние, история, разброс, правка. */
export function ItemScreen() {
  const { id = '' } = useParams()
  const cycles = useCycles()

  if (cycles.status === 'loading') return <p className="muted">Открываю базу…</p>
  if (cycles.status === 'failed') return <p className="error">База не открылась: {cycles.error}</p>

  const state = cycles.stateOf(id)
  if (!state) {
    return (
      <>
        <p className="stub">Позиция не найдена. Возможно, удалена.</p>
        <Link className="btn btn--wide" to="/">
          К списку
        </Link>
      </>
    )
  }

  const marks = cycles.marksOf(id)
  const markedToday = state.daysSince === 0

  return (
    <>
      <p>
        <Link className="back" to="/">
          ← Сейчас
        </Link>
      </p>

      <header className="screen-head">
        <h1>{state.item.name}</h1>
        <p className="muted">
          {state.item.cat}
          {state.item.archived && ' · в архиве'}
        </p>
      </header>

      {cycles.error && <p className="error">Не сохранилось: {cycles.error}</p>}

      <section className={`block cycle cycle--${state.status}`}>
        <div className="bar" aria-hidden="true">
          <span className="bar__fill" style={{ width: `${barPercent(state)}%` }} />
        </div>
        <div className="cycle__foot">
          <div className="cycle__facts">
            <span className="cycle__status">{statusText(state)}</span>
            <span className="muted">
              {detailText(state)}
              {intervalText(state) && ` · ${intervalText(state)}`}
            </span>
          </div>
          <button
            type="button"
            className={markedToday ? 'mark mark--done' : 'mark'}
            onClick={() => void cycles.mark(state.item)}
          >
            {markedToday ? 'Отмечено' : 'Отметить'}
          </button>
        </div>
      </section>

      {state.spread && (
        <section className="block">
          <h2>Разброс</h2>
          <dl className="facts">
            <dt>Минимум</dt>
            <dd>{days(state.spread.min)}</dd>
            <dt>Медиана</dt>
            <dd>{state.spread.median === null ? '—' : days(state.spread.median)}</dd>
            <dt>Максимум</dt>
            <dd>{days(state.spread.max)}</dd>
            <dt>Интервалов</dt>
            <dd>{state.spread.count}</dd>
          </dl>
          {state.spread.median !== null && state.spread.max > state.spread.median * 2 && (
            <p className="muted">
              Разрыв между максимумом и медианой больше чем вдвое — в истории есть пропуск
              или лишняя запись.
            </p>
          )}
          {state.spread.median === null && state.interval === null && (
            <p className="muted">
              Срок считается с {MIN_INTERVALS} интервалов, сейчас {state.spread.count}. Если знаешь
              интервал — задай его руками ниже, позиция заработает сразу.
            </p>
          )}
          <Divergence state={state} onUseHistory={() => cycles.updateItem(id, { intervalDays: null })} />
        </section>
      )}

      <History marks={marks} onRemove={cycles.removeMark} onSetPrice={cycles.setMarkPrice} />

      <AddMark itemId={id} onAdd={cycles.addMark} />

      <QuickSection
        itemId={id}
        quick={cycles.quick}
        price={lastPrice(marks, id)}
        onAdd={cycles.addTemplate}
        onUpdate={cycles.updateTemplate}
        onRemove={cycles.removeTemplate}
      />

      <ItemForm
        draft={{
          name: state.item.name,
          cat: state.item.cat,
          intervalDays: state.item.intervalDays,
          ...(state.item.group === undefined ? {} : { group: state.item.group }),
          ...(state.item.note === undefined ? {} : { note: state.item.note }),
        }}
        groups={knownGroups(cycles.items)}
        categories={cycles.catNames}
        archived={state.item.archived === true}
        onSave={(patch) => cycles.updateItem(id, patch)}
        onRemove={() => cycles.removeItem(id)}
        name={state.item.name}
      />
    </>
  )
}

/**
 * Расхождение «как надо» и «как есть».
 *
 * Ручной интервал остаётся действующим — медиана его не подменяет (Р-29).
 * Но само расхождение и есть главная запись дневника: положено раз в 90,
 * а по факту раз в 137. Поэтому оно показывается всегда, а переключиться
 * на историю можно в один тап.
 */
function Divergence({
  state,
  onUseHistory,
}: {
  state: CycleState
  onUseHistory: () => Promise<void>
}) {
  const gap = divergence(state)
  if (!gap) return null

  const rarer = gap.history > gap.manual
  return (
    <>
      <p className="muted">
        Задано руками: {days(gap.manual)}. По факту выходит {days(gap.history)} —{' '}
        {rarer ? 'реже' : 'чаще'} задуманного в {gap.times} раза.
      </p>
      <button type="button" className="link-btn" onClick={() => void onUseHistory()}>
        Считать по истории
      </button>
    </>
  )
}

/**
 * История отметок, новые сверху. Рядом с каждой — промежуток до предыдущей:
 * ради этих чисел экран и открывают, в плоском списке дат они не видны.
 *
 * Здесь же правится цена. Отметка ставится одним тапом на экране «Сейчас»,
 * где формы нет вовсе, и другого места вписать 700 ₽ за стрижку у неё не
 * будет — а без цен нечего складывать (Р-36).
 */
function History({
  marks,
  onRemove,
  onSetPrice,
}: {
  marks: CycleEvent[]
  onRemove: (id: string) => Promise<void>
  onSetPrice: (id: string, price: number | null) => Promise<void>
}) {
  if (marks.length === 0) {
    return (
      <section className="block">
        <h2>История</h2>
        <p className="muted">Отметок пока нет.</p>
      </section>
    )
  }

  const total = spentText(spent(marks))

  return (
    <section className="block">
      <h2>История</h2>
      <table className="stats">
        <tbody>
          {marks.map((mark, index) => {
            const older = marks[index + 1]
            const gap = older ? daysBetween(older.date, mark.date) : null
            return (
              <tr key={mark.id}>
                <td>{formatDateLoose(mark.date)}</td>
                <td className="num muted">{gap === null ? '' : `+${days(gap)}`}</td>
                <td className="num">
                  <PriceCell mark={mark} onSet={onSetPrice} />
                </td>
                <td className="num">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => void onRemove(mark.id)}
                    aria-label={`Удалить отметку ${formatDateLoose(mark.date)}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {total && <p className="muted">Потрачено: {total}</p>}
    </section>
  )
}

/**
 * Цена одной отметки: показывается текстом, правится на месте.
 *
 * Пустое поле убирает цену — другого способа стереть ошибочно введённую
 * сумму нет. Нечитаемый ввод не стирает ничего: отмена молчаливее, чем
 * запись нуля вместо «1 500 руб с копейками».
 */
function PriceCell({
  mark,
  onSet,
}: {
  mark: CycleEvent
  onSet: (id: string, price: number | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  if (!editing) {
    return (
      <button
        type="button"
        className={mark.price === undefined ? 'link-btn muted' : 'link-btn'}
        onClick={() => {
          setText(mark.price === undefined ? '' : String(mark.price))
          setEditing(true)
        }}
        aria-label={`Цена отметки ${formatDateLoose(mark.date)}`}
      >
        {mark.price === undefined ? 'цена' : formatMoney(mark.price)}
      </button>
    )
  }

  function commit() {
    setEditing(false)
    const parsed = parsePrice(text)
    // Непустая строка, из которой не вышло числа, — это опечатка,
    // и стирать по ней существующую цену нельзя.
    if (parsed === null && text.trim() !== '') return
    if (parsed === (mark.price ?? null)) return
    void onSet(mark.id, parsed)
  }

  return (
    <input
      className="price-input"
      value={text}
      autoFocus
      inputMode="decimal"
      placeholder="₽"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}

/** Ввод задним числом: дату выбирают, а не вспоминают формат. */
function AddMark({
  itemId,
  onAdd,
}: {
  itemId: string
  onAdd: (itemId: string, date: string, price?: number | null) => Promise<void>
}) {
  const [date, setDate] = useState(today())
  const [price, setPrice] = useState('')

  function add() {
    void onAdd(itemId, date, parsePrice(price))
    setPrice('')
  }

  return (
    <section className="block">
      <h2>Отметка задним числом</h2>
      <div className="row row--wrap">
        {/* type="date" отдаёт ровно YYYY-MM-DD — тот же формат, что в модели. */}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <TodayButton value={date} onPick={setDate} />
        {/* Цена необязательна: у стрижки она есть, у мытья окон её нет. */}
        <input
          className="price-input"
          value={price}
          inputMode="decimal"
          placeholder="цена, ₽"
          onChange={(e) => setPrice(e.target.value)}
        />
        <button type="button" className="btn" onClick={add}>
          Добавить
        </button>
      </div>
    </section>
  )
}

function ItemForm({
  draft,
  archived,
  name,
  groups,
  categories,
  onSave,
  onRemove,
}: {
  draft: ItemDraft
  archived: boolean
  name: string
  groups: string[]
  categories: string[]
  onSave: (patch: Partial<ItemDraft & { archived: boolean }>) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: draft.name,
    cat: draft.cat,
    group: draft.group ?? '',
    interval: draft.intervalDays === null ? '' : String(draft.intervalDays),
  })

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    const trimmed = form.name.trim()
    if (!trimmed) return

    const parsed = Number(form.interval)
    const intervalDays =
      form.interval.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null

    // Пустая группа записывается пустой строкой, а не пропускается:
    // иначе куст нельзя было бы расформировать, только переименовать.
    void onSave({ name: trimmed, cat: form.cat.trim(), group: form.group.trim(), intervalDays })
  }

  function remove() {
    if (!window.confirm(`Удалить позицию «${name}»? Отметки останутся в данных.`)) return
    void onRemove().then(() => navigate('/'))
  }

  return (
    <section className="block">
      <h2>Позиция</h2>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Название</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>

        <CategoryField
          value={form.cat}
          options={categories}
          onChange={(cat) => setForm({ ...form, cat })}
        />

        <GroupField
          value={form.group}
          options={groups}
          onChange={(group) => setForm({ ...form, group })}
        />

        <label className="field">
          <span>Интервал, дней</span>
          <input
            value={form.interval}
            onChange={(e) => setForm({ ...form, interval: e.target.value })}
            inputMode="numeric"
            placeholder="по истории"
          />
        </label>

        <div className="form__actions">
          <button type="submit" className="btn btn--primary">
            Сохранить
          </button>
        </div>
      </form>

      <div className="row row--end">
        <button type="button" className="btn" onClick={() => void onSave({ archived: !archived })}>
          {archived ? 'Вернуть из архива' : 'В архив'}
        </button>
        <button type="button" className="btn btn--danger" onClick={remove}>
          Удалить
        </button>
      </div>
    </section>
  )
}
