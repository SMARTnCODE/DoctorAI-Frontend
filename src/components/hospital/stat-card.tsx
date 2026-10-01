'use client'

import { useEffect, useRef, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

function formatStatNumber(n: number, isInteger: boolean): string {
  return isInteger ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1)
}

/**
 * Count-up number for stat cards — animates from the previously shown value
 * (0 on first mount) to `value` over ~0.8s easeOut. Respects reduced motion
 * (renders the final value instantly) and is hydration-safe (initial 0).
 */
function CountUpValue({ value }: { value: number }) {
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)

  useEffect(() => {
    if (reduceMotion) {
      // Render the final value directly (see `shown` below) — no animation needed.
      displayRef.current = value
      return
    }
    const controls = animate(displayRef.current, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => {
        displayRef.current = v
        setDisplay(v)
      },
    })
    return () => controls.stop()
  }, [value, reduceMotion])

  const shown = reduceMotion ? value : display
  return <>{Number.isFinite(value) ? formatStatNumber(shown, Number.isInteger(value)) : '—'}</>
}

export function StatCard({
  icon: Icon, label, value, hint, tone = 'teal', loading, index = 0,
}: {
  icon: LucideIcon
  label: string
  value: number | string | null | undefined
  hint?: string
  tone?: 'teal' | 'emerald' | 'slate' | 'amber' | 'rose' | 'sky' | 'violet'
  loading?: boolean
  /** Optional position for the 30ms-staggered fade-up entrance. */
  index?: number
}) {
  const reduceMotion = useReducedMotion()
  /* Soft, muted icon containers (stakeholder palette). No per-card color
     decoration — color is reserved for meaning (status), not decoration. */
  const toneRing: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
    violet: 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400',
  }
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut', delay: Math.min(index, 11) * 0.03 }}
      className="relative overflow-hidden rounded-lg border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : typeof value === 'number' ? (
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              <CountUpValue value={value} />
            </p>
          ) : (
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value ?? '—'}</p>
          )}
          {hint && !loading ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', toneRing[tone])}>
          <Icon className="size-5" aria-hidden />
        </div>
      </div>
    </motion.div>
  )
}
