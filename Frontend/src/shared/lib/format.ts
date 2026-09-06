/**
 * Formatters for machine data. Everything here renders in mono + tabular-nums
 * at the call site (`.machine` utility) — these functions only produce the string.
 */

/** +918247350941 → +91 82473 50941. Non-E.164 input is returned unchanged. */
export function formatPhone(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('+')) return trimmed

  const digits = trimmed.slice(1)
  // India: +91 XXXXX XXXXX
  if (digits.startsWith('91') && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
  }
  // US/Canada: +1 XXX XXX XXXX
  if (digits.startsWith('1') && digits.length === 11) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  return trimmed
}

/** 93 → 1:33. Durations over an hour get h:mm:ss. */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—'

  const seconds = Math.floor(totalSeconds % 60)
  const minutes = Math.floor((totalSeconds / 60) % 60)
  const hours = Math.floor(totalSeconds / 3600)

  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${String(hours)}:${String(minutes).padStart(2, '0')}:${ss}`
  return `${String(minutes)}:${ss}`
}

const currencyFormatters = new Map<string, Intl.NumberFormat>()

/** Minor units in, display string out. 125050 + INR → ₹1,250.50 */
export function formatCurrency(minorUnits: number, currency = 'INR'): string {
  let formatter = currencyFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    })
    currencyFormatters.set(currency, formatter)
  }
  return formatter.format(minorUnits / 100)
}

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1000],
] as const

/** Past or future ISO timestamp → "3 minutes ago" / "in 2 hours". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return '—'

  const deltaMs = then - now
  for (const [unit, msPerUnit] of RELATIVE_UNITS) {
    if (Math.abs(deltaMs) >= msPerUnit) {
      return relativeFormatter.format(Math.round(deltaMs / msPerUnit), unit)
    }
  }
  return 'just now'
}

const timestampFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * ISO → "06 Sep 14:32". Table-safe fixed width.
 *
 * Built from parts rather than the formatted string: en-IN renders month as
 * "Sept" and inserts a comma, which breaks column alignment in a dense table.
 * We want exactly three letters and no separator.
 */
export function formatTimestamp(iso: string): string {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return '—'

  const parts = timestampFormatter.formatToParts(parsed)
  const find = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''

  const month = find('month').slice(0, 3)
  return `${find('day')} ${month} ${find('hour')}:${find('minute')}`
}

/** 0.82 → 82%. Confidence scores and match scores. */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—'
  return `${String(Math.round(ratio * 100))}%`
}
