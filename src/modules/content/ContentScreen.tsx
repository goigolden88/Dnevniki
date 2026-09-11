import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Fold } from '../../ui/Fold.tsx'
import { watching } from './content.ts'
import { Archive } from './Archive.tsx'
import { ContentStats } from './ContentStats.tsx'
import { EntryCard } from './EntryCard.tsx'
import { EntryForm } from './EntryForm.tsx'
import { currentMonth, useContent, type Content } from './useContent.ts'

/**
 * Экран контента: что смотрю, что посмотрел, что собираюсь.
 *
 * Порядок блоков тот же, что в здоровье, и по той же причине: сверху то,
 * с чем работают каждый день. Здесь это «смотрю сейчас» — досмотрел
 * и поставил оценку, единственное регулярное действие модуля.
 *
 * Всё остальное — просмотренное, брошенное и намерения — живёт одним
 * списком с переключателем статуса. Три отдельных блока разъехались бы
 * по экрану, а вопросы у них однотипные: что это было и когда.
 *
 * Отдельного экрана записи нет: карточка разворачивается на месте.
 * Записей под сотню, и уход на свой маршрут ради двух строк комментария
 * стоил бы дороже, чем даёт.
 */
export function ContentScreen() {
  const content = useContent()
  // Запись, к которой пришли из ленты или с «Сейчас» (Р-56): развернуть
  // её и прокрутить к ней. Список сам подстраивается под её статус и год.
  const [params] = useSearchParams()
  const focusId = params.get('open')

  if (content.status === 'loading') return <p className="muted">Открываю базу…</p>
  if (content.status === 'failed') {
    return <p className="error">База не открылась: {content.error}</p>
  }

  const active = watching(content.entries)
  const focus = focusId === null ? null : content.entryOf(focusId)

  return (
    <>
      <header className="screen-head">
        <h1>Контент</h1>
      </header>

      {content.error && <p className="error">Не сохранилось: {content.error}</p>}

      {active.length > 0 && (
        <Fold
          id="content:watching"
          title="Смотрю сейчас"
          summary={active.length}
          reveal={focus?.status === 'active'}
        >
          <ul className="cycles">
            {active.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                content={content}
                focused={entry.id === focus?.id}
              />
            ))}
          </ul>
        </Fold>
      )}

      <NewEntry content={content} />

      <ContentStats entries={content.entries} />

      {/* Ключ по записи: переход к другой записи заново выставляет фильтры. */}
      <Archive key={focus?.id ?? ''} entries={content.entries} content={content} focus={focus} />
    </>
  )
}

/**
 * Заведение записи.
 *
 * По умолчанию — то, что начинают смотреть сейчас: статус «смотрю»,
 * месяц текущий. Это самый частый случай; «к просмотру» и «просмотрено»
 * задним числом переключаются одним тапом в самой форме.
 */
function NewEntry({ content }: { content: Content }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button type="button" className="btn btn--wide" onClick={() => setOpen(true)}>
        Добавить запись
      </button>
    )
  }

  return (
    <EntryForm
      draft={{
        type: 'anime',
        title: '',
        start: currentMonth(),
        end: null,
        status: 'active',
        score: null,
      }}
      submitLabel="Добавить"
      onCancel={() => setOpen(false)}
      onSubmit={async (draft) => {
        await content.addEntry(draft)
        setOpen(false)
      }}
    />
  )
}
