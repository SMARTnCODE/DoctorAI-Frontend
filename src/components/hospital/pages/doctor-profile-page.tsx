'use client'

/**
 * Doctor profile — complete clinical and administrative record.
 * Tabs: Overview, Account & Login, Qualifications, Specialization, Patients, Shifts, Activity.
 * Task 26 — Super Admin Control Center: a "Super Admin Controls" card above the
 * tabs (account/employment/assignments/next shift + the full action row), a
 * consolidated "Doctor Controls" dropdown in the header, an Account & Login tab
 * (login identity, suspension/termination details, account lifecycle controls),
 * patient unassignment and per-shift cancel — all with confirmations, toasts
 * and refetch on every mutation.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  Activity, ArrowLeft, BarChart3, Ban, Building2, CalendarClock, CalendarPlus, ChevronDown,
  CircleOff, Download, Eye, FilePen, FileSearch, FileText, FileUp, FileX, GraduationCap, Hash,
  HeartPulse, KeyRound, Loader2, Lock, LockOpen, LogIn, LogOut, Pencil, PencilLine, PlusCircle,
  RefreshCw, RotateCcwKey, ShieldAlert, ShieldCheck, ShieldOff, SlidersHorizontal, Stethoscope,
  Trash2, TrendingUp, UserCheck, UserCog, UserMinus, UserPlus, UserX, Users,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { LucideIcon } from 'lucide-react'
import { apiFetch, ApiError, type AuditLogItem, type DoctorRef } from '@/lib/api-client'
import {
  DOCTOR_ACTION_UNAVAILABLE, doctorActionError, doctorControlFlags, doctorsService, mapAdminDoctorDetail, usableDoctorId,
  type DoctorPatient,
} from '@/services/doctors.service'
import { AssignShiftDialog } from '@/components/hospital/assign-shift-dialog'
import { useApiData } from '@/hooks/use-api-data'
import {
  ageFrom, formatDate, formatDateTime, formatShiftDate, formatTime12h, initials, isoDaysFromNow,
  timeAgo, todayLocalISO, weekdayShort,
} from '@/lib/format'
import { buildCsv, downloadTextFile } from '@/lib/csv-export'
import { trackRecentItem } from '@/lib/recent-items'
import { minutesOf } from '@/lib/shift-utils'
import { navigate } from '@/lib/hash-nav'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/hospital/page-header'
import { StatusBadge, getStatusLabel } from '@/components/hospital/status-badge'
import { EmptyState } from '@/components/hospital/empty-state'
import { ConfirmDialog } from '@/components/hospital/confirm-dialog'
import { ResetPasswordDialog } from '@/components/hospital/reset-password-dialog'
import { DeleteDoctorDialog } from '@/components/hospital/delete-doctor-dialog'
import { StatCard } from '@/components/hospital/stat-card'
// Task 26 — central doctor control dialogs (26-b). The parent page owns the
// account/employment flows; these dialogs collect credentials/reasons and
// hand actions back via callbacks.
import { ManageAccountDialog } from '@/components/hospital/manage-account-dialog'
import { ChangePasswordDialog } from '@/components/hospital/change-password-dialog'
import { SuspendDoctorDialog } from '@/components/hospital/suspend-doctor-dialog'
import { TerminateDoctorDialog } from '@/components/hospital/terminate-doctor-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ResumeDropzone, ResumeFileRow, formatFileSize, validateResumeFile,
} from '@/components/hospital/resume-upload'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

// ── Types (matching GET /api/doctors/[id]) ────────────────────
interface SpecDetail { id: string; name: string; description: string | null; status: string }
interface PatientRow {
  id: string; patientId: string; firstName: string; lastName: string
  dateOfBirth: string | null; gender: string | null; phone: string | null
  email: string | null; status: string; assignedAt: string
  // Task 26 — most recent visit recorded for THIS doctor (the profile API
  // groups Visit rows by patient where doctorId = this doctor).
  lastVisit: string | null
}
interface DoctorShift {
  id: string; date: string; startTime: string; endTime: string
  shiftType: string; room: string | null; notes: string | null; status: string
  createdByName: string | null
  department: { id: string; name: string } | null
}
interface DoctorProfile {
  id: string; doctorId: string; firstName: string; lastName: string
  photo: string | null; gender: string | null; dateOfBirth: string | null
  phone: string | null; email: string; address: string | null
  registrationNumber: string; qualification: string | null; university: string | null
  graduationYear: number | null; experienceYears: number | null
  designation: string | null; consultationType: string | null; consultationFee: number | null
  about: string | null; languages: string | null; roomNumber: string | null
  availableDays: string | null; status: string
  lastLoginAt: string | null; passwordChangedAt: string | null; accountStatus: string
  updatedByName: string | null; updatedAt: string
  // Task 26 — Super Admin central control (login + employment lifecycle).
  // GET /api/doctors/[id] spreads the full Doctor row, so these are ISO
  // DateTime strings (or null) straight from Prisma.
  username: string | null
  employeeId: string | null
  employmentType: string | null
  joinDate: string | null
  createdByName: string | null
  createdAt: string
  suspensionReason: string | null
  suspensionStart: string | null
  suspensionEnd: string | null
  suspensionNotes: string | null
  terminationType: string | null
  terminationDate: string | null
  lastWorkingDate: string | null
  terminationReason: string | null
  terminationNotes: string | null
  resume: {
    fileName: string; fileType: string; fileSize: number
    uploadedAt: string; uploadedBy: string | null
  } | null
  department: { id: string; name: string; code: string } | null
  specializations: { id: string; isPrimary: boolean; specialization: SpecDetail }[]
  patients: PatientRow[]
  shifts: DoctorShift[]
}
interface DoctorDetailResponse { doctor: DoctorProfile; activity: AuditLogItem[] }

// ── Types (matching GET /api/doctors/{idOrCode}/schedule-stats) ─
interface ScheduleBucket {
  date: string
  scheduledHours: number; scheduledShifts: number
  cancelledHours: number; cancelledShifts: number
  completedShifts: number
}
interface ScheduleStatsResponse {
  doctor: { id: string; code: string; name: string }
  from: string; to: string; days: number
  buckets: ScheduleBucket[]
  totals: {
    scheduledHours: number; scheduledShifts: number
    cancelledHours: number; cancelledShifts: number
    completedShifts: number
  }
}

// ── Account lifecycle actions (PATCH /api/doctors/[id]/account) ─────────────
// Task 26 — the parent page owns every account flow: the Manage Account dialog
// and the Controls section only NAME an action; the page shows the confirm
// dialog, PATCHes the endpoint, toasts and refetches.
type AccountAction = 'lock' | 'unlock' | 'enable' | 'disable' | 'force-password-change'

/** Confirm-dialog + toast copy for each account lifecycle action. */
function accountActionCopy(action: AccountAction, name: string): {
  title: string
  description: string
  confirmLabel: string
  destructive: boolean
  toast: string
} {
  switch (action) {
    case 'lock':
      return {
        title: 'Lock this doctor account?',
        description: `Dr. ${name} will immediately lose portal access. Their records remain fully preserved. Unlock to restore access.`,
        confirmLabel: 'Lock Account',
        destructive: true,
        toast: 'Doctor account locked',
      }
    case 'unlock':
      return {
        title: 'Unlock this doctor account?',
        description: `Dr. ${name} will regain portal access with their existing credentials.`,
        confirmLabel: 'Unlock Account',
        destructive: false,
        toast: 'Doctor account unlocked',
      }
    case 'enable':
      return {
        title: 'Reactivate this doctor?',
        description: `Dr. ${name} will be set back to active and can sign in again when the account allows it.`,
        confirmLabel: 'Reactivate',
        destructive: false,
        toast: 'Doctor reactivated successfully.',
      }
    case 'disable':
      return {
        title: 'Disable this doctor\'s account?',
        description: `Dr. ${name} will not be able to log in while the account is disabled. Historical records stay in place.`,
        confirmLabel: 'Disable Account',
        destructive: true,
        toast: 'Doctor account disabled successfully.',
      }
    case 'force-password-change':
      return {
        title: 'Require a password change at next sign-in?',
        description: `Dr. ${name} will be asked to set a new password the next time they sign in to the portal. Their current password keeps working until then.`,
        confirmLabel: 'Force Password Change',
        destructive: false,
        toast: 'Password change required at next sign-in',
      }
  }
}

