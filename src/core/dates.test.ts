import { describe, expect, it } from 'vitest'
import {
  addDays,
  lastDayOf,
  days,
  daysAgo,
  daysBetween,
  formatDate,
  formatDateLong,
  formatDateLoose,
  formatDateOrMonth,
  formatMonth,
  isDateStr,
  parseDate,
  plural,
  timeSpan,
  toDateStr,
  today,
} from './dates.ts'

describe('parseDate', () => {
  it('разбирает три формата, которые лежат вперемешку в дневниках Obsidian', () => {
    expect(parseDate('24.01.26')).toBe('2026-01-24')
    expect(parseDate('20-02-2026')).toBe('2026-02-20')
    expect(parseDate('03.03-2026')).toBe('2026-03-03')
  })

  it('разбирает ISO и однозначные числа', () => {
    expect(parseDate('2026-09-07')).toBe('2026-09-07')
    expect(parseDate('7.9.2026')).toBe('2026-09-07')
    expect(parseDate('  05.09.2026  ')).toBe('2026-09-05')
  })

  it('двузначный год: 00–79 в двухтысячные, 80–99 в девяностые', () => {
    expect(parseDate('01.01.26')).toBe('2026-01-01')
    expect(parseDate('01.01.79')).toBe('2079-01-01')
    expect(parseDate('01.01.80')).toBe('1980-01-01')
  })

  it('отвергает несуществующие дни, а не подставляет соседние', () => {
    expect(parseDate('31.02.2026')).toBeNull()
    expect(parseDate('01.13.2026')).toBeNull()
    expect(parseDate('00.01.2026')).toBeNull()
  })

  it('отвергает мусор', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('вчера')).toBeNull()
    expect(parseDate('2026')).toBeNull()
  })
})

