import { useState, type FormEvent } from 'react'
import { formatDate, formatDateLoose, today } from '../../core/dates.ts'
import { metricsOf, resolveMetric, series } from './health.ts'
import { measureText, METRICS, metricLabel, metricUnit } from './labels.ts'
import { Chart } from './Chart.tsx'
import { Fold } from '../../ui/Fold.tsx'
import { TodayButton } from '../../ui/TodayButton.tsx'
import type { Health } from './useHealth.ts'

/**
 * Измерения: ряд с графиком и ввод.
 *
 * Метрика — свободная строка в модели, но в интерфейсе предлагаются три
 * готовые: вес, давление, рост. Своя заводится чипом «+ своя»: до него
 * завести её было нечем вовсе, хотя модель это позволяла. Дальше она
 * стоит в переключателе сама, как только записано первое значение.
 */
export function Measures({ health }: { health: Health }) {
  const known = metricsOf(health.measures)
  // Готовые метрики стоят первыми всегда, даже пустые: без этого не
  // с чего начать, когда измерений ещё нет ни одного.
  const all = [...METRICS.map((each) => each.key), ...known.filter((each) => !isPreset(each))]
  const [metric, setMetric] = useState<string>(all[0] ?? 'weight')
  const [naming, setNaming] = useState(false)
  const [newName, setNewName] = useState('')
  // Только что выбранная своя метрика ещё без единого значения — в ряду
  // её нет, а показать выбранное надо.
  const shown = all.includes(metric) ? all : [...all, metric]

  function pickNew(event: FormEvent) {
    event.preventDefault()
    const clean = newName.trim()
    if (!clean) return
    setMetric(resolveMetric(health.measures, clean, METRICS))
    setNaming(false)
    setNewName('')
  }

  const row = series(health.measures, metric)
  const recent = health.measures
    .filter((measure) => measure.metric === metric)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)

  return (
    <Fold id="health:measures" title="Измерения" summary={health.measures.length}>

      <div className="chips">
        {shown.map((each) => (
          <button
            key={each}
            type="button"
            className={each === metric ? 'chip chip--on' : 'chip'}
            aria-pressed={each === metric}
            onClick={() => setMetric(each)}
          >
            {metricLabel(each)}
          </button>
        ))}
        <button
          type="button"
          className={naming ? 'chip chip--on' : 'chip'}
          aria-expanded={naming}
          onClick={() => setNaming(!naming)}
        >
          + своя
        </button>
      </div>

      {naming && (
        <form className="row row--wrap" onSubmit={pickNew}>
          <input
            value={newName}
            placeholder="пульс, сахар, талия"
            aria-label="Название своей метрики"
            autoFocus
            onChange={(event) => setNewName(event.target.value)}
          />
          <button type="submit" className="btn">
            Выбрать
          </button>
        </form>
      )}

      {row === null ? (
        <p className="muted">Измерений пока нет. Первое задаст точку отсчёта.</p>
      ) : (
        <>
          <Chart series={row} />
          <p className="muted">
            Сейчас {measureText(metric, row.last.value, row.last.value2)}, от{' '}
            {formatDate(row.first.date)}{' '}
            {row.delta === 0
              ? 'без изменений'
              : `${row.delta > 0 ? '+' : ''}${row.delta} ${metricUnit(metric)}`.trim()}
            . Размах {row.min}–{row.max}.
          </p>
        </>
      )}

      <MeasureForm metric={metric} health={health} />

      {recent.length > 0 && (
        <table className="stats">
          <tbody>
            {recent.map((measure) => (
              <tr key={measure.id}>
                <td>{formatDateLoose(measure.date)}</td>
                <td className="num">
                  {measureText(measure.metric, measure.value, measure.value2)}
                </td>
                <td className="num">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => void health.removeMeasure(measure.id)}
                    aria-label={`Удалить измерение ${formatDateLoose(measure.date)}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Fold>
  )
}

function isPreset(metric: string): boolean {
  return METRICS.some((each) => each.key === metric)
}

/** У давления два числа, у остальных одно. Форма это знает, модель — нет. */
function MeasureForm({ metric, health }: { metric: string; health: Health }) {
  const [date, setDate] = useState(today())
  const [value, setValue] = useState('')
  const [second, setSecond] = useState('')

  // Своя метрика пары не имеет: у неё в списке нет записи вовсе.
  const paired = typeof METRICS.find((each) => each.key === metric)?.second === 'string'

  function submit(event: FormEvent) {
    event.preventDefault()
    const first = Number(value.replace(',', '.'))
    if (!value.trim() || !Number.isFinite(first)) return

    const other = Number(second.replace(',', '.'))
    const hasSecond = paired && second.trim() !== '' && Number.isFinite(other)

    void health.addMeasure({
      metric,
      date,
      value: first,
      ...(hasSecond ? { value2: other } : {}),
    })
    setValue('')
    setSecond('')
  }

  return (
    <form className="row row--wrap" onSubmit={submit}>
      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <TodayButton value={date} onPick={setDate} />
      <input
        className="price-input"
        value={value}
        inputMode="decimal"
        placeholder={paired ? 'верх' : metricUnit(metric) || 'значение'}
        onChange={(event) => setValue(event.target.value)}
      />
      {paired && (
        <input
          className="price-input"
          value={second}
          inputMode="decimal"
          placeholder="низ"
          onChange={(event) => setSecond(event.target.value)}
        />
      )}
      <button type="submit" className="btn">
        Записать
      </button>
    </form>
  )
}
