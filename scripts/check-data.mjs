/**
 * Проверка на копии настоящих данных (Р-72):
 *
 *   npm run check:data -- dnevniki-2026-09-11.json
 *
 * Копия — «Настройки» → «Экспорт и импорт» → «Сохранить в файл» или
 * «Поделиться» (.txt — то же самое). Держать её в корне репозитория можно:
 * `.gitignore` прячет `dnevniki-*.json` и `dnevniki-*.txt`.
 *
 * Сама проверка — `src/realdata.test.ts`: там есть типы и модули
 * приложения. Этот скрипт только передаёт ей путь и возвращает её код выхода.
 * Экраны на тех же данных — `npm run smoke -- --data <файл>`.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const given = process.argv[2]
if (!given) {
  console.error('Укажи файл-копию: npm run check:data -- dnevniki-2026-09-11.json')
  process.exit(1)
}

// npm запускает скрипт из корня, а путь человек пишет от того места,
// где набрал команду.
const file = resolve(process.env.INIT_CWD ?? process.cwd(), given)
if (!existsSync(file)) {
  console.error(`Файла нет: ${file}`)
  process.exit(1)
}

// Отчёт — числа по хранилищам и шаги миграции. Vitest глотает вывод
// прошедшего теста, поэтому проверка пишет отчёт файлом, а печатаем мы.
// В нём только числа, записей нет.
const report = join(tmpdir(), `dnevniki-check-${process.pid}.txt`)

const result = spawnSync(
  process.execPath,
  [join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', 'src/realdata.test.ts'],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, DNEVNIKI_DATA: file, DNEVNIKI_REPORT: report } },
)

if (existsSync(report)) {
  console.log(readFileSync(report, 'utf8'))
  rmSync(report, { force: true })
}

process.exit(result.status ?? 1)
