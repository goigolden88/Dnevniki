import { Link } from 'react-router-dom'
import { formatDate } from '../../core/dates.ts'
import { healthStats, series } from './health.ts'
import { episodeText, measureText, sourceText, statsText, symptomNames } from './labels.ts'
import { useHealth } from './useHealth.ts'

/**
 * Сводка для врача: хронология на одну страницу, на печать.
 *
 * Отдельный экран, а не блок на общем: у врача три минуты, и он должен
 * получить лист без вкладок, кнопок и «болею сейчас» крупными буквами.
 * Всё лишнее убирает `@media print` — печатается ровно то, что здесь.
 *
 * Пишется всё подряд, без фильтров и выборки: решать, что важно,
 * а что нет, будет врач, а не приложение.
 */
export function SummaryScreen() {
  const health = useHealth()

  if (health.status === 'loading') return <p className="muted">Открываю базу…</p>
  if (health.status === 'failed') return <p className="error">База не открылась: {health.error}</p>

  const episodes = health.episodes.map((state) => state.episode)
  const stats = healthStats(episodes, {}, health.day)
  const weight = series(health.measures, 'weight')
  const pressure = series(health.measures, 'bp')

  // Хронология по времени, старые сверху: врач читает историю с начала.
  const chronology = [...health.episodes].sort((a, b) =>
    a.episode.start.localeCompare(b.episode.start),
  )

  return (
    <>
      <p className="no-print">
        <Link className="back" to="/health">
          ← Здоровье
        </Link>
      </p>

      <header className="screen-head">
        <h1>Сводка</h1>
        <p className="muted">Составлена {formatDate(health.day)}</p>
      </header>

      <p className="no-print">
        <button type="button" className="btn btn--wide" onClick={() => window.print()}>
          Распечатать
        </button>
      </p>

      {stats.count === 0 ? (
        <p className="stub">Эпизодов пока нет — печатать нечего.</p>
      ) : (
        <>
          <section className="block">
            <h2>Коротко</h2>
            <p>{statsText(stats)}</p>
            {weight && (
              <p>
                Вес: {measureText('weight', weight.last.value)} на {formatDate(weight.last.date)},
                за наблюдение {weight.delta >= 0 ? '+' : ''}
                {weight.delta} кг (размах {weight.min}–{weight.max}).
              </p>
            )}
            {pressure && (
              <p>
                Давление: {measureText('bp', pressure.last.value, pressure.last.value2)} на{' '}
                {formatDate(pressure.last.date)}.
              </p>
            )}
            {stats.symptoms.length > 0 && (
              <p>
                Повторяющиеся симптомы:{' '}
                {stats.symptoms
                  .slice(0, 5)
                  .map((symptom) => {
                    const name = health.tags.find((tag) => tag.id === symptom.tagId)?.name ?? '?'
                    return `${name} (${symptom.count})`
                  })
                  .join(', ')}
                .
              </p>
            )}
          </section>

          <section className="block">
            <h2>Хронология</h2>
            <table className="stats summary">
              <tbody>
                {chronology.map((state) => (
                  <tr key={state.episode.id}>
                    <td>
                      <b>{state.episode.title}</b>
                      <br />
                      <span className="muted">
                        {symptomNames(state.episode.symptoms, health.tags).join(', ')}
                      </span>
                      {state.episode.note && (
                        <>
                          <br />
                          <span className="muted">{state.episode.note}</span>
                        </>
                      )}
                    </td>
                    <td className="num">
                      {episodeText(state)}
                      <br />
                      <span className="muted">диагноз: {sourceText(state.episode.source)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  )
}
