import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { today } from '../../core/dates.ts'
import type { Episode } from '../../core/model.ts'
import { TodayButton } from '../../ui/TodayButton.tsx'
import type { EpisodeState } from './health.ts'
import { episodeText, sourceText, symptomNames } from './labels.ts'
import { Measures } from './Measures.tsx'
import { Sessions } from './Sessions.tsx'
import { Stats } from './Stats.tsx'
import { SymptomPicker } from './Symptoms.tsx'
import { useHealth, type EpisodeDraft, type Health } from './useHealth.ts'

/**
 * Экран здоровья: болею сейчас, история эпизодов, заведение нового.
 *
 * Открытые эпизоды стоят наверху отдельным блоком. Это не украшение:
 * закрыть эпизод — единственное действие, которое делают в этом модуле
 * каждый день, и оно должно быть первым, что видно.
 */
export function HealthScreen() {
  const health = useHealth()

  if (health.status === 'loading') return <p className="muted">Открываю базу…</p>
  if (health.status === 'failed') return <p className="error">База не открылась: {health.error}</p>

  const closed = health.episodes.filter((state) => !state.open)

  return (
    <>
      <header className="screen-head">
        <h1>Здоровье</h1>
      </header>

      {health.error && <p className="error">Не сохранилось: {health.error}</p>}

      {health.open.length > 0 && (
        <section className="block">
          <h2>Болею сейчас</h2>
          <ul className="cycles">
            {health.open.map((state) => (
              <EpisodeCard
                key={state.episode.id}
                state={state}
                health={health}
                onClose={() => health.closeEpisode(state.episode.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <NewEpisode health={health} />

      <Stats health={health} />

      <Measures health={health} />

      <Sessions health={health} />

      <section className="block">
        <h2>История</h2>
        {closed.length === 0 ? (
          <p className="muted">Закрытых эпизодов пока нет.</p>
        ) : (
          <ul className="cycles">
            {closed.map((state) => (
              <EpisodeCard key={state.episode.id} state={state} health={health} />
            ))}
          </ul>
        )}
      </section>

      {health.episodes.length > 0 && (
        <Link className="btn btn--wide" to="/health/summary">
          Сводка для врача
        </Link>
      )}
    </>
  )
}

/** Карточка эпизода. У открытого — кнопка «Выздоровел», у закрытого нет. */
function EpisodeCard({
  state,
  health,
  onClose,
}: {
  state: EpisodeState
  health: Health
  onClose?: () => Promise<void>
}) {
  const { episode } = state
  const symptoms = symptomNames(episode.symptoms, health.tags)

  return (
    <li className={state.open ? 'cycle cycle--overdue' : 'cycle'}>
      <div className="cycle__head">
        <Link className="cycle__name" to={`/episode/${episode.id}`}>
          {episode.title}
        </Link>
        <span className="cycle__cat muted">{sourceText(episode.source)}</span>
      </div>

      <div className="cycle__foot">
        <div className="cycle__facts">
          <span className="cycle__status">{episodeText(state)}</span>
          {symptoms.length > 0 && <span className="muted">{symptoms.join(', ')}</span>}
        </div>

        {onClose && (
          <button type="button" className="mark" onClick={() => void onClose()}>
            Выздоровел
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * Заведение эпизода.
 *
 * По умолчанию эпизод открытый и начинается сегодня: заводят его обычно
 * в тот день, когда заболел, а конца ещё не знают. Дата правится, если
 * записываешь задним числом.
 */
function NewEpisode({ health }: { health: Health }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button type="button" className="btn btn--wide" onClick={() => setOpen(true)}>
        Завести эпизод
      </button>
    )
  }

  return (
    <EpisodeForm
      health={health}
      draft={{
        title: '',
        source: 'self',
        start: today(),
        end: null,
        symptoms: [],
      }}
      submitLabel="Завести"
      onCancel={() => setOpen(false)}
      onSubmit={async (draft) => {
        await health.addEpisode(draft)
        setOpen(false)
      }}
    />
  )
}

/**
 * Форма эпизода — общая для заведения и правки.
 *
 * «Болею сейчас» — это отсутствие даты окончания, а не отдельное поле:
 * в модели открытость эпизода выражена `end: null`, и второе состояние
 * рядом с ней разъехалось бы с первым.
 */
export function EpisodeForm({
  health,
  draft,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  health: Health
  draft: EpisodeDraft
  submitLabel: string
  onSubmit: (draft: EpisodeDraft) => Promise<void>
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(draft.title)
  const [source, setSource] = useState<Episode['source']>(draft.source)
  const [start, setStart] = useState(draft.start)
  const [end, setEnd] = useState<string | null>(draft.end)
  const [symptoms, setSymptoms] = useState<string[]>(draft.symptoms)
  const [note, setNote] = useState(draft.note ?? '')

  function submit(event: FormEvent) {
    event.preventDefault()
    const clean = title.trim()
    if (!clean) return

    void onSubmit({
      title: clean,
      source,
      start,
      end,
      symptoms,
      ...(note.trim() ? { note: note.trim() } : {}),
    })
  }

  return (
    <form className="form block" onSubmit={submit}>
      <label className="field">
        <span>Что за эпизод</span>
        <input
          value={title}
          placeholder="ОРВИ, поясница, зуб"
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <div className="field">
        <span>Диагноз</span>
        <div className="row">
          <button
            type="button"
            className={source === 'self' ? 'btn btn--primary' : 'btn'}
            onClick={() => setSource('self')}
          >
            Сам
          </button>
          <button
            type="button"
            className={source === 'doctor' ? 'btn btn--primary' : 'btn'}
            onClick={() => setSource('doctor')}
          >
            Врач
          </button>
        </div>
      </div>

      <div className="field">
        <span>Начало</span>
        <div className="row">
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          <TodayButton value={start} onPick={setStart} />
        </div>
      </div>

      <div className="field">
        <span>Окончание</span>
        <div className="row row--wrap">
          <input
            type="date"
            value={end ?? ''}
            onChange={(event) => setEnd(event.target.value || null)}
          />
          {/* Здесь «сегодня» — это «выздоровел сегодня» прямо из формы. */}
          <TodayButton value={end} onPick={setEnd} />
          <button type="button" className="btn" onClick={() => setEnd(null)} disabled={end === null}>
            {end === null ? 'Ещё болею' : 'Сбросить'}
          </button>
        </div>
      </div>

      <SymptomPicker
        selected={symptoms}
        tags={health.tags}
        episodes={health.episodes.map((state) => state.episode)}
        onChange={setSymptoms}
        onCreate={(name) => health.ensureTag(name, 'symptom')}
      />

      <label className="field">
        <span>Заметка</span>
        <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
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
