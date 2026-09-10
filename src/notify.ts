/**
 * Напоминание о просроченном (Р-50).
 *
 * Одна функция на два вызова: service worker зовёт её, когда браузер будит
 * его фоновой синхронизацией, а «Настройки» — по кнопке «Проверить сейчас».
 * Считают они одинаково, и разойтись это не должно.
 *
 * Живёт на уровне приложения, рядом с `app.tsx`, а не в `core`: она знает
 * модуль циклов, а ядру это запрещено.
 *
 * Без сервера веб-пуш невозможен — пуш по определению присылает сервер.
 * Отсюда и ограничения: только Chrome на Android, только установленное
 * приложение, частоту решает браузер (примерно раз в сутки, без гарантий).
 */

import { db } from './core/db.ts'
import { today } from './core/dates.ts'
import { cycleStates } from './modules/cycles/cycles.ts'
import { overdueNotice } from './modules/cycles/labels.ts'

/** Имя фоновой проверки. Им же она выключается. */
export const REMINDER_TAG = 'overdue'

/**
 * В какой день напоминание уже приходило. Лежит в `settings`: у каждого
 * устройства своё — напоминание на телефоне не отменяет напоминания на
 * компьютере.
 */
const LAST_DAY = 'reminderLastDay'

/** Чаще раза в полсуток браузер будить не станет, и просить незачем. */
const MIN_INTERVAL = 12 * 60 * 60 * 1000

export type RemindResult = 'shown' | 'nothing' | 'already'

/**
 * Показывает уведомление о просроченном — не чаще раза в день.
 *
 * `force` — проверка руками: показывает всегда, даже когда просроченного
 * нет, иначе не понять, дошло уведомление или сломалось. И день не
 * отмечает: проверка не должна отменять настоящее напоминание.
 */
export async function remindOverdue(
  registration: ServiceWorkerRegistration,
  options: { force?: boolean } = {},
): Promise<RemindResult> {
  const day = today()
  const force = options.force === true
  if (!force && (await db.settings.get<string>(LAST_DAY)) === day) return 'already'

  const [items, events] = await Promise.all([db.getAll('items'), db.getAll('cycleEvents')])
  const notice = overdueNotice(cycleStates(items, events, day))

  if (notice === null) {
    if (force) await show(registration, 'Просроченного нет', 'Напоминать сегодня не о чем.')
    return 'nothing'
  }

  await show(registration, notice.title, notice.body)
  if (!force) await db.settings.set(LAST_DAY, day)
  return 'shown'
}

function show(registration: ServiceWorkerRegistration, title: string, body: string): Promise<void> {
  return registration.showNotification(title, {
    body,
    // Одно уведомление на тему: новое заменяет старое, а не копится стопкой.
    tag: REMINDER_TAG,
    icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
    lang: 'ru',
  })
}

// ─── Для экрана настроек ───────────────────────────────────────────────────

/**
 * Где мы: браузер не умеет, человек запретил, выключено, включено.
 * `not-installed` — уведомления разрешены, но фоновую проверку браузер не
 * дал: так бывает у приложения, открытого во вкладке, а не установленного.
 */
export type ReminderStatus = 'unsupported' | 'denied' | 'off' | 'not-installed' | 'on'

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

function notifications(): boolean {
  return typeof Notification !== 'undefined'
}

export async function reminderStatus(): Promise<ReminderStatus> {
  const reg = await registration()
  if (!reg?.periodicSync || !notifications()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  const tags = await reg.periodicSync.getTags()
  return tags.includes(REMINDER_TAG) ? 'on' : 'off'
}

/** Разрешение браузер спрашивает только по действию человека — отсюда кнопка. */
export async function enableReminders(): Promise<ReminderStatus> {
  const reg = await registration()
  if (!reg?.periodicSync || !notifications()) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'off'

  try {
    await reg.periodicSync.register(REMINDER_TAG, { minInterval: MIN_INTERVAL })
  } catch {
    return 'not-installed'
  }
  return 'on'
}

export async function disableReminders(): Promise<void> {
  const reg = await registration()
  await reg?.periodicSync?.unregister(REMINDER_TAG)
}

/** «Проверить сейчас»: не ждать сутки, чтобы узнать, работает ли. */
export async function checkReminder(): Promise<RemindResult | 'denied' | 'unsupported'> {
  const reg = await registration()
  if (!reg || !notifications()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  return remindOverdue(reg, { force: true })
}
