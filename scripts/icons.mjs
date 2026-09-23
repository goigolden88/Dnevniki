/**
 * Иконки PWA «Дневников» из геометрии public/favicon.svg.
 *
 * Растеризатор и PNG — ядра (`src/shared/scripts/icons.mjs`, Р-81); своё
 * здесь — фигуры и цвет. Запускается руками (`npm run icons`), результат
 * коммитится. Почему свой растеризатор, а не @vite-pwa/assets-generator, —
 * Р-20.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INK, writeIcons } from '../src/shared/scripts/icons.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/** Акцент — синий корешок, как в favicon.svg. */
const ACCENT = [0x6f, 0x9d, 0xff]

/** Те же фигуры, что в favicon.svg. Расходиться им нельзя. */
const SHAPES = [
  // Корешок тетради
  { x: 118, y: 118, w: 16, h: 276, r: 8, color: ACCENT, alpha: 1 },
  // Строки записей
  { x: 166, y: 150, w: 228, h: 18, r: 9, color: INK, alpha: 1 },
  { x: 166, y: 212, w: 164, h: 18, r: 9, color: INK, alpha: 0.72 },
  { x: 166, y: 274, w: 196, h: 18, r: 9, color: INK, alpha: 0.52 },
  { x: 166, y: 336, w: 120, h: 18, r: 9, color: INK, alpha: 0.32 },
]

writeIcons({ out: OUT, shapes: SHAPES })