// Task 26 — termination type → human label (Account & Login tab + banners).
const TERMINATION_TYPE_LABELS: Record<string, string> = {
  RESIGNATION: 'Resignation',
  CONTRACT_COMPLETED: 'Contract Completed',
  RETIREMENT: 'Retirement',
  DISMISSAL: 'Dismissal',
  OTHER: 'Other',
}

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  LOGIN: LogIn, LOGOUT: LogOut, LOGIN_FAILED: ShieldAlert, CREATE: PlusCircle,
  UPDATE: PencilLine, DEACTIVATE: UserX, ACTIVATE: UserCheck, VIEW: Eye,
  ACCESS: FileSearch, CANCEL: Ban, ASSIGN: UserPlus, UNASSIGN: UserMinus,
  PASSWORD_CHANGE: KeyRound, RESUME_UPLOADED: FileUp, RESUME_REPLACED: FilePen,
  RESUME_REMOVED: FileX, DOCTOR_PASSWORD_RESET: KeyRound,
}
const ACTIVITY_ICON_TONES: Record<string, string> = {
  LOGIN: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400',
  LOGOUT: 'bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-300',
  LOGIN_FAILED: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
  CREATE: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  UPDATE: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  DEACTIVATE: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
  ACTIVATE: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400',
  VIEW: 'bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-300',
  ACCESS: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
  CANCEL: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
  ASSIGN: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
  UNASSIGN: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  PASSWORD_CHANGE: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/10 dark:text-fuchsia-400',
  // Task 23 — resume / CV + doctor password-reset actions (tones copied from semantic siblings)
  RESUME_UPLOADED: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  RESUME_REPLACED: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  RESUME_REMOVED: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  DOCTOR_PASSWORD_RESET: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/10 dark:text-fuchsia-400',
}

