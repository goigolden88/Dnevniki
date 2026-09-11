import { plural } from '../../core/dates.ts'
import type { Tag } from '../../core/model.ts'
import { RenameField } from '../../ui/RenameField.tsx'
import { metricsOf } from './health.ts'
import { METRICS } from './labels.ts'
import { useHealth, type Health } from './useHealth.ts'

/**
 * Названия здоровья в «Настройках» (Р-59): симптомы, виды тренировок,
 * свои метрики.
 *
 * Заводятся они по-прежнему словом прямо в форме — здесь только
 * переименование. В уже занятое название — слияние: так «насморк»
 * и «заложенность носа» становятся одним симптомом.
 */
export function HealthNames() {
  const health = useHealth()
  if (health.status !== 'ready') return null

  const symptoms = sorted(health.tags.filter((tag) => tag.scope === 'symptom'))
  const activities = sorted(health.tags.filter((tag) => tag.scope === 'activity'))
  const metrics = metricsOf(health.measures).filter((metric) => !METRICS.some((each) => each.key === metric))

  const symptomUses = (tag: Tag) =>
    health.episodes.filter((state) => state.episode.symptoms.includes(tag.id)).length
  const activityUses = (tag: Tag) => health.sessions.filter((session) => session.activity === tag.id).length
  const metricUses = (metric: string) => health.measures.filter((measure) => measure.metric === metric).length

  return (
    <>
      <h3>Симптомы</h3>
      {symptoms.length === 0 ? (
        <p className="muted">Симптомов пока нет — они заводятся в форме эпизода.</p>
      ) : (
        symptoms.map((tag) => (
          <TagRow
            key={`${tag.id}:${tag.name}`}
            tag={tag}
            uses={`${symptomUses(tag)} ${plural(symptomUses(tag), ['эпизод', 'эпизода', 'эпизодов'])}`}
            siblings={symptoms}
            health={health}
          />
        ))
      )}

      <h3>Виды тренировок</h3>
      {activities.length === 0 ? (
        <p className="muted">Видов пока нет — они заводятся в форме тренировки.</p>
      ) : (
        activities.map((tag) => (
          <TagRow
            key={`${tag.id}:${tag.name}`}
            tag={tag}
            uses={`${activityUses(tag)} ${plural(activityUses(tag), ['раз', 'раза', 'раз'])}`}
            siblings={activities}
            health={health}
          />
        ))
      )}

      {/* Встроенные — вес, рост, давление — не переименовываются: их
          подписи в коде. Здесь только вписанные руками. */}
      {metrics.length > 0 && (
        <>
          <h3>Свои метрики</h3>
          {metrics.map((metric) => (
            <div className="row row--wrap" key={metric}>
              <RenameField
                value={metric}
                label={`Название метрики «${metric}»`}
                onCommit={(next) => {
                  void health.renameMetric(metric, next)
                  return true
                }}
              />
              <span className="muted">
                {metricUses(metric)} {plural(metricUses(metric), ['измерение', 'измерения', 'измерений'])}
              </span>
            </div>
          ))}
        </>
      )}
    </>
  )
}

function sorted(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

function TagRow({
  tag,
  uses,
  siblings,
  health,
}: {
  tag: Tag
  uses: string
  siblings: Tag[]
  health: Health
}) {
  return (
    <div className="row row--wrap">
      <RenameField
        value={tag.name}
        label={`Название «${tag.name}»`}
        onCommit={(next) => {
          const other = siblings.find(
            (each) => each.id !== tag.id && each.name.trim().toLowerCase() === next.toLowerCase(),
          )
          if (other && !window.confirm(`Слить «${tag.name}» с «${other.name}»? Записи перейдут к «${other.name}».`)) {
            return false
          }
          void health.renameTag(tag.id, next)
          return true
        }}
      />
      <span className="muted">{uses}</span>
    </div>
  )
}
