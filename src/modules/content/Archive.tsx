import { useState } from 'react'
import {
  filterEntries,
  groupByMonth,
  sortEntries,
  yearsOf,
  type EntryStatus,
  type EntryType,
} from './content.ts'
import { entriesText, monthHeading, statusLabel, TYPES } from './labels.ts'
import { EntryCard } from './EntryCard.tsx'
import type { Content } from './useContent.ts'
import type { ContentEntry } from '../../core/model.ts'

/** Что показывается, когда год не выбран. */
const ALL_YEARS = 'всё время'

/**
 * Статусы отдельными переключателями.
 *
 * «Смотрю» сюда не входит: активное стоит блоком наверху экрана, и второе
 * место для него развело бы одно и то же по двум спискам. Остальные три —
 * три разных вопроса: что посмотрел, что бросил, что собираюсь.
 */
const TABS: EntryStatus[] = ['done', 'dropped', 'planned']

/**
 * Список записей: статус, тип, год, поиск — и разбивка по месяцам.
 *
 * Месяцы заголовками, как было в Obsidian: там дневник и вёлся разделами
 * по месяцам, дня не было ни у одной записи. Заголовки показывают год
 * лентой целиком, а не по одному месяцу за тап.
 */
export function Archive({ entries, content }: { entries: ContentEntry[]; content: Content }) {
  const [status, setStatus] = useState<EntryStatus>('done')
  const [type, setType] = useState<EntryType | null>(null)
  const [year, setYear] = useState<string>(ALL_YEARS)
  const [query, setQuery] = useState('')

  const years = yearsOf(entries)
  // У намерений даты нет по определению (Р-21), и выбор года над ними —
  // переключатель, который ничего не переключает.
  const dated = status !== 'planned'

  const shown = sortEntries(
    filterEntries(entries, {
      status,
      type,
      query,
      year: dated && year !== ALL_YEARS ? year : null,
    }),
  )
  const groups = groupByMonth(shown)
  const inStatus = entries.filter((entry) => entry.status === status).length

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
            onClick={() => setStatus(each)}
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

      {dated && years.length > 1 && (
        <div className="chips">
          {[...years, ALL_YEARS].map((each) => (
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
          <p className="muted">
            {shown.length === inStatus
              ? entriesText(shown.length)
              : `Показано ${shown.length} из ${inStatus}.`}
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
                  <EntryCard key={entry.id} entry={entry} content={content} />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