describe('часовой пояс', () => {
  // Ради этого дата нигде не строится из строки через new Date(строка):
  // такой разбор идёт как UTC и в минусовом поясе сдвигает день назад.
  it('today() совпадает с локальным календарём, а не с UTC', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`
    expect(today()).toBe(expected)
  })

  it('toDateStr берёт локальные компоненты даты', () => {
    // 1 января, час ночи по местному времени. В UTC это ещё 31 декабря.
    expect(toDateStr(new Date(2026, 0, 1, 1, 0, 0))).toBe('2026-01-01')
  })

  it('daysAgo(сегодня) равен нулю', () => {
    expect(daysAgo(today())).toBe(0)
  })
})

describe('арифметика дней', () => {
  it('считает разницу', () => {
    expect(daysBetween('2026-09-01', '2026-09-07')).toBe(6)
    expect(daysBetween('2026-09-07', '2026-09-01')).toBe(-6)
    expect(daysBetween('2026-09-07', '2026-09-07')).toBe(0)
  })

  it('переходит через границу месяца и года', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
  })

  it('знает про високосный год', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
  })

  it('пережил бы перевод часов: разница в сутках, а не в 23 часах', () => {
    // Последнее воскресенье марта — там, где переход на летнее время есть.
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1)
    expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1)
  })

  it('addDays', () => {
    expect(addDays('2026-09-07', 1)).toBe('2026-09-08')
    expect(addDays('2026-09-07', -7)).toBe('2026-08-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('interval + addDays возвращает исходную дату', () => {
    const from = '2026-01-15'
    const to = '2026-07-04'
    expect(addDays(from, daysBetween(from, to))).toBe(to)
  })
})

describe('lastDayOf', () => {
  it('последний день месяца, февраль високосного тоже', () => {
    expect(lastDayOf('2026-02')).toBe('2026-02-28')
    expect(lastDayOf('2024-02')).toBe('2024-02-29')
    expect(lastDayOf('2026-04')).toBe('2026-04-30')
    expect(lastDayOf('2026-12')).toBe('2026-12-31')
  })
})

describe('формат', () => {
  it('formatDate', () => {
    expect(formatDate('2026-09-07')).toBe('07.09.2026')
  })

  it('formatDateLong — родительный падеж без ведущего нуля', () => {
    expect(formatDateLong('2026-09-07')).toBe('7 сентября 2026')
    expect(formatDateLong('2026-01-31')).toBe('31 января 2026')
    expect(formatDateLong('2026-05-01')).toBe('1 мая 2026')
  })

  it('isDateStr', () => {
    expect(isDateStr('2026-09-07')).toBe(true)
    expect(isDateStr('2026-02-31')).toBe(false)
    expect(isDateStr('07.09.2026')).toBe(false)
  })
})

describe('склонения', () => {
  it('единственное число', () => {
    expect(days(1)).toBe('1 день')
    expect(days(21)).toBe('21 день')
    expect(days(101)).toBe('101 день')
  })

  it('от двух до четырёх', () => {
    expect(days(2)).toBe('2 дня')
    expect(days(3)).toBe('3 дня')
    expect(days(4)).toBe('4 дня')
    expect(days(22)).toBe('22 дня')
    expect(days(103)).toBe('103 дня')
  })

  it('множественное', () => {
    expect(days(0)).toBe('0 дней')
    expect(days(5)).toBe('5 дней')
    expect(days(10)).toBe('10 дней')
    expect(days(100)).toBe('100 дней')
  })

  it('11–14 — исключение, без него выходит «11 день»', () => {
    expect(days(11)).toBe('11 дней')
    expect(days(12)).toBe('12 дней')
    expect(days(13)).toBe('13 дней')
    expect(days(14)).toBe('14 дней')
    expect(days(111)).toBe('111 дней')
    expect(days(112)).toBe('112 дней')
  })

  it('отрицательные склоняются по модулю', () => {
    expect(days(-1)).toBe('-1 день')
    expect(days(-11)).toBe('-11 дней')
  })

  it('работает не только со днями', () => {
    const forms: [string, string, string] = ['раз', 'раза', 'раз']
    expect(plural(1, forms)).toBe('раз')
    expect(plural(2, forms)).toBe('раза')
    expect(plural(5, forms)).toBe('раз')
  })
})

describe('склонение дробных', () => {
  it('дробное число всегда берёт вторую форму', () => {
    expect(plural(3.5, ['день', 'дня', 'дней'])).toBe('дня')
    expect(plural(0.5, ['день', 'дня', 'дней'])).toBe('дня')
    expect(plural(11.5, ['день', 'дня', 'дней'])).toBe('дня')
  })

  it('дробные дни пишутся через запятую', () => {
    expect(days(3.5)).toBe('3,5 дня')
    expect(days(1)).toBe('1 день')
  })
})

describe('timeSpan', () => {
  it('секунды — с числом и склонением', () => {
    expect(timeSpan(1000)).toBe('1 секунду')
    expect(timeSpan(3000)).toBe('3 секунды')
    expect(timeSpan(5000)).toBe('5 секунд')
  })

  it('одна минута — без числа: «через минуту»', () => {
    expect(timeSpan(60_000)).toBe('минуту')
  })

  it('несколько минут — с числом', () => {
    expect(timeSpan(120_000)).toBe('2 минуты')
    expect(timeSpan(300_000)).toBe('5 минут')
    expect(timeSpan(21 * 60_000)).toBe('21 минуту')
  })
})

describe('formatDateLoose', () => {
  it('обычную дату форматирует как formatDate', () => {
    expect(formatDateLoose('2026-09-07')).toBe('07.09.2026')
  })

  it('кривую строку отдаёт как есть, а не роняет экран', () => {
    // Битая дата может приехать с другого устройства или из файла,
    // поправленного руками. Строка покажется странно — это лучше,
    // чем белый экран вместо всего списка.
    expect(formatDateLoose('когда-то')).toBe('когда-то')
    expect(formatDateLoose('2026-13-45')).toBe('2026-13-45')
    expect(formatDateLoose('')).toBe('')
  })
})

describe('formatMonth и formatDateOrMonth', () => {
  it('месяц показывается месяцем, а не первым числом — Р-25', () => {
    expect(formatMonth('2026-01')).toBe('январь 2026')
    expect(formatMonth('2026-09')).toBe('сентябрь 2026')
  })

  it('дата известной точности показывается по своей точности', () => {
    expect(formatDateOrMonth('2026-01')).toBe('январь 2026')
    expect(formatDateOrMonth('2026-01-05')).toBe('05.01.2026')
  })

  it('нечитаемое отдаётся как есть — экран не должен падать из-за строки', () => {
    expect(formatDateOrMonth('когда-то весной')).toBe('когда-то весной')
    expect(formatDateOrMonth('2026-13')).toBe('2026-13')
    expect(formatMonth('2026-01-05')).toBe('2026-01-05')
    expect(formatDateOrMonth('')).toBe('')
  })
})
