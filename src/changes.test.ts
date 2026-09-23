import { describe, expect, it } from 'vitest'
import { isDateStr } from './shared/core/dates.ts'
import { CHANGES } from './changes.ts'

// Что показать после обновления — механика ядра, её тесты там (Я-06 «FamilyCore»).

describe('список изменений — Р-71', () => {
  it('id с единицы и растут на один — по ним устройство помнит прочитанное', () => {
    CHANGES.forEach((change, index) => expect(change.id).toBe(index + 1))
  })

  it('даты читаются и не убывают', () => {
    CHANGES.forEach((change, index) => {
      expect(isDateStr(change.date)).toBe(true)
      const previous = CHANGES[index - 1]
      if (previous) expect(change.date >= previous.date).toBe(true)
    })
  })

  it('в каждой записи есть строки, пустых нет', () => {
    for (const change of CHANGES) {
      expect(change.lines.length).toBeGreaterThan(0)
      for (const line of change.lines) expect(line.trim()).not.toBe('')
    }
  })
})
