import { CATEGORIES } from './labels.ts'

/**
 * Категория — свободная строка, а не справочник: в модели это поле `cat`
 * типа string, отдельной сущности нет. Поэтому поле ввода с подсказками,
 * а не выпадающий список: пять известных категорий предлагаются, любая
 * своя вводится руками и дальше подставляется браузером сама.
 */
export function CategoryField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="field">
      <span>Категория</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list="cycle-categories"
        autoComplete="off"
      />
      <datalist id="cycle-categories">
        {CATEGORIES.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </label>
  )
}
