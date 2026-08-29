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

/** Format a UTC timestamp for lightweight-charts axis labels (GMT+7). */
export function chartTimeFormatter(time: number): string {
  return new Date(time * 1000).toLocaleString('vi-VN', {
    ...vnTimeBase,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
