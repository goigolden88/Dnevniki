import { useEffect, useState } from 'react'
import { db } from '../core/db.ts'
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

export function Settings() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
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
        if (!cancelled) setState({ status: 'ready', rows, dirty })
      } catch (error) {
        if (!cancelled) {
          setState({ status: 'failed', message: error instanceof Error ? error.message : 'Неизвестная ошибка' })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

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
