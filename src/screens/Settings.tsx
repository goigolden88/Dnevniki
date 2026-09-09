import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../core/db.ts'
import { daysAgo, days, formatDate, toDateStr, today } from '../core/dates.ts'
import { SCHEMA_VERSION, SYNCED_STORES } from '../core/model.ts'
import type { SyncedStore } from '../core/model.ts'
import { SyncSettings } from '../ui/SyncSettings.tsx'

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
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `dnevniki-${today()}.json`
      link.click()
      // Ссылка держит слепок в памяти, пока её не отпустить.
      URL.revokeObjectURL(url)
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

/** Через сколько дней без выгрузки напоминание становится тревожным. */
const STALE_DAYS = 14

/**
 * Когда в последний раз забирали копию.
 *
 * Пока синхронизации нет, файл — единственное место, где данные лежат
 * вне этого браузера. Очистка данных сайта стирает базу целиком, и без
 * этой строки о ней вспоминают уже после.
 */
function LastExport({ at }: { at: string | null | undefined }) {
  if (at === undefined) return null

  if (at === null) {
    return (
      <p className="error">
        Копию ещё ни разу не забирали. Данные есть только в этом браузере — очистка данных сайта
        сотрёт их целиком.
      </p>
    )
  }

  const day = toDateStr(new Date(at))
  const ago = daysAgo(day)
  const when =
    ago === 0 ? 'сегодня' : ago === 1 ? 'вчера' : `${days(ago)} назад, ${formatDate(day)}`

  return (
    <p className={ago >= STALE_DAYS ? 'error' : 'muted'}>
      Последняя выгрузка: {when}.
      {ago >= STALE_DAYS && ' С тех пор всё новое живёт только здесь.'}
    </p>
  )
}
