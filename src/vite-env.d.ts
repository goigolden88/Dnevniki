/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Время сборки, подставляется в vite.config.ts.
 *
 * Нужно, чтобы проверить обновление service worker на телефоне: открыл
 * настройки, посмотрел дату сборки — видно, приехала новая версия или нет.
 * Иначе для проверки приходится каждый раз менять видимый текст.
 */
declare const __BUILD_TIME__: string
