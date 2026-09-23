/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import { familyVite } from './src/shared/scripts/vite.ts'

// GitHub Pages отдаёт сайт проекта не с корня домена, а по /<имя репозитория>/.
// Репозиторий называется Dnevniki → https://goigolden88.github.io/Dnevniki/
//
// Если base не выставить, сборка пройдёт зелёной, а страница откроется белой:
// все скрипты уйдут в 404. Симптом выглядит как сломанная сборка, причина — здесь.
// Переименуете репозиторий — правьте эту строку, остальное подтянется. См. Р-17.
const BASE = '/Dnevniki/'

// Сборка, работник и манифест — фабрикой ядра (Р-81); своё здесь — адрес,
// имя и описание. Работник — свой `src/sw.ts` поверх `startWorker` ядра,
// имя на выходе прежнее — sw.js (Р-50).
export default defineConfig({
  ...familyVite({
    base: BASE,
    name: 'Дневники',
    description: 'Циклы, здоровье и контент. Работает без сети.',
  }),

  // Тесты ядра гоняет CI ядра; здесь — только свои (Р-82).
  test: {
    exclude: [...configDefaults.exclude, 'src/shared/**'],
  },
})
