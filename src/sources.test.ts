import { describe, expect, it } from 'vitest'

/**
 * Сторож исходников: в них нет байта NUL.
 *
 * С ним grep, ripgrep и поиск агентов считают файл двоичным и молча
 * пропускают — поиск по коду не видит файла. Нужен такой символ в строке —
 * пишется escape `\x00`. `src/shared` — ядро, отсюда не правится и не сторожится.
 */

const ROOTS = ['src', 'scripts']
const SKIP = ['src/shared']
const SOURCE = /\.(ts|tsx|js|mjs|css)$/

type Entry = { name: string; parentPath: string; isFile: () => boolean }

describe('исходники', () => {
  it('без байта NUL', async () => {
    // Типов Node в проекте нет: тесты пишутся для кода браузера.
    const fsModule = 'node:fs'
    const { readdirSync, readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
      readdirSync: (path: string, options: { recursive: true; withFileTypes: true }) => Entry[]
      readFileSync: (path: string) => Uint8Array
    }

    const files = ROOTS.flatMap((root) => readdirSync(root, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile() && SOURCE.test(entry.name))
      .map((entry) => `${entry.parentPath.replaceAll('\\', '/')}/${entry.name}`)
      .filter((path) => !SKIP.some((skip) => path === skip || path.startsWith(`${skip}/`)))

    expect(files).toContain('src/modules/cycles/cycles.ts')
    expect(files.filter((path) => readFileSync(path).includes(0))).toEqual([])
  })
})
