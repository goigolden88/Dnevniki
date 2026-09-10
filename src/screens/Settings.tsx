import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../core/db.ts'
import { today } from '../core/dates.ts'
import { SCHEMA_VERSION, SYNCED_STORES } from '../core/model.ts'
import type { SyncedStore } from '../core/model.ts'
import {
  checkReminder,
  disableReminders,
  enableReminders,
  reminderStatus,
  type ReminderStatus,
  type RemindResult,
} from '../notify.ts'
import { QuickSettings } from '../modules/cycles/Quick.tsx'
import { markdownExport } from '../registry.ts'
import { backupNote } from '../ui/backup.ts'
import { SyncSettings } from '../ui/SyncSettings.tsx'
import { useSyncStatus } from '../ui/useSync.ts'

const LABELS: Record<SyncedStore, string> = {
  items: 'Позиции циклов',
  tags: 'Теги',
  templates: 'Шаблоны',
  cycleEvents: 'Отметки циклов',
  episodes: 'Эпизоды',
  measures: 'Измерения',
  sessions: 'Тренировки',
  content: 'Контент',
}

type Row = { store: SyncedStore; live: number; total: number }

type State =
  | { status: 'loading' }
  | { status: 'ready'; rows: Row[]; dirty: number }
  | { status: 'failed'; message: string }

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

