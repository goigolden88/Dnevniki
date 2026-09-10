/**
 * Прогон собранного приложения в настоящем браузере.
 *
 * Зачем он есть. Тестов React-экранов в проекте нет и не будет (Р-41):
 * приложение однопользовательское, сломанный экран виден в тот же день,
 * а тесты экранов — самый хрупкий их вид. Но «виден в тот же день» —
 * это день, потраченный на выяснение, вместо минуты до пуша. Этот скрипт
 * закрывает разрыв: он не проверяет вёрстку и не заменяет тесты расчёта,
 * он отвечает на один вопрос — открывается ли приложение и не падает ли
 * оно на обычном пути.
 *
 * За две сессии поймал три ошибки, которых тесты поймать не могли:
 * исключение на нечитаемой дате в списке, лишнее поле у своей метрики
 * и строку «не болел столько-то», спрятанную фильтром по году.
 *
 * Почему не Playwright. Ради одного сценария он тянет свой Chromium
 * и сотню мегабайт в devDependencies. Здесь — уже установленный браузер
 * и протокол отладки поверх WebSocket, встроенного в Node 22+.
 * Ни одной зависимости.
 *
 * Данные не трогает: браузер запускается с пустым временным профилем,
 * и IndexedDB у него свой. На базу в твоём обычном браузере он повлиять
 * не может.
 *
 * Запуск: `npm run smoke`. Собирает сам, поэтому проверяет ровно тот код,
 * который лежит в `src/` сейчас. Падает с ненулевым кодом, если браузер
 * сообщил об ошибке или проверка не сошлась.
 */

import { spawn } from 'node:child_process'
import { build, preview } from 'vite'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Адрес собранного приложения. Заполняется, когда поднимется сервер. */
let APP = ''

/** Свой порт отладки, чтобы не столкнуться с открытым браузером. */
const DEBUG_PORT = 9333

/**
 * Где искать браузер. Годится любой на Chromium: Chrome, Edge, Chromium.
 * Свой путь задаётся переменной CHROME_PATH.
 */
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// ─── Запуск ────────────────────────────────────────────────────────────────

function findBrowser() {
  const found = BROWSERS.find((path) => path && existsSync(path))
  if (!found) {
    throw new Error(
      'Браузер на Chromium не найден. Укажите путь в переменной CHROME_PATH.',
    )
  }
  return found
}

/**
 * Поднимает просмотр собранного приложения.
 *
 * Через API Vite, а не отдельным процессом `npm run preview`: на Windows
 * Node не запускает `.cmd` без оболочки, а с оболочкой ругается на
 * аргументы. Заодно адрес берётся у самого сервера — вместе с `base`
 * из vite.config.ts, и держать его копию здесь не нужно.
 */
async function startServer() {
  // Собираем сами, а не полагаемся на dist от прошлого раза. Прогон,
  // который молча проверяет вчерашнюю сборку, хуже отсутствующего:
  // он показывает зелёное на сломанном коде. Проверено — так и вышло,
  // когда сборка была отдельным шагом.
  await build({ root: ROOT, logLevel: 'warn' })

  const server = await preview({ root: ROOT })
  const url = server.resolvedUrls?.local?.[0]
  if (!url) {
    await server.close()
    throw new Error('Сервер просмотра не назвал адрес')
  }

  APP = url
  return server
}

/** Адрес вкладки в протоколе отладки. */
async function pageSocket() {
  for (let i = 0; i < 40; i++) {
    try {
      const tabs = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((r) => r.json())
      const page = tabs.find((tab) => tab.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // Браузер ещё не открыл порт.
    }
    await sleep(250)
  }
  throw new Error('Браузер не отдал порт отладки')
}

// ─── Разговор с браузером ──────────────────────────────────────────────────

/** Ошибки, о которых сообщил сам браузер. Любая из них валит прогон. */
const problems = []

/** Проверки сценария: что должно было оказаться на экране. */
const checks = []

function check(what, passed, seen = '') {
  checks.push({ what, passed, seen })
}

let socket
let seq = 0
const waiting = new Map()

function connect(url) {
  socket = new WebSocket(url)

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)

    if (message.id !== undefined) {
      waiting.get(message.id)?.(message)
      waiting.delete(message.id)
      return
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      problems.push(details.exception?.description ?? details.text)
    }

    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      problems.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '))
    }
  }

  return new Promise((done, fail) => {
    socket.onopen = done
    socket.onerror = fail
  })
}

function send(method, params = {}) {
  const id = ++seq
  return new Promise((done) => {
    waiting.set(id, (message) => done(message.result))
    socket.send(JSON.stringify({ id, method, params }))
  })
}

/**
 * Выполняет выражение на странице.
 *
 * Исключение здесь — тоже ошибка прогона: если сценарий не нашёл кнопку,
 * значит экран не тот, каким его считали.
 */
