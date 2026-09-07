import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../core/db.ts'
import { today } from '../core/dates.ts'
import { SCHEMA_VERSION, SYNCED_STORES } from '../core/model.ts'
import type { SyncedStore } from '../core/model.ts'

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

      <DataTransfer onChanged={load} />

      <section className="block">
        <h2>Синхронизация</h2>
        <p className="stub">
          Репозиторий и токен появятся на Этапе 2. Пока данные живут только в этом браузере
          и никуда не уходят.
        </p>
      </section>

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

      <p className="muted">
        Загрузка не стирает то, что уже есть: записи сливаются по времени правки, побеждает
        более поздняя.
      </p>
    </section>
  )
}
