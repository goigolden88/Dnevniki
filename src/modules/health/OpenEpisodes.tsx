import { Link } from 'react-router-dom'
import { episodeText } from './labels.ts'
import { useHealth } from './useHealth.ts'

/**
 * Открытые эпизоды на главном экране.
 *
 * Стоят над циклами и молчат, когда болезней нет. Пока болеешь, это
 * главное на экране: остальное — про сроки, а это про сейчас. Заодно
 * закрывается вторая беда открытого эпизода — про него забывают
 * закрыть, и он тянется в статистике месяцами.
 */
export function OpenEpisodes() {
  const health = useHealth()
  if (health.status !== 'ready' || health.open.length === 0) return null

  return (
    <section className="block">
      <h2>Болею сейчас</h2>
      <ul className="cycles">
        {health.open.map((state) => (
          <li className="cycle cycle--overdue" key={state.episode.id}>
            <div className="cycle__foot">
              <div className="cycle__facts">
                <Link className="cycle__name" to={`/episode/${state.episode.id}`}>
                  {state.episode.title}
                </Link>
                <span className="muted">{episodeText(state)}</span>
              </div>
              <button
                type="button"
                className="mark"
                onClick={() => void health.closeEpisode(state.episode.id)}
              >
                Выздоровел
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
