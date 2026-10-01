'use client'

import { SHIFT_TYPE_LABELS } from '@/lib/shift-utils'

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Shift dates are stored at UTC midnight — format via UTC to avoid off-by-one. */
export function formatShiftDate(value?: string | Date | null): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function timeAgo(value?: string | Date | null): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(d)
}

export function ageFrom(dob?: string | null): string {
  const age = ageYears(dob)
  return age === null ? '—' : `${age} yrs`
}

/** Numeric age in whole years (null when DOB missing/invalid) — used by CSV export. */
export function ageYears(dob?: string | null): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

export { SHIFT_TYPE_LABELS, formatTime12h } from '@/lib/shift-utils'

export function shiftTypeLabel(t: string): string {
  return SHIFT_TYPE_LABELS[t] ?? t
}

export const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Login', LOGOUT: 'Logout', LOGIN_FAILED: 'Failed login',
  CREATE: 'Created', UPDATE: 'Updated', DEACTIVATE: 'Deactivated', ACTIVATE: 'Activated',
  VIEW: 'Viewed', ACCESS: 'Accessed', CANCEL: 'Cancelled', DELETE: 'Deleted',
  ASSIGN: 'Assigned', UNASSIGN: 'Unassigned', PASSWORD_CHANGE: 'Password changed',
  RESUME_UPLOADED: 'Resume uploaded', RESUME_REPLACED: 'Resume replaced',
  RESUME_REMOVED: 'Resume removed', DOCTOR_PASSWORD_RESET: 'Password reset',
  DOCTOR_LOCKED: 'Account locked', DOCTOR_UNLOCKED: 'Account unlocked',
  // Task 26 — Super Admin central doctor-control actions.
  DOCTOR_LOGIN_CREATED: 'Doctor login created',
  DOCTOR_PASSWORD_CHANGED: 'Doctor password changed',
  DOCTOR_PASSWORD_CHANGE_FORCED: 'Force password change',
  DOCTOR_ACCOUNT_ENABLED: 'Account enabled', DOCTOR_ACCOUNT_DISABLED: 'Account disabled',
  DOCTOR_SUSPENDED: 'Doctor suspended', DOCTOR_SUSPENSION_LIFTED: 'Suspension lifted',
  DOCTOR_TERMINATED: 'Doctor terminated',
  DOCTOR_DELETE_INITIATED: 'Delete initiated', DOCTOR_DELETED: 'Doctor account deleted',
}

export function todayLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function weekdayShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short' })
}

export function dayNum(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return String(d.getDate()).padStart(2, '0')
}

export function monthLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
