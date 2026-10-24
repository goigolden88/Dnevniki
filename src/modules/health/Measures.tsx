import { Fragment, useState, type FormEvent } from 'react'
import { formatDate, formatDateLoose, today } from '../../shared/core/dates.ts'
import type { Measure } from '../../app/model.ts'
import { metricsOf, RECENT_LIMIT, recentWithFocus, resolveMetric, series } from './health.ts'
import { measureText, METRICS, metricLabel, metricUnit } from './labels.ts'
import { Chart } from './Chart.tsx'
import { ScrollRow } from './ScrollRow.tsx'
import { Fold } from '../../shared/ui/Fold.tsx'
import { TodayButton } from '../../ui/TodayButton.tsx'
import type { Health, MeasureDraft } from './useHealth.ts'

/**
 * Измерения: ряд с графиком и ввод.
 *
 * Метрика — свободная строка в модели, но в интерфейсе предлагаются три
 * готовые: вес, давление, рост. Своя заводится чипом «+ своя»: до него
 * завести её было нечем вовсе, хотя модель это позволяла. Дальше она
 * стоит в переключателе сама, как только записано первое значение.
 *
 * `focusId` — запись, к которой пришли из ленты (Р-97): выбрана её метрика,
 * она открыта на правку. Id не измерения — блок его не замечает.
 */
export function Measures({ health, focusId }: { health: Health; focusId: string | null }) {
  const focus = health.measures.find((each) => each.id === focusId) ?? null
  const known = metricsOf(health.measures)
  // Готовые метрики стоят первыми всегда, даже пустые: без этого не
  // с чего начать, когда измерений ещё нет ни одного.
  const all = [...METRICS.map((each) => each.key), ...known.filter((each) => !isPreset(each))]
  const [metric, setMetric] = useState<string>(focus?.metric ?? all[0] ?? 'weight')
  const [naming, setNaming] = useState(false)
  const [newName, setNewName] = useState('')
  /** Какая из последних записей открыта на правку. */
  const [editing, setEditing] = useState<string | null>(focus?.id ?? null)
  /** Цель перехода, пока её правка не закрыта: к ней прокрутить, ради неё развернуть блок. */
  const [target, setTarget] = useState<string | null>(focus?.id ?? null)
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
  const { recent, apart } = recentWithFocus(
    health.measures.filter((measure) => measure.metric === metric),
    focus?.id ?? null,
  )

  function done() {
    setEditing(null)
    setTarget(null)
  }

  function rows(list: readonly Measure[]) {
    return list.map((measure) =>
      measure.id === editing ? (
        <ScrollRow key={measure.id} scroll={measure.id === target}>
          <td colSpan={3}>
            <MeasureForm metric={measure.metric} health={health} measure={measure} onDone={done} />
          </td>
        </ScrollRow>
      ) : (
        // Тап по записи — правка, как у тренировки и эпизода.
        <Fragment key={measure.id}>
          <tr className="tap" onClick={() => setEditing(measure.id)}>
            <td>{formatDateLoose(measure.date)}</td>
            <td className="num">{measureText(measure.metric, measure.value, measure.value2)}</td>
            <td className="num">
              <button
                type="button"
                className="link-btn"
                onClick={(event) => {
                  event.stopPropagation()
                  if (!window.confirm(`Удалить измерение ${formatDateLoose(measure.date)}?`)) return
                  void health.removeMeasure(measure.id)
                }}
                aria-label={`Удалить измерение ${formatDateLoose(measure.date)}`}
              >
                ×
              </button>
            </td>
          </tr>
          {/* Заметка правится — значит, должна быть видна. */}
          {measure.note && (
            <tr className="tap" onClick={() => setEditing(measure.id)}>
              <td colSpan={3} className="muted">
                {measure.note}
              </td>
            </tr>
          )}
        </Fragment>
      ),
    )
  }

  return (
    <Fold
      id="health:measures"
      title="Измерения"
      summary={health.measures.length}
      reveal={target !== null}
    >

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

      {/* Запись из ленты старше последних — отдельно над ними (Р-97). */}
      {apart && (
        <>
          <p className="muted">Из ленты — старше последних {RECENT_LIMIT}:</p>
          <table className="stats">
            <tbody>{rows([apart])}</tbody>
          </table>
        </>
      )}

      {recent.length > 0 && (
        <table className="stats">
          <tbody>{rows(recent)}</tbody>
        </table>
      )}
    </Fold>
  )
}

function isPreset(metric: string): boolean {
  return METRICS.some((each) => each.key === metric)
}

/**
 * У давления два числа, у остальных одно. Форма это знает, модель — нет.
 *
 * Одна на ввод и правку. При правке заполнена значениями записи, и к ним
 * добавляется заметка — ввод строкой её не спрашивает, а у перенесённых
 * из дневников измерений она бывает. Метрика при правке не меняется.
 */
function MeasureForm({
  metric,
  health,
  measure,
  onDone,
}: {
  metric: string
  health: Health
  measure?: Measure
  onDone?: () => void
}) {
  const [date, setDate] = useState(measure?.date ?? today())
  const [value, setValue] = useState(measure === undefined ? '' : String(measure.value))
  const [second, setSecond] = useState(measure?.value2 === undefined ? '' : String(measure.value2))
  const [note, setNote] = useState(measure?.note ?? '')

  // Своя метрика пары не имеет: у неё в списке нет записи вовсе.
  const paired = typeof METRICS.find((each) => each.key === metric)?.second === 'string'

  function submit(event: FormEvent) {
    event.preventDefault()
    const first = Number(value.replace(',', '.'))
    if (!value.trim() || !Number.isFinite(first)) return

    const other = Number(second.replace(',', '.'))
    const hasSecond = paired && second.trim() !== '' && Number.isFinite(other)

    const draft: MeasureDraft = {
      metric,
      date,
      value: first,
      ...(hasSecond ? { value2: other } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    }

    if (measure) {
      void health.updateMeasure(measure.id, draft)
      onDone?.()
      return
    }
    void health.addMeasure(draft)
    setValue('')
    setSecond('')
  }

  const fields = (
    <>
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
    </>
  )

  if (!measure) {
    return (
      <form className="row row--wrap" onSubmit={submit}>
        {fields}
        <button type="submit" className="btn">
          Записать
        </button>
      </form>
    )
  }

  return (
    <form className="form block" onSubmit={submit}>
      <div className="row row--wrap">{fields}</div>

      <label className="field">
        <span>Заметка</span>
        <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>

      <div className="form__actions">
        <button type="button" className="btn" onClick={onDone}>
          Отмена
        </button>
        <button type="submit" className="btn btn--primary">
          Сохранить
        </button>
      </div>
    </form>
  )
}
