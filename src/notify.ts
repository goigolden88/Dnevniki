/**
 * Напоминания (Р-50, Р-54, Р-57): о просроченном в циклах и о незакрытой
 * болезни.
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
 * приложение, частоту и время решает браузер (примерно раз в сутки, без
 * гарантий). Выбрать время нельзя, но можно не шуметь ночью (Р-57).
 */

import { db } from './core/db.ts'
import { toDateStr } from './core/dates.ts'
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

// Ключи в `settings`: у каждого устройства свои — напоминание на телефоне
// не отменяет напоминания на компьютере.

/**
 * В какой день уже приходило напоминание со звуком. Имя прежнее, с тех пор
 * как тихих не было: на установленных копиях день уже записан под ним.
 */
const LOUD_DAY = 'reminderLastDay'
/** В какой день уже приходило тихое, вне окна. Второй раз за ночь незачем. */
const QUIET_DAY = 'reminderQuietDay'
/** Часы со звуком. */
const WINDOW = 'reminderWindow'
/** Последние фоновые пробуждения. */
const LOG = 'reminderLog'

/** Чаще раза в полсуток браузер будить не станет, и просить незачем. */
const MIN_INTERVAL = 12 * 60 * 60 * 1000

export type RemindResult = 'shown' | 'quiet' | 'nothing' | 'already' | 'failed'

type Notice = {
  title: string
  body: string
  /** Уведомление одной темы заменяет прежнее, а не копится стопкой. */
  tag: string
  /** Куда ведёт тап — путь хеш-роутинга. */
  target: string
}

// ─── Тихие часы (Р-57) ─────────────────────────────────────────────────────

/** Часы со звуком: с `from` включительно до `to` исключительно, 0..23. */
export type ReminderWindow = { from: number; to: number }

export const DEFAULT_WINDOW: ReminderWindow = { from: 12, to: 20 }

function isHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23
}

/** Окно из настроек. Кривое или отсутствующее — умолчание, а не падение. */
export function parseWindow(value: unknown): ReminderWindow {
  if (typeof value !== 'object' || value === null) return DEFAULT_WINDOW
  const { from, to } = value as { from?: unknown; to?: unknown }
  return isHour(from) && isHour(to) ? { from, to } : DEFAULT_WINDOW
}

/**
 * Попадает ли час в окно. Окно через полночь — «с 22 до 8» — допустимо:
 * кто-то работает ночью. Равные концы — круглые сутки.
 */
export function inWindow(hour: number, window: ReminderWindow): boolean {
  if (window.from === window.to) return true
  if (window.from < window.to) return hour >= window.from && hour < window.to
  return hour >= window.from || hour < window.to
}

/**
 * Что делать, когда браузер разбудил проверку.
 *
 * Вне окна — без звука, а не никогда: браузер может будить проверку раз
 * в сутки и как раз ночью, и пропуск означал бы, что напоминание не приходит
 * вовсе. Тихое не закрывает день: если браузер разбудит проверку ещё раз
 * уже в окне, то же уведомление повторится со звуком.
 */
export function planWake(state: {
  day: string
  hour: number
  window: ReminderWindow
  /** День последнего напоминания со звуком. */
  loudDay: string | null
  /** День последнего тихого. */
  quietDay: string | null
}): 'loud' | 'quiet' | 'already' {
  if (state.loudDay === state.day) return 'already'
  if (inWindow(state.hour, state.window)) return 'loud'
  return state.quietDay === state.day ? 'already' : 'quiet'
}

// ─── Журнал пробуждений (Р-57) ─────────────────────────────────────────────

/** Одно пробуждение фоновой проверки: когда и чем кончилось. */
export type Wake = { at: string; result: RemindResult }

/** Сколько пробуждений помнить. Раз в сутки — это три недели. */
export const LOG_SIZE = 20

const RESULTS: readonly RemindResult[] = ['shown', 'quiet', 'nothing', 'already', 'failed']

function isWake(value: unknown): value is Wake {
  if (typeof value !== 'object' || value === null) return false
  const { at, result } = value as { at?: unknown; result?: unknown }
  return typeof at === 'string' && RESULTS.includes(result as RemindResult)
}