function ActivityIcon({ action }: { action: string }) {
  const Icon = ACTIVITY_ICONS[action] ?? Activity
  const tone = ACTIVITY_ICON_TONES[action] ?? 'bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-300'
  return (
    <span
      className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${tone}`}
      aria-hidden
    >
      <Icon className="size-4" />
    </span>
  )
}

function DefinitionItem({ label, children, className }: {
  label: string; children: ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words text-foreground">{children}</dd>
    </div>
  )
}

function formatNext7dHours(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

// ── Shifts tab: schedule activity chart (GET /schedule-stats) ─
const STATS_TEAL = '#1B8A7A'
const STATS_ROSE = '#C84A3A'

const DAYS_OPTIONS = [7, 14, 30] as const
type DaysOption = (typeof DAYS_OPTIONS)[number]

/** Compact recharts tooltip matching the dashboard charts' visual language. */
function StatsTooltipContent({ active, payload }: {
  active?: boolean
  payload?: { payload?: ScheduleBucket }[]
}) {
  if (!active || !payload?.length) return null
  const b = payload[0]?.payload
  if (!b) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900 px-2.5 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{formatShiftDate(b.date)}</p>
      <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: STATS_TEAL }} aria-hidden />
        {formatNext7dHours(b.scheduledHours)}h scheduled · {b.scheduledShifts} shift{b.scheduledShifts === 1 ? '' : 's'}
      </p>
      {b.cancelledHours > 0 ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: STATS_ROSE }} aria-hidden />
          {formatNext7dHours(b.cancelledHours)}h cancelled · {b.cancelledShifts} shift{b.cancelledShifts === 1 ? '' : 's'}
        </p>
      ) : null}
      {b.completedShifts > 0 ? (
        <p className="mt-0.5 text-emerald-600 dark:text-emerald-400">{b.completedShifts} completed</p>
      ) : null}
    </div>
  )
}

function ScheduleActivityCard({ doctorCode }: { doctorCode: string }) {
  const [days, setDays] = useState<DaysOption>(14)
  const [mounted, setMounted] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(t)
  }, [])

  // Keyed by days — toggling refetches (path changes); previous data stays visible while loading.
  // Schedule stats are not on the admin doctor API — do not request a 404.
  const { data, loading, error, refetch } = useApiData<ScheduleStatsResponse>(null)

  const totals = data?.totals
  const chartData = toChartBuckets(data?.buckets)
  const allZero =
    !totals ||
    (totals.scheduledHours === 0 && totals.cancelledHours === 0 && totals.completedShifts === 0)

  // Export the CURRENT buckets (no totals row) using the shared CSV conventions.
  const handleExportCsv = () => {
    if (!data?.buckets?.length || !data.from) return
    const headers = [
      'Date', 'Weekday', 'Scheduled Hours', 'Scheduled Shifts',
      'Cancelled Hours', 'Cancelled Shifts', 'Completed Shifts',
    ]
    const rows = data.buckets.map((b) => [
      b.date,
      weekdayShort(b.date),
      Number(b.scheduledHours) || 0,
      Number(b.scheduledShifts) || 0,
      Number(b.cancelledHours) || 0,
      Number(b.cancelledShifts) || 0,
      Number(b.completedShifts) || 0,
    ])
    const filename = `schedule-${doctorCode}-${data.from}.csv`
    downloadTextFile(filename, buildCsv(headers, rows))
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'} · ${filename}`)
  }

  return (
    <Card data-testid="schedule-activity-card">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 ring-1 ring-teal-200/70 dark:bg-teal-500/10 dark:ring-teal-500/30">
              <BarChart3 className="size-4.5 text-teal-600 dark:text-teal-400" aria-hidden />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base">Last {days} days</CardTitle>
              <CardDescription>
                Scheduled vs cancelled hours
                {data ? ` · ${formatShiftDate(data.from)} — ${formatShiftDate(data.to)}` : ''}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Chart period" className="flex items-center rounded-lg bg-slate-100 dark:bg-white/5 p-0.5">
              {DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  aria-pressed={days === d}
                  aria-label={`Show last ${d} days`}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                    days === d ? 'bg-white text-foreground shadow-sm dark:bg-slate-700' : 'text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300',
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={loading || Boolean(error)}
              data-testid="export-schedule-csv"
              aria-label={`Export schedule activity CSV for ${doctorCode}`}
            >
              <Download className="size-4" aria-hidden /> Export CSV
            </Button>
          </div>
        </div>

        <div className="mt-4">
          {loading && !data ? (
            <Skeleton className="h-[190px] w-full rounded-lg" aria-hidden />
          ) : error && !data ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4">
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load the schedule stats{error ? ` — ${error}` : '.'}
              </p>
              <Button variant="ghost" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : allZero ? (
            <EmptyState
              icon={CalendarClock}
              title="No shift activity"
              description="No scheduled, cancelled or completed shifts in this period."
              className="py-8"
            />
          ) : (
            <>
              <div role="img" aria-label={`Bar chart of scheduled versus cancelled hours over the last ${days} days`}>
                {mounted ? (
                  <ResponsiveContainer width="100%" height={190}>
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <XAxis
                        dataKey="dd"
                        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                        width={38}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(13, 148, 136, 0.07)' }}
                        content={<StatsTooltipContent />}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
                      <Bar
                        dataKey="scheduledHours"
                        name="Scheduled (h)"
                        fill={STATS_TEAL}
                        radius={[3, 3, 0, 0]}
                        isAnimationActive={!reduceMotion}
                      />
                      <Bar
                        dataKey="cancelledHours"
                        name="Cancelled (h)"
                        fill={STATS_ROSE}
                        radius={[3, 3, 0, 0]}
                        isAnimationActive={!reduceMotion}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[190px]" aria-hidden />
                )}
              </div>
              {totals ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="schedule-stats-totals">
                  <Badge variant="outline" className="bg-slate-50 dark:bg-white/5 dark:text-slate-300 text-xs font-normal text-slate-600">
                    Σ {formatNext7dHours(totals.scheduledHours)}h scheduled
                  </Badge>
                  {totals.cancelledHours > 0 ? (
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-xs font-normal text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
                      {formatNext7dHours(totals.cancelledHours)}h cancelled
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="bg-slate-50 dark:bg-white/5 dark:text-slate-300 text-xs font-normal text-slate-600">
                    {totals.completedShifts} completed
                  </Badge>
                </div>
              ) : null}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Map API buckets to chart points (dd = day-of-month label). */
function toChartBuckets(buckets: ScheduleBucket[] | undefined) {
  return (buckets ?? []).map((b) => ({
    ...b,
    scheduledHours: Number(b.scheduledHours) || 0,
    cancelledHours: Number(b.cancelledHours) || 0,
    completedShifts: Number(b.completedShifts) || 0,
    dd: typeof b.date === 'string' && b.date.length >= 10 ? b.date.slice(8, 10) : '',
  }))
}

// ── Overview tab: per-doctor visit trend (GET /api/doctors/[id]/visit-trend) ──
interface DoctorVisitTrendPoint {
  date: string
  count: number
  completed: number
  cancelled: number
  scheduled: number
}
interface DoctorVisitTrend {
  doctor: { id: string; name: string; doctorCode: string }
  days: number
  points: DoctorVisitTrendPoint[]
  total: number
}

const TREND_RANGES = [7, 14, 30] as const

/** '2026-09-11' → '11 Sep' for compact axis ticks (UTC-pinned, server-consistent). */
function trendTickLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * Compact "Visit trend" bar chart backed by GET /api/doctors/{id}/visit-trend,
 * mirroring the patient-detail card's visual language (18-a). Range toggle
 * re-fetches by changing the path (useApiData refetches on path change and
 * keeps stale data until the next result lands). Chart colors are theme-aware
 * via CSS variables — pure SVG var() references, no re-render or recharts
 * props mapping needed. Bars skip entrance animation (reduced-motion friendly).
 * The doctor profile page has no visit mutations of its own (edits/shifts
 * navigate away), so a mount fetch is sufficient — no refreshKey wiring.
 */
function DoctorVisitTrendCard({ doctorId }: { doctorId: string }) {
  const [range, setRange] = useState<number>(30)
  // Visit trend is not on the admin doctor API — do not request a 404.
  const { data, loading, error, refetch } = useApiData<DoctorVisitTrend>(null)

  const points = data?.points ?? []
  const total = data?.total ?? 0
  const allZero = !error && points.length > 0 && points.every((p) => p.count === 0)

  return (
    <Card data-testid="doctor-visit-trend-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Visit Trend
          <span className="sr-only"> for doctor {doctorId}</span>
          <Badge variant="outline" className="ml-1 font-normal tabular-nums">
            {total}
            <span className="sr-only">visits in the last {range} days</span>
          </Badge>
        </CardTitle>
        <div role="group" aria-label="Visit trend range" className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
          {TREND_RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRange(d)}
              aria-pressed={range === d}
              aria-label={`Show last ${d} days`}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                range === d
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300',
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-[180px] w-full rounded-lg" aria-hidden />
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : allZero ? (
          <div
            className="flex h-[180px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
            role="status"
            aria-label={`No visits in this period (last ${range} days)`}
          >
            No visits in this period
          </div>
        ) : (
          <div role="img" aria-label={`Bar chart of visit counts per day over the last ${range} days`}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={trendTickLabel}
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={18}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: 'var(--muted)' }}
                  contentStyle={{
                    background: 'var(--card)',
                    color: 'var(--card-foreground)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontSize: 12,
                    padding: '8px 10px',
                  }}
                  labelStyle={{ color: 'var(--foreground)', fontWeight: 600, marginBottom: 2 }}
                  itemStyle={{ color: 'var(--card-foreground)' }}
                  formatter={(value) => [value, 'Visits']}
                />
                <Bar
                  dataKey="count"
                  name="Visits"
                  fill="var(--primary)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** One shift row. `actions` (Task 26) renders the per-row Cancel / Edit
 *  controls next to the badges for SCHEDULED shifts. */
function ShiftRow({ shift, actions }: { shift: DoctorShift; actions?: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 hms-row-hover sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{formatShiftDate(shift.date)}</p>
        <p className="text-xs text-muted-foreground">
          {formatTime12h(shift.startTime)} – {formatTime12h(shift.endTime)}
          {shift.room ? ` · Room ${shift.room}` : ''}
          {shift.department ? ` · ${shift.department.name}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={shift.shiftType} />
        <StatusBadge status={shift.status} />
        {actions}
      </div>
    </li>
  )
}

// ── Tab panels ────────────────────────────────────────────────
// ── Overview tab: Professional Documents (resume / CV on file) ──
/**
 * Task 23 — the doctor's stored resume / CV. Self-contained: owns its state
 * and the API calls; the page only passes the current `doctor.resume` metadata
 * (from GET /api/doctors/[id]) plus an `onChanged` refetch callback.
 *
 * Upload/replace posts multipart FormData to
 * POST /api/admin/doctors/{id}/resume. View, download, and remove have no
 * admin endpoint, so those buttons do not call the API.
 */
function ProfessionalDocumentsCard({ doctorId, resume, onChanged }: {
  doctorId: string
  resume: DoctorProfile['resume']
  onChanged: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const removing = false
  const [replacing, setReplacing] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const busy = uploading || removing
  const isReplace = Boolean(resume) // does this upload replace an existing file?

  const startReplace = () => {
    setDropError(null)
    setReplacing(true)
  }
  const cancelReplace = () => {
    setDropError(null)
    setReplacing(false)
  }

  // Authenticated blob download (Bearer token; Python API on separate origin).
  const handleDownload = () => {
    toast.info(DOCTOR_ACTION_UNAVAILABLE)
  }

  const handleView = () => {
    toast.info(DOCTOR_ACTION_UNAVAILABLE)
  }

  const handleFile = async (file: File) => {
    if (busy) return
    const invalid = validateResumeFile(file)
    if (invalid) {
      setDropError(invalid)
      toast.error(invalid)
      return
    }
    const targetId = usableDoctorId(doctorId)
    if (!targetId) {
      toast.error('Missing doctor id.')
      return
    }
    setDropError(null)
    setUploading(true)
    try {
      await doctorsService.uploadResume(targetId, file)
      toast.success(isReplace ? 'Resume updated' : 'Resume uploaded')
      setReplacing(false)
      onChanged()
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not upload the resume. Please try again.'
      toast.error(message)
      if (message.toLowerCase().includes('sign in')) navigate('/super-admin/login')
      else setDropError(message)
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = () => {
    if (busy || !resume) return
    toast.info(DOCTOR_ACTION_UNAVAILABLE)
  }

  return (
    <Card data-testid="professional-documents-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Professional Documents
        </CardTitle>
        <CardDescription>{resume ? 'Doctor resume / CV on file' : 'Nothing on file yet'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {resume && !replacing ? (
          <ResumeFileRow
            meta={resume}
            note={`${formatFileSize(resume.fileSize)} · Uploaded ${formatDate(resume.uploadedAt)}${resume.uploadedBy ? ` by ${resume.uploadedBy}` : ''}`}
            testId="doctor-resume-row"
          >
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void handleView()}
              aria-label={`View resume of doctor ${doctorId} in a new tab`}
            >
              <Eye className="size-4" aria-hidden /> View
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void handleDownload()}
              aria-label={`Download resume of doctor ${doctorId}`}
            >
              <Download className="size-4" aria-hidden /> Download
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={startReplace}
              aria-label={`Replace resume of doctor ${doctorId}`}
            >
              <FilePen className="size-4" aria-hidden /> Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
              disabled={busy}
              onClick={() => void handleRemove()}
              aria-label={`Remove resume of doctor ${doctorId}`}
            >
              {removing
                ? <Loader2 className="size-4 animate-spin" aria-hidden />
                : <Trash2 className="size-4" aria-hidden />}
              Remove
            </Button>
          </ResumeFileRow>
        ) : (
          <>
            <ResumeDropzone
              id="doctor-profile-resume-upload"
              onFile={(file) => void handleFile(file)}
              disabled={busy}
              error={dropError}
            />
            {uploading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
                <Loader2 className="size-4 animate-spin text-teal-600 dark:text-teal-400" aria-hidden />
                Uploading resume…
              </p>
            ) : null}
            {replacing && !busy ? (
              <Button variant="ghost" size="sm" onClick={cancelReplace}>
                Cancel
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function OverviewTab({ doctor, onResumeChanged }: { doctor: DoctorProfile; onResumeChanged: () => void }) {
  const days = doctor.availableDays
    ? doctor.availableDays.split(',').map((d) => d.trim()).filter(Boolean)
    : []
  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DefinitionItem label="Gender">{doctor.gender ?? '—'}</DefinitionItem>
            <DefinitionItem label="Date of Birth">
              {doctor.dateOfBirth ? `${formatDate(doctor.dateOfBirth)} · ${ageFrom(doctor.dateOfBirth)}` : '—'}
            </DefinitionItem>
            <DefinitionItem label="Phone">{doctor.phone ?? '—'}</DefinitionItem>
            <DefinitionItem label="Last Login">
              {doctor.lastLoginAt ? formatDateTime(doctor.lastLoginAt) : 'Never signed in'}
            </DefinitionItem>
            <DefinitionItem label="Password Last Changed">
              {doctor.passwordChangedAt ? formatDateTime(doctor.passwordChangedAt) : 'Not set up yet'}
            </DefinitionItem>
            <DefinitionItem label="Email">{doctor.email}</DefinitionItem>
            <DefinitionItem label="Consultation Type">{doctor.consultationType ?? '—'}</DefinitionItem>
            <DefinitionItem label="Consultation Fee">
              {doctor.consultationFee != null ? `$${doctor.consultationFee.toLocaleString()}` : '—'}
            </DefinitionItem>
            <DefinitionItem label="Room">{doctor.roomNumber ?? '—'}</DefinitionItem>
            <DefinitionItem label="Languages">{doctor.languages ?? '—'}</DefinitionItem>
            <DefinitionItem label="Years of Experience">
              {doctor.experienceYears != null ? `${doctor.experienceYears}` : '—'}
            </DefinitionItem>
            <DefinitionItem label="Address" className="sm:col-span-2 lg:col-span-3">
              {doctor.address ?? '—'}
            </DefinitionItem>
            <DefinitionItem label="Available Days" className="sm:col-span-2 lg:col-span-3">
              {days.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {days.map((d) => (
                    <Badge key={d} variant="outline" className="border-teal-200 bg-teal-50 text-xs text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300">
                      {d}
                    </Badge>
                  ))}
                </span>
              ) : '—'}
            </DefinitionItem>
            <DefinitionItem label="About Doctor" className="sm:col-span-2 lg:col-span-3">
              {doctor.about ? (
                <p className="text-sm leading-relaxed font-normal text-slate-600 dark:text-slate-300">{doctor.about}</p>
              ) : '—'}
            </DefinitionItem>
          </dl>
        </CardContent>
      </Card>
      <ProfessionalDocumentsCard
        doctorId={doctor.id}
        resume={doctor.resume}
        onChanged={onResumeChanged}
      />
      <DoctorVisitTrendCard doctorId={doctor.id} />
    </div>
  )
}

function QualificationsTab({ doctor }: { doctor: DoctorProfile }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Education
          </CardTitle>
          <CardDescription>Degree and training background</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <DefinitionItem label="Qualification">{doctor.qualification ?? '—'}</DefinitionItem>
            <DefinitionItem label="University / Institution">{doctor.university ?? '—'}</DefinitionItem>
            <DefinitionItem label="Graduation Year">
              {doctor.graduationYear != null ? String(doctor.graduationYear) : '—'}
            </DefinitionItem>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Registration & Experience
          </CardTitle>
          <CardDescription>Licence to practise and career length</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <DefinitionItem label="Medical Registration Number">
              <span className="font-mono text-sm">{doctor.registrationNumber}</span>
            </DefinitionItem>
            <DefinitionItem label="Experience (years)">
              {doctor.experienceYears != null ? String(doctor.experienceYears) : '—'}
            </DefinitionItem>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

function SpecializationTab({ doctor }: { doctor: DoctorProfile }) {
  const specs = doctor.specializations.map((s) => s.specialization)
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
      {specs.length === 0 ? (
        <div className="lg:col-span-2">
          <EmptyState
            icon={HeartPulse}
            title="No specializations"
            description="Assign specializations via the Edit Doctor form."
          />
        </div>
      ) : (
        specs.map((sp) => (
          <Card key={sp.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartPulse className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> {sp.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{sp.description ?? 'No description available.'}</p>
            </CardContent>
          </Card>
        ))
      )}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Department
          </CardTitle>
        </CardHeader>
        <CardContent>
          {doctor.department ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-foreground">{doctor.department.name}</p>
              <Badge variant="outline" className="font-mono text-xs">{doctor.department.code}</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not assigned to a department.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function patientFromApi(item: DoctorPatient): PatientRow {
  const parts = item.full_name.trim().split(/\s+/)
  const firstName = parts[0] || 'N/A'
  const lastName = parts.slice(1).join(' ')
  return {
    id: item.id,
    patientId: item.patient_id,
    firstName,
    lastName,
    dateOfBirth: null,
    gender: item.gender,
    phone: item.phone,
    email: item.email,
    status: item.status ?? 'ACTIVE',
    assignedAt: '',
    lastVisit: item.last_visit,
  }
}

function PatientsTab({ doctor, onChanged }: { doctor: DoctorProfile; onChanged: () => void }) {
  const [query, setQuery] = useState('')
  const [loadedPatients, setLoadedPatients] = useState<PatientRow[] | null>(null)
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [patientsError, setPatientsError] = useState<string | null>(null)

  useEffect(() => {
    const doctorId = usableDoctorId(doctor.id)
    if (!doctorId) {
      setPatientsLoading(false)
      setPatientsError('Missing doctor id.')
      return
    }
    let cancelled = false
    setPatientsLoading(true)
    setPatientsError(null)
    doctorsService.getPatients(doctorId, { page: 1, page_size: 100 })
      .then((data) => {
        if (cancelled) return
        setLoadedPatients((data.items ?? []).map(patientFromApi))
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setPatientsError(doctorActionError(e, 'Could not load patients.'))
      })
      .finally(() => {
        if (!cancelled) setPatientsLoading(false)
      })
    return () => { cancelled = true }
  }, [doctor.id])

  const assignedPatients = loadedPatients ?? doctor.patients
  // Task 26 — per-row unassignment (§15). The row's patient is stashed here so
  // the ConfirmDialog can describe exactly who is being unassigned.
  const [unassignTarget, setUnassignTarget] = useState<PatientRow | null>(null)
  const [unassigning, setUnassigning] = useState(false)
  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? assignedPatients.filter((p) =>
        [`${p.firstName} ${p.lastName}`, p.patientId, p.phone ?? '', p.email ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    : assignedPatients

  const totalPatients = assignedPatients.length
  const activePatients = assignedPatients.filter((p) => p.status === 'ACTIVE').length
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const recentPatients = assignedPatients.filter((p) => {
    const t = new Date(p.assignedAt).getTime()
    return Number.isFinite(t) && t >= thirtyDaysAgo
  }).length

  /** DELETE /api/patients/{patientId}/doctors/{doctorId} — audited server-side.
   *  409/422 errors (e.g. protected visit context) surface verbatim as toasts. */
  const confirmUnassign = async () => {
    const target = unassignTarget
    if (!target) return
    setUnassigning(true)
    try {
      toast.info(DOCTOR_ACTION_UNAVAILABLE)
      setUnassignTarget(null)
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
      toast.error(message)
      if (message.toLowerCase().includes('sign in')) navigate('/super-admin/login')
    } finally {
      setUnassigning(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* §15 — patient stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="patients-stat-tiles">
        <StatCard icon={Users} label="Total Patients" value={totalPatients} tone="teal" index={0} />
        <StatCard icon={UserCheck} label="Active Patients" value={activePatients} tone="emerald" index={1} />
        <StatCard
          icon={UserPlus}
          label="Recent Patients"
          value={recentPatients}
          hint="Assigned in the last 30 days"
          tone="sky"
          index={2}
        />
      </div>

      <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Assigned Patients</CardTitle>
          <CardDescription className="mt-1 flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-teal-600 dark:text-teal-400" aria-hidden />
            Patient data access is audited.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="whitespace-nowrap">
            {needle ? `${filtered.length} of ${assignedPatients.length}` : `${assignedPatients.length}`}{' '}
            patient{assignedPatients.length === 1 ? '' : 's'}
          </Badge>
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patients…"
              className="w-full sm:w-56"
              aria-label="Search assigned patients"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {patientsLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading patients…
          </div>
        ) : patientsError ? (
          <div className="p-4 sm:p-6">
            <EmptyState icon={Users} title="Could not load patients" description={patientsError} />
          </div>
        ) : assignedPatients.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState
              icon={Users}
              title="No patients assigned to this doctor."
              description="Assigned patients will appear here."
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState
              icon={Users}
              title="No matching patients"
              description="Try a different name, patient ID or phone number."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Patient</TableHead>
                  <TableHead>Patient ID</TableHead>
                  <TableHead className="hidden sm:table-cell">Gender / Age</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  {/* Task 26 §15 — assignment lifecycle columns */}
                  <TableHead className="hidden sm:table-cell">Assigned</TableHead>
                  <TableHead className="hidden md:table-cell">Last Visit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} className="hms-row-hover">
                    <TableCell className="text-sm font-medium text-foreground">
                      {p.firstName} {p.lastName}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.patientId}</TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {p.gender ?? '—'}
                      {p.dateOfBirth ? <span className="text-muted-foreground"> · {ageFrom(p.dateOfBirth)}</span> : null}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{p.phone ?? '—'}</TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">{formatDate(p.assignedAt)}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {p.lastVisit ? formatDate(p.lastVisit) : '—'}
                    </TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/super-admin/patients/${p.id}`)}
                          aria-label={`Open record of ${p.firstName} ${p.lastName}`}
                        >
                          Open record
                        </Button>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                              onClick={() => setUnassignTarget(p)}
                              aria-label={`Unassign ${p.firstName} ${p.lastName} from Dr. ${doctor.firstName} ${doctor.lastName}`}
                            >
                              <UserMinus className="size-4" aria-hidden />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Unassign patient</TooltipContent>
                        </UITooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      </Card>

      {/* Unassign confirmation — the DELETE is audited server-side. */}
      <ConfirmDialog
        open={unassignTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUnassignTarget(null)
        }}
        title="Unassign this patient?"
        description={
          unassignTarget
            ? `Dr. ${doctor.firstName} ${doctor.lastName} will no longer see ${unassignTarget.firstName} ${unassignTarget.lastName} in their patient list. The patient's record and visit history are fully preserved.`
            : undefined
        }
        confirmLabel="Unassign Patient"
        destructive
        processing={unassigning}
        onConfirm={() => void confirmUnassign()}
      />
    </div>
  )
}

function ShiftsTab({ doctor, onChanged }: { doctor: DoctorProfile; onChanged: () => void }) {
  const today = todayLocalISO()
  // Task 26 §16 — per-shift cancel (PUT /api/shifts/{id} with status CANCELLED).
  const [cancelTarget, setCancelTarget] = useState<DoctorShift | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // §16 — three labeled sections: today, upcoming, previous.
  const todays = doctor.shifts
    .filter((s) => s.status === 'SCHEDULED' && s.date.slice(0, 10) === today)
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
  const upcoming = doctor.shifts
    .filter((s) => s.status === 'SCHEDULED' && s.date.slice(0, 10) > today)
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
  const previous = doctor.shifts
    .filter((s) => !(s.status === 'SCHEDULED' && s.date.slice(0, 10) >= today))
    .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`))

  // The server rejects shift creation/edits for suspended, terminated,
  // inactive or login-disabled doctors — disable the entry point up front
  // instead of letting the admin hit the raw 409/422.
  const shiftBlockReason =
    doctor.status === 'SUSPENDED'
      ? 'This doctor is suspended — suspended doctors cannot receive new shifts.'
      : doctor.status === 'TERMINATED'
        ? 'This doctor is terminated — terminated doctors cannot receive new shifts.'
        : doctor.status === 'INACTIVE'
          ? 'This doctor is inactive — inactive doctors cannot receive new shifts.'
          : doctor.accountStatus === 'DEACTIVATED'
            ? 'This doctor’s account is disabled — disabled doctors cannot receive new shifts.'
            : null

  const openShiftsPage = () => {
    sessionStorage.setItem('hms-shift-prefill', JSON.stringify({ doctorId: doctor.id }))
    navigate('/super-admin/shifts')
  }

  const cancelShift = async () => {
    const target = cancelTarget
    if (!target) return
    setCancelling(true)
    try {
      await apiFetch(`/api/shifts/${encodeURIComponent(target.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      toast.success('Shift cancelled')
      setCancelTarget(null)
      onChanged()
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
      toast.error(message)
      if (message.toLowerCase().includes('sign in')) navigate('/super-admin/login')
    } finally {
      setCancelling(false)
    }
  }

  /** Per-row Cancel / Edit controls — only meaningful while SCHEDULED. */
  const rowActions = (s: DoctorShift) =>
    s.status === 'SCHEDULED' ? (
      <>
        <UITooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
              onClick={() => setCancelTarget(s)}
              aria-label={`Cancel the ${formatShiftDate(s.date)} shift from ${formatTime12h(s.startTime)} to ${formatTime12h(s.endTime)}`}
            >
              <Ban className="size-4" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cancel shift</TooltipContent>
        </UITooltip>
        <UITooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={openShiftsPage}
              aria-label={`Edit the ${formatShiftDate(s.date)} shift on the shifts page`}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit on shifts page</TooltipContent>
        </UITooltip>
      </>
    ) : null

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Last N days activity (scheduled vs cancelled hours) */}
      <ScheduleActivityCard doctorCode={doctor.doctorId} />

      <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Shifts</CardTitle>
          <CardDescription>Latest 30 shifts — today, upcoming and previous</CardDescription>
        </div>
        <UITooltip>
          <TooltipTrigger asChild>
            {/* span wrapper — Radix tooltips cannot anchor to a disabled button */}
            <span className="inline-block">
              <Button
                size="sm"
                disabled={shiftBlockReason !== null}
                onClick={openShiftsPage}
                aria-label="Add a shift on the shifts page"
              >
                <CalendarPlus className="size-4" aria-hidden /> Add Shift
              </Button>
            </span>
          </TooltipTrigger>
          {shiftBlockReason ? <TooltipContent className="max-w-56">{shiftBlockReason}</TooltipContent> : null}
        </UITooltip>
      </CardHeader>
      <CardContent className="space-y-6">
        {shiftBlockReason ? (
          <p
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
            role="note"
          >
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {shiftBlockReason} Cancel the existing scheduled shifts below instead.
          </p>
        ) : null}
        {todays.length === 0 && upcoming.length === 0 && previous.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No shifts recorded"
            description="Assign shifts from the shift management page."
            action={
              <Button size="sm" variant="outline" onClick={() => navigate('/super-admin/shifts')}>
                Go to shifts
              </Button>
            }
          />
        ) : (
          <>
            <section aria-label="Today's shift">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Today’s Shift ({todays.length})
              </h3>
              {todays.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No shifts scheduled for today.
                </p>
              ) : (
                <ul className="space-y-2">
                  {todays.map((s) => <ShiftRow key={s.id} shift={s} actions={rowActions(s)} />)}
                </ul>
              )}
            </section>
            <section aria-label="Upcoming shifts">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Upcoming Shifts ({upcoming.length})
              </h3>
              {upcoming.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No upcoming scheduled shifts.
                </p>
              ) : (
                <ul className="hms-scroll max-h-96 space-y-2 overflow-y-auto pr-1">
                  {upcoming.map((s) => <ShiftRow key={s.id} shift={s} actions={rowActions(s)} />)}
                </ul>
              )}
            </section>
            <section aria-label="Previous shifts">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Previous Shifts ({previous.length})
              </h3>
              {previous.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No previous shifts.
                </p>
              ) : (
                <ul className="hms-scroll max-h-96 space-y-2 overflow-y-auto pr-1">
                  {previous.map((s) => <ShiftRow key={s.id} shift={s} actions={rowActions(s)} />)}
                </ul>
              )}
            </section>
          </>
        )}
        <Button
          variant="link"
          className="h-auto p-0 text-teal-700 dark:text-teal-300"
          onClick={() => navigate('/super-admin/shifts')}
        >
          Manage shifts →
        </Button>
      </CardContent>
      </Card>

      {/* Cancel confirmation — server also guards suspended/terminated/disabled doctors. */}
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null)
        }}
        title="Cancel this shift?"
        description={
          cancelTarget
            ? `The ${formatShiftDate(cancelTarget.date)} shift (${formatTime12h(cancelTarget.startTime)} – ${formatTime12h(cancelTarget.endTime)}) will be marked as cancelled and the doctor will no longer be expected to attend.`
            : undefined
        }
        confirmLabel="Cancel Shift"
        destructive
        processing={cancelling}
        onConfirm={() => void cancelShift()}
      />
    </div>
  )
}

