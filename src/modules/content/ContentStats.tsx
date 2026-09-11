import { useState } from 'react'
import { MONTHS_SHORT } from '../../core/dates.ts'
import { contentStats, scoreOf, SCORE_MIN, yearsOf } from './content.ts'
import {
  averageText,
  formatScore,
  peakMonthText,
  startedText,
  typeCountText,
  typeLabel,
} from './labels.ts'
import type { ContentEntry } from '../../core/model.ts'
import { Fold } from '../../ui/Fold.tsx'

/** Что показывается, когда год не выбран. */
const ALL = 'всё время'

/**
 * Итоги: сколько начато и закончено, распределение оценок, разбивка
 * по типам, лучшее за период.
 *
 * Ради этого блока модуль и заводится. Отдельная запись «смотрел то-то,
 * поставил 7» не стоит почти ничего — а «за год 41 запись, средняя 6,6,
 * и половина из них аниме» стоит. Числа считает `contentStats`, здесь
 * только выбор периода и подача.
 */
export function ContentStats({ entries }: { entries: ContentEntry[] }) {
  const years = yearsOf(entries)
  const [year, setYear] = useState<string>(years[0] ?? ALL)

  const stats = contentStats(entries, year === ALL ? null : year)
  const peakScore = Math.max(...stats.byScore, 1)
  const peakMonth = Math.max(...stats.byMonth, 1)

  if (entries.length === 0) return null

  return (
    <Fold id="content:stats" title="Итоги">

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

      {stats.started === 0 ? (
        <p className="muted">
          {year === ALL ? 'Начатого пока нет.' : `За ${year} год ничего не начато.`}
        </p>
      ) : (
        <>
          <p className="lead">{startedText(stats)}</p>
          {averageText(stats) && <p className="muted">{averageText(stats)}.</p>}

          {/* Распределение оценок: столбик на балл. Дробные сгруппированы
              вниз (Р-26) — 6,5 стоит в шестёрках, а не между. */}
          {stats.scored > 0 && (
            <div className="scores" aria-hidden="true">
              {stats.byScore.map((count, index) => (
                <div className="scores__cell" key={index} title={`${count}`}>
                  <div
                    className="scores__bar"
                    style={{ height: `${(count / peakScore) * 100}%` }}
                  />
                  <span className="scores__name">{index + SCORE_MIN}</span>
                </div>
              ))}
            </div>
          )}

          {/* По месяцам: когда смотрел больше. За год это лента года,
              за «всё время» — в какие месяцы смотрится вообще больше.
              Тот же приём, что у сезонности болезней. */}
          <div className="months" aria-hidden="true">
            {stats.byMonth.map((count, index) => (
              <div className="months__cell" key={MONTHS_SHORT[index]} title={`${count}`}>
                <div
                  className="months__bar"
                  style={{ height: `${(count / peakMonth) * 100}%` }}
                />
                <span className="months__name">{MONTHS_SHORT[index]}</span>
              </div>
            ))}
          </div>
          {peakMonthText(stats) && <p className="muted">{peakMonthText(stats)}.</p>}

          {stats.byType.length > 0 && (
            <table className="stats">
              <tbody>
                {stats.byType.map((each) => (
                  <tr key={each.type}>
                    <td>{typeLabel(each.type)}</td>
                    <td className="num muted">{typeCountText(each)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {stats.top.length > 0 && (
            <>
              <p className="muted">Лучшее:</p>
              <table className="stats">
                <tbody>
                  {stats.top.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.title}</td>
                      <td className="num">{formatScore(scoreOf(entry) ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </Fold>
  )
}