async function run(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    problems.push(result.exceptionDetails.exception?.description ?? 'ошибка в сценарии')
    return null
  }
  return result.result.value
}

/**
 * Помощники, доступные внутри каждого шага сценария.
 *
 * `set` пишет в поле так, как это делает человек: React слушает не
 * присваивание `value`, а событие с нативного сеттера. `blur` через
 * focusout по той же причине — обычный blur не всплывает, и onBlur
 * его не увидит.
 */
const HELPERS = `
  const set = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const blur = (el) => {
    el.blur()
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  }
  const byText = (tag, label) =>
    [...document.querySelectorAll(tag)].find((el) => el.textContent.trim() === label)
  const startsWith = (tag, prefix) =>
    [...document.querySelectorAll(tag)].find((el) => el.textContent.trim().startsWith(prefix))
`

const act = (body) => run(`(() => {${HELPERS}\n${body}\n})()`)

/** Текст всего экрана. По нему и делаются проверки. */
const screen = () => run('document.querySelector("#root")?.innerText ?? ""')

/**
 * Есть ли на экране такой текст.
 *
 * Сравнение без учёта регистра и неразрывных пробелов. Заголовки блоков
 * рисуются капителью средствами CSS, и `innerText` отдаёт их прописными;
 * суммы пишутся с неразрывным пробелом между разрядами. Ни то ни другое
 * к смыслу проверки отношения не имеет, а ловушка тут злая: проверка вида
 * «этого текста больше нет» проходит ложно просто потому, что регистр
 * оказался другим.
 */
function has(text, needle) {
  const flat = (value) => value.replace(/\u00A0/g, ' ').toLowerCase()
  return flat(text).includes(flat(needle))
}

/** Переход по хеш-роутингу с ожиданием перерисовки. */
async function go(hash) {
  await run(`location.hash = ${JSON.stringify(hash)}`)
  await sleep(700)
}

// ─── Сценарий ──────────────────────────────────────────────────────────────

/**
 * Обычный путь человека через все три модуля.
 *
 * Ровно то, что делают каждый день: отметить, вписать цену, завести
 * эпизод, закрыть его, завести запись контента и досмотреть её. Экраны,
 * на которые никто не заходит, сюда добавлять незачем — они и сломаются
 * незаметно.
 */
