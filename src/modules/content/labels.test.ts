import { describe, expect, it } from 'vitest'
import {
  averageText,
  entriesText,
  entryText,
  formatScore,
  monthHeading,
  peakMonthText,
  startedText,
  statusLabel,
  typeCountText,
  typeLabel,
} from './labels.ts'
import { contentStats } from './content.ts'
import type { ContentEntry } from '../../core/model.ts'

const T = '2026-09-07T00:00:00.000Z'

function entry(over: Partial<ContentEntry> = {}): ContentEntry {
  return {
    id: 'c1',
    updatedAt: T,
    type: 'anime',
    title: 'Магическая битва 3',
    start: '2026-01',
    end: null,
    status: 'done',
    score: 7,
    ...over,
  }
}

describe('типы', () => {
  it('название типа по-русски', () => {
    expect(typeLabel('anime')).toBe('Аниме')
    expect(typeLabel('course')).toBe('Курс')
  })

  it('склоняет по числу', () => {
    expect(typeCountText({ type: 'series', count: 1 })).toBe('1 сериал')
    expect(typeCountText({ type: 'series', count: 3 })).toBe('3 сериала')
    expect(typeCountText({ type: 'series', count: 19 })).toBe('19 сериалов')
    expect(typeCountText({ type: 'game', count: 3 })).toBe('3 игры')
  })

  it('аниме не склоняется, и это не ошибка', () => {
    expect(typeCountText({ type: 'anime', count: 1 })).toBe('1 аниме')
    expect(typeCountText({ type: 'anime', count: 27 })).toBe('27 аниме')
  })
})

describe('статусы', () => {
  it('все четыре названы по-русски', () => {
    expect(statusLabel('planned')).toBe('к просмотру')
    expect(statusLabel('active')).toBe('смотрю')
    expect(statusLabel('done')).toBe('просмотрено')
    expect(statusLabel('dropped')).toBe('брошено')
  })
})

describe('formatScore', () => {
  it('целая оценка без хвоста, дробная с запятой', () => {
    expect(formatScore(7)).toBe('7')
    expect(formatScore(7.5)).toBe('7,5')
    expect(formatScore(6.4)).toBe('6,4')
  })
})

describe('entryText', () => {
  it('тип, месяц и оценка', () => {
    expect(entryText(entry())).toBe('аниме · январь 2026 · 7')
  })

  it('полный день показывается днём — Р-25', () => {
    expect(entryText(entry({ start: '2026-01-05' }))).toBe('аниме · 05.01.2026 · 7')
  })

  it('без оценки — без хвоста', () => {
    expect(entryText(entry({ status: 'active', score: null }))).toBe('аниме · январь 2026')
  })

  it('без даты — только тип: у «к просмотру» даты нет по определению', () => {
    expect(entryText(entry({ status: 'planned', start: null, score: null }))).toBe('аниме')
  })

  it('брошенное называется брошенным', () => {
    expect(entryText(entry({ status: 'dropped', score: 4 }))).toBe('аниме · январь 2026 · брошено · 4')
  })

  it('нечитаемая дата называется прямо, а не прячется', () => {
    const text = entryText(entry({ start: 'прошлой весной' }))
    expect(text).toContain('дата не разобрана')
    expect(text).toContain('прошлой весной')
  })
})

describe('startedText', () => {
  const stats = (entries: ContentEntry[]) => contentStats(entries, '2026')

  it('начато и закончено вместе', () => {
    const text = startedText(
      stats([
        entry({ id: '1', status: 'done' }),
        entry({ id: '2', status: 'done' }),
        entry({ id: '3', status: 'active', score: null }),
      ]),
    )
    expect(text).toBe('Начато 3 · закончено 2 · смотрю 1')
  })

  it('брошенное называется отдельно', () => {
    const text = startedText(
      stats([entry({ id: '1', status: 'done' }), entry({ id: '2', status: 'dropped' })]),
    )
    expect(text).toBe('Начато 2 · закончено 2 · из них брошено 1')
  })

  it('нулевые части не показываются', () => {
    expect(startedText(stats([entry({ status: 'done' })]))).toBe('Начато 1 · закончено 1')
  })

  it('пусто, когда за период ничего не начато', () => {
    expect(startedText(stats([]))).toBe('')
  })
})

describe('averageText', () => {
  it('среднее идёт с числом записей — Р-38', () => {
    const text = averageText(
      contentStats(
        [
          entry({ id: '1', score: 7 }),
          entry({ id: '2', score: 6 }),
          entry({ id: '3', score: null, status: 'active' }),
        ],
        '2026',
      ),
    )
    expect(text).toBe('Средняя оценка 6,5 — по 2 записям из 3')
  })

  it('когда оценены все, второе число не дублируется', () => {
    const text = averageText(
      contentStats([entry({ id: '1', score: 7 }), entry({ id: '2', score: 6 })], '2026'),
    )
    expect(text).toBe('Средняя оценка 6,5 — по 2 записям')
  })

  it('одна запись склоняется правильно', () => {
    expect(averageText(contentStats([entry({ score: 8 })], '2026'))).toBe(
      'Средняя оценка 8 — по 1 записи',
    )
  })

  it('пусто, когда оценок нет вовсе', () => {
    expect(averageText(contentStats([entry({ score: null, status: 'active' })], '2026'))).toBe('')
  })
})

describe('entriesText', () => {
  it('склоняет записи по числу', () => {
    expect(entriesText(1)).toBe('1 запись')
    expect(entriesText(2)).toBe('2 записи')
    expect(entriesText(12)).toBe('12 записей')
  })
})

describe('monthHeading', () => {
  it('месяц с прописной — это заголовок, а не часть фразы', () => {
    expect(monthHeading('2026-01')).toBe('Январь 2026')
    expect(monthHeading('2026-09')).toBe('Сентябрь 2026')
  })

  it('записи без даты собираются под своим заголовком, а не прячутся', () => {
    expect(monthHeading(null)).toBe('Без даты')
  })
})

describe('peakMonthText', () => {
  const at = (months: string[]) =>
    contentStats(
      months.map((start, index) => entry({ id: String(index), start })),
      '2026',
    )

  it('называет месяц, в котором начато больше всего', () => {
    expect(peakMonthText(at(['2026-04', '2026-04', '2026-01']))).toBe(
      'Плотнее всего апрель — 2 записи',
    )
  })

  it('молчит при ничьей: «самый плотный» из двух одинаковых — неправда', () => {
    expect(peakMonthText(at(['2026-01', '2026-01', '2026-04', '2026-04']))).toBe('')
  })

  it('молчит, когда в каждом месяце по одной: сравнивать нечего', () => {
    expect(peakMonthText(at(['2026-01', '2026-04']))).toBe('')
  })

  it('молчит на пустом периоде', () => {
    expect(peakMonthText(at([]))).toBe('')
  })
})
