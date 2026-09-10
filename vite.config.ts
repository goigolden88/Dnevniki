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
      // Service worker свой, а не собранный плагином (Р-50): в нём живут
      // напоминания о просроченном, а в сгенерированный код их не положить.
      // Имя на выходе прежнее — sw.js, иначе установленные копии остались бы
      // со старым работником навсегда.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',

      // autoUpdate, а не prompt: новый service worker забирает управление
      // немедленно и перезагружает страницу. Иначе выходит классическая
      // боль PWA — выкатил сборку, а телефон неделю показывает вчерашнюю
      // и ни на что не реагирует. Со своим работником половина этого —
      // skipWaiting и clientsClaim — написана в src/sw.ts руками.
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

      // Что уходит в кеш для работы без сети. Подмена навигации на
      // index.html, чистка старых кешей и немедленный захват управления —
      // в src/sw.ts: при generateSW это были опции здесь же.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },

      // Чтобы офлайн проверялся локально, а не только после деплоя.
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
  ],
})
