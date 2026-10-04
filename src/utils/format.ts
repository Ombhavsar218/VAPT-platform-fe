/** Presentation helpers for dates, durations and numbers. */

/** `2m 14s`, `1h 04m`, `—` */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) {
    return '—'
  }
  if (totalSeconds < 1) return '<1s'

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

/** Always `HH:MM:SS` — for live elapsed timers. */
export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** `3 hours ago`, `in 2 days` */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'

  const timestamp = new Date(iso).getTime()
  if (Number.isNaN(timestamp)) return '—'

  const deltaSeconds = (timestamp - Date.now()) / 1000
  const absolute = Math.abs(deltaSeconds)

  if (absolute < 45) return 'just now'

  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (absolute >= unitSeconds) {
      return relativeFormatter.format(Math.round(deltaSeconds / unitSeconds), unit)
    }
  }
  return 'just now'
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date)
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : timeFormatter.format(date)
}

/** `1,204` */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

/** `12.4k` — for dashboard tiles where width matters. */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${value.toFixed(fractionDigits)}%`
}

/** `AR` from `Aarav Reddy`. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.charAt(0) ?? '?'
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : ''
  return (first + last).toUpperCase()
}

/** Hostname without protocol, for compact table cells. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? url
  }
}

/** `/api/users/{id}` with the origin stripped. */
export function pathOf(url: string): string {
  try {
    const { pathname } = new URL(url)
    return pathname === '' ? '/' : pathname
  } catch {
    return url
  }
}

export function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}
