import { CATEGORIES } from './labels.ts'

/**
 * Поле ввода с подсказками.
 *
 * И категория, и группа — свободные строки, а не справочники: в модели это
 * поля `cat` и `group` типа string, отдельных сущностей нет. Поэтому ввод
 * с подсказками, а не выпадающий список: известное предлагается, любое
 * своё вводится руками и дальше подставляется браузером само.
 */
export function SuggestField({
  label,
  listId,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string
  listId: string
  value: string
  options: readonly string[]
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={listId}
        autoComplete="off"
        {...(placeholder === undefined ? {} : { placeholder })}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  )
}

export function CategoryField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <SuggestField
      label="Категория"
      listId="cycle-categories"
      value={value}
      options={CATEGORIES}
      onChange={onChange}
    />
  )
}

/**
 * Куст внутри категории: «Барьер Эксперт», «Зарядки».
 * Пустое поле — обычная одиночная позиция, и это нормальный случай.
 */
export function GroupField({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  return (
    <SuggestField
      label="Группа"
      listId="cycle-groups"
      value={value}
      options={options}
      placeholder="необязательно"
      onChange={onChange}
    />
  )
}
