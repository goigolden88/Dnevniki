/**
 * Тексты и подписи модуля здоровья.
 *
 * Отделены от `health.ts` намеренно, как и у циклов: там расчёт, здесь
 * подача. Расчёт не знает, что его читают глазами, и русских строк
 * не содержит.
 */

import { days, formatDate, formatDateLoose, plural } from '../../core/dates.ts'
import type { Episode, Tag } from '../../core/model.ts'
import type { EpisodeState, HealthStats } from './health.ts'

/** Метрики, которые предлагаются в форме. Поле в модели — свободная строка. */
export const METRICS = [
  { key: 'weight', label: 'Вес', unit: 'кг', second: null },
  { key: 'bp', label: 'Давление', unit: '', second: 'диастолическое' },
  { key: 'height', label: 'Рост', unit: 'см', second: null },
] as const

export function metricLabel(metric: string): string {
  return METRICS.find((each) => each.key === metric)?.label ?? metric
}

export function metricUnit(metric: string): string {
  return METRICS.find((each) => each.key === metric)?.unit ?? ''
}

/**
 * «40 мин · 7.5 км» — длительность и дистанция тренировки.
 * Ноль не показывается: его не записывали, а «0 км» у зарядки — неправда.
 */
export function sessionText(minutes: number, km: number): string {
  const parts: string[] = []
  if (minutes > 0) parts.push(`${minutes} мин`)
  if (km > 0) parts.push(`${km} км`)
  return parts.join(' · ')
}

/** Значение измерения с единицей: «75 кг», «120/80». */
export function measureText(metric: string, value: number, value2?: number): string {
  if (value2 !== undefined) return `${value}/${value2}`
  const unit = metricUnit(metric)
  return unit ? `${value} ${unit}` : String(value)
}

const SOURCE: Record<Episode['source'], string> = {
  self: 'сам',
  doctor: 'врач',
}

export function sourceText(source: Episode['source']): string {
  return SOURCE[source]
}

/**
 * Строка под названием эпизода.
 *
 * У открытого — сколько дней идёт: это то, что хочется знать про болезнь,
 * которая длится. У закрытого — сколько длилась и когда была.
 */
export function episodeText(state: EpisodeState): string {
  const { episode, durationDays } = state
  if (durationDays === null) return `дата не разобрана: «${episode.start}»`

  if (state.open) {
    const which = durationDays === 1 ? 'первый день' : `${durationDays}-й день`
    return `идёт ${which}, с ${formatDate(episode.start)}`
  }

  const finish = episode.end === null ? '' : ` — ${formatDateLoose(episode.end)}`
  return `${days(durationDays)} · ${formatDate(episode.start)}${finish}`
}

/** Имена симптомов по их идентификаторам, в порядке записи. */
export function symptomNames(ids: string[], tags: Tag[]): string[] {
  const byId = new Map(tags.map((tag) => [tag.id, tag.name]))
  // Неизвестный id — это тег, приехавший с другого устройства раньше
  // своего эпизода. Показать что-то надо, потерять симптом нельзя.
  return ids.map((id) => byId.get(id) ?? '?')
}

/**
 * Одна строка про год: сколько раз болел и сколько это заняло.
 *
 * Пусто, когда эпизодов нет: «0 эпизодов, средняя длительность —»
 * не сообщает ничего.
 */
export function statsText(stats: HealthStats): string {
  if (stats.count === 0) return ''

  const times = `${stats.count} ${plural(stats.count, ['эпизод', 'эпизода', 'эпизодов'])}`
  if (stats.averageDays === null) return `${times}, ни один пока не закрыт`

  const closed = stats.closed < stats.count ? ` (закрыто ${stats.closed})` : ''
  return `${times}${closed} · в среднем по ${days(stats.averageDays)}`
}

/**
 * Сколько идёт нынешняя здоровая полоса.
 *
 * Главное число блока, и до 10.09.2026 его тут не было вовсе. Без него
 * год без единой болезни не отражался на экране никак: промежутки
 * считаются только между эпизодами, а последнюю полосу закрыть нечем —
 * следующего эпизода нет. Выходило, что экран показывает «в среднем
 * 15,7 дня без болезни» человеку, который не болел год.
 */
export function healthyText(stats: HealthStats): string {
  if (stats.healthyDays === null || stats.healthySince === null) return ''
  if (stats.healthyDays === 0) return 'Выздоровел сегодня'
  return `Не болел ${days(stats.healthyDays)} — с ${formatDate(stats.healthySince)}`
}

/**
 * Промежуток между эпизодами. Отдельной строкой, потому что отвечает
 * на другой вопрос: не «сколько болел», а «сколько проходило между».
 *
 * Число промежутков называется всегда — по тому же правилу, по которому
 * сумма трат идёт с числом отметок (Р-38). Среднее по двум наблюдениям
 * обязано сообщать, что их два, иначе оно выдаёт себя за закономерность.
 */
export function gapText(stats: HealthStats): string {
  if (stats.averageGap === null) return ''
  const count = stats.gaps.length
  const by = plural(count, ['промежутку', 'промежуткам', 'промежуткам'])
  return `Между эпизодами проходило в среднем ${days(stats.averageGap)} — по ${count} ${by}`
}
