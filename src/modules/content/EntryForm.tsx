import { useState, type FormEvent } from 'react'
import { formatScore, statusLabel, TYPES } from './labels.ts'
import { parseScore, SCORE_MAX, SCORE_MIN } from './content.ts'
import { currentMonth, type EntryDraft } from './useContent.ts'
import type { ContentEntry } from '../../core/model.ts'
import { TodayButton } from '../../ui/TodayButton.tsx'

const STATUSES: ContentEntry['status'][] = ['planned', 'active', 'done', 'dropped']

/**
 * Дата с выбором точности (Р-25).
 *
 * По умолчанию месяц: в дневнике просмотренного дней не было ни у одной
 * из 72 записей, и подставлять первое число значит записать выдумку
 * фактом. День доступен переключателем — для того, что заводится сегодня
 * и дату которого помнишь точно.
 *
 * `<input type="month">` отдаёт ровно `YYYY-MM`, а `type="date"` —
 * `YYYY-MM-DD`. Ни то ни другое дополнительного разбора не требует.
 */
function PrecisionDate({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
}) {
  // Точность выводится из самого значения, отдельного поля нет — ровно
  // по той причине, по которой его нет и в модели: забыть невозможно.
  const [precise, setPrecise] = useState(value !== null && value.length > 7)

  function toggle() {
    if (precise) {
      // День → месяц: хвост отрезается, месяц остаётся.
      onChange(value === null ? null : value.slice(0, 7))
      setPrecise(false)
    } else {
      setPrecise(true)
    }
  }

  // «Сегодня» ставит день, а не месяц (Р-51): месяц по умолчанию нужен
  // там, где день забыт, а сегодняшний день известен наверняка.
  function pickToday(day: string) {
    setPrecise(true)
    onChange(day)
  }

  return (
    <div className="field">
      <span>{label}</span>
      <div className="row row--wrap">
        <input
          type={precise ? 'date' : 'month'}
          value={precise ? (value ?? '') : (value ?? '').slice(0, 7)}
          onChange={(event) => onChange(event.target.value || null)}
        />
        <TodayButton value={value} onPick={pickToday} />
        <button type="button" className="btn" onClick={toggle}>
          {precise ? 'Только месяц' : 'Уточнить день'}
        </button>
      </div>
    </div>
  )
}

/**
 * Форма записи — общая для заведения и правки.
 *
 * Статус правит форму, а не украшает её: у «к просмотру» даты начала нет
 * по определению (Р-21), и поле для неё не показывается вовсе. Дата
 * окончания спрашивается только у законченного — и остаётся
 * необязательной: у всех перенесённых записей её нет, и это нормально (Р-42).
 */
export function EntryForm({
  draft,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  draft: EntryDraft
  submitLabel: string
  onSubmit: (draft: EntryDraft) => Promise<void>
  onCancel?: () => void
}) {
  const [type, setType] = useState(draft.type)
  const [title, setTitle] = useState(draft.title)
  const [titleOrig, setTitleOrig] = useState(draft.titleOrig ?? '')
  const [status, setStatus] = useState(draft.status)
  const [start, setStart] = useState(draft.start)
  const [end, setEnd] = useState(draft.end)
  const [score, setScore] = useState(draft.score === null ? '' : formatScore(draft.score))
  const [comment, setComment] = useState(draft.comment ?? '')

  const showStart = status !== 'planned'
  const showEnd = status === 'done' || status === 'dropped'

  /**
   * Смена статуса чинит дату, а не оставляет её в противоречии.
   *
   * «К просмотру» с датой начала — это не намерение, а начатое; начатое
   * без даты потеряет год и уедет в `undated.json` (Р-34). Оба случая
   * лечатся здесь, а не проверкой на сохранении.
   */
  function pickStatus(next: ContentEntry['status']) {
    setStatus(next)
    if (next === 'planned') setStart(null)
    else if (start === null) setStart(currentMonth())
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const clean = title.trim()
    if (!clean) return

    void onSubmit({
      type,
      title: clean,
      ...(titleOrig.trim() ? { titleOrig: titleOrig.trim() } : {}),
      start: showStart ? start : null,
      end: showEnd ? end : null,
      status,
      score: parseScore(score),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    })
  }

  return (
    <form className="form block" onSubmit={submit}>
      <div className="field">
        <span>Что это</span>
        <div className="chips">
          {TYPES.map((each) => (
            <button
              key={each.key}
              type="button"
              className={each.key === type ? 'chip chip--on' : 'chip'}
              aria-pressed={each.key === type}
              onClick={() => setType(each.key)}
            >
              {each.label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Название</span>
        <input
          value={title}
          placeholder="Фрирен"
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label className="field">
        <span>Оригинальное название</span>
        <input
          value={titleOrig}
          placeholder="необязательно"
          onChange={(event) => setTitleOrig(event.target.value)}
        />
      </label>

      <div className="field">
        <span>Статус</span>
        <div className="chips">
          {STATUSES.map((each) => (
            <button
              key={each}
              type="button"
              className={each === status ? 'chip chip--on' : 'chip'}
              aria-pressed={each === status}
              onClick={() => pickStatus(each)}
            >
              {statusLabel(each)}
            </button>
          ))}
        </div>
      </div>

      {showStart && <PrecisionDate label="Начало" value={start} onChange={setStart} />}
      {showEnd && <PrecisionDate label="Окончание, если помнишь" value={end} onChange={setEnd} />}

      <label className="field">
        <span>Оценка</span>
        <input
          className="score-input"
          value={score}
          inputMode="decimal"
          placeholder={`${SCORE_MIN}–${SCORE_MAX}, можно с десятыми`}
          onChange={(event) => setScore(event.target.value)}
        />
      </label>

      <label className="field">
        <span>Комментарий</span>
        <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>

      <div className="form__actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Отмена
          </button>
        )}
        <button type="submit" className="btn btn--primary">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
