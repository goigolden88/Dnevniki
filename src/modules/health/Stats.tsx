import { useState } from 'react'
import { days } from '../../core/dates.ts'
import { healthStats } from './health.ts'
import { gapText, MONTHS_SHORT, statsText } from './labels.ts'
import type { Health } from './useHealth.ts'

/** Что показывается, когда год не выбран. */
const ALL = 'всё время'

/**
 * Аналитика эпизодов: частота, длительность, сезонность, повторяющиеся
 * симптомы.
 *
 * Ради этого блока модуль и заводится: отдельная запись «болел с 1 по 5»
 * не стоит ничего, а «третий раз за год, и все три раза горло» — стоит.
 * Числа считает `healthStats`, здесь только выбор периода и подача.
 */
export function Stats({ health }: { health: Health }) {
  const years = [
    ...new Set(health.episodes.map((state) => state.episode.start.slice(0, 4)).filter(Boolean)),
  ].sort((a, b) => b.localeCompare(a))

  const [year, setYear] = useState<string>(years[0] ?? ALL)
  const episodes = health.episodes.map((state) => state.episode)
  const period = year === ALL ? {} : { from: `${year}-01-01`, to: `${year}-12-31` }
  const stats = healthStats(episodes, period, health.day)

  if (health.episodes.length === 0) return null

  const names = new Map(health.tags.map((tag) => [tag.id, tag.name]))
  const peak = Math.max(...stats.byMonth, 1)

  return (
    <section className="block">
      <h2>Итоги</h2>

      {years.length > 1 && (
        <div className="chips">
          {[...years, ALL].map((each) => (
            <button
              key={each}
              type="button"
              className={each === year ? 'chip chip--on' : 'chip'}
              aria-pressed={each === year}
              onClick={() => setYear(each)}
            >
              {each}
            </button>
          ))}
        </div>
      )}

      {stats.count === 0 ? (
        <p className="muted">За этот период эпизодов не было.</p>
      ) : (
        <>
          <p>{statsText(stats)}</p>
          {stats.longestDays !== null && stats.longestDays > 0 && (
            <p className="muted">Самый долгий — {days(stats.longestDays)}.</p>
          )}
          {gapText(stats) && <p className="muted">{gapText(stats)}.</p>}

          {/* Сезонность: столбик на месяц. Числа маленькие, и подписи
              к каждому столбику были бы длиннее самих столбиков. */}
          <div className="months" aria-hidden="true">
            {stats.byMonth.map((count, index) => (
              <div className="months__cell" key={MONTHS_SHORT[index]} title={`${count}`}>
                <div className="months__bar" style={{ height: `${(count / peak) * 100}%` }} />
                <span className="months__name">{MONTHS_SHORT[index]}</span>
              </div>
            ))}
          </div>

          {stats.symptoms.length > 0 && (
            <table className="stats">
              <tbody>
                {stats.symptoms.slice(0, 8).map((symptom) => (
                  <tr key={symptom.tagId}>
                    <td>{names.get(symptom.tagId) ?? '?'}</td>
                    <td className="num muted">
                      {symptom.count} из {stats.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}
