import { describe, expect, it } from 'vitest'
import help from './Help.tsx?raw'
import welcome from './Welcome.tsx?raw'

/**
 * Строки исходника, где число вписано цифрой. Импорты, комментарии и имена
 * тегов не в счёт: в комментариях — номера решений, в `<h1>` — разметка,
 * а не текст для человека.
 */
function typedNumbers(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(import\b|\/\/)/.test(line))
    .filter((line) => /\d/.test(line.replace(/<\/?[A-Za-z][A-Za-z0-9]*/g, '')))
    .map((line) => line.trim())
}

describe('справка и приветствие — числа только из констант (Р-65, Р-67)', () => {
  it.each([
    ['Help.tsx', help],
    ['Welcome.tsx', welcome],
  ])('в %s ни одна цифра не вписана руками', (_name, source) => {
    expect(typedNumbers(source)).toEqual([])
  })

  it('сторож ловит вписанное число и не трогает комментарии и импорты', () => {
    const sample = [
      "import { A1 } from './x.ts'",
      '/* Р-63 */',
      '// Р-65',
      '<h1>Справка</h1>',
      '<p>через 5 секунд</p>',
      '<p>через {timeSpan(QUIET_MS)}</p>',
    ].join('\n')
    expect(typedNumbers(sample)).toEqual(['<p>через 5 секунд</p>'])
  })
})
