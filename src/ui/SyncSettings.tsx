/**
 * Настройка и состояние синхронизации.
 *
 * Репозиторий и токен — поля на экране, а не константы в коде: иначе
 * приложением невозможно поделиться (Р-15). Посторонний, ничего здесь не
 * заполнив, получает прежнюю работу — данные в браузере и никакой сети.
 */

import { useCallback, useEffect, useState } from 'react'
import { daysBetween, formatDate, isDateStr, today } from '../core/dates.ts'
import {
  checkAccess,
  expiryDay,
  forgetToken,
  getStatus,
  readConfig,
  saveConfig,
  syncNow,
} from '../core/sync.ts'
import type { SyncConfig } from '../core/sync.ts'
import { useSyncStatus } from './useSync.ts'

/** За сколько дней до конца жизни токена начинать предупреждать. */
const WARN_DAYS = 30

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

export function SyncSettings({ onChanged }: { onChanged: () => Promise<void> }) {
  const status = useSyncStatus()
  const [config, setConfig] = useState<SyncConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void readConfig().then(setConfig)
  }, [])

  const patch = useCallback(async (change: Partial<SyncConfig>) => {
    await saveConfig(change)
    setConfig(await readConfig())
  }, [])

  if (!config) {
    return (
      <section className="block">
        <h2>Синхронизация</h2>
        <p className="muted">Читаю настройки…</p>
      </section>
    )
  }

  async function check() {
    if (!config) return
    setBusy(true)
    setNote('')
    setError('')
    try {
      const access = await checkAccess(config)
      if (access.tokenExpiry) await patch({ tokenExpires: access.tokenExpiry })

      const parts = [
        `Репозиторий ${access.fullName} найден`,
        access.private ? 'приватный' : 'ПУБЛИЧНЫЙ — данные увидят все',
        access.canWrite ? 'запись разрешена' : 'запись ЗАПРЕЩЕНА',
      ]
      if (access.defaultBranch !== config.branch) {
        parts.push(`ветка по умолчанию — ${access.defaultBranch}`)
      }
      setNote(`${parts.join(', ')}.`)
      if (!access.canWrite) {
        setError(
          'Токену не хватает права «Contents: Read and write». ' +
            'Перевыпусти его с этим правом, иначе отправлять будет нечем.',
        )
      }
    } catch (failure) {
      setError(describe(failure))
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    setBusy(true)
    setNote('')
    setError('')
    try {
      const result = await syncNow()
      await onChanged()
      // Пустой ответ означает две разные вещи: синхронизация не настроена
      // либо проход упал. Разбирает их состояние — текст ошибки уже там,
      // и дублировать его здесь незачем.
      if (result === null) setNote(getStatus().state === 'error' ? '' : 'Синхронизация выключена')
      else if (result.pulled === 0 && result.pushed === 0) setNote('Всё и так совпадает')
      else {
        const parts = []
        if (result.pulled > 0) parts.push(`получено записей ${result.pulled}`)
        if (result.pushed > 0) parts.push(`отправлено файлов ${result.pushed}`)
        setNote(parts.join(', '))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="block">
      <h2>Синхронизация</h2>

      <StatusLine />

      <label className="check">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(event) => void patch({ enabled: event.target.checked })}
        />
        <span>Синхронизировать через приватный репозиторий</span>
      </label>

      {config.enabled && (
        <div className="form">
          <label className="field">
            Репозиторий данных
            <input
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="владелец/репозиторий"
              defaultValue={config.repo}
              onBlur={(event) => void patch({ repo: event.target.value })}
            />
          </label>

          <label className="field">
            Ветка
            <input
              type="text"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="main"
              defaultValue={config.branch}
              onBlur={(event) => void patch({ branch: event.target.value })}
            />
          </label>

          <TokenField config={config} onSave={(token) => patch({ token })} />

          <div className="row">
            <button type="button" className="btn" onClick={() => void check()} disabled={busy}>
              Проверить доступ
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void run()}
              disabled={busy || status.state === 'syncing'}
            >
              Синхронизировать
            </button>
          </div>
        </div>
      )}

      {note && <p className="muted">{note}</p>}
      {error && <p className="error">{error}</p>}

      {config.enabled && <TokenExpiry config={config} onSave={(day) => patch({ tokenExpires: day })} />}

      <p className="muted">
        {config.enabled
          ? 'Токен хранится только в этом браузере и в выгрузку данных не попадает. ' +
            'Репозиторий должен быть приватным: в нём лежит всё, включая здоровье.'
          : 'Пока выключено, данные живут только в этом браузере и никуда не уходят.'}
      </p>
    </section>
  )
}

/** Строка состояния. Видна и когда синхронизация выключена — там она молчит. */
function StatusLine() {
  const status = useSyncStatus()

  if (status.state === 'off') return null

  if (status.state === 'error') {
    return (
      <p className="error">
        {status.error}
        {status.pending > 0 && ` Ждут отправки: ${status.pending}.`}
      </p>
    )
  }

  if (status.state === 'syncing') return <p className="muted">Синхронизирую…</p>

  const when = status.lastAt ? new Date(status.lastAt).toLocaleString('ru-RU') : null

  return (
    <p className="muted">
      {status.pending > 0 ? `Ждут отправки: ${status.pending}. ` : 'Всё отправлено. '}
      {when ? `Последний обмен: ${when}` : 'Обмена ещё не было'}
    </p>
  )
}

/**
 * Токен вводится один раз и дальше не показывается.
 *
 * Показывать его нечем помочь: проверить глазами длинную строку всё равно
 * нельзя, а на чужом экране она лишняя. Заменить — вставить новый.
 */
function TokenField({
  config,
  onSave,
}: {
  config: SyncConfig
  onSave: (token: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(config.token === '')
  const [value, setValue] = useState('')

  if (!editing) {
    return (
      <div className="field">
        Токен доступа
        <div className="row">
          <span className="muted">Сохранён в этом браузере</span>
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            Заменить
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => void forgetToken().then(() => setEditing(true))}
          >
            Забыть
          </button>
        </div>
      </div>
    )
  }

  return (
    <label className="field">
      Токен доступа
      <input
        type="password"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="github_pat_…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (!value) return
          void onSave(value).then(() => {
            setValue('')
            setEditing(false)
          })
        }}
      />
    </label>
  )
}

/**
 * Срок жизни токена.
 *
 * Fine-grained токены выдаются на год. Через год синхронизация просто
 * перестанет работать, и без этой строки причина будет неочевидна: приложение
 * ведь ничего не меняло. Дата берётся из заголовка ответа GitHub, а если
 * браузеру не разрешили его читать — вписывается руками один раз.
 */
function TokenExpiry({
  config,
  onSave,
}: {
  config: SyncConfig
  onSave: (day: string) => Promise<void>
}) {
  const day = expiryDay(config.tokenExpires)

  if (config.token === '') return null

  if (day === null) {
    return (
      <label className="field">
        Когда истекает токен — GitHub показал дату при выдаче
        <input
          type="date"
          onChange={(event) => {
            if (isDateStr(event.target.value)) void onSave(event.target.value)
          }}
        />
      </label>
    )
  }

  const left = daysBetween(today(), day)

  if (left < 0) {
    return (
      <p className="error">
        Токен истёк {formatDate(day)}. Перевыпусти его в GitHub и вставь новый —
        до этого синхронизация работать не будет.
      </p>
    )
  }

  return (
    <p className={left <= WARN_DAYS ? 'error' : 'muted'}>
      Токен действует до {formatDate(day)}
      {left <= WARN_DAYS && ` — осталось дней ${left}, пора перевыпускать`}.
    </p>
  )
}
