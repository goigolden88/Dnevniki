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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Копия настоящих данных для прогона экранов (Р-72):
 * `npm run smoke -- --data <файл>`. Путь — от того места, где набрали
 * команду. Нет ключа — обычный сценарий.
 */
const DATA_AT = process.argv.indexOf('--data')
const DATA =
  DATA_AT === -1 ? null : resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[DATA_AT + 1] ?? '')

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

/** Разворачивает блок по заголовку, если он свёрнут (Р-55, Р-61). */
async function unfold(title) {
  await act(`
    const button = [...document.querySelectorAll('.fold__btn')]
      .find((el) => el.textContent.trim() === ${JSON.stringify(title)})
    if (button?.getAttribute('aria-expanded') === 'false') button.click()
  `)
  await sleep(400)
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

  // Разрешение на уведомления — до первой загрузки: уже открытая страница
  // выданное позже не видит. Проверяется в конце, у напоминаний (Р-50).
  const granted = await grantNotifications()

  await send('Page.navigate', { url: APP })
  await sleep(2000)

  const start = await screen()
  check('главный экран открылся', has(start, 'Сейчас'), start.slice(0, 60))

  // Первый запуск (Р-70): на пустой базе — приветствие с установкой;
  // «Понятно» убирает его насовсем, и после перезапуска оно не возвращается.
  check(
    'на пустой базе — приветствие — Р-70',
    has(start, 'С чего начать') && has(start, 'Установка'),
    start.replace(/\s+/g, ' ').slice(0, 160),
  )
  await act(`byText('button', 'Понятно')?.click()`)
  await sleep(400)
  await send('Page.reload')
  await sleep(2000)
  check('«Понятно» убирает приветствие и после перезапуска — Р-70', !has(await screen(), 'С чего начать'))

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

  // Траты — отдельный блок, свёрнутый по умолчанию; раскрывается заголовком (Р-55).
  await go('/')
  await act(`byText('button', 'Траты')?.click()`)
  await sleep(400)
  const spending = await screen()
  const table = await run(`document.querySelector('.panel .spending')?.innerText ?? ''`)
  check(
    'траты раскрываются заголовком и считаются по категориям',
    has(table, 'Гигиена') && has(table, '₽ за'),
    line(spending, 'Траты'),
  )

  // ─ Быстрые кнопки (Р-49): заводится с позиции, цену берёт из последней
  // отметки, повторный тап снимает, следующий ставит заново с ценой.
  await act(`document.querySelector('.cycle__name')?.click()`)
  await sleep(800)
  await act(`byText('button', 'Сделать быстрой кнопкой')?.click()`)
  await sleep(600)
  await go('/')
  const quickText = await run(`document.querySelector('.quick .mark')?.textContent ?? ''`)
  check(
    'быстрая кнопка завелась с позиции и взяла цену',
    has(quickText, 'Стрижка') && has(quickText, '700 ₽'),
    quickText,
  )
  const pressed = () => run(`document.querySelector('.quick .mark')?.getAttribute('aria-pressed')`)
  check('позиция отмечена сегодня — кнопка нажата', (await pressed()) === 'true')

  await act(`document.querySelector('.quick .mark')?.click()`)
  await sleep(600)
  check(
    'повторный тап по кнопке снимает отметку',
    (await pressed()) === 'false' && has(await screen(), 'Отметить'),
  )

  await act(`document.querySelector('.quick .mark')?.click()`)
  await sleep(600)
  const remarked = await screen()
  check(
    'тап по кнопке ставит отметку вместе с ценой',
    has(remarked, 'Отмечено') && has(remarked, '1 900,50 ₽ за 2 отметки'),
    line(remarked, 'Траты'),
  )

  // Вторая позиция, заведомо просроченная: интервал 10 дней, отметка
  // в июле. Нужна напоминанию (о чём-то же надо напомнить) и кнопке
  // на две позиции в конце сценария.
  await act(`byText('button', 'Добавить позицию')?.click()`)
  await sleep(300)
  await act(`
    set(document.querySelector('form input'), 'Фильтр')
    const interval = [...document.querySelectorAll('form input')].find((el) => el.placeholder === 'по истории')
    set(interval, '10')
    byText('button', 'Добавить')?.click()
  `)
  await sleep(600)
  await act(`byText('a', 'Фильтр')?.click()`)
  await sleep(800)
  await act(`
    set([...document.querySelectorAll('input[type=date]')].at(-1), '2026-07-01')
    byText('button', 'Добавить')?.click()
  `)
  await sleep(600)
  await go('/')
  const attention = await screen()
  check('просроченная позиция в «требует внимания»', has(attention, 'Требует внимания') && has(attention, 'перебор'), line(attention, 'перебор'))

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

  // Р-51: у даты есть «сегодня». Сначала уводим дату в сторону, потом
  // возвращаем чипом — иначе проверять нечего, поле и так сегодняшнее.
  await act(`set(document.querySelector('form input[type=date]'), '2026-01-15')`)
  await sleep(200)
  await act(`byText('button', 'сегодня')?.click()`)
  await sleep(300)
  const startValue = await run(`document.querySelector('form input[type=date]')?.value`)
  const todayValue = await run(`(() => {
    const d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  })()`)
  check('«сегодня» у даты возвращает сегодняшний день — Р-51', startValue === todayValue, `в поле ${startValue}`)

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

  // Вторая запись другим месяцем — иначе фильтр по месяцам не из чего
  // строить: ряд чипов появляется, только когда месяцев больше одного.
  await act(`byText('button', 'Добавить запись')?.click()`)
  await sleep(300)
  await act(`
    set(document.querySelector('form input'), 'Мартовский фильм')
    set(document.querySelector('form input[type=month]'), '2026-03')
    byText('button', 'просмотрено')?.click()
  `)
  await sleep(400)
  await act(`byText('button', 'Добавить')?.click()`)
  await sleep(800)
  const twoMonths = await screen()
  check(
    'два месяца — два заголовка',
    has(twoMonths, 'Сентябрь 2026') && has(twoMonths, 'Март 2026'),
    line(twoMonths, 'Март'),
  )

  // Период слоями: готовый ответ, потом выбор месяцев руками (Р-47).
  await act(`byText('button', 'Этот месяц')?.click()`)
  await sleep(500)
  const thisMonth = await screen()
  const inThisMonth = await run(`document.querySelectorAll('.cycles li').length`)
  check('готовый период «этот месяц» отбирает свой месяц', inThisMonth === 1, `карточек ${inThisMonth}`)
  check('и это правда сентябрь', has(thisMonth, 'Пробное аниме') && !has(thisMonth, 'Март 2026'))

  await act(`byText('button', 'Выбрать период')?.click()`)
  await sleep(400)
  await act(`byText('button', 'мар')?.click()`)
  await sleep(500)
  const twoPicked = await screen()
  const inTwo = await run(`document.querySelectorAll('.cycles li').length`)
  check('месяцы отмечаются несколькими', inTwo === 2, `карточек ${inTwo}`)
  check('и период назван словами', has(twoPicked, 'мар, сен'), line(twoPicked, 'Показано'))

  await act(`byText('button', 'сен')?.click()`)
  await sleep(500)
  const onlyMarch = await screen()
  const inMarch = await run(`document.querySelectorAll('.cycles li').length`)
  check('повторный тап снимает месяц', inMarch === 1, `карточек ${inMarch}`)
  check('остался март', has(onlyMarch, 'Мартовский фильм') && !has(onlyMarch, 'Сентябрь 2026'))

  await act(`byText('button', 'Все месяцы')?.click()`)
  await sleep(500)
  const wholeYear = await run(`document.querySelectorAll('.cycles li').length`)
  check('«все месяцы» возвращают обе записи', wholeYear === 2, `карточек ${wholeYear}`)

  await act(`byText('button', 'брошено')?.click()`)
  await sleep(500)
  const dropped = await screen()
  check('переключатель статуса работает', has(dropped, 'Пока ничего с меткой'))
  // Проверяется список, а не весь экран: название той же записи законно
  // стоит выше, в блоке «Лучшее» у итогов.
  const cards = await run(`document.querySelectorAll('.cycles li').length`)
  check('просмотренное в брошенные не затесалось', cards === 0, `карточек ${cards}`)

  // ─ Лента (Р-48, Р-52): записи всех трёх модулей одним списком.
  await go('/feed')
  const feedText = await screen()
  check(
    'лента собирает записи всех трёх модулей',
    has(feedText, 'Стрижка') && has(feedText, 'Пробный эпизод') && has(feedText, 'Мартовский фильм'),
    line(feedText, 'запис'),
  )
  const rows = () => run(`document.querySelectorAll('.feed li').length`)
  const allRows = await rows()
  await act(`set(document.querySelector('.search'), 'пробный эпизод')`)
  await sleep(400)
  const found = await rows()
  check('поиск сужает ленту', found === 1, `строк ${found} из ${allRows}`)
  await act(`set(document.querySelector('.search'), '')`)
  await sleep(300)
  await act(`byText('button', 'Контент')?.click()`)
  await sleep(400)
  const contentRows = await rows()
  check('чип вида отбирает свой модуль', contentRows === 2, `строк ${contentRows}`)
  check('«к просмотру» в ленте названо словами', has(await screen(), 'в ленту не входит'))

  // Тап по записи контента ведёт к самой записи, а не просто на вкладку (Р-56).
  // Через переменную: строка, начатая с «[», склеилась бы с концом
  // помощников в одно выражение — и вышла бы синтаксическая ошибка.
  await act(`const row = [...document.querySelectorAll('.feed__row')]
      .find((each) => each.textContent.includes('Мартовский фильм'))
    row?.click()`)
  await sleep(900)
  const focused = await run(`document.querySelector('.cycle--focus')?.innerText ?? ''`)
  check(
    'тап в ленте разворачивает саму запись — Р-56',
    has(focused, 'Мартовский фильм') && has(focused, 'Правка'),
    focused.replace(/\s+/g, ' ').slice(0, 70),
  )

  // Незакрытая болезнь — повод для второго напоминания (Р-54).
  await go('/health')
  await act(`byText('button', 'Завести эпизод')?.click()`)
  await sleep(300)
  await act(`set(document.querySelector('form input'), 'Затянувшийся кашель')`)
  await sleep(200)
  await act(`byText('button', 'Завести')?.click()`)
  await sleep(800)

  // Настройки открываются шестерёнкой, а не вкладкой (Р-43).
  await go('/')

  // «Что нового» (Р-71). Свежая установка отметила всё прочитанным ещё на
  // пустой базе и блока не видит. Копия, обновившаяся со старой версии,
  // помнит своё последнее прочитанное — подставляем ноль и перезапускаем,
  // как это делает автообновление.
  check('свежая установка «Что нового» не показывает — Р-71', !has(await screen(), 'Что нового'))
  await run(`new Promise((resolve, reject) => {
    const request = indexedDB.open('dnevniki')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const tx = request.result.transaction('settings', 'readwrite')
      tx.objectStore('settings').put({ key: 'seenChanges', value: 0 })
      tx.oncomplete = () => {
        request.result.close()
        resolve(true)
      }
      tx.onerror = () => reject(tx.error)
    }
  })`)
  await send('Page.reload')
  await sleep(2000)
  const news = await screen()
  check(
    'после обновления на «Сейчас» — «Что нового» — Р-71',
    has(news, 'Что нового') && has(news, 'Справка сверена'),
    news.replace(/\s+/g, ' ').slice(0, 160),
  )
  await act(`byText('button', 'Понятно')?.click()`)
  await sleep(400)
  await send('Page.reload')
  await sleep(2000)
  check('«Понятно» закрывает «Что нового» до следующего обновления — Р-71', !has(await screen(), 'Что нового'))

  // Справка (Р-63): «?» рядом с шестерёнкой, вопросы свёрнуты.
  await act(`document.querySelector('[aria-label="Справка"]')?.click()`)
  await sleep(700)
  await unfold('Синхронизация между устройствами')
  const help = await screen()
  check(
    'справка открывается с «Сейчас», вопрос раскрывается — Р-63',
    has(help, 'Справка') && has(help, 'fine-grained токен'),
  )
  // Числа справки собираются из констант (Р-65): раскрыты все вопросы,
  // подставленное читается, а не «undefined».
  await act(`document.querySelectorAll('.fold__btn[aria-expanded="false"]').forEach((el) => el.click())`)
  await sleep(500)
  const helpAll = await screen()
  check(
    'числа справки подставлены из констант — Р-65',
    has(helpAll, '90 дней висит') &&
      has(helpAll, 'через 5 секунд') &&
      has(helpAll, 'с 12 до 20') &&
      has(helpAll, '4 отметки') &&
      !has(helpAll, 'undefined') &&
      !has(helpAll, 'NaN'),
    helpAll.replace(/\s+/g, ' ').slice(0, 200),
  )
  await go('/')

  await act(`document.querySelector('[aria-label="Настройки"]')?.click()`)
  await sleep(700)
  // Разделы свёрнуты оглавлением (Р-61): заголовки видны, содержимого нет.
  const settings = await screen()
  check(
    'настройки открываются шестерёнкой, разделы свёрнуты — Р-43, Р-61',
    has(settings, 'О приложении') && has(settings, 'Экспорт и импорт') && !has(settings, 'Версия схемы'),
    settings.replace(/\s+/g, ' ').slice(0, 160),
  )
  await unfold('О приложении')
  const about = await screen()
  check('в «О приложении» — версия схемы', has(about, 'Версия схемы'))
  // Установка (Р-69): безголовый Chrome не iPhone и не установлен — кнопка
  // или совет через меню, смотря прислал ли он событие.
  check(
    'в «О приложении» — как установить — Р-69',
    has(about, 'Установка') && (has(about, 'Установить') || has(about, 'меню браузера')),
    about.replace(/\s+/g, ' ').slice(0, 200),
  )
  check('в «О приложении» — весь список «Что нового» — Р-71', has(about, 'Что нового'))

  await unfold('Экспорт и импорт')
  await act(`byText('button', 'Сохранить в markdown')?.click()`)
  await sleep(700)
  check('выгрузка в markdown собирается без ошибок', has(await screen(), 'Markdown сохранён'))

  // Запись, зависшая в «смотрю» (Р-58), заводится загрузкой слепка: у неё
  // должна быть давняя правка, а форма ставит время правки «сейчас».
  // Заодно проверяется сама загрузка из файла — тем путём, каким её
  // делает человек.
  const staleFile = join(profile, 'stale.json')
  writeFileSync(
    staleFile,
    JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-01-15T10:00:00.000Z',
      data: {
        content: [
          {
            id: 'stale-series',
            updatedAt: '2026-01-15T10:00:00.000Z',
            type: 'series',
            title: 'Забытый сериал',
            start: '2026-01',
            end: null,
            status: 'active',
            score: null,
          },
        ],
      },
    }),
  )
  const { root } = await send('DOM.getDocument')
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' })
  await send('DOM.setFileInputFiles', { nodeId, files: [staleFile] })
  await sleep(1000)
  check('слепок загружается из файла', has(await screen(), 'Загружено записей: 1'))

  // ─ Импорт записей (Р-60): текстом, как на телефоне, и в блоке ```json —
  // ровно так его отдаёт ИИ. Сводка до записи; повтор ничего не удваивает.
  const importText =
    '```json\n' +
    JSON.stringify({
      format: 'dnevniki-import',
      version: 1,
      content: [{ type: 'course', title: 'Курс из Obsidian', start: '2026-02', status: 'done', score: 8 }],
      episodes: [{ title: 'Ангина', start: '2026-02-01', end: '2026-02-06', symptoms: ['горло'] }],
      cycles: [{ name: 'Стрижка', cat: 'Гигиена', marks: ['2026-02-02'] }],
      food: [],
    }) +
    '\n```'
  const pasteImport = async () => {
    await act(`
      set(document.querySelector('textarea.import__text'), ${JSON.stringify(importText)})
      byText('button', 'Разобрать')?.click()
    `)
    await sleep(800)
    return run(`document.querySelector('.import__plan')?.innerText ?? ''`)
  }
  const firstPlan = await pasteImport()
  check(
    'импорт показывает сводку до записи: что добавится и что не разобрано — Р-60',
    has(firstPlan, '1 запись контента') &&
      has(firstPlan, '1 эпизод') &&
      has(firstPlan, '1 отметка') &&
      has(firstPlan, 'такого раздела нет'),
    firstPlan.replace(/\s+/g, ' ').slice(0, 200),
  )
  await act(`startsWith('button', 'Загрузить ')?.click()`)
  await sleep(1000)
  check('импорт записывает по кнопке', has(await screen(), 'Загружено записей: 3'))
  const secondPlan = await pasteImport()
  check(
    'повтор того же файла ничего не удваивает — Р-60',
    has(secondPlan, 'Добавлять нечего') && has(secondPlan, 'Уже есть'),
    secondPlan.replace(/\s+/g, ' ').slice(0, 160),
  )
  await act(`byText('button', 'Отмена')?.click()`)
  const prompt = await run(`document.querySelector('pre.prompt')?.textContent ?? ''`)
  check(
    'промпт для ИИ собран из разделов и знает формат — Р-60',
    prompt.includes('"format": "dnevniki-import"') && prompt.includes('"cycles"') && prompt.includes('Мои данные'),
  )

  await unfold('Быстрые кнопки')
  const listed = await run(`[...document.querySelectorAll('.quick__item')].map((el) => el.textContent).join(', ')`)
  check('все быстрые кнопки видны в настройках — Р-56', listed.includes('Стрижка'), listed)

  // Кнопки прокрутки (Р-55): настройки длинные, есть куда ехать.
  const canDown = await run(`!!document.querySelector('[aria-label="В конец"]')`)
  await act(`document.querySelector('[aria-label="В конец"]')?.click()`)
  await sleep(1000)
  const down = await run('Math.round(window.scrollY)')
  await act(`document.querySelector('[aria-label="В начало"]')?.click()`)
  await sleep(1000)
  const up = await run('Math.round(window.scrollY)')
  check(
    'кнопки прокрутки везут в конец и в начало — Р-55',
    canDown && down > 0 && up < 5,
    `вниз до ${down}, обратно до ${up}`,
  )

  // ─ Service worker свой (Р-50). Главный риск перехода — что работник
  // вовсе не встанет, и приложение потеряет офлайн и автообновление.
  const worker = await run(`Promise.race([
    navigator.serviceWorker.ready.then((r) => r.active?.state ?? 'нет'),
    new Promise((done) => setTimeout(() => done('не дождался'), 5000)),
  ])`)
  check('service worker встал и активен', worker === 'activated', `состояние ${worker}`)

  // Напоминание «Проверить сейчас»: разрешение на уведомления выдаётся
  // через протокол отладки — в безголовом браузере спросить некого.
  const seenPermission = await run('Notification.permission')
  check(
    'разрешение на уведомления выдано',
    granted && seenPermission === 'granted',
    `страница видит ${seenPermission}`,
  )
  await unfold('Напоминания')
  // Окно со звуком и журнал пробуждений (Р-57). Пробуждений в прогоне
  // не бывает: фоновую проверку будит только браузер, и не по команде.
  const reminderSection = `[...document.querySelectorAll('section')]
    .find((each) => each.querySelector('.fold__btn')?.textContent === 'Напоминания')`
  const hours = await run(`[...(${reminderSection})?.querySelectorAll('select') ?? []].map((el) => el.value).join('–')`)
  const reminderText = await run(`(${reminderSection})?.innerText ?? ''`)
  check(
    'окно напоминаний по умолчанию 12–20, журнал пуст — Р-57',
    hours === '12–20' && has(reminderText, 'ещё ни разу не просыпалась'),
    `окно «${hours}»`,
  )
  await act(`byText('button', 'Проверить сейчас')?.click()`)
  await sleep(1500)
  const shown = await run(`navigator.serviceWorker.ready
    .then((r) => r.getNotifications())
    .then((list) => list.map((each) => each.title + ': ' + each.body).join(' | '))`)
  // Раздел целиком — в отчёт: по нему видно, чем кончилась проверка,
  // если уведомления не нашлось.
  const reminders = await run(`[...document.querySelectorAll('section')]
    .find((each) => each.querySelector('.fold__btn')?.textContent === 'Напоминания')
    ?.innerText.replace(/\\s+/g, ' ') ?? 'раздела нет'`)
  check(
    'напоминание называет просроченную позицию',
    typeof shown === 'string' && shown.includes('Просрочено: Фильтр'),
    `уведомления: «${shown}»; раздел: ${reminders}`,
  )
  check(
    'напоминание о незакрытой болезни — Р-54',
    typeof shown === 'string' && shown.includes('Всё ещё болеешь?: Затянувшийся кашель — первый день'),
    `уведомления: «${shown}»`,
  )

  check(
    'напоминание о зависшем в «смотрю» — Р-58',
    typeof shown === 'string' && shown.includes('Ещё смотришь?: Забытый сериал'),
    `уведомления: «${shown}»`,
  )

  // Карточка зависшей записи спрашивает сама; «Ещё смотрю» снимает вопрос.
  await go('/content')
  const staleCard = await screen()
  await act(`byText('button', 'Ещё смотрю')?.click()`)
  await sleep(700)
  const touched = await screen()
  check(
    'зависшая запись спрашивает, «Ещё смотрю» снимает вопрос — Р-58',
    has(staleCard, 'ещё смотришь?') && !has(touched, 'ещё смотришь?'),
    line(staleCard, 'без новостей'),
  )

  // ─ Кнопка на две позиции (Р-49): «включающее обслуживание» одним тапом.
  await go('/')
  await act(`byText('a', 'Фильтр')?.click()`)
  await sleep(800)
  await act(`startsWith('button', 'Добавить в «')?.click()`)
  await sleep(600)
  await go('/')
  const both = await run(`document.querySelector('.quick .mark')?.textContent ?? ''`)
  check('позиция добавилась в чужую кнопку', has(both, 'Стрижка + Фильтр'), both)
  check('отмечена одна из двух — кнопка не нажата', (await pressed()) === 'false')
  await act(`document.querySelector('.quick .mark')?.click()`)
  await sleep(700)
  const done = await screen()
  check(
    'один тап отметил обе позиции',
    (await pressed()) === 'true' && !has(done, 'Требует внимания'),
    line(done, 'Фильтр'),
  )

  // ─ Сворачивание (Р-55): тап по заголовку прячет блок, устройство помнит.
  const cutCards = () =>
    run(`[...document.querySelectorAll('.cycle__name')].filter((el) => el.textContent.trim() === 'Стрижка').length`)
  await act(`byText('button', 'Гигиена')?.click()`)
  await sleep(400)
  const folded = await cutCards()
  // Заголовок — флекс-строка, и innerText разносит название и число по
  // разным строкам. Текст берётся из самого заголовка.
  const foldedHead = await run(`[...document.querySelectorAll('.fold__head')]
    .find((head) => head.querySelector('button')?.textContent === 'Гигиена')?.textContent ?? ''`)
  await go('/feed')
  await go('/')
  const remembered = await cutCards()
  // Перезапуск — не переход: память страницы пропадает, остаётся только
  // база. С телефона пришло, что свёрнутое после выхода раскрывается.
  await send('Page.reload')
  await sleep(2000)
  const restarted = await cutCards()
  await act(`byText('button', 'Гигиена')?.click()`)
  await sleep(400)
  const unfolded = await cutCards()
  check(
    'блок сворачивается заголовком, помнит это после перезапуска и показывает число — Р-55',
    folded === 0 && remembered === 0 && restarted === 0 && unfolded === 1 && /·\s*\d/.test(foldedHead),
    `«${foldedHead}»: свёрнут ${folded}, после перехода ${remembered}, после перезапуска ${restarted}, развёрнут ${unfolded}`,
  )

  // Здоровье и контент сворачиваются так же (Р-61).
  const foldTitles = () =>
    run(`[...document.querySelectorAll('.fold__btn')].map((el) => el.textContent.trim()).join(', ')`)
  await go('/health')
  const healthFolds = await foldTitles()
  await go('/content')
  const contentFolds = await foldTitles()
  check(
    'здоровье и контент сворачиваются — Р-61',
    ['Итоги', 'Измерения', 'Тренировки', 'История'].every((title) => healthFolds.includes(title)) &&
      ['Итоги', 'Записи'].every((title) => contentFolds.includes(title)),
    `здоровье: ${healthFolds}; контент: ${contentFolds}`,
  )
  await go('/')

  // ─ Категории своими записями (Р-59). Свежая база прогона прошла тот же
  // путь, что и старая: раскладка версии 1 и миграция на 2. Стартовый
  // набор завёлся сам; переименование в «Настройках» уводит за собой
  // позиции, и «Сейчас» показывает новое название.
  await go('/settings')
  await unfold('Категории и названия')
  const names = await screen()
  check(
    'в «Категориях и названиях» есть здоровье: симптомы и виды тренировок — Р-59',
    has(names, 'Симптомы') && has(names, 'Виды тренировок') && has(names, 'Здоровье'),
  )
  const seeded = await run(`[...document.querySelectorAll('.category input')].map((el) => el.value).join(', ')`)
  await act(`
    const field = [...document.querySelectorAll('.category input')].find((el) => el.value === 'Гигиена')
    field.focus()
    set(field, 'Уход')
    blur(field)
  `)
  await sleep(700)
  await go('/')
  const renamed = await run(`[...document.querySelectorAll('.fold__btn')].map((el) => el.textContent.trim()).join(', ')`)
  check(
    'категории заведены из прежних пяти и переименовываются целиком — Р-59',
    seeded.startsWith('Гигиена, Дом, Техника, Авто, Дача') &&
      renamed.includes('Уход') &&
      !renamed.includes('Гигиена'),
    `было: ${seeded}; на «Сейчас»: ${renamed}`,
  )

  // ─ Без сети (Р-50). Ради этого работник и существует, а после перехода
  // на свой файл подмена навигации и кеш написаны руками. Проверяется и то,
  // что страницу отдал работник: иначе при непойманном офлайне проверка
  // прошла бы на обычной загрузке из сети.
  await send('Network.enable')
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  await send('Page.navigate', { url: `${APP}#/feed` })
  await sleep(2000)
  const offline = await screen()
  const controlled = await run('navigator.serviceWorker.controller !== null')
  check(
    'без сети приложение открывается из кеша',
    has(offline, 'Лента') && has(offline, 'Стрижка') && controlled === true,
    `работник ${controlled ? 'управляет' : 'не управляет'} страницей`,
  )
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
}

