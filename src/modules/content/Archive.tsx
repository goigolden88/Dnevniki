import { useState } from 'react'
import { MONTHS_SHORT, today } from '../../core/dates.ts'
import {
  filterEntries,
  groupByMonth,
  hasUndated,
  keepAvailable,
  monthsOf,
  sortEntries,
  startOf,
  yearsOf,
  type EntryStatus,
  type EntryType,
} from './content.ts'
import { entriesText, monthHeading, periodText, statusLabel, TYPES } from './labels.ts'
import { EntryCard } from './EntryCard.tsx'
import type { Content } from './useContent.ts'
import type { ContentEntry } from '../../core/model.ts'

/** Все годы разом. */
const ALL_YEARS = 'всё время'

/**
 * Записи, у которых даты начала нет или она не читается (Р-34).
 *
 * Отдельным выбором рядом с годами, а не спрятанное внутри них: отбор
 * по году такую запись отбрасывает, и без этого выбора она стала бы
 * невидимой ровно тогда, когда её надо найти и поправить. Появляется,
 * только если такие записи есть.
 */
const UNDATED = 'без даты'

/** Что выбрано в периоде. Год и месяцы связаны, и живут они вместе. */
type Period = {
  /** `YYYY`, `ALL_YEARS` либо `UNDATED`. */
  year: string
  /** Месяцы 1..12. Пусто — все месяцы выбранного года. */
  months: number[]
}

/**
 * Статусы отдельными переключателями.
 *
 * «Смотрю» сюда не входит: активное стоит блоком наверху экрана, и второе
 * место для него развело бы одно и то же по двум спискам. Остальные три —
 * три разных вопроса: что посмотрел, что бросил, что собираюсь.
 */
const TABS: EntryStatus[] = ['done', 'dropped', 'planned']

/**
 * Список записей: статус, тип, период, поиск — и разбивка по месяцам.
 *
 * Период устроен слоями (Р-47): сверху три готовых ответа — всё, этот год,
 * этот месяц, — а под ними, если развернуть, выбор года и месяцев вручную.
 * Месяцы предлагаются только те, что есть в выбранном году: иначе при
 * нескольких годах «мар» означал бы март любого из них.
 *
 * Месяцы заодно остаются заголовками в самом списке — так дневник и вёлся
 * в Obsidian. Фильтр отвечает на «покажи апрель», заголовки — на «что было
 * за год». Вопросы разные (Р-45).
 */
