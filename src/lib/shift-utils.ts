/**
 * Shift scheduling utilities — validation & conflict detection.
 */
export const SHIFT_TYPES = ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'EMERGENCY', 'CUSTOM'] as const
export type ShiftType = (typeof SHIFT_TYPES)[number]

export const SHIFT_TYPE_LABELS: Record<string, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
  NIGHT: 'Night',
  EMERGENCY: 'Emergency',
  CUSTOM: 'Custom',
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidTime(t: string): boolean {
  return TIME_RE.test(t)
}

/** Shift start must be strictly before end (same calendar day). */
export function isTimeRangeValid(start: string, end: string): boolean {
  if (!isValidTime(start) || !isValidTime(end)) return false
  return start < end // zero-padded HH:MM compares lexicographically
}

export function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export interface Interval { startTime: string; endTime: string }

/** Two shifts conflict when they overlap in time on the same date for the same doctor. */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return minutesOf(a.startTime) < minutesOf(b.endTime) && minutesOf(a.endTime) > minutesOf(b.startTime)
}

/**
 * Shift length in minutes; endTime <= startTime is treated as an overnight
 * shift (+24h). Numeric counterpart of shiftDurationLabel for aggregations
 * (e.g. weekly utilization hours).
 */
export function shiftDurationMinutes(start: string, end: string): number {
  const mins = minutesOf(end) - minutesOf(start)
  return mins <= 0 ? mins + 24 * 60 : mins
}

export function shiftDurationLabel(start: string, end: string): string {
  const mins = minutesOf(end) - minutesOf(start)
  if (mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

export function formatTime12h(t: string): string {
  if (!isValidTime(t)) return t
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}
