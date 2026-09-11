import { useState, type FormEvent } from 'react'
import { plural } from '../../core/dates.ts'
import type { CycleCategory } from '../../core/model.ts'
import { RenameField } from '../../ui/RenameField.tsx'
import { categoryGroups, sameName } from './cycles.ts'
import { useCycles, type Cycles } from './useCycles.ts'

/**
 * Категории циклов в «Настройках» (Р-59): переименовать, переставить,
 * убрать, завести.
 *
 * Здесь, а не на «Сейчас»: это делают раз в полгода, и место ему там же,
 * где быстрым кнопкам (Р-56). Заголовки блоков на «Сейчас» и так заняты
 * тапом — сворачиванием (Р-55).
 */
export function CategorySettings() {
  const cycles = useCycles()
  if (cycles.status !== 'ready') return null

  const { categories } = cycles
  const count = (category: CycleCategory) =>
    cycles.items.filter((item) => sameName(item.cat, category.name)).length

  return (
    <>
      <p className="muted">
        Категории позиций циклов. Порядок — тот же, что на «Сейчас», в тратах и в выгрузке.
        Незнакомая категория, вписанная у позиции, заводится сама.
      </p>

      {categories.length === 0 && <p className="muted">Категорий пока нет.</p>}

      <ul className="plain">
        {categories.map((category, index) => (
          // Ключ с названием: переименование, приехавшее с другого
          // устройства, должно сбросить поле, а не держать старый текст.
          <CategoryRow
            key={`${category.id}:${category.name}`}
            category={category}
            count={count(category)}
            first={index === 0}
            last={index === categories.length - 1}
            others={categories.filter((other) => other.id !== category.id)}
            cycles={cycles}
          />
        ))}
      </ul>

      <AddCategory onAdd={cycles.addCategory} />
    </>
  )
}

function CategoryRow({
  category,
  count,
  first,
  last,
  others,
  cycles,
}: {
  category: CycleCategory
  count: number
  first: boolean
  last: boolean
  others: CycleCategory[]
  cycles: Cycles
}) {
  const [name, setName] = useState(category.name)
  const [moving, setMoving] = useState(false)
  const [target, setTarget] = useState(others[0]?.id ?? '')
  const positions = `${count} ${plural(count, ['позиция', 'позиции', 'позиций'])}`
  const groups = categoryGroups(cycles.items, category.name)

  function commit() {
    const clean = name.trim()
    if (!clean || clean === category.name) {
      setName(category.name)
      return
    }
    // Занятое название — это слияние, и оно не отменяется одним тапом:
    // спросить до, а не извиняться после.
    const other = others.find((each) => sameName(each.name, clean))
    if (other && !window.confirm(`Слить «${category.name}» с «${other.name}»? ${positions} переедут.`)) {
      setName(category.name)
      return
    }
    void cycles.renameCategory(category.id, clean)
  }

  function remove() {
    if (count > 0) {
      setMoving(true)
      return
    }
    if (!window.confirm(`Удалить категорию «${category.name}»?`)) return
    void cycles.removeCategory(category.id, null)
  }

  return (
    <li className="form quick__card category">
      <div className="row row--wrap">
        <input
          value={name}
          aria-label={`Название категории «${category.name}»`}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <span className="muted">{positions}</span>
      </div>

      <div className="row row--wrap">
        <button
          type="button"
          className="btn"
          disabled={first}
          aria-label={`«${category.name}» выше`}
          onClick={() => void cycles.moveCategory(category.id, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn"
          disabled={last}
          aria-label={`«${category.name}» ниже`}
          onClick={() => void cycles.moveCategory(category.id, 1)}
        >
          ↓
        </button>
        <button type="button" className="btn btn--danger" onClick={remove}>
          Удалить
        </button>
      </div>

      {/* Группы — строки у позиций (Р-30): переименование правит все
          позиции группы разом, в название соседней — сливает. */}
      {groups.length > 0 && (
        <div className="field">
          <span>Группы</span>
          {groups.map((group) => (
            <div className="row row--wrap" key={group.name}>
              <RenameField
                value={group.name}
                label={`Название группы «${group.name}»`}
                onCommit={(next) => {
                  const other = groups.find((each) => each.name !== group.name && sameName(each.name, next))
                  if (other && !window.confirm(`Слить группу «${group.name}» с «${other.name}»?`)) return false
                  void cycles.renameGroup(category.name, group.name, next)
                  return true
                }}
              />
              <span className="muted">
                {group.count} {plural(group.count, ['позиция', 'позиции', 'позиций'])}
              </span>
            </div>
          ))}
        </div>
      )}

      {moving &&
        (others.length === 0 ? (
          <p className="muted">
            Позиции некуда перенести: заведи другую категорию, тогда эту можно будет удалить.
          </p>
        ) : (
          <div className="row row--wrap">
            <label className="field">
              <span>Позиции перенести в</span>
              <select value={target} onChange={(event) => setTarget(event.target.value)}>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn--danger"
              disabled={!target}
              onClick={() => void cycles.removeCategory(category.id, target)}
            >
              Перенести и удалить
            </button>
            <button type="button" className="btn" onClick={() => setMoving(false)}>
              Отмена
            </button>
          </div>
        ))}
    </li>
  )
}

function AddCategory({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const clean = name.trim()
    if (!clean) return
    void onAdd(clean)
    setName('')
  }

  return (
    <form className="row row--wrap" onSubmit={submit}>
      <input
        value={name}
        placeholder="Новая категория"
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className="btn">
        Добавить
      </button>
    </form>
  )
}
