/** Vietnam display timezone — charts and tables must agree on GMT+7. */
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh'

const vnTimeBase = { hour12: false, timeZone: VN_TIMEZONE } as const

export function fmtTimeVN(value: Date | string): string {
  return new Date(value).toLocaleTimeString('vi-VN', {
    ...vnTimeBase,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function fmtClockVN(value: Date | string): string {
  const d = new Date(value)
  return `${fmtTimeVN(d)}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

export function fmtDateTimeVN(value: Date | string): string {
  return new Date(value).toLocaleString('vi-VN', {
    ...vnTimeBase,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function fmtDateVN(value: Date | string): string {
  return new Date(value).toLocaleDateString('vi-VN', {
    timeZone: VN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/**
 * Today's calendar date in Vietnam as `YYYY-MM-DD`, the format an
 * `<input type="date">` expects.
 *
 * Built from `en-CA` (which formats as ISO `YYYY-MM-DD`) with an explicit
 * `timeZone` rather than `toISOString().slice(0, 10)`: the latter is UTC,
 * so between 00:00 and 07:00 Vietnam time it returns YESTERDAY.
 */
export function vietnamToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: VN_TIMEZONE })
}

/** `vietnamToday()` shifted back `days` calendar days. */
export function vietnamDaysAgo(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toLocaleDateString('en-CA', { timeZone: VN_TIMEZONE })
}

/** Map HTML date inputs (calendar days in Vietnam) to ISO instants for the API. */
export function vietnamDateRangeToIso(fromDate: string, toDate: string): {
  startTime: string
  endTime: string
} {
  return {
    startTime: `${fromDate}T00:00:00+07:00`,
    endTime: `${toDate}T23:59:59+07:00`,
  }
}

/**
 * Crosshair / tooltip time label for lightweight-charts (GMT+7).
 *
 * NOTE: `localization.timeFormatter` covers ONLY the crosshair label. The
 * labels printed along the time axis itself go through
 * `timeScale.tickMarkFormatter`, which is a separate option — see
 * `chartTickMarkFormatter` below.
 */
export function chartTimeFormatter(time: number): string {
  return new Date(time * 1000).toLocaleString('vi-VN', {
    ...vnTimeBase,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Time-AXIS tick labels for lightweight-charts, in GMT+7.
 *
 * Without this, the axis fell back to the library's built-in formatter,
 * which renders UTC — so the chart showed a crosshair in Vietnam time over
 * an axis seven hours behind it. Setting only `localization.timeFormatter`
 * (as this chart used to) does not fix the axis: the two options are read
 * from different places in the library.
 *
 * `tickMarkType` tells us how much context the library wants at this zoom
 * level; we honour it so the axis stays as terse as it was, just in the
 * right timezone. The enum values are 0=Year, 1=Month, 2=DayOfMonth,
 * 3=Time, 4=TimeWithSeconds — matched numerically so this module does not
 * have to import a value (not just a type) from lightweight-charts.
 */
export function chartTickMarkFormatter(time: number, tickMarkType: number): string {
  const date = new Date(time * 1000)
  const fmt = (options: Intl.DateTimeFormatOptions): string =>
    date.toLocaleString('vi-VN', { ...vnTimeBase, ...options })

  switch (tickMarkType) {
    case 0: // Year
      return fmt({ year: 'numeric' })
    case 1: // Month
      return fmt({ month: 'short' })
    case 2: // DayOfMonth
      return fmt({ day: '2-digit', month: '2-digit' })
    case 4: // TimeWithSeconds
      return fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit' })
    default: // 3 = Time
      return fmt({ hour: '2-digit', minute: '2-digit' })
  }
}
