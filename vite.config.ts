import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages отдаёт сайт проекта не с корня домена, а по /<имя репозитория>/.
// Репозиторий называется Dnevniki → https://goigolden88.github.io/Dnevniki/
//
// Если base не выставить, сборка пройдёт зелёной, а страница откроется белой:
// все скрипты уйдут в 404. Симптом выглядит как сломанная сборка, причина — здесь.
// Переименуете репозиторий — правьте эту строку, остальное подтянется. См. Р-17.
const BASE = '/Dnevniki/'

const THEME = '#1b1c1e'

export default defineConfig({
  base: BASE,

  define: {
    // Видно в настройках. Нужно, чтобы проверять обновление на телефоне,
    // не меняя каждый раз видимый текст ради теста.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },

  plugins: [
    react(),

    VitePWA({
      // autoUpdate, а не prompt: новый service worker забирает управление
      // немедленно и перезагружает страницу. Иначе выходит классическая
      // боль PWA — выкатил сборку, а телефон неделю показывает вчерашнюю
      // и ни на что не реагирует.
      registerType: 'autoUpdate',

      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],

      manifest: {
        id: BASE,
        name: 'Дневники',
        short_name: 'Дневники',
        description: 'Циклы, здоровье и контент. Работает без сети.',
        lang: 'ru',
        // Пути с base. При base '/' манифест соберётся, но иконка
        // на телефон не встанет — установка просто не предложится.
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: THEME,
        theme_color: THEME,
        icons: [
          { src: `${BASE}pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${BASE}maskable-icon-512x512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Без этого офлайн-открытие по прямой ссылке даёт пустую страницу:
        // запрос уходит в сеть, сети нет, показать нечего.
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },

      // Чтобы офлайн проверялся локально, а не только после деплоя.
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
  ],
})
