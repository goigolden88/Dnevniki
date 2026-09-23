/**
 * Конфиг «Дневников» для ядра `FamilyCore` (Р-81).
 *
 * Всё, чем «Дневники» отличаются для ядра, — одним объектом. Значения
 * перенесены буквально из прежних `core/db.ts`, `core/layout.ts`
 * и `core/importing.ts`: имя базы, хранилища, `V1_STORES`, индексы,
 * раскладка и формат импорта лежат на устройствах и в репозитории данных,
 * и перевод на ядро их не меняет. Проверка — `config.test.ts`.
 */

import type { AppConfig } from '../shared/core/model.ts'
import { migrations, SCHEMA_VERSION, SYNCED_STORES, type StoreRecord } from './model.ts'

export const config: AppConfig<StoreRecord> = {
  name: 'Дневники',

  // Все приложения семьи живут на одном origin goigolden88.github.io,
  // а IndexedDB общая на origin и различается только именем базы.
  // Не меняется никогда: на устройствах лежит база под этим именем.
  dbName: 'dnevniki',

  schemaVersion: SCHEMA_VERSION,
  migrations,
  stores: SYNCED_STORES,

  // Раскладка версии 1 — заморожена. `categories` здесь нет и не будет:
  // его заводит миграция 2, и свежая база доезжает до текущей теми же
  // шагами, что и база установленной копии (Р-59).
  v1Stores: ['items', 'tags', 'templates', 'cycleEvents', 'episodes', 'measures', 'sessions', 'content'],

  // Сверх `updatedAt`. Заморожены вместе с `v1Stores` (Я-08 «FamilyCore»):
  // новый индекс — только шагом миграции. Строка `categories` держит
  // таблицу полной — его индексы заводит миграция 2.
  indexes: {
    items: [],
    categories: [],
    tags: [],
    templates: [],
    cycleEvents: ['date', 'itemId'], // itemId — история позиции, Этап 1
    episodes: ['start'],
    measures: ['date', 'metric'],
    sessions: ['date'],
    content: ['start'],
  },

  // 02-Архитектура, «Раскладка данных в репозитории». Нарезка по годам
  // (Р-08) не меняется никогда (Я-09 «FamilyCore»): папки и даты прежние,
  // иначе файлы в репозитории данных стали бы чужими. Без года — undated (Р-34).
  places: {
    items: { split: 'none', path: 'items.json' },
    categories: { split: 'none', path: 'categories.json' },
    tags: { split: 'none', path: 'tags.json' },
    templates: { split: 'none', path: 'templates.json' },
    cycleEvents: { split: 'year', dir: 'cycles', dateOf: (event) => event.date },
    episodes: { split: 'none', path: 'health/episodes.json' },
    measures: { split: 'none', path: 'health/measures.json' },
    sessions: { split: 'none', path: 'health/sessions.json' },
    content: { split: 'year', dir: 'content', dateOf: (entry) => entry.start },
  },

  // Строки README данных — его кладёт синхронизация, только если README
  // в репозитории нет (Р-86); лежащий не переписывается.
  storeNotes: {
    items: 'позиции циклов: что и как часто обслуживается',
    categories: 'категории позиций циклов',
    tags: 'теги симптомов и видов активности',
    templates: 'быстрые кнопки отметок',
    cycleEvents: 'отметки обслуживания — по году отметки',
    episodes: 'эпизоды болезней',
    measures: 'измерения: вес, давление, рост',
    sessions: 'тренировки',
    // Строку `content/undated.json` ядро допишет само: там список «к просмотру».
    content: 'аниме, сериалы, фильмы, игры, книги, курсы — по году начала',
  },

  importFormat: 'dnevniki-import',

  // Свои правила промпта — 1–4; общие ядро допишет следом. Правила про поля
  // живут в описаниях разделов `modules/<имя>/import.ts`, а не здесь.
  promptRules: [
    'Ничего не выдумывай. Чего нет в моих данных — не пиши: необязательное поле опусти, ' +
      'запись без обязательного поля не пиши вовсе, а назови в списке после JSON.',
    'Даты — ГГГГ-ММ-ДД. Любой вид (24.01.26, 20-02-2026, «3 марта») приводи к нему. Где это ' +
      'разрешено и известен только месяц — например, месяц стоит заголовком раздела, — пиши ГГГГ-ММ, ' +
      'без выдуманного числа.',
    // Шкала оценок — не здесь, а в описании поля контента: её пределы
    // живут в модуле, а ядро про модули не знает (Р-65).
    'Статусы из других сервисов: смотрю, читаю, играю, прохожу, отложено → "active"; просмотрено, ' +
      'прочитано, пройдено → "done"; брошено → "dropped"; запланировано, хочу посмотреть → "planned".',
    'Скриншоты списков — Шикимори, MyAnimeList, Кинопоиск, Letterboxd, Steam и похожие: бери ' +
      'название, тип, статус, оценку и даты, если они видны.',
  ],

  about: {
    data: 'циклическое обслуживание, здоровье, потребление контента',
    privacy: 'внутри история болезней и всё остальное, что человек пишет в дневник о себе',
    sources: 'заметки, таблицы или скриншоты из других сервисов',
  },
}
