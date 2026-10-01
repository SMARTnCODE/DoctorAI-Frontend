'use client'

import { cn } from '@/lib/utils'

const TONES: Record<string, string> = {
  critical: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  high: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30',
  moderate: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30',
  stable: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  normal: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  low: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/30',
  scheduled: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10',
  'checked-in': 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-500/30',
  'in-progress': 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  'no-show': 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  admitted: 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-500/30',
  outpatient: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10',
  telehealth: 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-500/30',
  pending: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30',
}

const LABELS: Record<string, string> = {
  'checked-in': 'Checked-in',
  'in-progress': 'In progress',
  'no-show': 'No-show',
  admitted: 'In-Hospital',
  outpatient: 'OP Patient',
  telehealth: 'Telehealth',
}

export function StatusPill({ value }: { value: string }) {
  const key = value.toLowerCase()
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset', TONES[key] ?? TONES.scheduled)}>
      {LABELS[key] ?? value}
    </span>
  )
}
