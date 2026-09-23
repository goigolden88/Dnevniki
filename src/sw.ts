/**
 * Service worker «Дневников» — точка входа `injectManifest`. Кеш, работа без
 * сети, автообновление, фоновая проверка и тап по уведомлению — ядра
 * (`shared/sw.ts`, Р-81); своё — о чём напоминать (`notify.ts`).
 *
 * Имя на выходе — `sw.js`, менять нельзя: установленные копии остались бы
 * со старым работником навсегда.
 */

import { startWorker } from './shared/sw.ts'
import { reminders } from './notify.ts'

startWorker({ remind: (registration) => reminders.remind(registration) })
