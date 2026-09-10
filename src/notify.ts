/**
 * Напоминания (Р-50, Р-54): о просроченном в циклах и о незакрытой болезни.
 *
 * Одна функция на два вызова: service worker зовёт её, когда браузер будит
 * его фоновой синхронизацией, а «Настройки» — по кнопке «Проверить сейчас».
 * Считают они одинаково, и разойтись это не должно.
 *
 * Живёт на уровне приложения, рядом с `app.tsx`, а не в `core`: она знает
 * модули циклов и здоровья, а ядру это запрещено.
 *
 * Без сервера веб-пуш невозможен — пуш по определению присылает сервер.
 * Отсюда и ограничения: только Chrome на Android, только установленное
 * приложение, частоту решает браузер (примерно раз в сутки, без гарантий).
 */

import { db } from './core/db.ts'
import { today } from './core/dates.ts'
import { cycleStates } from './modules/cycles/cycles.ts'
import { overdueNotice } from './modules/cycles/labels.ts'
import { openEpisodes } from './modules/health/health.ts'
import { illnessNotice } from './modules/health/labels.ts'

/**
 * Имя фоновой проверки. Им же она выключается. Осталось от времени, когда
 * напоминание было одно: на установленных копиях проверка заведена под этим
 * именем, и переименование выключило бы её молча.
 */
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

type Notice = {
  title: string
  body: string
  /** Уведомление одной темы заменяет прежнее, а не копится стопкой. */
  tag: string
  /** Куда ведёт тап — путь хеш-роутинга. */
  target: string
}

/**
 * Показывает напоминания — не чаще раза в день.
 *
 * Два уведомления, а не одно: у просроченного и у болезни разные действия,
 * и тап по каждому ведёт к своему.
 *
 * `force` — проверка руками: показывает всегда, даже когда напоминать
 * не о чем, иначе не понять, дошло уведомление или сломалось. И день не
 * отмечает: проверка не должна отменять настоящее напоминание.
 */
export async function remind(
  registration: ServiceWorkerRegistration,
  options: { force?: boolean } = {},
): Promise<RemindResult> {
  const day = today()
  const force = options.force === true
  if (!force && (await db.settings.get<string>(LAST_DAY)) === day) return 'already'

  const [items, events, episodes] = await Promise.all([
    db.getAll('items'),
    db.getAll('cycleEvents'),
    db.getAll('episodes'),
  ])

  const notices: Notice[] = []
  const overdue = overdueNotice(cycleStates(items, events, day))
  if (overdue) notices.push({ ...overdue, tag: 'overdue', target: '/' })
  const illness = illnessNotice(openEpisodes(episodes, day))
  if (illness) notices.push({ ...illness, tag: 'illness' })

  if (notices.length === 0) {
    if (force) {
      await show(registration, {
        title: 'Напоминать не о чем',
        body: 'Просроченного нет, незакрытых болезней нет.',
        tag: 'overdue',
        target: '/',
      })
    }
    return 'nothing'
  }

  for (const notice of notices) await show(registration, notice)
  if (!force) await db.settings.set(LAST_DAY, day)
  return 'shown'
}

function show(registration: ServiceWorkerRegistration, notice: Notice): Promise<void> {
  return registration.showNotification(notice.title, {
    body: notice.body,
    tag: notice.tag,
    icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
    lang: 'ru',
    // Адрес целиком: тап обрабатывает service worker, а у него нет роутера.
    data: { url: `${registration.scope}#${notice.target}` },
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
  return remind(reg, { force: true })
}
