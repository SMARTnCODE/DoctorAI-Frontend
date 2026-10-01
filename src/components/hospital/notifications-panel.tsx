'use client'

/**
 * Notifications bell + dropdown panel fed by GET /api/notifications.
 * - Fetches on first open (cached per mount session), manual refresh available
 * - Unread badge = items newer than the `hms-notifs-last-seen` localStorage
 *   timestamp (capped display "9+"); opening the panel or "Mark all as read"
 *   updates last-seen to now.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowRight, Bell, CheckCircle2, KeyRound, Loader2, PenLine, Plus,
  RefreshCw, ShieldAlert, UserCheck, UserMinus, UserPlus, UserX, XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { apiFetch, ApiError } from '@/lib/api-client'
import { navigate } from '@/lib/hash-nav'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

const LAST_SEEN_KEY = 'hms-notifs-last-seen'

interface NotificationItem {
  id: string
  action: string
  module: string
  recordLabel: string | null
  description: string
  userName: string | null
  timestamp: string
}

const NOTIF_ICONS: Record<string, LucideIcon> = {
  CREATE: Plus,
  UPDATE: PenLine,
  DEACTIVATE: UserX,
  ACTIVATE: UserCheck,
  CANCEL: XCircle,
  PASSWORD_CHANGE: KeyRound,
  LOGIN_FAILED: ShieldAlert,
  ASSIGN: UserPlus,
  UNASSIGN: UserMinus,
}

const NOTIF_TONES: Record<string, string> = {
  CREATE: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
  UPDATE: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  DEACTIVATE: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  ACTIVATE: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  CANCEL: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  PASSWORD_CHANGE: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
  LOGIN_FAILED: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  ASSIGN: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  UNASSIGN: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300',
}

function NotificationIcon({ action }: { action: string }) {
  const Icon = NOTIF_ICONS[action] ?? Activity
  const tone = NOTIF_TONES[action] ?? 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400'
  return (
    <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', tone)} aria-hidden>
      <Icon className="size-3.5" />
    </span>
  )
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastSeen, setLastSeen] = useState<string | null>(null)

  // Hydrate last-seen from localStorage (client only).
  useEffect(() => {
    setLastSeen(window.localStorage.getItem(LAST_SEEN_KEY))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ notifications?: NotificationItem[] }>('/api/notifications')
      setItems(Array.isArray(data.notifications) ? data.notifications : [])
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        toast.error('Session expired. Please sign in again.')
        navigate('/super-admin/login')
        setOpen(false)
        return
      }
      // Endpoint briefly unavailable → treat as empty rather than breaking the bell.
      setItems((prev) => prev ?? [])
      toast.error(e instanceof ApiError ? e.message : 'Could not load notifications.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch once on mount (so the unread badge is populated before the first
  // open) and refresh each time the dropdown opens (cached while open).
  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const markAllSeen = useCallback(() => {
    const now = new Date().toISOString()
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, now)
    } catch {
      /* storage unavailable (private mode) — badge just won't persist */
    }
    setLastSeen(now)
  }, [])

  // Opening the panel counts as seeing the list.
  useEffect(() => {
    if (open) markAllSeen()
  }, [open, markAllSeen])

  const unreadCount = useMemo(() => {
    if (!items) return 0
    if (!lastSeen) return items.length
    const seen = new Date(lastSeen).getTime()
    if (Number.isNaN(seen)) return items.length
    return items.filter((n) => {
      const ts = new Date(n.timestamp).getTime()
      return Number.isFinite(ts) && ts > seen
    }).length
  }, [items, lastSeen])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9" aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}>
          <Bell className="size-4.5" />
          {unreadCount > 0 ? (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-semibold text-white ring-2 ring-white dark:ring-white/20"
              aria-hidden
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifications</p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label="Refresh notifications"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            </Button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-500/10"
              onClick={markAllSeen}
            >
              Mark all as read
            </button>
          </div>
        </div>

        {/* List */}
        <div className="hms-scroll max-h-96 overflow-y-auto">
          {loading && !items ? (
            <div className="space-y-3 px-3 py-3" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <Skeleton className="size-7 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (items ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-500/10" aria-hidden>
                <CheckCircle2 className="size-5 text-teal-600 dark:text-teal-300" />
              </span>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">You&apos;re all caught up.</p>
              <p className="text-xs text-muted-foreground">Notable events (creates, updates, cancellations) will appear here.</p>
            </div>
          ) : (
            (items ?? []).map((n) => (
              <div key={n.id ?? n.timestamp} className="flex gap-2.5 border-b border-border/60 px-3 py-2.5 last:border-b-0 hover:bg-slate-50 dark:hover:bg-white/5">
                <NotificationIcon action={n.action} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">{n.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">{timeAgo(n.timestamp)}</span>
                    {n.module ? (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">{n.module}</Badge>
                    ) : null}
                    {n.userName ? (
                      <span className="truncate text-[11px] text-muted-foreground">· {n.userName}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-3 py-2">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-500/10"
            onClick={() => {
              setOpen(false)
              navigate('/super-admin/audit-logs')
            }}
          >
            View audit logs <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
