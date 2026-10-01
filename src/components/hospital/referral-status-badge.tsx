'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STYLES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/25',
  ACCEPTED: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/25',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-slate-700/60',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25',
}

const LABELS: Record<string, string> = {
  PENDING: 'Review required',
  ACCEPTED: 'Active referral',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
}

export function ReferralStatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toUpperCase()
  return (
    <Badge variant="outline" className={cn('rounded-full font-medium whitespace-nowrap', STYLES[key], className)}>
      {LABELS[key] ?? status}
    </Badge>
  )
}
