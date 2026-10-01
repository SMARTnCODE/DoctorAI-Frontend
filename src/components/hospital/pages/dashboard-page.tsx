'use client'

/**
 * Dashboard — hospital administration overview.
 * 8 stat cards, analytics charts, the visit-activity heat strip,
 * recent administrative activity feed, and today's shift roster.
 */
import { useEffect, useState } from 'react'
import {
  Activity, ArrowRight, Ban, Building2, CalendarClock, CalendarDays, Eye, FileSearch,
  HeartPulse, KeyRound, LogIn, LogOut, PencilLine, Plus, PlusCircle, RefreshCw, ShieldAlert,
  Stethoscope, Timer, UserCheck, UserMinus, UserPlus, UserX, Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AuditLogItem, ShiftItem } from '@/lib/api-client'
import { useApiData } from '@/hooks/use-api-data'
import { formatShiftDate, formatTime12h, timeAgo, todayLocalISO } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/hospital/page-header'
import { StatCard } from '@/components/hospital/stat-card'
import { StatusBadge } from '@/components/hospital/status-badge'
import { EmptyState } from '@/components/hospital/empty-state'
import { DashboardChartsSection } from '@/components/hospital/pages/dashboard-charts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface DashboardStats {
  totalDoctors: number
  activeDoctors: number
  inactiveDoctors: number
  totalPatients: number
  todayShifts: number
  upcomingShifts: number
  totalDepartments: number
  totalSpecializations: number
}
// Analytics fields are served by an updated /api/dashboard; optional + defaulted
// so the page keeps working while the endpoint rolls out.
interface DashboardResponse {
  stats: DashboardStats
  recentActivity: AuditLogItem[]
  patientsByDepartment?: { department: string; code?: string; count: number }[]
  weekTrend?: { date: string; label: string; scheduled: number; cancelled: number }[]
  shiftTypeDistribution?: { type: string; label: string; count: number }[]
}
interface TodayShiftsResponse { shifts: ShiftItem[] }

// ── Visit activity heat strip (GET /api/dashboard/visits-trend) ──────────

interface VisitTrendPoint {
  date: string
  weekday: string
  scheduled: number
  completed: number
  cancelled: number
  total: number
}
interface VisitTrendResponse {
  days: number
  from: string
  to: string
  points: VisitTrendPoint[]
}

type HeatDays = 7 | 14 | 30
const HEAT_DAYS_OPTIONS: HeatDays[] = [7, 14, 30]

/** Strip columns run Monday → Sunday; labels mirror the API's 'Sat'-style weekday. */
const WEEKDAY_COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const WEEKDAY_COLUMN: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
}

/**
 * Teal heat scale for a day's total visit count — matches the app accent
 * (StatCard toneBar `bg-teal-500`, StatusBadge `teal-50..200`):
 *   0 → slate-100 (empty day) · 1 → teal-100 · 2 → teal-200 ·
 *   3–4 → teal-300 · 5–6 → teal-400 · 7+ → teal-500 (+ white text).
 * Dark equivalents keep the ramp perceptible on dark card surfaces:
 * translucent teal fills ramp 0 → white/5, then teal-500/20 → /45, then
 * teal-400/70 → /90 so high-activity cells stay the brightest stop.
 */
function heatLevel(total: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (!Number.isFinite(total) || total <= 0) return 0
  if (total === 1) return 1
  if (total === 2) return 2
  if (total <= 4) return 3
  if (total <= 6) return 4
  return 5
}

const HEAT_BG = [
  'bg-slate-100 dark:bg-white/5',
  'bg-teal-100 dark:bg-teal-500/20',
  'bg-teal-200 dark:bg-teal-500/30',
  'bg-teal-300 dark:bg-teal-500/45',
  'bg-teal-400 dark:bg-teal-400/70',
  'bg-teal-500 dark:bg-teal-400/90',
] as const
const HEAT_TEXT = [
  'text-slate-400 dark:text-slate-500',
  'text-slate-600 dark:text-teal-100',
  'text-slate-700 dark:text-teal-100',
  'text-teal-950 dark:text-teal-50',
  'text-teal-950',
  'text-white',
] as const

/** Parse a 'YYYY-MM-DD' string as a local calendar date (format.ts convention). */
function parseISODate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Grid column 0..6 for a point — `weekday` field first, parsed-date fallback. */
function weekdayColumnOf(p: VisitTrendPoint): number {
  const known = WEEKDAY_COLUMN[p.weekday]
  if (known !== undefined) return known
  const d = parseISODate(p.date)
  return d ? (d.getDay() + 6) % 7 : 0
}

