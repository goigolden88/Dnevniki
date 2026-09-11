import { useState } from 'react'
import type { TemplateMark, TemplateState } from './cycles.ts'
import { formatMoney, parsePrice, templateButtonText, templateLabel } from './labels.ts'
import { useCycles } from './useCycles.ts'
import { Fold } from '../../ui/Fold.tsx'

/**
 * Быстрые кнопки (Р-49): одна кнопка отмечает сегодня одну или несколько
 * позиций вместе с ценой.
 *
 * Три места. Ряд кнопок стоит над циклами на «Сейчас» — ради него всё
 * и затевалось. Заводится кнопка с экрана позиции: конструктор с выбором
 * вида и полей — отдельный экран ради действия раз в полгода. Все кнопки
 * разом видны в «Настройках» (Р-56).
 */

type Update = (id: string, patch: { label?: string; marks?: TemplateMark[] }) => Promise<void>

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
    <Fold id="today:quick" title="Быстрые кнопки" summary={shown.length}>
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
    </Fold>
  )
}

/**
 * Быстрая кнопка на экране позиции: завести, добавить позицию в уже
 * заведённую, поправить название, цены или состав.
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
  onUpdate: Update
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
        <TemplateCard key={state.template.id} state={state} onUpdate={onUpdate} onRemove={onRemove} />
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

/**
 * Все кнопки разом — в «Настройках» (Р-56).
 *
 * Здесь видны и кнопки, у которых не осталось ни одной позиции: на
 * «Сейчас» и на экранах позиций их нет, и без этого места удалить их
 * было бы негде.
 */
export function QuickSettings() {
  const cycles = useCycles()
  if (cycles.status !== 'ready') return null

  return (
    <Fold id="settings:quick" title="Быстрые кнопки" summary={cycles.quick.length} folded>
      <p className="muted">
        Кнопка на «Сейчас» отмечает сразу все свои позиции, вместе с ценой. Новая заводится
        с экрана позиции — «Сделать быстрой кнопкой»; там же позиция добавляется в уже
        заведённую.
      </p>
      {cycles.quick.length === 0 && <p className="muted">Кнопок пока нет.</p>}
      {cycles.quick.map((state) => (
        <TemplateCard
          key={state.template.id}
          state={state}
          onUpdate={cycles.updateTemplate}
          onRemove={cycles.removeTemplate}
        />
      ))}
    </Fold>
  )
}

/** Одна кнопка целиком: название, позиции с ценами, удаление. */
function TemplateCard({
  state,
  onUpdate,
  onRemove,
}: {
  state: TemplateState
  onUpdate: Update
  onRemove: (id: string) => Promise<void>
}) {
  const id = state.template.id
  const marks = marksOf(state)
  const [label, setLabel] = useState(state.template.label)

  // Составное название показывается подсказкой в пустом поле: видно, как
  // кнопка называется сейчас, и понятно, что его можно заменить своим.
  const composed = state.marks.map((mark) => mark.item.name).join(' + ')

  function commitLabel() {
    const clean = label.trim()
    if (clean !== state.template.label.trim()) void onUpdate(id, { label: clean })
  }

  function setPrice(itemId: string, price: number | null) {
    void onUpdate(id, {
      marks: marks.map((mark) =>
        mark.itemId !== itemId ? mark : price === null ? { itemId } : { itemId, price },
      ),
    })
  }

  function remove() {
    const name = templateLabel(state) || 'без позиций'
    if (!window.confirm(`Удалить кнопку «${name}»? Отметки останутся.`)) return
    void onRemove(id)
  }

  return (
    <div className="form quick__card">
      <label className="field">
        <span>Название кнопки</span>
        <input
          value={label}
          placeholder={composed || 'без названия'}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={commitLabel}
        />
      </label>

      {state.marks.length === 0 ? (
        <p className="muted">Позиций в кнопке не осталось — все удалены. Её можно удалить.</p>
      ) : (
        <ul className="plain">
          {state.marks.map((mark) => (
            <li key={mark.item.id} className="row row--wrap">
              <span className="quick__item">{mark.item.name}</span>
              {/* Ключ с ценой: после сохранения поле берёт новое значение,
                  а не держит набранный текст. */}
              <MarkPrice
                key={`${mark.item.id}:${mark.price ?? ''}`}
                price={mark.price}
                onCommit={(price) => setPrice(mark.item.id, price)}
              />
              {state.marks.length > 1 && (
                <button
                  type="button"
                  className="link-btn"
                  aria-label={`Убрать «${mark.item.name}» из кнопки`}
                  onClick={() =>
                    void onUpdate(id, { marks: marks.filter((each) => each.itemId !== mark.item.id) })
                  }
                >
                  убрать
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="form__actions">
        <button type="button" className="btn btn--danger" onClick={remove}>
          Удалить кнопку
        </button>
      </div>
    </div>
  )
}

/** Цена позиции в кнопке. Опечатка не стирает цену — как у цены в истории. */
function MarkPrice({
  price,
  onCommit,
}: {
  price: number | null
  onCommit: (price: number | null) => void
}) {
  const [text, setText] = useState(price === null ? '' : String(price))

  function commit() {
    const parsed = parsePrice(text)
    if (parsed === null && text.trim() !== '') return
    if (parsed === price) return
    onCommit(parsed)
  }

  return (
    <input
      className="price-input"
      value={text}
      inputMode="decimal"
      placeholder="без цены"
      aria-label={price === null ? 'Цена не задана' : `Цена ${formatMoney(price)}`}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
    />
  )
}
