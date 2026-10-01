'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/* Soft, muted status chips (stakeholder palette): success #E7F3EC/#2F7054,
   warning #FBF3DF/#916D1D, danger #F9E9E6/#A84438, info #E7F1F4/#416D7C.
   Account-lifecycle entries reuse the same families: LOCKED → danger (rose),
   PASSWORD_RESET_REQUIRED → warning (amber), DEACTIVATED → neutral slate
   (same visual family as INACTIVE). Light values are solid soft fills; dark
   uses translucent /10 fills + -300 text + -500/25 borders so badges stay
   legible on dark card surfaces. */
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/25',
  INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-slate-700/60',
  ON_LEAVE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',
  // Task 26 — employment lifecycle extensions (Super Admin central control).
  SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',
  TERMINATED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  SCHEDULED: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/25',
  RESCHEDULED: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  MORNING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',
  AFTERNOON: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/25',
  EVENING: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-slate-700/60',
  NIGHT: 'bg-teal-900 text-white border-teal-900 dark:bg-teal-800 dark:border-teal-700',
  EMERGENCY: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  CUSTOM: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-slate-700/60',
  // Account lifecycle (Task 24)
  LOCKED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  PASSWORD_RESET_REQUIRED: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',
  DEACTIVATED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-slate-700/60',
  DISABLED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-slate-700/60',
  STABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25',
  MODERATE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',
  CRITICAL: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  DISCHARGED: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-slate-700/60',
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active', INACTIVE: 'Inactive', ON_LEAVE: 'On Leave',
  SCHEDULED: 'Scheduled', RESCHEDULED: 'Rescheduled', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
  MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening',
  NIGHT: 'Night', EMERGENCY: 'Emergency', CUSTOM: 'Custom',
  LOCKED: 'Locked', PASSWORD_RESET_REQUIRED: 'Password Reset Required',
  // Task 26 — DEACTIVATED renders as "Disabled" (Enable/Disable Account flows);
  DEACTIVATED: 'Deactivated',
  DISABLED: 'Disabled',
  SUSPENDED: 'Suspended', TERMINATED: 'Terminated',
  STABLE: 'Stable', MODERATE: 'Moderate', CRITICAL: 'Critical', DISCHARGED: 'Discharged',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-slate-700/60'
  return (
    <Badge variant="outline" className={cn('rounded-full font-medium whitespace-nowrap', style, className)}>
      <span className="mr-1 inline-block size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}