/**
 * Lay the zero-filled window (oldest → newest) into a Monday-first 7-wide
 * grid: leading blanks before the first day, every point, then trailing
 * blanks to close the last row (days ∈ {7,14,30} keep rows week-aligned).
 */
function buildHeatCells(points: VisitTrendPoint[]): (VisitTrendPoint | null)[] {
  const valid = (points ?? []).filter((p) => Boolean(p) && parseISODate(p.date) !== null)
  if (valid.length === 0) return []
  const leading = Array.from({ length: weekdayColumnOf(valid[0]) }, () => null)
  const filled = leading.length + valid.length
  const trailing = Array.from({ length: (7 - (filled % 7)) % 7 }, () => null)
  return [...leading, ...valid, ...trailing]
}

/** 'Fri 11 Sept 2026' — en-GB month abbreviations ('Sept' included). */
function shortDateLabel(p: VisitTrendPoint): string {
  const d = parseISODate(p.date)
  if (!d) return p.date
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} `
    + `${d.toLocaleDateString('en-GB', { month: 'short' })} ${d.getFullYear()}`
}

/** 'Friday, 11 September 2026' — full date for cell aria-labels. */
function fullDateLabel(p: VisitTrendPoint): string {
  const d = parseISODate(p.date)
  return d
    ? d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : p.date
}

/** '3 visits (1 scheduled, 2 completed)' — zero parts are omitted. */
function heatTooltipText(p: VisitTrendPoint): string {
  const parts: string[] = []
  if (p.scheduled > 0) parts.push(`${p.scheduled} scheduled`)
  if (p.completed > 0) parts.push(`${p.completed} completed`)
  if (p.cancelled > 0) parts.push(`${p.cancelled} cancelled`)
  const breakdown = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  return `${shortDateLabel(p)} · ${p.total} ${p.total === 1 ? 'visit' : 'visits'}${breakdown}`
}

/** Busiest weekday in the window (first max wins); null while all zero. */
function busiestWeekdayLabel(points: VisitTrendPoint[]): string | null {
  let best: VisitTrendPoint | null = null
  for (const p of points ?? []) {
    if ((Number(p.total) || 0) > 0 && (!best || (Number(p.total) || 0) > (Number(best.total) || 0))) {
      best = p
    }
  }
  return best ? WEEKDAY_COLUMNS[weekdayColumnOf(best)] ?? best.weekday : null
}

/** Skeleton row estimate — the window ends 'today' (hospital tz, UTC+8); the
 * ±1 day client/server skew never crosses a row boundary in practice. */
function estimateStripRows(days: number): number {
  const d = parseISODate(todayLocalISO())
  const colToday = d ? (d.getDay() + 6) % 7 : 0
  const leading = (((colToday - (days - 1)) % 7) + 7) % 7
  return Math.ceil((leading + days) / 7)
}

function HeatStripSkeleton({ rows }: { rows: number }) {
  return (
    <div className="mx-auto w-full max-w-md" aria-hidden>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_COLUMNS.map((w) => (
          <span
            key={w}
            className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {w}
          </span>
        ))}
        {Array.from({ length: rows * 7 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-md" />
        ))}
      </div>
    </div>
  )
}

function HeatCell({
  point, row, col, active, onActivate,
}: {
  point: VisitTrendPoint
  row: number
  col: number
  active: boolean
  onActivate: (date: string | null) => void
}) {
  const level = heatLevel(point.total)
  const dayOfMonth = Number(point.date.slice(8))
  // Tooltip placement: the top row opens downward, every other row upward, so
  // it never clips the card header/footer; edge columns align inward so it
  // never clips the card sides (or the 390px viewport).
  const vPos = row === 0 ? 'top-full mt-2' : 'bottom-full mb-2'
  const hPos = col <= 1 ? 'left-0' : col >= 5 ? 'right-0' : 'left-1/2 -translate-x-1/2'
  const arrowH = col <= 1 ? 'left-3' : col >= 5 ? 'right-3' : 'left-1/2 -translate-x-1/2'
  const arrowV = row === 0 ? '-top-1' : '-bottom-1'
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => navigate(`/super-admin/visits?from=${point.date}&to=${point.date}`)}
        onMouseEnter={() => onActivate(point.date)}
        onMouseLeave={() => {
          if (active) onActivate(null)
        }}
        onFocus={() => onActivate(point.date)}
        onBlur={() => {
          if (active) onActivate(null)
        }}
        aria-label={`${point.total} ${point.total === 1 ? 'visit' : 'visits'} on ${fullDateLabel(point)}`}
        data-testid={`heat-cell-${point.date}`}
        className={cn(
          'relative aspect-square w-full rounded-md border border-slate-200/60 tabular-nums'
            + ' dark:border-slate-700/60',
          'transition-transform duration-150 motion-reduce:transition-none',
          'hover:z-10 hover:scale-105 hover:ring-2 hover:ring-teal-400',
          'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2'
            + ' focus-visible:ring-teal-500 focus-visible:ring-offset-2'
            + ' dark:focus-visible:ring-offset-background',
          HEAT_BG[level],
          HEAT_TEXT[level],
        )}
      >
        <span className="absolute left-1 top-1 text-[10px] leading-none tabular-nums">
          {dayOfMonth}
        </span>
      </button>
      {active ? (
        <div
          data-testid="heat-tooltip"
          className={cn(
            'pointer-events-none absolute z-50 w-max max-w-[220px] rounded-md bg-slate-900'
            + ' px-2.5 py-1.5 text-xs leading-snug text-white shadow-lg',
            vPos,
            hPos,
          )}
        >
          {heatTooltipText(point)}
          <span aria-hidden className={cn('absolute size-2 rotate-45 bg-slate-900', arrowV, arrowH)} />
        </div>
      ) : null}
    </div>
  )
}

function VisitActivityCard({
  days, onDaysChange, data, loading, error, onRetry,
}: {
  days: HeatDays
  onDaysChange: (days: HeatDays) => void
  data: VisitTrendResponse | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const [activeDate, setActiveDate] = useState<string | null>(null)

  // Defensive normalization — missing API fields degrade to zeros/empties
  // (mirrors DashboardChartsSection's input handling).
  const points: VisitTrendPoint[] = (data?.points ?? [])
    .filter((p): p is VisitTrendPoint => Boolean(p) && typeof p.date === 'string')
    .map((p) => ({
      date: p.date,
      weekday: typeof p.weekday === 'string' ? p.weekday : '',
      scheduled: Number(p.scheduled) || 0,
      completed: Number(p.completed) || 0,
      cancelled: Number(p.cancelled) || 0,
      total: Number(p.total) || 0,
    }))
  const cells = buildHeatCells(points)
  const totalVisits = points.reduce((sum, p) => sum + p.total, 0)
  const busiest = busiestWeekdayLabel(points)
  const allZero = totalVisits === 0

  return (
    <Card data-testid="visit-activity-card">
      <CardHeader>
        <CardTitle className="text-base">Visit activity</CardTitle>
        <CardDescription>
          Daily visits over the last {days} days
          {data?.from && data.to ? ` · ${formatShiftDate(data.from)} — ${formatShiftDate(data.to)}` : ''}
        </CardDescription>
        <CardAction>
          <div
            role="group"
            aria-label="Visit activity range"
            className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-white/5"
          >
            {HEAT_DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDaysChange(d)}
                aria-pressed={days === d}
                aria-label={`Show last ${d} days`}
                data-testid={`heat-days-${d}`}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors'
                  + ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                  days === d
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-foreground'
                    : 'text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300',
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <HeatStripSkeleton rows={estimateStripRows(days)} />
        ) : error && !data ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load visit activity{error ? ` — ${error}` : '.'}
            </p>
            <Button variant="ghost" size="sm" onClick={onRetry} data-testid="heat-retry">
              Retry
            </Button>
          </div>
        ) : (
          <div
            className={cn('mx-auto w-full max-w-md', loading && 'pointer-events-none opacity-60')}
            aria-busy={loading}
          >
            <div className="grid grid-cols-7 gap-1" data-testid="visit-heat-strip">
              {WEEKDAY_COLUMNS.map((w) => (
                <span
                  key={w}
                  className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {w}
                </span>
              ))}
              {cells.map((p, i) =>
                p === null ? (
                  <div key={`blank-${i}`} aria-hidden />
                ) : (
                  <HeatCell
                    key={p.date}
                    point={p}
                    row={Math.floor(i / 7)}
                    col={i % 7}
                    active={activeDate === p.date}
                    onActivate={setActiveDate}
                  />
                ),
              )}
            </div>
            {allZero ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                No visits recorded in this window yet.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3 border-t !pt-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Less</span>
          {HEAT_BG.slice(1).map((bg) => (
            <span key={bg} aria-hidden className={cn('size-3 rounded-[3px] border border-slate-200/60 dark:border-slate-700/60', bg)} />
          ))}
          <span>More</span>
        </div>
        {data ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 tabular-nums dark:bg-white/5 dark:text-slate-300">
              Σ {totalVisits} {totalVisits === 1 ? 'visit' : 'visits'}
            </span>
            {busiest ? (
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                Busiest: {busiest}
              </span>
            ) : null}
          </div>
        ) : null}
      </CardFooter>
    </Card>
  )
}

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  LOGIN: LogIn, LOGOUT: LogOut, LOGIN_FAILED: ShieldAlert, CREATE: PlusCircle,
  UPDATE: PencilLine, DEACTIVATE: UserX, ACTIVATE: UserCheck, VIEW: Eye,
  ACCESS: FileSearch, CANCEL: Ban, ASSIGN: UserPlus, UNASSIGN: UserMinus,
  PASSWORD_CHANGE: KeyRound,
}

const ACTIVITY_ICON_TONES: Record<string, string> = {
  LOGIN: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
  LOGOUT: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400',
  LOGIN_FAILED: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  CREATE: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  UPDATE: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  DEACTIVATE: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  ACTIVATE: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
  VIEW: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400',
  ACCESS: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
  CANCEL: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  ASSIGN: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  UNASSIGN: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300',
  PASSWORD_CHANGE: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/10 dark:text-fuchsia-300',
}

function ActivityIcon({ action }: { action: string }) {
  const Icon = ACTIVITY_ICONS[action] ?? Activity
  const tone = ACTIVITY_ICON_TONES[action] ?? 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400'
  return (
    <span
      className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${tone}`}
      aria-hidden
    >
      <Icon className="size-4" />
    </span>
  )
}

function ActivityListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const today = todayLocalISO()
  const { data, loading, error, refetch } = useApiData<DashboardResponse>(`/api/dashboard?date=${today}`)
  const {
    data: shiftData, loading: shiftsLoading, error: shiftsError, refetch: refetchShifts,
  } = useApiData<TodayShiftsResponse>(`/api/shifts?date=${today}&pageSize=100`)

  // Visit-activity heat strip — toggling the range changes the path (refetch,
  // previous window stays visible while loading, mirroring schedule-stats).
  const [trendDays, setTrendDays] = useState<HeatDays>(14)
  const {
    data: trendData, loading: trendLoading, error: trendError, refetch: refetchTrend,
  } = useApiData<VisitTrendResponse>(`/api/dashboard/visits-trend?days=${trendDays}`)

  const stats = data?.stats
  const activity = data?.recentActivity ?? []
  const todayShifts = shiftData?.shifts ?? []
  const hasError = Boolean(error || shiftsError)
  const errorMessage = error ?? shiftsError

  // Freshness — remember when the visible stats were fetched. Manual refresh
  // keeps it calm (no polling; mirrors the settings System status card).
  const [statsFetchedAt, setStatsFetchedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!data) return
    // Deferred to satisfy react-hooks/set-state-in-effect (codebase convention).
    const t = setTimeout(() => setStatsFetchedAt(new Date()), 0)
    return () => clearTimeout(t)
  }, [data])

  // Server-side 401s surface as "...sign in..." messages — send the user back to the login view.
  useEffect(() => {
    const msg = error ?? shiftsError ?? trendError
    if (msg && msg.includes('sign in')) {
      toast.error('Session expired. Please sign in again.')
      navigate('/super-admin/login')
    }
  }, [error, shiftsError, trendError])

  const retryAll = () => {
    void refetch()
    void refetchShifts()
    void refetchTrend()
  }

  const refreshDashboard = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([refetch(), refetchShifts(), refetchTrend()])
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Hospital administration overview"
        actions={
          <>
            <div className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="dashboard-freshness">
              <Timer className="size-3.5 shrink-0" aria-hidden />
              <span className="tabular-nums" aria-live="polite">
                Updated {statsFetchedAt ? timeAgo(statsFetchedAt) : '—'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:bg-muted hover:text-teal-700 dark:hover:text-teal-300 focus-visible:ring-2 focus-visible:ring-teal-500"
                onClick={() => void refreshDashboard()}
                disabled={refreshing}
                data-testid="refresh-dashboard"
                aria-label="Refresh dashboard"
              >
                <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
              </Button>
            </div>
            <Button onClick={() => navigate('/super-admin/doctors/new')} className="active:scale-[0.98]">
              <Plus className="size-4" aria-hidden /> Add Doctor
            </Button>
          </>
        }
      />

      {hasError ? (
        <Alert variant="destructive" role="alert">
          <RefreshCw className="size-4" aria-hidden />
          <AlertTitle>Could not load dashboard</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage}</span>
            <Button size="sm" variant="outline" onClick={retryAll}>
              <RefreshCw className="size-4" aria-hidden /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Stat cards */}
      <section aria-label="Key hospital statistics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Stethoscope} label="Total Doctors" value={stats?.totalDoctors} tone="teal" loading={loading} index={0} />
          <StatCard icon={UserCheck} label="Active Doctors" value={stats?.activeDoctors} tone="emerald" loading={loading} index={1} />
          <StatCard icon={UserX} label="Inactive Doctors" value={stats?.inactiveDoctors} tone="slate" loading={loading} index={2} />
          <StatCard icon={Users} label="Total Patients" value={stats?.totalPatients} tone="sky" loading={loading} index={3} />
          <StatCard icon={CalendarClock} label="Today's Shifts" value={stats?.todayShifts} tone="amber" loading={loading} index={4} />
          <StatCard icon={CalendarDays} label="Upcoming Shifts" value={stats?.upcomingShifts} tone="violet" loading={loading} index={5} />
          <StatCard icon={Building2} label="Total Departments" value={stats?.totalDepartments} tone="teal" loading={loading} index={6} />
          <StatCard icon={HeartPulse} label="Total Specializations" value={stats?.totalSpecializations} tone="rose" loading={loading} index={7} />
        </div>
      </section>

      {/* Analytics charts (patients by department + weekly trend + shifts by type) */}
      <DashboardChartsSection
        byDepartment={data?.patientsByDepartment ?? []}
        weekTrend={data?.weekTrend ?? []}
        shiftTypeDistribution={data?.shiftTypeDistribution ?? []}
        loading={loading}
      />

      {/* Visit activity heat strip (daily visit counts, 7/14/30-day window) */}
      <section aria-label="Visit activity">
        <VisitActivityCard
          days={trendDays}
          onDaysChange={setTrendDays}
          data={trendData}
          loading={trendLoading}
          error={trendError}
          onRetry={() => void refetchTrend()}
        />
      </section>

      {/* Recent activity + today's shift roster */}
      <section aria-label="Activity and shift roster" className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>Latest administrative actions across the portal</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ActivityListSkeleton />
            ) : activity.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Administrative actions such as doctor updates and shift changes will appear here."
              />
            ) : (
              <ul className="hms-scroll max-h-96 overflow-y-auto pr-1" data-testid="recent-activity-list">
                {activity.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-3 border-b border-slate-200/60 px-2 py-2.5 transition-colors last:border-0 hover:bg-muted/30 dark:border-slate-700/60"
                  >
                    <ActivityIcon action={a.action} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-slate-700 dark:text-slate-300">{a.description}</p>
                      <div className="mt-1">
                        <Badge variant="outline" className="text-xs font-medium">{a.module}</Badge>
                      </div>
                    </div>
                    <span className="shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">
                      {timeAgo(a.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <CardFooter className="border-t !pt-4">
            <Button
              variant="link"
              className="h-auto p-0 text-teal-700 dark:text-teal-300"
              onClick={() => navigate('/super-admin/audit-logs')}
            >
              View all activity <ArrowRight className="size-4" aria-hidden />
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s Shifts</CardTitle>
            <CardDescription>Scheduled duty roster for today</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {shiftsLoading ? (
              <div className="space-y-3" aria-hidden>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="mt-2 h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : todayShifts.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No shifts today"
                description="There are no scheduled shifts for today. Assign shifts to keep coverage on track."
                action={
                  <Button size="sm" variant="outline" onClick={() => navigate('/super-admin/shifts')}>
                    Go to shifts
                  </Button>
                }
              />
            ) : (
              <ul className="hms-scroll max-h-96 space-y-2 overflow-y-auto pr-1">
                {todayShifts.map((s) => (
                  <li key={s.id} className="rounded-lg border p-3 hms-row-hover">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        Dr. {s.doctor.firstName} {s.doctor.lastName}
                      </p>
                      <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
                        {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={s.shiftType} />
                      <StatusBadge status={s.status} />
                      {s.room ? (
                        <span className="text-xs text-muted-foreground">Room {s.room}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <CardFooter className="border-t !pt-4">
            <Button
              variant="link"
              className="h-auto p-0 text-teal-700 dark:text-teal-300"
              onClick={() => navigate('/super-admin/shifts')}
            >
              Manage shifts <ArrowRight className="size-4" aria-hidden />
            </Button>
          </CardFooter>
        </Card>
      </section>
    </div>
  )
}
