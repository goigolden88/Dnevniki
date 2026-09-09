import { Link, useNavigate, useParams } from 'react-router-dom'
import { EpisodeForm } from './HealthScreen.tsx'
import { episodeText, sourceText, symptomNames } from './labels.ts'
import { useHealth } from './useHealth.ts'

/** Эпизод целиком: что было, сколько длилось, правка и удаление. */
export function EpisodeScreen() {
  const { id = '' } = useParams()
  const health = useHealth()
  const navigate = useNavigate()

  if (health.status === 'loading') return <p className="muted">Открываю базу…</p>
  if (health.status === 'failed') return <p className="error">База не открылась: {health.error}</p>

  const state = health.episodeOf(id)
  if (!state) {
    return (
      <>
        <p className="stub">Эпизод не найден. Возможно, удалён.</p>
        <Link className="btn btn--wide" to="/health">
          К списку
        </Link>
      </>
    )
  }

  const { episode } = state
  const symptoms = symptomNames(episode.symptoms, health.tags)

  function remove() {
    if (!window.confirm(`Удалить эпизод «${episode.title}»?`)) return
    void health.removeEpisode(id).then(() => navigate('/health'))
  }

  return (
    <>
      <p>
        <Link className="back" to="/health">
          ← Здоровье
        </Link>
      </p>

      <header className="screen-head">
        <h1>{episode.title}</h1>
        <p className="muted">
          {episodeText(state)} · диагноз: {sourceText(episode.source)}
        </p>
      </header>

      {health.error && <p className="error">Не сохранилось: {health.error}</p>}

      <section className="block">
        <div className="row">
          {state.open ? (
            <button type="button" className="btn btn--primary" onClick={() => void health.closeEpisode(id)}>
              Выздоровел сегодня
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => void health.reopenEpisode(id)}>
              Снова открыть
            </button>
          )}
        </div>

        {symptoms.length > 0 && <p className="muted">Симптомы: {symptoms.join(', ')}</p>}
        {episode.note && <p>{episode.note}</p>}
      </section>

      <section className="block">
        <h2>Правка</h2>
        <EpisodeForm
          health={health}
          draft={{
            title: episode.title,
            source: episode.source,
            start: episode.start,
            end: episode.end,
            symptoms: episode.symptoms,
            ...(episode.note === undefined ? {} : { note: episode.note }),
          }}
          submitLabel="Сохранить"
          onSubmit={(draft) => health.updateEpisode(id, draft)}
        />
      </section>

      <div className="row row--end">
        <button type="button" className="btn btn--danger" onClick={remove}>
          Удалить
        </button>
      </div>
    </>
  )
}