export function Archive({
  entries,
  content,
  focus = null,
}: {
  entries: ContentEntry[]
  content: Content
  /** Запись, к которой пришли из ленты (Р-56). Активная живёт выше, не здесь. */
  focus?: ContentEntry | null
}) {
  const years = yearsOf(entries)
  const thisYear = today().slice(0, 4)
  const thisMonth = Number(today().slice(5, 7))
  const target = focus !== null && focus.status !== 'active' ? focus : null

  const [status, setStatus] = useState<EntryStatus>(target ? target.status : 'done')
  const [type, setType] = useState<EntryType | null>(null)
  // Свежий год по умолчанию — то же, что в «Итогах». Иначе при появлении
  // второго года экран открывался бы сразу обоими, и чем дальше, тем длиннее.
  // Пришли к записи — год её, иначе она окажется за фильтром.
  const [period, setPeriod] = useState<Period>(() => {
    const fallback = { year: years[0] ?? ALL_YEARS, months: [] }
    if (!target || target.status === 'planned') return fallback
    const start = startOf(target)
    return start === null ? { year: UNDATED, months: [] } : { year: start.slice(0, 4), months: [] }
  })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  // У намерений даты нет по определению (Р-21), как и у записей с испорченной
  // датой. Выбор периода над ними — переключатель, которому нечего переключать.
  const dated = status !== 'planned' && period.year !== UNDATED

  // Месяцы считаются по статусу и году, но не по типу: иначе ряд чипов
  // перестраивался бы под пальцем при каждом переключении соседнего фильтра.
  const inStatusEntries = entries.filter((entry) => entry.status === status)
  const months = monthsOf(inStatusEntries, period.year === ALL_YEARS ? null : period.year)

  const shown = sortEntries(
    filterEntries(entries, {
      status,
      type,
      query,
      year: dated && period.year !== ALL_YEARS ? period.year : null,
      months: dated ? period.months : [],
      undated: status !== 'planned' && period.year === UNDATED,
    }),
  )
  const groups = groupByMonth(shown)
  const inStatus = inStatusEntries.length

  /** Смена года: выбранные месяцы не сбрасываются, а сужаются до доступных. */
  function pickYear(year: string) {
    const scope = year === ALL_YEARS || year === UNDATED ? null : year
    setPeriod({ year, months: keepAvailable(period.months, monthsOf(inStatusEntries, scope)) })
  }

  function toggleMonth(month: number) {
    setPeriod({
      year: period.year,
      months: period.months.includes(month)
        ? period.months.filter((each) => each !== month)
        : [...period.months, month],
    })
  }

  function pickStatus(next: EntryStatus) {
    setStatus(next)
    // По той же причине, по которой месяцы сужаются при смене года:
    // у брошенного апреля может не быть вовсе.
    const scope = period.year === ALL_YEARS || period.year === UNDATED ? null : period.year
    const available = monthsOf(
      entries.filter((entry) => entry.status === next),
      scope,
    )
    setPeriod({ year: period.year, months: keepAvailable(period.months, available) })
  }

  const presets: { label: string; period: Period }[] = [
    { label: 'Всё', period: { year: ALL_YEARS, months: [] } },
    { label: 'Этот год', period: { year: thisYear, months: [] } },
    { label: 'Этот месяц', period: { year: thisYear, months: [thisMonth] } },
  ]

  function isPreset(each: Period): boolean {
    return (
      each.year === period.year &&
      each.months.length === period.months.length &&
      each.months.every((month) => period.months.includes(month))
    )
  }

  const periods = [...years, ...(hasUndated(inStatusEntries) ? [UNDATED] : []), ALL_YEARS]
  // Разворачивать нечего, когда и год один, и месяцев меньше двух.
  const adjustable = periods.length > 2 || months.length > 1

  return (
    <section className="block">
      <h2>Записи</h2>

      <div className="chips">
        {TABS.map((each) => (
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

      <div className="chips">
        <button
          type="button"
          className={type === null ? 'chip chip--on' : 'chip'}
          aria-pressed={type === null}
          onClick={() => setType(null)}
        >
          Всё
        </button>
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

      {status !== 'planned' && adjustable && (
        <>
          <div className="chips">
            {presets.map((each) => (
              <button
                key={each.label}
                type="button"
                className={isPreset(each.period) ? 'chip chip--on' : 'chip'}
                aria-pressed={isPreset(each.period)}
                onClick={() => setPeriod(each.period)}
              >
                {each.label}
              </button>
            ))}
            <button
              type="button"
              className={open ? 'chip chip--on' : 'chip'}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? 'Свернуть' : 'Выбрать период'}
            </button>
          </div>

          {open && (
            <>
              {periods.length > 2 && (
                <div className="chips chips--nested">
                  {periods.map((each) => (
                    <button
                      key={each}
                      type="button"
                      className={each === period.year ? 'chip chip--on' : 'chip'}
                      aria-pressed={each === period.year}
                      onClick={() => pickYear(each)}
                    >
                      {each === ALL_YEARS ? 'Все годы' : each}
                    </button>
                  ))}
                </div>
              )}

              {dated && months.length > 1 && (
                <div className="chips chips--nested">
                  <button
                    type="button"
                    className={period.months.length === 0 ? 'chip chip--on' : 'chip'}
                    aria-pressed={period.months.length === 0}
                    onClick={() => setPeriod({ year: period.year, months: [] })}
                  >
                    Все месяцы
                  </button>
                  {months.map((each) => (
                    <button
                      key={each}
                      type="button"
                      className={period.months.includes(each) ? 'chip chip--on' : 'chip'}
                      aria-pressed={period.months.includes(each)}
                      onClick={() => toggleMonth(each)}
                    >
                      {MONTHS_SHORT[each - 1]}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <input
        className="search"
        value={query}
        placeholder="Поиск по названию"
        onChange={(event) => setQuery(event.target.value)}
      />

      {shown.length === 0 ? (
        <p className="muted">
          {inStatus === 0
            ? `Пока ничего с меткой «${statusLabel(status)}».`
            : 'Под фильтры ничего не подошло.'}
        </p>
      ) : (
        <>
          {/* Период называется словами всегда, даже когда ряды свёрнуты:
              иначе короткий список молча выдавал бы себя за весь. */}
          <p className="muted">
            {shown.length === inStatus
              ? entriesText(shown.length)
              : `Показано ${shown.length} из ${inStatus}`}
            {dated &&
              ` · ${periodText(period.year === ALL_YEARS ? null : period.year, period.months)}`}
          </p>

          {groups.map((group) => (
            <div className="month-group" key={group.month ?? 'нет даты'}>
              {/* Заголовок молчит, когда группа одна и она без даты:
                  подписывать «Без даты» весь список намерений незачем. */}
              {!(groups.length === 1 && group.month === null) && (
                <h3 className="month-group__head">
                  {monthHeading(group.month)}
                  <span className="muted"> · {group.entries.length}</span>
                </h3>
              )}

              <ul className="cycles">
                {group.entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    content={content}
                    focused={entry.id === target?.id}
                  />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
