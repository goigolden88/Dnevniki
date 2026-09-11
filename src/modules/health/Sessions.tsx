import { Fragment, useState, type FormEvent } from 'react'
import { formatDateLoose, plural, today } from '../../core/dates.ts'
import { activityTotals } from './health.ts'
import { sessionText } from './labels.ts'
import type { Health } from './useHealth.ts'
import { Fold } from '../../ui/Fold.tsx'
import { TodayButton } from '../../ui/TodayButton.tsx'

/**
 * Тренировки: свод по видам и ввод.
 *
 * Вид активности — тег со `scope: 'activity'`, тот же механизм, что
 * у симптомов. Длительность и дистанция необязательны: пробежка бывает
 * без секундомера, а зарядка без километров, и требовать их значило бы
 * не записать тренировку вовсе.
 */
export function Sessions({ health }: { health: Health }) {
  const totals = activityTotals(health.sessions)
  const recent = [...health.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
  const names = new Map(health.tags.map((tag) => [tag.id, tag.name]))

  return (
    <Fold id="health:sessions" title="Тренировки" summary={health.sessions.length}>

      <SessionForm health={health} />

      {totals.length === 0 ? (
        <p className="muted">Тренировок пока нет.</p>
      ) : (
        <table className="stats">
          <tbody>
            {totals.map((total) => (
              <tr key={total.activity}>
                <td>{names.get(total.activity) ?? '?'}</td>
                <td className="num">
                  {total.sessions} {plural(total.sessions, ['раз', 'раза', 'раз'])}
                </td>
                <td className="num muted">{sessionText(total.minutes, total.km)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {recent.length > 0 && (
        <details>
          <summary className="link-btn">Последние записи</summary>
          <table className="stats">
            <tbody>
              {recent.map((session) => (
                <Fragment key={session.id}>
                  <tr>
                    <td>{formatDateLoose(session.date)}</td>
                    <td>{names.get(session.activity) ?? '?'}</td>
                    <td className="num muted">
                      {sessionText(session.durationMin ?? 0, session.distanceKm ?? 0)}
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => void health.removeSession(session.id)}
                        aria-label={`Удалить тренировку ${formatDateLoose(session.date)}`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  {session.note && (
                    <tr>
                      <td colSpan={4} className="muted">
                        {session.note}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Fold>
  )
}

function SessionForm({ health }: { health: Health }) {
  const [activity, setActivity] = useState('')
  const [date, setDate] = useState(today())
  const [minutes, setMinutes] = useState('')
  const [km, setKm] = useState('')
  const [note, setNote] = useState('')

  const kinds = health.tags.filter((tag) => tag.scope === 'activity')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const name = activity.trim()
    if (!name) return

    const tagId = await health.ensureTag(name, 'activity')
    if (!tagId) return

    void health.addSession({
      activity: tagId,
      date,
      ...(number(minutes) === null ? {} : { durationMin: number(minutes) as number }),
      ...(number(km) === null ? {} : { distanceKm: number(km) as number }),
      ...(note.trim() ? { note: note.trim() } : {}),
    })
    setMinutes('')
    setKm('')
    setNote('')
  }

  return (
    <form className="form" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>Вид</span>
        {/* Список подсказывает заведённые виды, но не запирает в них:
            новый вид вписывается тем же полем. */}
        <input
          value={activity}
          list="activity-kinds"
          placeholder="бег, зал, растяжка"
          onChange={(event) => setActivity(event.target.value)}
        />
        <datalist id="activity-kinds">
          {kinds.map((tag) => (
            <option key={tag.id} value={tag.name} />
          ))}
        </datalist>
      </label>

      <div className="row row--wrap">
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <TodayButton value={date} onPick={setDate} />
        <input
          className="price-input"
          value={minutes}
          inputMode="numeric"
          placeholder="мин"
          onChange={(event) => setMinutes(event.target.value)}
        />
        <input
          className="price-input"
          value={km}
          inputMode="decimal"
          placeholder="км"
          onChange={(event) => setKm(event.target.value)}
        />
      </div>

      {/* Заметка, как у эпизода и контента: самочувствие, темп, где бегал. */}
      <label className="field">
        <span>Заметка</span>
        <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>

      <div className="form__actions">
        <button type="submit" className="btn">
          Записать
        </button>
      </div>
    </form>
  )
}

/** Пустое поле — это «не мерил», а не ноль. */
function number(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (!clean) return null
  const value = Number(clean)
  return Number.isFinite(value) && value > 0 ? value : null
}
