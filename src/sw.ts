/**
 * Service worker приложения.
 *
 * До Р-50 его собирал плагин целиком. Своим файлом он стал ради одного:
 * напоминаний о просроченном. Без сервера веб-пуш невозможен, и остаётся
 * периодическая фоновая синхронизация — браузер сам будит работника
 * примерно раз в сутки. Работает в Chrome на Android у установленного
 * приложения; на остальных событие просто не придёт.
 *
 * Всё прочее здесь повторяет то, что раньше было опциями `generateSW`,
 * и ломать это нельзя: автообновление было главным риском Этапа 0.
 */

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { remindOverdue, REMINDER_TAG } from './notify.ts'

/**
 * Ровно то, чем работник пользуется. Библиотека типов `webworker` целиком
 * спорит с `DOM`, на котором собрано остальное приложение, а заводить ради
 * одного файла второй tsconfig — дороже десяти строк ниже.
 */
type Extendable = Event & { waitUntil(promise: Promise<unknown>): void }

type Scope = {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
  registration: ServiceWorkerRegistration
  skipWaiting(): Promise<void>
  clients: {
    matchAll(options: {
      type: 'window'
      includeUncontrolled: boolean
    }): Promise<readonly { focus(): Promise<unknown> }[]>
    openWindow(url: string): Promise<unknown>
  }
  addEventListener(
    type: 'periodicsync',
    listener: (event: Extendable & { tag: string }) => void,
  ): void
  addEventListener(
    type: 'notificationclick',
    listener: (event: Extendable & { notification: Notification }) => void,
  ): void
}

declare const self: Scope

// autoUpdate: новый работник забирает управление сразу, не дожидаясь, пока
// закроются все вкладки. Иначе телефон неделю показывает вчерашнюю сборку.
void self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Без подмены навигации открытие без сети по прямой ссылке даёт пустую
// страницу: запрос уходит в сеть, сети нет, показать нечего. В разработке
// index.html в кеше нет, и подмена упала бы на старте работника.
if (!import.meta.env.DEV) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== REMINDER_TAG) return
  event.waitUntil(remindOverdue(self.registration))
})

// Тап по уведомлению открывает приложение — уже открытое, если оно есть,
// а не вторую копию.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(openApp())
})

async function openApp(): Promise<unknown> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = windows[0]
  if (open) return open.focus()
  return self.clients.openWindow(self.registration.scope)
}