/**
 * Разрешение на уведомления для адреса приложения. Без него «Проверить
 * сейчас» упирается в вопрос о разрешении, на который в безголовом
 * браузере некому ответить.
 *
 * Выдаётся из сессии самой вкладки. Через отдельное соединение с браузером
 * не работает, и молча: без контекста ответ «ok», а вкладка по-прежнему
 * видит «не спрашивали»; с контекстом вкладки браузер отвечает, что такого
 * контекста не знает. Проверено 10.09.2026 на Chrome из прогона.
 */
async function grantNotifications() {
  const reply = await send('Browser.grantPermissions', {
    origin: new URL(APP).origin,
    permissions: ['notifications'],
  })
  // Ответ с ошибкой приходит без `result` — `send` отдаёт undefined.
  return reply !== undefined
}

/** Строка экрана с образцом внутри. Для внятного отчёта о непрошедшем. */
function line(text, part) {
  const flat = (value) => value.replace(/\u00A0/g, ' ')
  return flat(text)
    .split('\n')
    .find((each) => each.toLowerCase().includes(part.toLowerCase())) ?? ''
}

// ─── Копия настоящих данных (Р-72) ─────────────────────────────────────────

/** Разворачивает все свёрнутые блоки, вложенные тоже: они появляются после внешних. */
async function unfoldAll() {
  for (let round = 0; round < 3; round++) {
    await act(`document.querySelectorAll('.fold__btn[aria-expanded="false"]').forEach((el) => el.click())`)
    await sleep(400)
  }
}

