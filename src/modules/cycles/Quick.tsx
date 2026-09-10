import { useState } from 'react'
import type { TemplateMark, TemplateState } from './cycles.ts'
import { formatMoney, parsePrice, templateButtonText, templateLabel } from './labels.ts'

/**
 * Быстрые кнопки (Р-49): одна кнопка отмечает сегодня одну или несколько
 * позиций вместе с ценой.
 *
 * Здесь две части. Ряд кнопок стоит над циклами на «Сейчас» — ради него всё
 * и затевалось. Заводятся и правятся кнопки на экране позиции: конструктор
 * с выбором вида и полей — отдельный экран ради действия раз в полгода.
 */

/** Кнопки, у которых осталась хоть одна живая позиция. Остальным нечего отмечать. */
function usable(quick: TemplateState[]): TemplateState[] {
  return quick.filter((state) => state.marks.length > 0)
}

/** Отметки кнопки в форме заготовки — для правки её состава. */
function marksOf(state: TemplateState): TemplateMark[] {
  return state.marks.map((mark) =>
    mark.price === null ? { itemId: mark.item.id } : { itemId: mark.item.id, price: mark.price },
  )
}

export function QuickRow({
  quick,
  onPress,
}: {
  quick: TemplateState[]
  onPress: (state: TemplateState) => Promise<void>
}) {
  const shown = usable(quick)
  if (shown.length === 0) return null

  return (
    <section className="block">
      <h2>Быстрые кнопки</h2>
      <div className="quick">
        {shown.map((state) => (
          <button
            key={state.template.id}
            type="button"
            // Нажатая выглядит как отмеченная карточка — и так же снимается
            // повторным тапом: это отмена ошибочного нажатия.
            className={state.doneToday ? 'mark mark--done' : 'mark'}
            aria-pressed={state.doneToday}
            onClick={() => void onPress(state)}
          >
            {state.doneToday && '✓ '}
            {templateButtonText(state)}
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * Быстрая кнопка на экране позиции: завести, добавить позицию в уже
 * заведённую, поправить название, цену или состав.
 */
export function QuickSection({
  itemId,
  quick,
  price,
  onAdd,
  onUpdate,
  onRemove,
}: {
  itemId: string
  quick: TemplateState[]
  /** Последняя цена этой позиции — с ней она встаёт в чужую кнопку. */
  price: number | null
  onAdd: (itemId: string) => Promise<void>
  onUpdate: (id: string, patch: { label?: string; marks?: TemplateMark[] }) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const all = usable(quick)
  const has = (state: TemplateState) => state.marks.some((mark) => mark.item.id === itemId)
  const mine = all.filter(has)
  const others = all.filter((state) => !has(state))

  return (
    <section className="block">
      <h2>Быстрая кнопка</h2>

      {mine.length === 0 && (
        <p className="muted">
          Кнопка на «Сейчас» отмечает позицию в один тап вместе с ценой. В одну кнопку можно
          собрать несколько позиций — например, полную замену фильтра со всеми стадиями.
        </p>
      )}

      {mine.map((state) => (
        <TemplateCard
          key={state.template.id}
          state={state}
          itemId={itemId}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}

      <div className="row row--wrap">
        <button type="button" className="btn" onClick={() => void onAdd(itemId)}>
          {mine.length === 0 ? 'Сделать быстрой кнопкой' : 'Ещё одна кнопка'}
        </button>
        {others.map((state) => (
          <button
            key={state.template.id}
            type="button"
            className="btn"
            onClick={() =>
              void onUpdate(state.template.id, {
                marks: [...marksOf(state), price === null ? { itemId } : { itemId, price }],
              })
            }
          >
            Добавить в «{templateLabel(state)}»
          </button>
        ))}
      </div>
    </section>
  )
}

function TemplateCard({
  state,
  itemId,
  onUpdate,
  onRemove,
}: {
  state: TemplateState
  itemId: string
  onUpdate: (id: string, patch: { label?: string; marks?: TemplateMark[] }) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const id = state.template.id
  const marks = marksOf(state)
  const own = marks.find((mark) => mark.itemId === itemId)

  const [label, setLabel] = useState(state.template.label)
  const [price, setPrice] = useState(own?.price === undefined ? '' : String(own.price))

  // Составное название показывается подсказкой в пустом поле: видно, как
  // кнопка называется сейчас, и понятно, что его можно заменить своим.
  const composed = state.marks.map((mark) => mark.item.name).join(' + ')

  function commitLabel() {
    const clean = label.trim()
    if (clean !== state.template.label.trim()) void onUpdate(id, { label: clean })
  }

  function commitPrice() {
    const parsed = parsePrice(price)
    // Опечатка не стирает цену — то же правило, что у цены в истории.
    if (parsed === null && price.trim() !== '') return
    if (parsed === (own?.price ?? null)) return
    void onUpdate(id, {
      marks: marks.map((mark) =>
        mark.itemId !== itemId ? mark : parsed === null ? { itemId } : { itemId, price: parsed },
      ),
    })
  }

  function remove() {
    if (!window.confirm(`Удалить кнопку «${templateLabel(state)}»? Отметки останутся.`)) return
    void onRemove(id)
  }

  return (
    <div className="form quick__card">
      <label className="field">
        <span>Название кнопки</span>
        <input
          value={label}
          placeholder={composed}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={commitLabel}
        />
      </label>

      <p className="muted">
        Отмечает:{' '}
        {state.marks
          .map((mark) => (mark.price === null ? mark.item.name : `${mark.item.name} · ${formatMoney(mark.price)}`))
          .join(', ')}
      </p>

      <label className="field">
        <span>Цена этой позиции в кнопке</span>
        <input
          className="price-input"
          value={price}
          inputMode="decimal"
          placeholder="без цены"
          onChange={(event) => setPrice(event.target.value)}
          onBlur={commitPrice}
        />
      </label>

      <div className="form__actions">
        {marks.length > 1 && (
          <button
            type="button"
            className="btn"
            onClick={() =>
              void onUpdate(id, { marks: marks.filter((mark) => mark.itemId !== itemId) })
            }
          >
            Убрать отсюда
          </button>
        )}
        <button type="button" className="btn btn--danger" onClick={remove}>
          Удалить кнопку
        </button>
      </div>
    </div>
  )
}