export function Settings() {
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(async () => {
    try {
      await db.ready()
      const rows: Row[] = []
      for (const store of SYNCED_STORES) {
        rows.push({
          store,
          live: await db.count(store),
          total: await db.count(store, { includeDeleted: true }),
        })
      }
      const dirty = (await db.listDirty()).length
      setState({ status: 'ready', rows, dirty })
    } catch (error) {
      setState({ status: 'failed', message: describe(error) })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <header className="screen-head">
        <h1>Настройки</h1>
      </header>

      <section className="block">
        <h2>Хранилище</h2>

        {state.status === 'loading' && <p className="muted">Открываю базу…</p>}

        {state.status === 'failed' && (
          <p className="error">База не открылась: {state.message}</p>
        )}

        {state.status === 'ready' && (
          <>
            <table className="stats">
              <tbody>
                {state.rows.map((row) => (
                  <tr key={row.store}>
                    <td>{LABELS[row.store]}</td>
                    <td className="num">{row.live}</td>
                    <td className="num muted">
                      {row.total > row.live ? `+${row.total - row.live} удал.` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Ждут отправки: {state.dirty}</p>
          </>
        )}
      </section>

      <SyncSettings onChanged={load} />

      <Reminders />

      <QuickSettings />

      <DataTransfer onChanged={load} />

      <section className="block">
        <h2>О приложении</h2>
        <dl className="facts">
          <dt>Версия схемы</dt>
          <dd>{SCHEMA_VERSION}</dd>
          <dt>Сборка</dt>
          <dd>{new Date(__BUILD_TIME__).toLocaleString('ru-RU')}</dd>
        </dl>
      </section>
    </>
  )
}

/**
 * Ручной перенос файлом. До Этапа 2 это единственный способ увезти данные
 * на второе устройство, а после него — запасной, на случай отвалившейся
 * синхронизации, и способ забрать всё с собой при отказе от приложения.
 */
function DataTransfer({ onChanged }: { onChanged: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [lastSaved, setLastSaved] = useState<string | null | undefined>(undefined)

  // Дата последней выгрузки лежит в настройках: они не синхронизируются,
  // и это правильно — «когда я забирал копию» у каждого устройства своё.
  useEffect(() => {
    void db.settings.get<string>(LAST_EXPORT).then((value) => setLastSaved(value ?? null))
  }, [])

  async function save() {
    setBusy(true)
    setError('')
    try {
      const snapshot = await db.exportAll()
      download(`dnevniki-${today()}.json`, JSON.stringify(snapshot, null, 2), 'application/json')
      // Браузер не сообщает, дошёл ли файл до диска: диалог мог быть отменён.
      // Отметка означает «выгрузку запускали», а не «копия точно есть».
      const at = new Date().toISOString()
      await db.settings.set(LAST_EXPORT, at)
      setLastSaved(at)
      setNote('Файл сохранён')
    } catch (failure) {
      setError(describe(failure))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Markdown — для чтения глазами и на случай отказа от приложения:
   * дневники остаются текстом, открываемым где угодно. Отметку о выгрузке
   * не ставит — это не копия, из которой можно восстановиться.
   */
  async function saveMarkdown() {
    setBusy(true)
    setNote('')
    setError('')
    try {
      const snapshot = await db.exportAll()
      download(`dnevniki-${today()}.md`, markdownExport(snapshot.data, today()), 'text/markdown')
      setNote('Markdown сохранён. Он для чтения: обратно в приложение загружается только JSON.')
    } catch (failure) {
      setError(describe(failure))
    } finally {
      setBusy(false)
    }
  }

  async function open(file: File) {
    setBusy(true)
    setNote('')
    setError('')
    try {
      const snapshot = db.parseSnapshot(await file.text())
      const applied = await db.importAll(snapshot)
      await onChanged()
      setNote(
        applied === 0
          ? 'Ничего не изменилось: в файле нет записей новее здешних'
          : `Загружено записей: ${applied}`,
      )
    } catch (failure) {
      setError(describe(failure))
    } finally {
      setBusy(false)
      // Одинаковый файл должен открываться повторно — без сброса
      // второй выбор того же файла не даёт события.
      if (input.current) input.current.value = ''
    }
  }

  return (
    <section className="block">
      <h2>Данные</h2>

      <div className="row">
        <button type="button" className="btn" onClick={() => void save()} disabled={busy}>
          Сохранить в файл
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          Загрузить из файла
        </button>
      </div>

      <div className="row row--end">
        <button type="button" className="btn" onClick={() => void saveMarkdown()} disabled={busy}>
          Сохранить в markdown
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void open(file)
        }}
      />

      {note && <p className="muted">{note}</p>}
      {error && <p className="error">{error}</p>}

      <LastExport at={lastSaved} />

      <p className="muted">
        Загрузка не стирает то, что уже есть: записи сливаются по времени правки, побеждает
        более поздняя.
      </p>
    </section>
  )
}

const LAST_EXPORT = 'lastExportAt'

/** Отдать текст файлом через ссылку со скачиванием. */
function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // Ссылка держит содержимое в памяти, пока её не отпустить.
  URL.revokeObjectURL(url)
}

const REMINDER_TEXT: Record<ReminderStatus, string> = {
  unsupported:
    'Этот браузер не умеет напоминать, когда приложение закрыто. Напоминания работают ' +
    'в Chrome на Android у установленного приложения.',
  denied: 'Уведомления для этого сайта запрещены в настройках браузера. Разрешить их можно только там.',
  off:
    'Примерно раз в сутки приложение напомнит о просроченном и о болезни, которую не закрыли, — ' +
    'даже закрытое.',
  'not-installed':
    'Уведомления разрешены, но фоновую проверку браузер не дал. Так бывает, когда приложение ' +
    'открыто во вкладке, а не установлено иконкой.',
  on: 'Включено. Браузер проверяет примерно раз в сутки, точное время выбирает сам.',
}

const CHECK_TEXT: Record<RemindResult | 'denied' | 'unsupported', string> = {
  shown: 'Уведомление показано.',
  nothing:
    'Напоминать не о чем — пришло пустое уведомление, чтобы было видно, что они доходят.',
  already: 'Сегодня уже напоминало.',
  denied: 'Уведомления запрещены — показать нечего.',
  unsupported: REMINDER_TEXT.unsupported,
}

/**
 * Напоминания о просроченном (Р-50).
 *
 * Включаются кнопкой, а не сами: разрешение на уведомления браузер
 * спрашивает только по действию человека. «Проверить сейчас» — чтобы
 * не ждать сутки, прежде чем узнать, работает ли.
 */
function Reminders() {
  const [status, setStatus] = useState<ReminderStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    void reminderStatus()
      .then(setStatus)
      .catch(() => setStatus('unsupported'))
  }, [])

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setNote('')
    try {
      await action()
    } catch (failure) {
      setNote(describe(failure))
    } finally {
      setBusy(false)
    }
  }

  // Состояние ещё читается — мигать «не поддерживается» на полсекунды незачем.
  if (status === null) return null

  return (
    <section className="block">
      <h2>Напоминания</h2>
      <p className="muted">{REMINDER_TEXT[status]}</p>

      <div className="row row--wrap">
        {(status === 'off' || status === 'not-installed') && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void act(async () => setStatus(await enableReminders()))}
          >
            Напоминать о просроченном
          </button>
        )}
        {status === 'on' && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await disableReminders()
                setStatus('off')
              })
            }
          >
            Выключить
          </button>
        )}
        {status !== 'unsupported' && status !== 'denied' && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void act(async () => setNote(CHECK_TEXT[await checkReminder()]))}
          >
            Проверить сейчас
          </button>
        )}
      </div>

      {note && <p className="muted">{note}</p>}
    </section>
  )
}

/**
 * Где лежит копия данных и стоит ли об этом беспокоиться.
 *
 * Само правило — в `ui/backup.ts`: оно неочевидное и зависит от того,
 * проходила ли синхронизация хоть раз, а такое должно проверяться
 * тестами, а не глазами.
 */
function LastExport({ at }: { at: string | null | undefined }) {
  const sync = useSyncStatus()

  // undefined — настройки ещё читаются. Мигать тревогой на полсекунды
  // при каждом открытии экрана незачем.
  if (at === undefined) return null

  const note = backupNote(at, sync, today())
  return <p className={note.tone}>{note.text}</p>
}
