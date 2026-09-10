import { Fragment, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  groupByCategory,
  knownGroups,
  spendTree,
  totalSpent,
  type CycleState,
  type CycleUnit,
} from './cycles.ts'
import type { CycleEvent, CycleItem } from '../../core/model.ts'
import { CategoryField, GroupField } from './CategoryField.tsx'
import {
  barPercent,
  CATEGORIES,
  detailText,
  intervalText,
  MARKS_FOR_INTERVAL,
  spentText,
  statusText,
} from './labels.ts'
import { QuickRow } from './Quick.tsx'
import { Fold } from '../../ui/Fold.tsx'
import { useCycles, type ItemDraft } from './useCycles.ts'

export function CycleList() {
  const cycles = useCycles()

  if (cycles.status === 'loading') return <p className="muted">Открываю базу…</p>
  if (cycles.status === 'failed') return <p className="error">База не открылась: {cycles.error}</p>

  const archived = cycles.items.filter((item) => item.archived)

  // Срочное вынесено наверх и не разложено по категориям: просроченный
  // таймер на даче не должен теряться внизу экрана из-за того, что дача
  // идёт последней. Всё остальное категориями — иначе получается каша.
  const attention = cycles.states.filter(
    (state) => state.status === 'overdue' || state.status === 'due',
  )
  const rest = cycles.states.filter(
    (state) => state.status !== 'overdue' && state.status !== 'due',
  )
  const groups = groupByCategory(rest, CATEGORIES)
  const waiting = cycles.states.filter((state) => state.status === 'unset').length

  return (
    <>
      {cycles.error && <p className="error">Не сохранилось: {cycles.error}</p>}

      <QuickRow quick={cycles.quick} onPress={cycles.pressTemplate} />

      {/* Наверху, а не под всем списком (Р-55): до низа экрана с десятком
          категорий иначе приходится листать ради каждой новой позиции. */}
      <AddItem onAdd={cycles.addItem} groups={knownGroups(cycles.items)} />

      {cycles.states.length === 0 && (
        <p className="stub">
          Позиций пока нет. Заведи первую — стрижку, замену фильтра, что угодно повторяющееся.
        </p>
      )}

      {attention.length > 0 && (
        <Fold id="today:attention" title="Требует внимания" summary={attention.length}>
          <CardList states={attention} onMark={cycles.mark} />
        </Fold>
      )}

      {groups.map((group) => (
        <Fold
          key={group.cat}
          id={`today:cat:${group.cat}`}
          title={group.cat}
          summary={group.units.reduce((count, unit) => count + unit.states.length, 0)}
        >
          {group.units.map((unit) => (
            <Unit key={unit.group ?? unit.states[0]?.item.id} unit={unit} onMark={cycles.mark} />
          ))}
        </Fold>
      ))}

      {waiting > 0 && (
        <p className="muted">
          У {waiting} {waiting === 1 ? 'позиции' : 'позиций'} срок ещё не посчитан: для этого нужно{' '}
          {MARKS_FOR_INTERVAL} отметки. Если интервал известен заранее — открой позицию и задай его
          руками.
        </p>
      )}

      <Spending items={cycles.items} events={cycles.events} />

      {archived.length > 0 && <Archived items={archived} />}
    </>
  )
}

function CardList({
  states,
  onMark,
}: {
  states: CycleState[]
  onMark: (item: CycleItem) => Promise<void>
}) {
  return (
    <ul className="cycles">
      {states.map((state) => (
        <CycleCard key={state.item.id} state={state} onMark={onMark} />
      ))}
    </ul>
  )
}

/**
 * Куст внутри категории. Одиночная позиция рисуется как раньше, без
 * лишней обёртки: заголовок над одной карточкой — шум, а не структура.
 */
function Unit({
  unit,
  onMark,
}: {
  unit: CycleUnit
  onMark: (item: CycleItem) => Promise<void>
}) {
  if (unit.group === null) return <CardList states={unit.states} onMark={onMark} />

  return (
    <div className="unit">
      <h3 className="unit__name">{unit.group}</h3>
      <CardList states={unit.states} onMark={onMark} />
    </div>
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

/**
 * Траты: категория → куст → позиция (Р-36).
 *
 * Свёрнут по умолчанию — это не то, ради чего экран открывают каждый день.
 * Суммы никогда не показываются в одиночку: рядом всегда число отметок,
 * из которых сумма сложена, и общее их число. Без этого «6 118 ₽»
 * читается как «столько потрачено», хотя цена стоит у четырёх отметок
 * из тридцати трёх.
 */
function Spending({ items, events }: { items: CycleItem[]; events: CycleEvent[] }) {
  const tree = useMemo(() => spendTree(items, events, CATEGORIES), [items, events])

  // Ни одной цены — блок молчит целиком. Пустая таблица с нулями
  // не сообщает ничего, кроме того, что поле цены ещё не заполняли.
  if (tree.length === 0) return null

  const total = totalSpent(tree)

  // Отдельным блоком с заголовком, как остальные, а не строкой-ссылкой
  // среди карточек (Р-55). Итог стоит в заголовке и у свёрнутого.
  return (
    <Fold id="today:spending" title="Траты" summary={spentText(total)} folded>
      <div className="panel">
        <table className="stats spending">
          <tbody>
            {tree.map((cat) => (
              <Fragment key={cat.cat}>
                <tr className="spending__cat">
                  <td>{cat.cat}</td>
                  <td className="num">{spentText(cat.spent)}</td>
                </tr>
                {cat.units.map((unit) => (
                  <Fragment key={unit.group ?? unit.items[0]?.item.id}>
                    {unit.group !== null && (
                      <tr className="spending__group">
                        <td>{unit.group}</td>
                        <td className="num muted">{spentText(unit.spent)}</td>
                      </tr>
                    )}
                    {unit.items.map((each) => (
                      <tr key={each.item.id} className="spending__item">
                        <td>
                          <Link to={`/cycle/${each.item.id}`}>{each.item.name}</Link>
                        </td>
                        <td className="num muted">{spentText(each.spent)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Fold>
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

function AddItem({
  onAdd,
  groups,
}: {
  onAdd: (draft: ItemDraft) => Promise<CycleItem | null>
  groups: string[]
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [cat, setCat] = useState<string>(CATEGORIES[0])
  const [group, setGroup] = useState('')
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

    const inGroup = group.trim()
    void onAdd({ name: trimmed, cat: cat.trim(), intervalDays, ...(inGroup ? { group: inGroup } : {}) })
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

      <GroupField value={group} options={groups} onChange={setGroup} />

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