// ── Account & Login tab (Task 26 §13) ─────────────────────────
/**
 * Login identity, account lifecycle metadata and the account controls.
 * Stateless on purpose — every control defers to a page-level flow so the
 * confirm dialogs and PATCH calls live in exactly one place (the parent).
 */
function AccountTab({ doctor, onChangePassword, onResetPassword, onAccountAction }: {
  doctor: DoctorProfile
  onChangePassword: () => void
  onResetPassword: () => void
  onAccountAction: (action: AccountAction) => void
}) {
  const passwordChangeRequired = doctor.accountStatus === 'PASSWORD_RESET_REQUIRED'
  const controls = doctorControlFlags(doctor.status, doctor.accountStatus)
  return (
    <div className="space-y-4 sm:space-y-6">
      <Card data-testid="account-login-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Account &amp; Login
          </CardTitle>
          <CardDescription>Portal sign-in identity and account lifecycle</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DefinitionItem label="Username">
              {doctor.username ? <span className="font-mono text-sm">{doctor.username}</span> : '—'}
            </DefinitionItem>
            <DefinitionItem label="Email">{doctor.email}</DefinitionItem>
            <DefinitionItem label="Account Status"><StatusBadge status={doctor.accountStatus} /></DefinitionItem>
            <DefinitionItem label="Employment Status"><StatusBadge status={doctor.status} /></DefinitionItem>
            <DefinitionItem label="Last Login">
              {doctor.lastLoginAt ? formatDateTime(doctor.lastLoginAt) : 'Never signed in'}
            </DefinitionItem>
            <DefinitionItem label="Password Change Required">
              {passwordChangeRequired ? (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
                >
                  Yes
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300">
                  No
                </Badge>
              )}
            </DefinitionItem>
            <DefinitionItem label="Account Created">
              {formatDateTime(doctor.createdAt)}
              <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                Created by: {doctor.createdByName ?? '—'}
              </p>
            </DefinitionItem>
            <DefinitionItem label="Last Updated">
              {formatDateTime(doctor.updatedAt)}
              <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                Updated by: {doctor.updatedByName ?? '—'}
              </p>
            </DefinitionItem>
          </dl>
        </CardContent>
      </Card>

      {/* Suspension details (§13) — shown while the doctor is SUSPENDED */}
      {doctor.status === 'SUSPENDED' ? (
        <Card className="border-amber-200 dark:border-amber-500/25" data-testid="suspension-details-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-300">
              <ShieldAlert className="size-4" aria-hidden /> Suspension Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <DefinitionItem label="Reason">{doctor.suspensionReason ?? '—'}</DefinitionItem>
              <DefinitionItem label="Start">
                {doctor.suspensionStart ? formatDate(doctor.suspensionStart) : '—'}
              </DefinitionItem>
              <DefinitionItem label="End">
                {doctor.suspensionEnd ? formatDate(doctor.suspensionEnd) : 'Ongoing'}
              </DefinitionItem>
              <DefinitionItem label="Notes">{doctor.suspensionNotes ?? '—'}</DefinitionItem>
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {/* Termination details (§13) — shown while the doctor is TERMINATED */}
      {doctor.status === 'TERMINATED' ? (
        <Card className="border-rose-200 dark:border-rose-500/25" data-testid="termination-details-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-rose-700 dark:text-rose-300">
              <ShieldAlert className="size-4" aria-hidden /> Termination Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <DefinitionItem label="Type">
                {doctor.terminationType
                  ? TERMINATION_TYPE_LABELS[doctor.terminationType] ?? doctor.terminationType
                  : '—'}
              </DefinitionItem>
              <DefinitionItem label="Date">
                {doctor.terminationDate ? formatDate(doctor.terminationDate) : '—'}
              </DefinitionItem>
              <DefinitionItem label="Last Working Date">
                {doctor.lastWorkingDate ? formatDate(doctor.lastWorkingDate) : '—'}
              </DefinitionItem>
              <DefinitionItem label="Reason">{doctor.terminationReason ?? '—'}</DefinitionItem>
              <DefinitionItem label="Notes" className="sm:col-span-2 lg:col-span-4">
                {doctor.terminationNotes ?? '—'}
              </DefinitionItem>
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {/* Controls (§13) — every action defers to a page-level confirm flow */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Controls
          </CardTitle>
          <CardDescription>Account lifecycle actions — every change is audited</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {controls.changePassword ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onChangePassword}
                aria-label="Change this doctor's password"
              >
                <KeyRound className="size-4" aria-hidden /> Change Password
              </Button>
            ) : null}
            {controls.resetPassword ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onResetPassword}
                aria-label="Reset this doctor's password"
              >
                <RotateCcwKey className="size-4" aria-hidden /> Reset Password
              </Button>
            ) : null}
            {controls.disable ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAccountAction('disable')}
                aria-label="Disable portal sign-in for this account"
              >
                <CircleOff className="size-4" aria-hidden /> Disable Account
              </Button>
            ) : null}
            {controls.reactivate ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAccountAction('enable')}
                aria-label="Reactivate this doctor"
              >
                <UserCheck className="size-4" aria-hidden /> Reactivate
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ActivityTab({ activity }: { activity: AuditLogItem[] }) {
  if (activity.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-6">
          <EmptyState
            icon={Activity}
            title="No recorded activity"
            description="Administrative actions affecting this doctor will be listed here."
          />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
        <CardDescription>Audit trail for this doctor record</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="hms-scroll max-h-96 space-y-1 overflow-y-auto pr-1">
          {activity.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hms-row-hover">
              <ActivityIcon action={a.action} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-slate-700 dark:text-slate-300">{a.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(a.timestamp)} · {timeAgo(a.timestamp)}
                  {a.userName ? ` · ${a.userName}` : ''}
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-medium">{a.module}</Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-2xl" />
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
const PROFILE_TABS = ['overview', 'account', 'qualifications', 'specialization', 'patients', 'shifts', 'activity'] as const
type ProfileTab = (typeof PROFILE_TABS)[number]

export default function DoctorProfilePage({ doctorId }: { doctorId: string }) {
  const doctorKey = usableDoctorId(doctorId)
  const detail = useApiData<unknown>(
    doctorKey ? `/api/admin/doctors/${encodeURIComponent(doctorKey)}` : null,
  )
  const data = mapAdminDoctorDetail(detail.data)
  const { loading, error, refetch } = detail
  const [tab, setTab] = useState<ProfileTab>('overview')

  // Task 26 — Super Admin control center dialog state. The page owns every
  // flow: dialogs collect input, the page confirms → calls the API → toasts →
  // refetches.
  const [resetOpen, setResetOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [terminateOpen, setTerminateOpen] = useState(false)
  const [liftOpen, setLiftOpen] = useState(false)
  const [resendOpen, setResendOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [resending, setResending] = useState(false)
  const [lifting, setLifting] = useState(false)
  const [accountAction, setAccountAction] = useState<AccountAction | null>(null)
  const [accountProcessing, setAccountProcessing] = useState(false)

  // Deep-link: other surfaces (e.g. the doctors page "View Patients" menu) stash
  // the requested tab in sessionStorage under 'hms-doctor-profile-tab' before
  // navigating here. Consume it once on mount — client-only (sessionStorage is
  // never touched during render, so hydration stays safe) — and ALWAYS remove
  // the key afterwards, whether or not it held a valid tab.
  useEffect(() => {
    // Deferred via timeout (same pattern as the shifts-page prefill) — avoids a
    // synchronous setState inside the effect and stays hydration-safe.
    const t = window.setTimeout(() => {
      const requested = sessionStorage.getItem('hms-doctor-profile-tab')
      sessionStorage.removeItem('hms-doctor-profile-tab')
      if (requested && (PROFILE_TABS as readonly string[]).includes(requested)) {
        setTab(requested as ProfileTab)
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [])

  // Track this doctor for the command palette's Recent group — once per
  // mount/doctor (the ref also guards the double-fire under React strict mode).
  const trackedDoctorRef = useRef<string | null>(null)
  useEffect(() => {
    const d = data?.doctor
    if (!d || trackedDoctorRef.current === d.doctorId) return
    trackedDoctorRef.current = d.doctorId
    trackRecentItem({ type: 'doctor', code: d.doctorId, name: `Dr. ${d.firstName} ${d.lastName}` })
  }, [data])

  // Server 401s surface as "...sign in..." messages — back to the login view.
  useEffect(() => {
    if (error && error.includes('sign in')) {
      toast.error('Session expired. Please sign in again.')
      navigate('/super-admin/login')
    }
  }, [error])

  const backBtn = (
    <Button variant="outline" onClick={() => navigate('/super-admin/doctors')}>
      <ArrowLeft className="size-4" aria-hidden /> Back to doctors
    </Button>
  )

  if (!doctorKey) {
    return (
      <div className="space-y-6">
        <PageHeader title="Doctor Profile" description="Complete clinical and administrative record" actions={backBtn} />
        <EmptyState
          icon={UserX}
          title="Doctor not found"
          description="This doctor may have been removed or the link is incorrect."
          action={backBtn}
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Doctor Profile" description="Complete clinical and administrative record" actions={backBtn} />
        <ProfileSkeleton />
      </div>
    )
  }

  if (error && error.toLowerCase().includes('not found')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Doctor Profile" description="Complete clinical and administrative record" actions={backBtn} />
        <EmptyState
          icon={UserX}
          title="Doctor not found"
          description="This doctor may have been removed or the link is incorrect."
          action={backBtn}
        />
      </div>
    )
  }

  if (error || !data?.doctor) {
    return (
      <div className="space-y-6">
        <PageHeader title="Doctor Profile" description="Complete clinical and administrative record" actions={backBtn} />
        <Alert variant="destructive" role="alert">
          <RefreshCw className="size-4" aria-hidden />
          <AlertTitle>Could not load doctor profile</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error ?? 'Unknown error.'}</span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              <RefreshCw className="size-4" aria-hidden /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const d = data.doctor
  const controls = doctorControlFlags(d.status, d.accountStatus)
  const specNames = d.specializations.map((s) => s.specialization.name).join(', ')

  // The compact ref shape shared by the account-control dialogs.
  const doctorRef: DoctorRef = {
    id: d.id, doctorId: d.doctorId, firstName: d.firstName, lastName: d.lastName,
  }

  /** Account lifecycle (PATCH /account) — lock/unlock/enable/disable/force a
   *  password change. Employment records are never touched; only sign-in
   *  access flips. */
  const confirmAccountAction = async () => {
    if (!accountAction || !doctorKey || accountProcessing) return
    if (accountAction !== 'disable' && accountAction !== 'enable') {
      toast.info(DOCTOR_ACTION_UNAVAILABLE)
      setAccountAction(null)
      return
    }
    setAccountProcessing(true)
    try {
      if (accountAction === 'disable') await doctorsService.disable(doctorKey)
      else await doctorsService.reactivate(doctorKey)
      toast.success(accountActionCopy(accountAction, `${d.firstName} ${d.lastName}`).toast)
      setAccountAction(null)
      void refetch()
    } catch (e) {
      const message = doctorActionError(e)
      toast.error(message)
      if (e instanceof ApiError && e.status === 401) navigate('/super-admin/login')
    } finally {
      setAccountProcessing(false)
    }
  }

  /** Lift the suspension (DELETE /suspend) — the doctor returns to Active,
   *  the suspension fields are cleared and portal access is restored.
   *  A 409 (not suspended) surfaces verbatim as an error toast. */
  const confirmLiftSuspension = async () => {
    if (!doctorKey || lifting) return
    setLifting(true)
    try {
      await doctorsService.reactivate(doctorKey)
      toast.success('Doctor reactivated successfully.')
      setLiftOpen(false)
      void refetch()
    } catch (e) {
      const message = doctorActionError(e)
      toast.error(message)
      if (e instanceof ApiError && e.status === 401) navigate('/super-admin/login')
    } finally {
      setLifting(false)
    }
  }

  const resendInvite = async () => {
    if (!doctorKey || resending) return
    setResending(true)
    try {
      await doctorsService.resendInvite(doctorKey)
      toast.success('Doctor invitation sent successfully.')
      setResendOpen(false)
    } catch (e) {
      const message = doctorActionError(e, 'Could not resend the invitation.')
      toast.error(message)
      if (e instanceof ApiError && e.status === 401) navigate('/super-admin/login')
    } finally {
      setResending(false)
    }
  }

  // Upcoming load (next 7 days) — computed from the already-fetched shifts, no extra request.
  const horizonISO = isoDaysFromNow(7)
  const next7dShifts = d.shifts.filter((s) => {
    if (s.status !== 'SCHEDULED') return false
    const iso = s.date.slice(0, 10)
    return iso >= todayLocalISO() && iso <= horizonISO
  })
  const next7dHours =
    next7dShifts.reduce(
      (sum, s) => sum + Math.max(0, minutesOf(s.endTime) - minutesOf(s.startTime)), 0,
    ) / 60

  // Task 26 §19 — the doctor's next SCHEDULED shift (today or later), for the
  // Super Admin Controls card.
  const todayISO = todayLocalISO()
  const nextShift =
    d.shifts
      .filter((s) => s.status === 'SCHEDULED' && s.date.slice(0, 10) >= todayISO)
      .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))[0] ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctor Profile"
        description="Complete clinical and administrative record"
        actions={backBtn}
      />

      {/* Header card */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <Avatar className="size-16 shrink-0 border bg-slate-50 dark:bg-white/5">
                {d.photo ? <AvatarImage src={d.photo} alt={`Photo of Dr. ${d.firstName} ${d.lastName}`} /> : null}
                <AvatarFallback className="bg-teal-50 text-lg font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                  {initials(`${d.firstName} ${d.lastName}`)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    Dr. {d.firstName} {d.lastName}
                  </h2>
                  {d.designation ? <Badge variant="secondary">{d.designation}</Badge> : null}
                  <StatusBadge status={d.status} />
                  {d.accountStatus && d.accountStatus !== 'ACTIVE' ? (
                    <StatusBadge status={d.accountStatus} />
                  ) : null}
                  {next7dShifts.length > 0 ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-teal-200 bg-teal-50 text-xs font-medium text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300"
                      data-testid="upcoming-load-chip"
                      aria-label={`Scheduled in the next 7 days: ${next7dHours} hours across ${next7dShifts.length} shifts`}
                    >
                      <CalendarClock className="size-3" aria-hidden />
                      Next 7 days: {formatNext7dHours(next7dHours)}h · {next7dShifts.length} shift(s)
                    </Badge>
                  ) : null}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <HeartPulse className="size-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                    <span className="truncate">{specNames || 'No specializations'}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Building2 className="size-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                    <span className="truncate">{d.department?.name ?? 'No department'}</span>
                  </li>
                  {d.registrationNumber ? (
                    <li className="flex items-center gap-1.5 font-mono text-xs">
                      <Hash className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{d.registrationNumber}</span>
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
            {/* Task 26 §12 — ONE consolidated "Doctor Controls" menu replaces the
                scattered header buttons. Items in exact spec order. */}
            <div className="flex shrink-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-testid="doctor-controls-trigger" aria-haspopup="menu">
                    <SlidersHorizontal className="size-4" aria-hidden /> Doctor Controls
                    <ChevronDown className="size-4 opacity-60" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {controls.edit ? (
                    <DropdownMenuItem onSelect={() => navigate(`/super-admin/doctors/${d.id}/edit`)}>
                      <Pencil className="size-4" aria-hidden /> Edit Doctor
                    </DropdownMenuItem>
                  ) : null}
                  {controls.manageAccount ? (
                    <DropdownMenuItem onSelect={() => setManageOpen(true)}>
                      <UserCog className="size-4" aria-hidden /> Manage Account
                    </DropdownMenuItem>
                  ) : null}
                  {controls.changePassword ? (
                    <DropdownMenuItem onSelect={() => setChangeOpen(true)}>
                      <KeyRound className="size-4" aria-hidden /> Change Password
                    </DropdownMenuItem>
                  ) : null}
                  {controls.resetPassword ? (
                    <DropdownMenuItem onSelect={() => setResetOpen(true)}>
                      <RotateCcwKey className="size-4" aria-hidden /> Reset Password
                    </DropdownMenuItem>
                  ) : null}
                  {controls.resendInvite ? (
                    <DropdownMenuItem onSelect={() => setResendOpen(true)}>
                      <RefreshCw className="size-4" aria-hidden /> Resend Invitation
                    </DropdownMenuItem>
                  ) : null}
                  {controls.disable ? (
                    <DropdownMenuItem onSelect={() => setAccountAction('disable')}>
                      <CircleOff className="size-4" aria-hidden /> Disable Account
                    </DropdownMenuItem>
                  ) : null}
                  {controls.reactivate ? (
                    <DropdownMenuItem onSelect={() => setAccountAction('enable')}>
                      <UserCheck className="size-4" aria-hidden /> Reactivate
                    </DropdownMenuItem>
                  ) : null}
                  {controls.assignShift ? (
                    <DropdownMenuItem onSelect={() => setAssignOpen(true)}>
                      <CalendarClock className="size-4" aria-hidden /> Assign Shift
                    </DropdownMenuItem>
                  ) : null}
                  {controls.viewPatients ? (
                    <DropdownMenuItem onSelect={() => setTab('patients')}>
                      <Users className="size-4" aria-hidden /> View Patients
                    </DropdownMenuItem>
                  ) : null}
                  {controls.suspend || controls.terminate || controls.deactivate ? <DropdownMenuSeparator /> : null}
                  {controls.suspend ? (
                    <DropdownMenuItem onSelect={() => setSuspendOpen(true)}>
                      <ShieldOff className="size-4" aria-hidden /> Suspend Doctor
                    </DropdownMenuItem>
                  ) : null}
                  {controls.terminate ? (
                    <DropdownMenuItem onSelect={() => setTerminateOpen(true)}>
                      <UserX className="size-4" aria-hidden /> Terminate Doctor
                    </DropdownMenuItem>
                  ) : null}
                  {controls.deactivate ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                      <Trash2 className="size-4" aria-hidden /> Delete Doctor
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task 26 §19 — Super Admin Controls: the doctor's central control center.
          Four-tile info grid + the full action row; sits ABOVE the detail tabs. */}
      <Card data-testid="super-admin-controls-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Super Admin Controls
          </CardTitle>
          <CardDescription>
            Central control for this doctor&apos;s account, employment and schedule
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Slim context strip while suspended (amber) or terminated (rose) */}
          {d.status === 'SUSPENDED' ? (
            <div
              className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/25 dark:bg-amber-500/10"
              role="alert"
              data-testid="suspension-banner"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Suspended — {d.suspensionReason ?? 'No reason recorded'}
                </p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                  {d.suspensionStart ? `From ${formatDate(d.suspensionStart)}` : 'From —'}
                  {d.suspensionEnd ? ` to ${formatDate(d.suspensionEnd)}` : ' · ongoing'}
                  {d.suspensionNotes ? ` · ${d.suspensionNotes}` : ''}
                </p>
              </div>
            </div>
          ) : null}
          {d.status === 'TERMINATED' ? (
            <div
              className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-500/25 dark:bg-rose-500/10"
              role="alert"
              data-testid="termination-banner"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-rose-800 dark:text-rose-200">
                  Terminated — {d.terminationType ? TERMINATION_TYPE_LABELS[d.terminationType] ?? d.terminationType : 'Details not recorded'}
                </p>
                <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">
                  {d.terminationDate ? `Terminated ${formatDate(d.terminationDate)}` : 'Terminated'}
                  {d.lastWorkingDate ? ` · Last working day ${formatDate(d.lastWorkingDate)}` : ''}
                  {d.terminationReason ? ` · ${d.terminationReason}` : ''}
                </p>
                {d.terminationNotes ? (
                  <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">{d.terminationNotes}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <DefinitionItem label="Account">
              <StatusBadge status={d.accountStatus} />
            </DefinitionItem>
            <DefinitionItem label="Employment">
              <StatusBadge status={d.status} />
            </DefinitionItem>
            <DefinitionItem label="Patient Assignments">
              <span className="flex flex-wrap items-center gap-2">
                {d.patients.length} Patient{d.patients.length === 1 ? '' : 's'}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-teal-700 dark:text-teal-300"
                  onClick={() => setTab('patients')}
                  aria-label="View assigned patients"
                >
                  View
                </Button>
              </span>
            </DefinitionItem>
            <DefinitionItem label="Next Shift">
              {nextShift
                ? `${getStatusLabel(nextShift.shiftType)} · ${formatShiftDate(nextShift.date)} ${formatTime12h(nextShift.startTime)}`
                : '—'}
            </DefinitionItem>
          </dl>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManageOpen(true)}
              aria-label="Manage this doctor's portal account"
            >
              <UserCog className="size-4" aria-hidden /> Manage Account
            </Button>
            {controls.changePassword ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChangeOpen(true)}
                aria-label="Change this doctor's password"
              >
                <KeyRound className="size-4" aria-hidden /> Change Password
              </Button>
            ) : null}
            {controls.assignShift ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssignOpen(true)}
                aria-label="Assign a shift to this doctor"
              >
                <CalendarClock className="size-4" aria-hidden /> Assign Shift
              </Button>
            ) : null}
            {controls.viewPatients ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTab('patients')}
                aria-label="View patients assigned to this doctor"
              >
                <Users className="size-4" aria-hidden /> View Patients
              </Button>
            ) : null}
            {controls.reactivate ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAccountAction('enable')}
                aria-label="Reactivate this doctor"
              >
                <ShieldCheck className="size-4" aria-hidden /> Reactivate
              </Button>
            ) : null}
            {controls.suspend ? (
              <Button
                variant="outline"
                size="sm"
                className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10 dark:hover:text-amber-200"
                onClick={() => setSuspendOpen(true)}
                aria-label="Suspend this doctor"
              >
                <ShieldOff className="size-4" aria-hidden /> Suspend Doctor
              </Button>
            ) : null}
            {controls.terminate ? (
              <Button
                variant="outline"
                size="sm"
                className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                onClick={() => setTerminateOpen(true)}
                aria-label="Terminate this doctor"
              >
                <UserX className="size-4" aria-hidden /> Terminate Doctor
              </Button>
            ) : null}
            {controls.deactivate ? (
              <Button
                variant="outline"
                size="sm"
                className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                onClick={() => setDeleteOpen(true)}
                aria-label="Deactivate this doctor"
              >
                <Trash2 className="size-4" aria-hidden /> Delete Doctor
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Detail tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as ProfileTab)}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="account">Account &amp; Login</TabsTrigger>
          <TabsTrigger value="qualifications">Qualifications</TabsTrigger>
          <TabsTrigger value="specialization">Specialization</TabsTrigger>
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab doctor={d} onResumeChanged={() => void refetch()} />
        </TabsContent>
        <TabsContent value="account" className="mt-4">
          <AccountTab
            doctor={d}
            onChangePassword={() => setChangeOpen(true)}
            onResetPassword={() => setResetOpen(true)}
            onAccountAction={setAccountAction}
          />
        </TabsContent>
        <TabsContent value="qualifications" className="mt-4">
          <QualificationsTab doctor={d} />
        </TabsContent>
        <TabsContent value="specialization" className="mt-4">
          <SpecializationTab doctor={d} />
        </TabsContent>
        <TabsContent value="patients" className="mt-4">
          <PatientsTab doctor={d} onChanged={() => void refetch()} />
        </TabsContent>
        <TabsContent value="shifts" className="mt-4">
          <ShiftsTab doctor={d} onChanged={() => void refetch()} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab activity={data.activity ?? []} />
        </TabsContent>
      </Tabs>

      {/* Task 26 — Super Admin control center dialogs. The parent owns the
          flows: Manage Account hands actions BACK here; every mutation is
          confirmed → called → toasted → refetched from this component. */}
      <ManageAccountDialog
        doctor={doctorRef}
        open={manageOpen}
        onOpenChange={setManageOpen}
        onRequestAction={(_target, action) => {
          // Close the Manage Account dialog first — the parent owns the flows.
          setManageOpen(false)
          if (action === 'reset-password') setResetOpen(true)
          else if (action === 'change-password') setChangeOpen(true)
          else setAccountAction(action)
        }}
        onRefresh={() => void refetch()}
      />
      <ChangePasswordDialog
        doctor={{ ...doctorRef, username: d.username }}
        open={changeOpen}
        onOpenChange={setChangeOpen}
        onDone={() => void refetch()}
      />
      <SuspendDoctorDialog
        doctor={{ id: d.id, doctorId: d.doctorId, firstName: d.firstName, lastName: d.lastName }}
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        onDone={() => void refetch()}
      />
      <TerminateDoctorDialog
        doctor={{
          id: d.id, doctorId: d.doctorId, firstName: d.firstName, lastName: d.lastName,
          departmentName: d.department?.name ?? null,
          specializationNames: specNames || undefined,
          designation: d.designation,
        }}
        open={terminateOpen}
        onOpenChange={setTerminateOpen}
        onDone={() => void refetch()}
      />
      <ConfirmDialog
        open={resendOpen}
        onOpenChange={setResendOpen}
        title="Resend invitation?"
        description={`A new invitation will be sent to Dr. ${d.firstName} ${d.lastName}'s registered email. The backend generates any temporary password.`}
        confirmLabel="Resend Invitation"
        processing={resending}
        onConfirm={() => void resendInvite()}
      />
      <AssignShiftDialog
        doctorId={d.id}
        doctorName={`Dr. ${d.firstName} ${d.lastName}`}
        employmentStatus={d.status}
        accountStatus={d.accountStatus}
        shifts={[]}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onAssigned={() => void refetch()}
      />
      <ConfirmDialog
        open={liftOpen}
        onOpenChange={setLiftOpen}
        title="Lift this suspension?"
        description={`Dr. ${d.firstName} ${d.lastName} will return to Active status, regain portal access and can be assigned shifts and patients again.`}
        confirmLabel="Lift Suspension"
        processing={lifting}
        onConfirm={() => void confirmLiftSuspension()}
      />
      <ResetPasswordDialog
        doctor={doctorRef}
        open={resetOpen}
        onOpenChange={setResetOpen}
        onReset={() => void refetch()}
      />
      <ConfirmDialog
        open={accountAction !== null}
        onOpenChange={(open) => {
          if (!open) setAccountAction(null)
        }}
        title={accountAction ? accountActionCopy(accountAction, `${d.firstName} ${d.lastName}`).title : ''}
        description={
          accountAction
            ? accountActionCopy(accountAction, `${d.firstName} ${d.lastName}`).description
            : undefined
        }
        confirmLabel={accountAction ? accountActionCopy(accountAction, `${d.firstName} ${d.lastName}`).confirmLabel : 'Confirm'}
        destructive={accountAction ? accountActionCopy(accountAction, `${d.firstName} ${d.lastName}`).destructive : false}
        processing={accountProcessing}
        onConfirm={() => void confirmAccountAction()}
      />
      <DeleteDoctorDialog
        doctor={doctorRef}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate('/super-admin/doctors')}
      />
    </div>
  )
}