/**
 * Экраны на копии настоящих данных. Копия загружается тем же путём, что
 * у человека, — «Восстановить из копии», — и каждый экран открывается со
 * всеми развёрнутыми блоками: ошибка на кривой записи прячется именно
 * в свёрнутом. Условие прохода прежнее — ни одной ошибки в консоли.
 *
 * Данные остаются во временном профиле браузера и удаляются вместе с ним.
 * Миграции IndexedDB здесь не проверяются — копия ложится в базу текущей
 * схемы; их проверяет `npm run check:data`.
 */
async function dataScenario(file) {
  await send('Runtime.enable')
  await send('Page.enable')
  await send('DOM.enable')

  await send('Page.navigate', { url: APP })
  await sleep(2000)

  await go('/settings')
  await unfold('Экспорт и импорт')
  // Поле копии, а не импорта записей: у копии в списке типов есть text/plain.
  const field = await send('Runtime.evaluate', {
    expression: `document.querySelector('input[type=file][accept*="text/plain"]')`,
  })
  const objectId = field?.result?.objectId
  check('поле «Восстановить из копии» найдено', Boolean(objectId))
  if (!objectId) return

  await send('DOM.setFileInputFiles', { files: [file], objectId })
  await sleep(3000)
  const restored = await screen()
  const loaded = /Загружено записей: (\d+)/.exec(restored.replace(/ /g, ' '))
  check('копия загрузилась через «Восстановить из копии» — Р-72', loaded !== null, loaded?.[0] ?? restored.slice(0, 160))

  const routes = ['/', '/health', '/health/summary', '/content', '/feed', '/settings', '/help']

  // Экраны позиции и эпизода — первые попавшиеся, если они есть.
  await go('/')
  // По адресу, а не по классу: у карточки болезни на «Сейчас» тот же класс.
  const item = await run(`document.querySelector('a[href^="#/cycle/"]')?.getAttribute('href') ?? ''`)
  if (item) routes.push(item.replace(/^#/, ''))
  await go('/health')
  const episode = await run(`document.querySelector('a[href^="#/episode/"]')?.getAttribute('href') ?? ''`)
  if (episode) routes.push(episode.replace(/^#/, ''))

  for (const route of routes) {
    await go(route)
    await unfoldAll()
    const text = await screen()
    check(
      `${route} — открылся на настоящих данных, всё развёрнуто`,
      text.trim().length > 0 && !has(text, 'База не открылась') && !has(text, 'не найден'),
      text.replace(/\s+/g, ' ').slice(0, 80),
    )
  }
}

// ─── Прогон ────────────────────────────────────────────────────────────────

let server
let browser
let profile

try {
  if (DATA !== null && !existsSync(DATA)) throw new Error(`Файла копии нет: ${DATA}`)
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
  await (DATA === null ? scenario() : dataScenario(DATA))
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
