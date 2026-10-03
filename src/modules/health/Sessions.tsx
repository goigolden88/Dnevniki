import { Fragment, useId, useState, type FormEvent } from 'react'
import { formatDateLoose, plural, today } from '../../shared/core/dates.ts'
import type { Session } from '../../app/model.ts'
import { activityTotals } from './health.ts'
import { sessionText } from './labels.ts'
import type { Health, SessionDraft } from './useHealth.ts'
import { Fold } from '../../shared/ui/Fold.tsx'
import { TodayButton } from '../../ui/TodayButton.tsx'

/**
 * Тренировки: свод по видам и ввод.
 *
 * Вид активности — тег со `scope: 'activity'`, тот же механизм, что
 * у симптомов. Длительность и дистанция необязательны: пробежка бывает
 * без секундомера, а зарядка без километров, и требовать их значило бы
 * не записать тренировку вовсе.
 *
 * Форма — за кнопкой, как у эпизода и записи контента (Р-73): раскрытая
 * всегда, она занимала экран, а свод по видам уезжал под неё.
 */
export function Sessions({ health }: { health: Health }) {
  const [adding, setAdding] = useState(false)
  /** Какая из последних записей открыта на правку. */
  const [editing, setEditing] = useState<string | null>(null)
  const totals = activityTotals(health.sessions)
  const recent = [...health.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
  const names = new Map(health.tags.map((tag) => [tag.id, tag.name]))

  return (
    <Fold id="health:sessions" title="Тренировки" summary={health.sessions.length}>
      {adding ? (
        <SessionForm
          health={health}
          submitLabel="Записать"
          onSubmit={health.addSession}
          onDone={() => setAdding(false)}
        />
      ) : (
        <p>
          <button type="button" className="btn btn--wide" onClick={() => setAdding(true)}>
            Записать тренировку
          </button>
        </p>
      )}

      {totals.length === 0 ? (
        <p className="muted">
          Тренировок пока нет. Вид — словами: бег, зал, плавание; дальше он подскажется сам. Минуты
          и километры — по желанию.
        </p>
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

      {/* Тем же сворачиванием, что блоки, а не ссылкой-треугольником (Р-73). */}
      {recent.length > 0 && (
        <Fold id="health:sessions:recent" title="Последние записи" summary={recent.length} sub folded>
          <table className="stats">
            <tbody>
              {recent.map((session) =>
                session.id === editing ? (
                  <tr key={session.id}>
                    <td colSpan={4}>
                      <SessionForm
                        health={health}
                        session={session}
                        submitLabel="Сохранить"
                        onSubmit={(draft) => health.updateSession(session.id, draft)}
                        onDone={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  // Тап по записи — правка, как у эпизода: тем же видом формы, что ввод.
                  <Fragment key={session.id}>
                    <tr className="tap" onClick={() => setEditing(session.id)}>
                      <td>{formatDateLoose(session.date)}</td>
                      <td>{names.get(session.activity) ?? '?'}</td>
                      <td className="num muted">
                        {sessionText(session.durationMin ?? 0, session.distanceKm ?? 0)}
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={(event) => {
                            event.stopPropagation()
                            void health.removeSession(session.id)
                          }}
                          aria-label={`Удалить тренировку ${formatDateLoose(session.date)}`}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    {session.note && (
                      <tr className="tap" onClick={() => setEditing(session.id)}>
                        <td colSpan={4} className="muted">
                          {session.note}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ),
              )}
            </tbody>
          </table>
        </Fold>
      )}
    </Fold>
  )
}

/**
 * Форма тренировки — общая для ввода и правки, как у эпизода. При правке
 * заполнена значениями записи; вид в ней словом, как при вводе.
 */
function SessionForm({
  health,
  session,
  submitLabel,
  onSubmit,
  onDone,
}: {
  health: Health
  session?: Session
  submitLabel: string
  onSubmit: (draft: SessionDraft) => Promise<void>
  onDone: () => void
}) {
  const [activity, setActivity] = useState(
    () => health.tags.find((tag) => tag.id === session?.activity)?.name ?? '',
  )
  const [date, setDate] = useState(session?.date ?? today())
  const [minutes, setMinutes] = useState(text(session?.durationMin))
  const [km, setKm] = useState(text(session?.distanceKm))
  const [note, setNote] = useState(session?.note ?? '')
  // Правка открывается внутри списка, пока форма ввода может быть открыта
  // выше: подсказкам видов нужны разные id.
  const kindsId = useId()

  const kinds = health.tags.filter((tag) => tag.scope === 'activity')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const name = activity.trim()
    if (!name) return

    const tagId = await health.ensureTag(name, 'activity')
    if (!tagId) return

    void onSubmit({
      activity: tagId,
      date,
      ...(number(minutes) === null ? {} : { durationMin: number(minutes) as number }),
      ...(number(km) === null ? {} : { distanceKm: number(km) as number }),
      ...(note.trim() ? { note: note.trim() } : {}),
    })
    onDone()
  }

  return (
    <form className="form block" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>Вид</span>
        {/* Список подсказывает заведённые виды, но не запирает в них:
            новый вид вписывается тем же полем. */}
        <input
          value={activity}
          list={kindsId}
          placeholder="бег, зал, растяжка"
          // При правке клавиатура не нужна сразу: чаще правят минуты и заметку.
          autoFocus={!session}
          onChange={(event) => setActivity(event.target.value)}
        />
        <datalist id={kindsId}>
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
        <button type="button" className="btn" onClick={onDone}>
          Отмена
        </button>
        <button type="submit" className="btn btn--primary">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

/** Число записи в поле формы; нет числа — пустое поле. */
function text(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

/** Пустое поле — это «не мерил», а не ноль. */
function number(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (!clean) return null
  const value = Number(clean)
  return Number.isFinite(value) && value > 0 ? value : null
}
