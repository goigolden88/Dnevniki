import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages отдаёт сайт проекта не с корня домена, а по /<имя репозитория>/.
// Репозиторий называется Dnevniki → https://goigolden88.github.io/Dnevniki/
//
// Если base не выставить, сборка пройдёт зелёной, а страница откроется белой:
// все скрипты уйдут в 404. Симптом выглядит как сломанная сборка, причина — здесь.
// Переименуете репозиторий — правьте эту строку и пути в манифесте PWA. См. Р-17.
const BASE = '/Dnevniki/'

export default defineConfig({
  base: BASE,
  plugins: [react()],
})
