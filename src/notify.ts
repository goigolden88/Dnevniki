/**
 * Напоминания (Р-50, Р-54, Р-57, Р-58): о просроченном в циклах, о незакрытой
 * болезни и «Ещё смотришь?».
 *
 * Механика — окно со звуком, тихое вне окна, со звуком не чаще раза в день,
 * журнал пробуждений, разрешение и фоновая проверка — ядра (`shared/notify.ts`,
 * Р-81). Своё здесь — о чём напоминать, куда ведёт тап и «раз в неделю»
 * у «Ещё смотришь?».
 *
 * Тем три, и у каждой свои дни громкого и тихого (Р-85): громкое одной
 * не глушит другую. Тот же объект зовут работник (`remind`) и «Настройки»
 * (остальное): считают они одинаково, и разойтись это не должно.
 *
 * Живёт на уровне приложения, рядом с `app.tsx`, а не в модуле: оно знает
 * модули циклов, здоровья и контента.
 */

import { db } from './app/core.ts'
import { daysBetween } from './shared/core/dates.ts'
import { createReminders, DAY_KEYS, type ReminderStatus } from './shared/notify.ts'
import { staleWatching } from './modules/content/content.ts'
import { staleNotice } from './modules/content/labels.ts'
import { cycleStates } from './modules/cycles/cycles.ts'
import { overdueNotice } from './modules/cycles/labels.ts'
import { openEpisodes } from './modules/health/health.ts'
import { illnessNotice } from './modules/health/labels.ts'

export { DEFAULT_WINDOW } from './shared/notify.ts'
export type { ReminderStatus, ReminderWindow, RemindResult, Wake } from './shared/notify.ts'

/**
 * Дни напоминания о незакрытой болезни (Р-85): свои, а не общие
 * с просроченным — иначе громкое о просроченном закрыло бы день и болезни.
 * Имена лежат в настройках устройств и не меняются никогда.
 */
export const ILLNESS_KEYS = { loud: 'reminderIllnessDay', quiet: 'reminderIllnessQuietDay' } as const

/**
 * Дни «Ещё смотришь?» (Р-58, Р-85). Громкий — прежний `reminderContentDay`:
 * в нём лежит день прошлого вопроса, и отсчёт недели не сбрасывается
 * обновлением.
 */
export const CONTENT_KEYS = { loud: 'reminderContentDay', quiet: 'reminderContentQuietDay' } as const

/**
 * Имя фоновой проверки до перевода на ядро (Р-54). Ядро проверяет под своим
 * `remind` (Р-85); прежняя регистрация снимается при включении напоминаний,
 * чтобы браузер не будил работника впустую.
 */
export const LEGACY_REMINDER_TAG = 'overdue'

// ─── «Ещё смотришь?» (Р-58) ────────────────────────────────────────────────

/** Как часто спрашивать о зависшем в «смотрю». */
export const CONTENT_EVERY_DAYS = 7

/**
 * Пора ли спросить о зависшем в «смотрю». Вопрос масштаба месяцев
 * ежедневного уведомления не стоит — раз в неделю. В тот же день можно:
 * ночное тихое повторяется днём со звуком — это решает механика ядра.
 */
export function contentDue(lastDay: string | null, day: string): boolean {
  return lastDay === null || lastDay === day || daysBetween(lastDay, day) >= CONTENT_EVERY_DAYS
}

/** День последнего вопроса — поздний из громкого и тихого. */
function lastAsked(loud: string | undefined, quiet: string | undefined): string | null {
  const days = [loud, quiet].filter((day): day is string => typeof day === 'string')
  return days.length === 0 ? null : days.reduce((a, b) => (a > b ? a : b))
}

// ─── Напоминания приложения ────────────────────────────────────────────────

export const reminders = createReminders(db.settings, {
  async topics(day) {
    const [items, events, episodes, entries, contentLoud, contentQuiet] = await Promise.all([
      db.getAll('items'),
      db.getAll('cycleEvents'),
      db.getAll('episodes'),
      db.getAll('content'),
      db.settings.get<string>(CONTENT_KEYS.loud),
      db.settings.get<string>(CONTENT_KEYS.quiet),
    ])

    const illness = illnessNotice(openEpisodes(episodes, day))
    const stale = staleNotice(staleWatching(entries, day))
    const askContent = stale !== null && contentDue(lastAsked(contentLoud, contentQuiet), day)

    return [
      {
        notice: overdueNotice(cycleStates(items, events, day)),
        tag: 'overdue',
        target: '/',
        loudKey: DAY_KEYS.loud,
        quietKey: DAY_KEYS.quiet,
      },
      {
        // О болезни — на экран эпизода, при нескольких — на «Здоровье» (Р-54).
        notice: illness,
        tag: 'illness',
        target: illness?.target ?? '/health',
        loudKey: ILLNESS_KEYS.loud,
        quietKey: ILLNESS_KEYS.quiet,
      },
      {
        notice: askContent ? stale : null,
        tag: 'content',
        target: stale?.target ?? '/content',
        loudKey: CONTENT_KEYS.loud,
        quietKey: CONTENT_KEYS.quiet,
      },
    ]
  },
  idle: {
    title: 'Напоминать не о чем',
    body: 'Просроченного нет, незакрытых болезней нет, в «смотрю» ничего не зависло.',
    tag: 'overdue',
    target: '/',
  },
})

// ─── Для экрана настроек ───────────────────────────────────────────────────

export const { checkReminder, disableReminders, readWakes, readWindow, reminderStatus, saveWindow } = reminders

/**
 * Включить напоминания — и снять регистрацию прежнего имени (Р-85): её
 * работник ядра не слушает, а браузер будил бы его впустую.
 */
export async function enableReminders(): Promise<ReminderStatus> {
  const status = await reminders.enableReminders()
  if (status === 'on') await forgetLegacyCheck()
  return status
}

async function forgetLegacyCheck(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.periodicSync?.unregister(LEGACY_REMINDER_TAG)
  } catch {
    // Не снялась — проверка под прежним именем разбудит работника вхолостую.
  }
}
