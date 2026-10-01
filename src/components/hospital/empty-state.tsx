'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Inline medical illustration (~120px) — clipboard + medical-cross motif in
 * teal/emerald tones with the contextual icon in a small white chip.
 * Pure SVG (no imported images), decorative (the title conveys meaning).
 */
function EmptyIllustration({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="relative" aria-hidden>
      <svg width="120" height="96" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="block">
        {/* soft ground shadow */}
        <ellipse cx="60" cy="89" rx="36" ry="4.5" fill="var(--muted)" opacity="0.8" />
        {/* decorative accents */}
        <circle cx="20" cy="28" r="4" fill="#99f6e4" />
        <circle cx="101" cy="20" r="3" fill="#a7f3d0" />
        <path d="M97 54h8M101 50v8" stroke="#5eead4" strokeWidth="2" strokeLinecap="round" />
        <path d="M15 58h6M18 55v6" stroke="#a7f3d0" strokeWidth="2" strokeLinecap="round" />
        {/* clipboard board */}
        <rect x="38" y="16" width="44" height="66" rx="8" fill="var(--card)" stroke="#99f6e4" strokeWidth="2.5" />
        {/* clipboard clip */}
        <rect x="51" y="10" width="18" height="11" rx="3.5" fill="#99f6e4" />
        {/* medical cross */}
        <rect x="55.5" y="28" width="9" height="30" rx="3" fill="#34d399" />
        <rect x="45" y="38.5" width="30" height="9" rx="3" fill="#34d399" />
        {/* paper lines */}
        <path d="M48 66h24M48 73h14" stroke="#ccfbf1" strokeWidth="2.5" strokeLinecap="round" className="dark:opacity-40" />
      </svg>
      <span className="absolute -top-1.5 -right-1.5 flex size-8 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-teal-100 dark:bg-white/10 dark:ring-teal-500/25">
        <Icon className="size-3.5 text-teal-600 dark:text-teal-300" />
      </span>
    </div>
  )
}

export function EmptyState({
  icon: Icon, title, description, action, className, illustrated = false,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  /** Render the larger illustrated medical motif instead of the compact icon circle. */
  illustrated?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed bg-slate-50/60 px-6 py-14 text-center dark:bg-white/5', className)}>
      {illustrated ? (
        <EmptyIllustration icon={Icon} />
      ) : (
        <div className="flex size-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 dark:bg-white/10 dark:ring-slate-700/60">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        </div>
      )}
      <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