async function scenario() {
  await send('Runtime.enable')
  await send('Page.enable')

  await send('Page.navigate', { url: APP })
  await sleep(2000)

  const start = await screen()
  check('главный экран открылся', has(start, 'Сейчас'), start.slice(0, 60))

  // ─ Циклы
  await act(`byText('button', 'Добавить позицию')?.click()`)
  await sleep(300)
  await act(`
    set(document.querySelector('form input'), 'Стрижка')
    byText('button', 'Добавить')?.click()
  `)
  await sleep(600)
  check('позиция завелась', has(await screen(), 'Стрижка'))

  await act(`byText('button', 'Отметить')?.click()`)
  await sleep(600)
  check('отметка встала', has(await screen(), 'Отмечено'))

  await act(`document.querySelector('.cycle__name')?.click()`)
  await sleep(800)
  check('экран позиции открылся', has(await screen(), 'История'))

  await act(`byText('button', 'цена')?.click()`)
  await sleep(300)
  await act(`
    const field = document.querySelector('.price-input')
    field.focus()
    set(field, '700')
    blur(field)
  `)
  await sleep(700)
  const priced = await screen()
  check(
    'цена сохранилась и сложилась в сумму',
    has(priced, 'за 1 отметку'),
    line(priced, 'Потрачено'),
  )

  await act(`
    const dates = [...document.querySelectorAll('input[type=date]')]
    set(dates.at(-1), '2026-07-01')
    const prices = [...document.querySelectorAll('.price-input')]
    set(prices.at(-1), '1 200,50')
    byText('button', 'Добавить')?.click()
  `)
  await sleep(700)
  const backdated = await screen()
  check(
    'отметка задним числом с ценой',
    has(backdated, '1 200,50'),
    line(backdated, 'Потрачено'),
  )

  await go('/')
  await act(`startsWith('button', 'Траты')?.click()`)
  await sleep(400)
  const spending = await screen()
  check(
    'траты считаются по категориям',
    has(spending, 'Скрыть траты'),
    line(spending, '₽ за'),
  )

  // ─ Здоровье
  await go('/health')
  check('экран здоровья открылся', has(await screen(), 'Здоровье'))

  await act(`byText('button', 'Завести эпизод')?.click()`)
  await sleep(300)
  await act(`
    const fields = [...document.querySelectorAll('form input')]
    set(fields[0], 'Пробный эпизод')
    const symptom = fields.find((el) => el.placeholder === 'новый симптом')
    set(symptom, 'горло')
    byText('button', 'Добавить')?.click()
  `)
  await sleep(500)
  await act(`byText('button', 'Завести')?.click()`)
  await sleep(800)
  const sick = await screen()
  check('эпизод завёлся и попал в «болею сейчас»', has(sick, 'Болею сейчас'))
  check('симптом привязался', has(sick, 'горло'))

  await go('/')
  check('открытый эпизод виден на главной', has(await screen(), 'Болею сейчас'))

  await go('/health')
  await act(`byText('button', 'Выздоровел')?.click()`)
  await sleep(800)
  const healthy = await screen()
  check('эпизод закрылся', !has(healthy, 'Болею сейчас'))
  check(
    'полоса здоровья считается',
    has(healthy, 'Выздоровел сегодня') || has(healthy, 'Не болел'),
    line(healthy, 'Выздоровел'),
  )

  await go('/health/summary')
  const summary = await screen()
  check('сводка для врача собирается', has(summary, 'Хронология'))

  // ─ Контент
  await go('/content')
  check('экран контента открылся', has(await screen(), 'Контент'))

  await act(`byText('button', 'Добавить запись')?.click()`)
  await sleep(300)
  await act(`
    const fields = [...document.querySelectorAll('form input')]
    set(fields[0], 'Пробное аниме')
    set(document.querySelector('.score-input'), '7,5')
    byText('button', 'Добавить')?.click()
  `)
  await sleep(800)
  const added = await screen()
  check('запись завелась и попала в «смотрю сейчас»', has(added, 'Смотрю сейчас'))
  check('оценка с десятыми сохранилась', has(added, '7,5'), line(added, '7,5'))

  await go('/')
  check('«смотрю сейчас» видно на главной', has(await screen(), 'Смотрю сейчас'))

  await go('/content')
  await act(`byText('button', 'Досмотрел')?.click()`)
  await sleep(800)
  const watched = await screen()
  check('запись досмотрена', !has(watched, 'Смотрю сейчас'))
  check(
    'итоги считают начатое и законченное',
    has(watched, 'Начато 1') && has(watched, 'закончено 1'),
    line(watched, 'Начато'),
  )
  check(
    'среднее идёт с числом записей — Р-38',
    has(watched, 'по 1 записи'),
    line(watched, 'Средняя оценка'),
  )
  check(
    'запись легла под заголовок своего месяца',
    has(watched, 'Сентябрь 2026'),
    line(watched, 'Сентябрь'),
  )

  await act(`byText('button', 'брошено')?.click()`)
  await sleep(500)
  const dropped = await screen()
  check('переключатель статуса работает', has(dropped, 'Пока ничего с меткой'))
  // Проверяется список, а не весь экран: название той же записи законно
  // стоит выше, в блоке «Лучшее» у итогов.
  const cards = await run(`document.querySelectorAll('.cycles li').length`)
  check('просмотренное в брошенные не затесалось', cards === 0, `карточек ${cards}`)

  // Настройки открываются шестерёнкой, а не вкладкой (Р-43).
  await go('/')
  await act(`document.querySelector('.gear')?.click()`)
  await sleep(700)
  check('настройки открываются шестерёнкой', has(await screen(), 'Версия схемы'))
}

/** Строка экрана с образцом внутри. Для внятного отчёта о непрошедшем. */
function line(text, part) {
  const flat = (value) => value.replace(/\u00A0/g, ' ')
  return flat(text)
    .split('\n')
    .find((each) => each.toLowerCase().includes(part.toLowerCase())) ?? ''
}

// ─── Прогон ────────────────────────────────────────────────────────────────

let server
let browser
let profile

try {
  server = await startServer()
  profile = mkdtempSync(join(tmpdir(), 'dnevniki-smoke-'))
  browser = spawn(
    findBrowser(),
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      // Пустой временный профиль: своей базы у прогона нет и быть не должно.
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  await connect(await pageSocket())
  await scenario()
} catch (failure) {
  problems.push(failure instanceof Error ? failure.message : String(failure))
} finally {
  socket?.close()
  browser?.kill()
  await server?.close()
}

// Браузер отпускает профиль не мгновенно, и на Windows удаление сразу
// после kill падает с EPERM. Не удалось — не беда: это папка во временных.
await sleep(500)
if (profile) {
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    // Останется до следующей уборки временных файлов.
  }
}

const failed = checks.filter((each) => !each.passed)

for (const each of checks) {
  console.log(`${each.passed ? '  ok' : 'НЕТ '} ${each.what}${each.seen ? ` — ${each.seen}` : ''}`)
}

if (problems.length > 0) {
  console.log('\nБраузер сообщил об ошибках:')
  for (const problem of problems) console.log(`  ${problem}`)
}

const bad = failed.length > 0 || problems.length > 0
console.log(
  bad
    ? `\nПрогон не прошёл: проверок ${checks.length}, не сошлось ${failed.length}, ошибок ${problems.length}`
    : `\nПрогон прошёл: ${checks.length} проверок, ошибок нет`,
)

process.exit(bad ? 1 : 0)