/** Новое пробуждение — первым, старые обрезаются. Мусор в настройках отбрасывается. */
export function appendWake(stored: unknown, wake: Wake, size: number = LOG_SIZE): Wake[] {
  const previous = Array.isArray(stored) ? stored.filter(isWake) : []
  return [wake, ...previous].slice(0, size)
}

// ─── Показ ─────────────────────────────────────────────────────────────────

/**
 * Показывает напоминания — со звуком не чаще раза в день.
 *
 * Два уведомления, а не одно: у просроченного и у болезни разные действия,
 * и тап по каждому ведёт к своему.
 *
 * `force` — проверка руками: показывает всегда и со звуком, даже когда
 * напоминать не о чем, иначе не понять, дошло уведомление или сломалось.
 * День не отмечает и в журнал не пишется: проверка не должна отменять
 * настоящее напоминание, а журнал заведён ради фоновых пробуждений.
 */
export async function remind(
  registration: ServiceWorkerRegistration,
  options: { force?: boolean; now?: Date } = {},
): Promise<RemindResult> {
  const force = options.force === true
  const now = options.now ?? new Date()
  const result = await decide(registration, force, now)
  if (!force) await record({ at: now.toISOString(), result })
  return result
}

async function decide(
  registration: ServiceWorkerRegistration,
  force: boolean,
  now: Date,
): Promise<RemindResult> {
  const day = toDateStr(now)
  let loud = true

  if (!force) {
    const [loudDay, quietDay, window] = await Promise.all([
      db.settings.get<string>(LOUD_DAY),
      db.settings.get<string>(QUIET_DAY),
      db.settings.get<unknown>(WINDOW),
    ])
    const plan = planWake({
      day,
      hour: now.getHours(),
      window: parseWindow(window),
      loudDay: loudDay ?? null,
      quietDay: quietDay ?? null,
    })
    if (plan === 'already') return 'already'
    loud = plan === 'loud'
  }

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

  try {
    if (notices.length === 0) {
      if (force) {
        await show(
          registration,
          {
            title: 'Напоминать не о чем',
            body: 'Просроченного нет, незакрытых болезней нет.',
            tag: 'overdue',
            target: '/',
          },
          true,
        )
      }
      return 'nothing'
    }

    for (const notice of notices) await show(registration, notice, loud)
  } catch {
    return 'failed'
  }

  if (!force) await db.settings.set(loud ? LOUD_DAY : QUIET_DAY, day)
  return loud ? 'shown' : 'quiet'
}

function show(registration: ServiceWorkerRegistration, notice: Notice, loud: boolean): Promise<void> {
  // `renotify`: ночное тихое уже лежит в шторке под той же темой, и без
  // этого флага замена его громким прошла бы молча. В типах DOM флага нет.
  const options = {
    body: notice.body,
    tag: notice.tag,
    icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
    lang: 'ru',
    silent: !loud,
    renotify: loud,
    // Адрес целиком: тап обрабатывает service worker, а у него нет роутера.
    data: { url: `${registration.scope}#${notice.target}` },
  } as NotificationOptions
  return registration.showNotification(notice.title, options)
}

/** Журнал не повод ронять напоминание: не записалось — и ладно. */
async function record(wake: Wake): Promise<void> {
  try {
    await db.settings.set(LOG, appendWake(await db.settings.get<unknown>(LOG), wake))
  } catch {
    // Уведомление уже показано, а без строки в журнале жить можно.
  }
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

export async function readWindow(): Promise<ReminderWindow> {
  return parseWindow(await db.settings.get<unknown>(WINDOW))
}

export async function saveWindow(window: ReminderWindow): Promise<void> {
  await db.settings.set(WINDOW, window)
}

/** Журнал пробуждений, свежие сверху. */
export async function readWakes(): Promise<Wake[]> {
  const stored = await db.settings.get<unknown>(LOG)
  return Array.isArray(stored) ? stored.filter(isWake) : []
}
