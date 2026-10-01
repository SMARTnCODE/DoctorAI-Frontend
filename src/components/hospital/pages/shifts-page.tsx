'use client'

/**
 * Doctor Shifts — scheduling workspace with Day / Week / Calendar / List views.
 * Add/edit via dialog (server validates conflicts, inactive doctors, time range);
 * cancel is a soft-delete (status CANCELLED, history preserved).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity, AlertCircle, AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, Copy, CopyPlus, DoorOpen, Download, Info, Loader2, MoreHorizontal, Move,
  Pencil, Plus, RefreshCw, Search, Users, X,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch, ApiError, type ShiftItem } from '@/lib/api-client'
import { doctorListItems, type DoctorListResponse } from '@/services/doctors.service'
import { useApiData } from '@/hooks/use-api-data'
import { buildCsv, downloadTextFile } from '@/lib/csv-export'
import {
  formatShiftDate, formatTime12h, initials, shiftTypeLabel, todayLocalISO, weekdayShort, dayNum,
  monthLabel,
} from '@/lib/format'
import { intervalsOverlap, SHIFT_TYPES, SHIFT_TYPE_LABELS, shiftDurationLabel } from '@/lib/shift-utils'
import { navigate } from '@/lib/hash-nav'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/hospital/page-header'
import { StatusBadge } from '@/components/hospital/status-badge'
import { EmptyState } from '@/components/hospital/empty-state'
import { ConfirmDialog } from '@/components/hospital/confirm-dialog'
import { PaginationControls } from '@/components/hospital/pagination-controls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

const ALL = 'ALL'
const TODAY = todayLocalISO()

type TabKey = 'day' | 'week' | 'calendar' | 'list'
type ShiftTypeKey = (typeof SHIFT_TYPES)[number]

interface RangeResp { shifts: ShiftItem[] }
interface ListResp { shifts: ShiftItem[]; total: number; page: number; pageSize: number; totalPages: number; today: string }
interface CopyWeekSkipped { doctor: string; date: string; reason: string }
interface CopyWeekResponse {
  sourceWeek: string
  targetWeek: string
  created: number
  skipped: CopyWeekSkipped[]
}
interface UtilizationRow {
  doctorId: string; code: string; name: string; department: string | null
  doctorStatus: string
  scheduledShifts: number; scheduledHours: number
  cancelledShifts: number; cancelledHours: number
  completedShifts: number
}
interface UtilizationResponse { from: string; to: string; rows: UtilizationRow[] }
/** Per-doctor rollup row from GET /api/doctors/utilization (List-tab card). */
interface UtilizationDoctorInfo {
  code: string
  name: string
  specializations: string[]
  status: string
}
interface DoctorUtilizationRow {
  doctor: UtilizationDoctorInfo
  scheduledShifts: number
  scheduledHours: number
  cancelledShifts: number
  cancelledHours: number
  completedShifts: number
  completedHours: number
  utilizationPct: number
}
interface DoctorUtilizationResponse { days: number; from: string; to: string; rows: DoctorUtilizationRow[] }
interface DuplicatedShift {
  id: string; date: string; startTime: string; endTime: string
  shiftType: string; status: string
}
interface DuplicateShiftResponse { shift: DuplicatedShift }
interface DoctorOption {
  id: string; firstName: string; lastName: string
  designation: string | null
  department: { id: string; name: string; code?: string } | null
}
interface DeptOption { id: string; name: string; code: string }

interface ShiftForm {
  doctorId: string
  departmentId: string
  date: string
  startTime: string
  endTime: string
  shiftType: ShiftTypeKey
  room: string
  notes: string
}

const TYPE_BAR: Record<string, string> = {
  MORNING: 'border-l-amber-400',
  AFTERNOON: 'border-l-sky-400',
  EVENING: 'border-l-violet-400',
  NIGHT: 'border-l-slate-700 dark:border-l-slate-400',
  EMERGENCY: 'border-l-rose-400',
  CUSTOM: 'border-l-slate-300',
}

const SKIP_REASON_TONES: Record<string, string> = {
  'doctor inactive': 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
  'time conflict': 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300',
}

/** Status-colored left accent bar on shift chips/cards (3px rounded inset). */
const STATUS_ACCENT: Record<string, string> = {
  SCHEDULED: 'bg-teal-500',
  CANCELLED: 'bg-rose-500',
  COMPLETED: 'bg-emerald-500',
}

/** Drag-drop rescheduling is pointer-only: fine pointer + hover-capable device. */
const POINTER_FINE_QUERY = '(hover: hover) and (pointer: fine)'

/** A shift picked up by drag, awaiting confirmation of its new day. */
interface MoveShiftTarget { shift: ShiftItem; toDate: string }

/** Hours label: 8 → "8", 8.5 → "8.5" (no trailing .0). */
function formatHours(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return isoOf(d)
}
function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoOf(d)
}
function monthStartOf(iso: string): string {
  return iso.slice(0, 8) + '01'
}
function monthEndOf(iso: string): string {
  return isoOf(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0))
}
function addMonthsISO(iso: string, n: number): string {
  return isoOf(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + n, 1))
}

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function mutationErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) {
      toast.error('Session expired. Please sign in again.')
      navigate('/super-admin/login')
      return ''
    }
    return e.message
  }
  return 'Something went wrong. Please try again.'
}

function DoctorCell({ shift }: { shift: ShiftItem }) {
  const name = `Dr. ${shift.doctor.firstName} ${shift.doctor.lastName}`
  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-7">
        <AvatarFallback className="bg-teal-100 text-[10px] font-semibold text-teal-800 dark:bg-teal-500/15 dark:text-teal-300">
          {name.split(' ').slice(-2).map((p) => p[0]).join('').toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {shift.doctor.designation ? (
          <p className="truncate text-[11px] text-muted-foreground">{shift.doctor.designation}</p>
        ) : null}
      </div>
    </div>
  )
}

function ShiftActions({ shift, onEdit, onCancel, onDuplicate, duplicating = false, compact = false }: {
  shift: ShiftItem
  onEdit: (s: ShiftItem) => void
  onCancel: (s: ShiftItem) => void
  onDuplicate?: (s: ShiftItem) => void
  /** True while this exact shift is being duplicated (spinner + disabled item). */
  duplicating?: boolean
  /** Smaller trigger for week-view chips. */
  compact?: boolean
}) {
  const doctorInactive = shift.doctor.status !== 'ACTIVE'
  const duplicable = shift.status === 'SCHEDULED' && !doctorInactive
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={compact ? 'size-5 rounded-sm' : 'size-8'}
          aria-label={`Actions for ${shift.doctor.firstName} ${shift.doctor.lastName}'s shift`}
        >
          {duplicating ? (
            <Loader2 className={compact ? 'size-3 animate-spin' : 'size-4 animate-spin'} aria-hidden />
          ) : (
            <MoreHorizontal className={compact ? 'size-3.5' : 'size-4'} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'end' : 'end'} className="w-44">
        <DropdownMenuItem onClick={() => onEdit(shift)}>
          <Pencil className="size-4" /> Edit
        </DropdownMenuItem>
        {onDuplicate ? (
          <DropdownMenuItem
            disabled={!duplicable || duplicating}
            onClick={() => onDuplicate(shift)}
            data-testid={compact ? 'chip-duplicate-action' : 'duplicate-action'}
          >
            {duplicating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <CopyPlus className="size-4" aria-hidden />
            )}
            Duplicate to next day
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={shift.status !== 'SCHEDULED'}
          onClick={() => onCancel(shift)}
        >
          <X className="size-4" /> Cancel Shift
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Copy week dialog ─────────────────────────────────────────
function CopyWeekDialog({
  open, onOpenChange, sourceWeek, onCopied,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceWeek: string
  onCopied: () => void
}) {
  // `submitting` lives in the outer shell so closing can be blocked mid-request;
  // picker/error/result state lives in CopyWeekDialogBody, which Radix unmounts
  // whenever the dialog closes — so it resets naturally on every open.
  const [submitting, setSubmitting] = useState(false)
  const closeDialog = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-md" data-testid="copy-week-dialog">
        <DialogHeader>
          <DialogTitle>Copy week&apos;s shifts</DialogTitle>
          <DialogDescription>
            Duplicate this week&apos;s schedule into another week.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CopyWeekDialogBody
            sourceWeek={sourceWeek}
            onCopied={onCopied}
            onSubmittingChange={setSubmitting}
            closeDialog={closeDialog}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CopyWeekDialogBody({
  sourceWeek, onCopied, onSubmittingChange, closeDialog,
}: {
  sourceWeek: string
  onCopied: () => void
  onSubmittingChange: (busy: boolean) => void
  closeDialog: () => void
}) {
  const [targetMonday, setTargetMonday] = useState(() => addDaysISO(sourceWeek, 7))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CopyWeekResponse | null>(null)

  const sameWeek = targetMonday === mondayOf(sourceWeek)

  function setBusy(busy: boolean) {
    setSubmitting(busy)
    onSubmittingChange(busy)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || sameWeek) return
    setBusy(true)
    setError(null)
    try {
      // Any date inside the week works — the server normalizes to Monday.
      const resp = await apiFetch<CopyWeekResponse>('/api/shifts/copy-week', {
        method: 'POST',
        body: JSON.stringify({ sourceDate: sourceWeek, targetDate: targetMonday }),
      })
      onCopied()
      toast.success(`Copied ${resp.created} shift(s) to week of ${resp.targetWeek}`, {
        description:
          resp.skipped.length > 0
            ? `${resp.skipped.length} shift(s) skipped — details below.`
            : undefined,
      })
      if (resp.skipped.length > 0) {
        setResult(resp) // stay open and report the skips
        setBusy(false)
      } else {
        closeDialog()
      }
    } catch (err) {
      const msg = mutationErrorMessage(err)
      if (msg) setError(msg)
      setBusy(false)
    }
  }

  return (
    <>
        {result ? (
          <div className="space-y-4" data-testid="copy-week-result">
            <Alert>
              <CheckCircle2 className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
              <AlertTitle>{result.created} shift(s) copied</AlertTitle>
              <AlertDescription>
                {result.skipped.length} shift(s) could not be copied to the week of{' '}
                {formatShiftDate(result.targetWeek)}:
              </AlertDescription>
            </Alert>
            <ul className="hms-scroll max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {result.skipped.map((s, i) => (
                <li
                  key={`${s.doctor}-${s.date}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-slate-50/50 dark:bg-white/5 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 font-medium text-foreground">
                    {s.doctor}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {formatShiftDate(s.date)}
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className={cn('text-[11px]', SKIP_REASON_TONES[s.reason] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300')}
                  >
                    {s.reason}
                  </Badge>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button onClick={closeDialog} data-testid="copy-week-done">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">From</p>
              <p className="rounded-lg border bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-medium text-foreground">
                {formatShiftDate(sourceWeek)} — {formatShiftDate(addDaysISO(sourceWeek, 6))}
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">To</p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => setTargetMonday((m) => addDaysISO(m, -7))}
                  aria-label="Previous target week"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <p
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium',
                    sameWeek ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-white text-foreground dark:bg-white/5',
                  )}
                  data-testid="copy-week-target"
                >
                  {formatShiftDate(targetMonday)} — {formatShiftDate(addDaysISO(targetMonday, 6))}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => setTargetMonday((m) => addDaysISO(m, 7))}
                  aria-label="Next target week"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              {sameWeek ? (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400" role="status">
                  Choose a different week
                </p>
              ) : null}
            </div>

            <Alert className="border-teal-200 bg-teal-50/60 dark:border-teal-500/30 dark:bg-teal-500/10">
              <Info className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
              <AlertDescription className="text-teal-900 dark:text-teal-300">
                Copies SCHEDULED shifts only, keeping doctor, time, type and room. Conflicting
                shifts and inactive doctors are skipped and reported.
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || sameWeek} data-testid="copy-week-submit">
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                Copy week
              </Button>
            </DialogFooter>
          </form>
        )}
    </>
  )
}

// ── Move-shift (drag-drop reschedule) confirm dialog ─────────
function MoveShiftDialog({
  target, conflict, serverError, processing, onOpenChange, onConfirm,
}: {
  target: MoveShiftTarget
  /** Client-side pre-check hit: the conflicting shift already in week state. */
  conflict: ShiftItem | null
  /** Verbatim server message (409 conflict / inactive doctor) after a failed PATCH. */
  serverError: string | null
  processing: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { shift, toDate } = target
  const doctorName = `Dr. ${shift.doctor.firstName} ${shift.doctor.lastName}`
  const timeLabel = `${formatTime12h(shift.startTime)}–${formatTime12h(shift.endTime)}`
  const fromDate = shift.date.slice(0, 10)

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md" data-testid="move-shift-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle data-testid="move-shift-title">
            Move shift to {weekdayShort(toDate)}, {formatShiftDate(toDate)}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {doctorName}&apos;s {shiftTypeLabel(shift.shiftType)} shift ({timeLabel}) will move
            from {weekdayShort(fromDate)}, {formatShiftDate(fromDate)} to {weekdayShort(toDate)},{' '}
            {formatShiftDate(toDate)}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 text-sm">
          {conflict ? (
            <p
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
              role="alert"
              data-testid="move-conflict-warning"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500 dark:text-amber-400" aria-hidden />
              <span>
                <span className="font-semibold">Conflict:</span> {doctorName} already has a{' '}
                {shiftTypeLabel(conflict.shiftType)} shift (
                {formatTime12h(conflict.startTime)}–{formatTime12h(conflict.endTime)}) on{' '}
                {formatShiftDate(conflict.date)}.
              </span>
            </p>
          ) : null}

          {serverError ? (
            <p
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
              role="alert"
              data-testid="move-server-error"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-500 dark:text-rose-400" aria-hidden />
              <span>{serverError}</span>
            </p>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault() // close is handled by the parent after the request
              onConfirm()
            }}
            disabled={processing}
            className={
              conflict ? 'border border-rose-300 bg-white text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20 hover:bg-rose-50' : undefined
            }
            data-testid="move-confirm"
          >
            {processing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {conflict ? 'Move anyway' : 'Move shift'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Client-side conflict pre-check shared by the Week + Calendar drag-drop:
 * same doctor, target date, overlapping time — CANCELLED shifts ignored and
 * boundary-touch (end === start) treated as non-overlapping, mirroring the
 * server's intervalsOverlap convention. Checks against the data set loaded by
 * the view the drag started in (week range or the whole calendar month). */
function findMoveConflict(
  shifts: ShiftItem[],
  shift: ShiftItem,
  toDate: string,
): ShiftItem | null {
  return (
    shifts.find(
      (s) =>
        s.id !== shift.id &&
        s.doctor.id === shift.doctor.id &&
        s.status !== 'CANCELLED' &&
        s.date.slice(0, 10) === toDate &&
        intervalsOverlap(shift, s),
    ) ?? null
  )
}

// ── This week's load (utilization) panel ─────────────────────
function WeekUtilizationPanel({ from, to }: { from: string; to: string }) {
  const path = from && to ? `/api/shifts/utilization?from=${from}&to=${to}` : null
  const { data, loading, error, refetch } = useApiData<UtilizationResponse>(path)
  const reduceMotion = useReducedMotion()

  const rows = data?.rows ?? []
  const maxHours = Math.max(1, ...rows.map((r) => r.scheduledHours))
  const totalHours = rows.reduce((sum, r) => sum + (r.scheduledHours || 0), 0)

  return (
    <Card className="rounded-xl" data-testid="utilization-panel">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 ring-1 ring-teal-200/70 dark:bg-teal-500/10 dark:ring-teal-500/30">
              <Activity className="size-4.5 text-teal-600 dark:text-teal-400" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">This week&apos;s load</CardTitle>
              <CardDescription>
                Scheduled hours per doctor · {formatShiftDate(from)} — {formatShiftDate(to)}
              </CardDescription>
            </div>
          </div>
          {rows.length > 0 ? (
            <Badge variant="outline" className="border-teal-200 bg-teal-50 text-xs text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300">
              {rows.length} doctor{rows.length === 1 ? '' : 's'} · {formatHours(totalHours)}h
            </Badge>
          ) : null}
        </div>

        <div className="mt-4">
          {loading && !data ? (
            <div className="space-y-3" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-8 flex-1" />
                </div>
              ))}
            </div>
          ) : error && !data ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4">
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load this week&apos;s utilization{error ? ` — ${error}` : '.'}
              </p>
              <Button variant="ghost" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground" data-testid="utilization-empty">
              No shifts scheduled this week.
            </p>
          ) : (
            <ul className="hms-scroll max-h-72 space-y-3 overflow-y-auto pr-1" data-testid="utilization-rows">
              {rows.map((r) => {
                const pct = r.scheduledHours > 0 ? Math.max(3, Math.round((r.scheduledHours / maxHours) * 100)) : 0
                return (
                  <li key={r.doctorId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 items-center gap-2.5 sm:w-56 sm:shrink-0">
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="bg-teal-100 text-[10px] font-semibold text-teal-800 dark:bg-teal-500/15 dark:text-teal-300">
                          {initials(r.name.replace(/^Dr\.\s+/i, ''))}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                          <span className="truncate">{r.name}</span>
                          {r.doctorStatus === 'INACTIVE' ? (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                              Inactive
                            </Badge>
                          ) : null}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">{r.department ?? 'No department'}</p>
                      </div>
                    </div>
                    <div className="flex flex-1 items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-white/10">
                        {r.scheduledHours > 0 ? (
                          reduceMotion ? (
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400"
                              style={{ width: `${pct}%` }}
                            />
                          ) : (
                            <motion.div
                              key={`${from}-${r.doctorId}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.4, ease: 'easeOut' }}
                              className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400"
                            />
                          )
                        ) : null}
                      </div>
                      <div className="w-24 shrink-0 text-right">
                        <p className="text-sm font-semibold text-teal-700 dark:text-teal-300">{formatHours(r.scheduledHours)}h</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.scheduledShifts} shift{r.scheduledShifts === 1 ? '' : 's'}
                        </p>
                        {r.cancelledHours > 0 ? (
                          <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-rose-600 dark:text-rose-400">
                            <span className="size-1.5 shrink-0 rounded-full bg-rose-500" aria-hidden />
                            {formatHours(r.cancelledHours)}h cancelled
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Doctor utilization rollup (List tab) ─────────────────────
const UTILIZATION_DAYS = [7, 14, 30] as const
type UtilizationDays = (typeof UTILIZATION_DAYS)[number]

/** The List-tab card unmounts whenever another tab opens; this module-level
 * cache keeps the last successful payload (plus the chosen range) so
 * re-activating the List tab serves cached data instead of refetching.
 * Range changes and manual refresh always bypass it. */
let utilizationCache: { days: UtilizationDays; data: DoctorUtilizationResponse } | null = null

function DoctorUtilizationCard() {
  const [days, setDays] = useState<UtilizationDays>(() => utilizationCache?.days ?? 30)
  const [data, setData] = useState<DoctorUtilizationResponse | null>(() => utilizationCache?.data ?? null)
  const [loading, setLoading] = useState(() => !utilizationCache)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const load = useCallback(async (range: UtilizationDays, _force = false) => {
    // Doctor utilization is not on the admin API. Keep the card, skip the 404.
    setLoading(false)
    setError(null)
    setData({ days: range, from: '', to: '', rows: [] })
  }, [])

  // First List-tab activation / range change — cached re-activations no-op above.
  useEffect(() => {
    void load(days)
  }, [days, load])

  const rows = data?.rows ?? []
  const visibleRows = expanded ? rows : rows.slice(0, 5)

  /** Export the CURRENT rows for the selected range (shared CSV conventions). */
  function handleExportCsv() {
    if (!data?.rows?.length) return
    const csv = buildCsv(
      [
        'Doctor Code', 'Doctor Name', 'Specializations', 'Status',
        'Scheduled Shifts', 'Scheduled Hours', 'Cancelled Shifts', 'Cancelled Hours',
        'Completed Shifts', 'Completed Hours', 'Utilization %',
      ],
      data.rows.map((r) => [
        r.doctor.code,
        r.doctor.name,
        (r.doctor.specializations ?? []).join(', '),
        r.doctor.status,
        Number(r.scheduledShifts) || 0,
        Number(r.scheduledHours) || 0,
        Number(r.cancelledShifts) || 0,
        Number(r.cancelledHours) || 0,
        Number(r.completedShifts) || 0,
        Number(r.completedHours) || 0,
        Number(r.utilizationPct) || 0,
      ]),
    )
    const filename = `doctor-utilization-${days}d.csv`
    downloadTextFile(filename, csv)
    toast.success(`Exported ${data.rows.length} row${data.rows.length === 1 ? '' : 's'} · ${filename}`)
  }

  return (
    <Card className="rounded-xl" data-testid="doctor-utilization-card">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 ring-1 ring-teal-200/70 dark:bg-teal-500/10 dark:ring-teal-500/30">
              <Users className="size-4.5 text-teal-600 dark:text-teal-400" aria-hidden />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base">Doctor utilization</CardTitle>
              <CardDescription>
                Scheduled vs completed hours per doctor · last {days} days
                {data ? ` · ${formatShiftDate(data.from)} — ${formatShiftDate(data.to)}` : ''}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Utilization period" className="flex items-center rounded-lg bg-slate-100 dark:bg-white/5 p-0.5">
              {UTILIZATION_DAYS.map((d) => (
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
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => void load(days, true)}
              disabled={loading}
              aria-label="Refresh utilization"
              data-testid="refresh-utilization"
            >
              <RefreshCw className={cn('size-4', loading && 'animate-spin motion-reduce:animate-none')} aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={loading || Boolean(error)}
              data-testid="export-utilization-csv"
              aria-label="Export doctor utilization as CSV"
            >
              <Download className="size-4" aria-hidden /> Export CSV
            </Button>
          </div>
        </div>

        <div className="mt-4">
          {loading && !data ? (
            // Skeleton rows — same layout as the real rows so nothing shifts.
            <div className="space-y-1" aria-hidden data-testid="utilization-skeleton">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg px-3 py-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 items-center gap-2.5 sm:w-64 sm:shrink-0">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-2.5 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-2.5 min-w-0 flex-1" />
                  <Skeleton className="h-3.5 w-32 shrink-0" />
                </div>
              ))}
            </div>
          ) : error && !data ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4">
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load doctor utilization{error ? ` — ${error}` : '.'}
              </p>
              <Button variant="ghost" size="sm" onClick={() => void load(days, true)}>
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p
              className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground"
              data-testid="doctor-utilization-empty"
            >
              No utilization data for this period.
            </p>
          ) : (
            <>
              {error && data ? (
                <p
                  className="mb-2 flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
                  role="alert"
                >
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                  Couldn&apos;t refresh — showing the last loaded results.
                </p>
              ) : null}
              <ul
                className={cn(
                  'space-y-1 transition-opacity motion-reduce:transition-none',
                  loading && data && 'opacity-60',
                )}
                aria-busy={loading}
                data-testid="doctor-utilization-rows"
              >
                {visibleRows.map((r) => {
                  const pct = Number(r.utilizationPct) || 0
                  const width = Math.min(100, Math.max(0, pct)) // bar caps at 100; label keeps the true number
                  const schedHours = Number(r.scheduledHours) || 0
                  const doneHours = Number(r.completedHours) || 0
                  const specs = (r.doctor.specializations ?? []).join(', ')
                  return (
                    <li
                      key={r.doctor.code}
                      data-testid={`utilization-row-${r.doctor.code}`}
                      data-utilization-pct={pct}
                      title={`${r.scheduledShifts} scheduled (${formatHours(schedHours)}h) · ${r.completedShifts} completed (${formatHours(doneHours)}h) · ${r.cancelledShifts} cancelled (${formatHours(Number(r.cancelledHours) || 0)}h)`}
                      className="flex flex-col gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted/30 motion-reduce:transition-none sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-2.5 sm:w-64 sm:shrink-0">
                        <Avatar className="size-8 shrink-0">
                          <AvatarFallback className="bg-teal-100 text-[10px] font-semibold text-teal-800 dark:bg-teal-500/15 dark:text-teal-300">
                            {initials(r.doctor.name.replace(/^Dr\.\s+/i, ''))}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            <span className="truncate" title={r.doctor.name}>{r.doctor.name}</span>
                            <Badge variant="outline" className="shrink-0 font-mono text-[10px] font-normal text-muted-foreground">
                              {r.doctor.code}
                            </Badge>
                            {r.doctor.status === 'INACTIVE' ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
                                <span className="size-1.5 shrink-0 rounded-full bg-rose-500" aria-hidden /> Inactive
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground" title={specs || undefined}>
                            {specs || 'No specializations'}
                          </p>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div
                          className="h-2.5 min-w-0 flex-1 rounded-full bg-slate-100 dark:bg-white/10"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(width)}
                          aria-label={`${r.doctor.name}: ${formatHours(pct)}% utilization over the last ${days} days`}
                        >
                          <div
                            className="h-2.5 rounded-full bg-gradient-to-r from-teal-500 to-teal-400 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                            style={{ width: `${width}%`, minWidth: pct > 0 ? 3 : undefined }}
                          />
                        </div>
                        <div className="w-32 shrink-0 text-right sm:w-40">
                          <p className="truncate text-xs tabular-nums text-muted-foreground">
                            {formatHours(schedHours)}h sched · {formatHours(doneHours)}h done
                          </p>
                          <p className={cn('text-sm font-bold tabular-nums', pct >= 10 ? 'text-teal-700 dark:text-teal-300' : 'text-muted-foreground')}>
                            {formatHours(pct)}%
                          </p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              {rows.length > 5 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
                  onClick={() => setExpanded((e) => !e)}
                  aria-expanded={expanded}
                  data-testid="utilization-toggle"
                >
                  {expanded ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                  {expanded ? 'Show fewer' : `Show all ${rows.length} doctors`}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function ShiftsPage() {
  const [tab, setTab] = useState<TabKey>('day')

  // ── View state ───────────────────────────────────────────────
  const [dayDate, setDayDate] = useState(TODAY)
  const [weekAnchor, setWeekAnchor] = useState(mondayOf(TODAY))
  const [monthAnchor, setMonthAnchor] = useState(monthStartOf(TODAY))

  // List filters
  const [fDoctor, setFDoctor] = useState(ALL)
  const [fDept, setFDept] = useState(ALL)
  const [fType, setFType] = useState(ALL)
  const [fStatus, setFStatus] = useState(ALL)
  const [fSearch, setFSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedFSearch = useDebouncedValue(fSearch)

  // ── Dialog state ─────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ShiftItem | null>(null)
  const [form, setForm] = useState<ShiftForm>({
    doctorId: '', departmentId: '', date: TODAY, startTime: '09:00', endTime: '17:00',
    shiftType: 'MORNING', room: '', notes: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Cancel dialog state
  const [cancelTarget, setCancelTarget] = useState<ShiftItem | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Copy-week dialog state
  const [copyOpen, setCopyOpen] = useState(false)

  // Duplicate quick-action: id of the shift currently being duplicated
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  // ── Drag-drop reschedule state (Week + Calendar views) ───────
  const [pointerFine, setPointerFine] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<MoveShiftTarget | null>(null)
  const [moveServerError, setMoveServerError] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)

  // ── Reference data ───────────────────────────────────────────
  const { data: doctorsData } = useApiData<DoctorListResponse>('/api/admin/doctors?status=ACTIVE')
  const { data: deptsData } = useApiData<{ departments: DeptOption[] }>('/api/departments')
  const activeDoctors = useMemo<DoctorOption[]>(
    () => doctorListItems(doctorsData).map((d) => ({
      id: d.id,
      firstName: d.firstName,
      lastName: d.lastName,
      designation: d.designation,
      department: d.department,
    })),
    [doctorsData],
  )
  const departments = deptsData?.departments ?? []

  // ── Data (per view; null path skips the fetch) ───────────────
  const weekEnd = addDaysISO(weekAnchor, 6)
  const monthEnd = monthEndOf(monthAnchor)

  const dayPath = tab === 'day' ? `/api/shifts?from=${dayDate}&to=${dayDate}` : null
  const { data: dayData, loading: dayLoading, refetch: refetchDay } = useApiData<RangeResp>(dayPath)

  const weekPath = tab === 'week' ? `/api/shifts?from=${weekAnchor}&to=${weekEnd}` : null
  const { data: weekData, loading: weekLoading, refetch: refetchWeek } = useApiData<RangeResp>(weekPath)

  const calPath = tab === 'calendar' ? `/api/shifts?from=${monthAnchor}&to=${monthEnd}` : null
  const { data: calData, loading: calLoading, refetch: refetchCal } = useApiData<RangeResp>(calPath)

  const listPath = useMemo(() => {
    if (tab !== 'list') return null
    const params = new URLSearchParams()
    if (fDoctor !== ALL) params.set('doctorId', fDoctor)
    if (fDept !== ALL) params.set('departmentId', fDept)
    if (fType !== ALL) params.set('shiftType', fType)
    if (fStatus !== ALL) params.set('status', fStatus)
    if (debouncedFSearch.trim()) params.set('search', debouncedFSearch.trim())
    params.set('page', String(page))
    params.set('pageSize', '10')
    return `/api/shifts?${params.toString()}`
  }, [tab, fDoctor, fDept, fType, fStatus, debouncedFSearch, page])
  const { data: listData, loading: listLoading, refetch: refetchList } = useApiData<ListResp>(listPath)

  function refetchAll() {
    void refetchDay()
    void refetchWeek()
    void refetchCal()
    void refetchList()
  }

  /** Export the currently viewed week's shifts (already in page state) as CSV. */
  function handleExportWeek() {
    if (weekShifts.length === 0) {
      toast.info('No shifts to export')
      return
    }
    try {
      const sorted = [...weekShifts].sort((a, b) => {
        const da = a.date.slice(0, 10)
        const db = b.date.slice(0, 10)
        if (da !== db) return da < db ? -1 : 1
        return a.startTime.localeCompare(b.startTime)
      })
      const csv = buildCsv(
        ['Date', 'Doctor Code', 'Doctor', 'Department', 'Type', 'Start', 'End', 'Duration', 'Room', 'Status'],
        sorted.map((s) => [
          s.date.slice(0, 10),
          s.doctor.doctorId,
          `Dr. ${s.doctor.firstName} ${s.doctor.lastName}`,
          s.department?.name ?? '',
          SHIFT_TYPE_LABELS[s.shiftType] ?? s.shiftType,
          s.startTime,
          s.endTime,
          shiftDurationLabel(s.startTime, s.endTime),
          s.room ?? '',
          s.status,
        ]),
      )
      const filename = `shifts-${weekAnchor}.csv`
      downloadTextFile(filename, csv)
      toast.success(`Exported ${sorted.length} row${sorted.length === 1 ? '' : 's'}`, { description: filename })
    } catch {
      toast.error('Export failed. Please try again.')
    }
  }

  // ── Prefill from Doctors page ("Assign Shift") ───────────────
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem('hms-shift-prefill')
        if (!raw) return
        sessionStorage.removeItem('hms-shift-prefill')
        const prefill = JSON.parse(raw) as { doctorId?: string }
        if (prefill?.doctorId) {
          setEditing(null)
          setForm((f) => ({
            ...f,
            doctorId: prefill.doctorId as string,
            date: TODAY,
          }))
          setFormError(null)
          setDialogOpen(true)
        }
      } catch {
        /* malformed prefill — ignore */
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // ── Drag-drop reschedule capability (Week + Calendar views) ──
  // HTML5 DnD is pointer-only: chips are draggable on hover-capable, fine-pointer
  // devices (touch users keep the Edit dialog). Re-read on every Week/Calendar
  // tab open so the media query stays live; drag residue is cleared when leaving
  // both tabs.
  useEffect(() => {
    if (tab !== 'week' && tab !== 'calendar') {
      const clear = setTimeout(() => {
        setDraggingId(null)
        setDropTargetDate(null)
      }, 0)
      return () => clearTimeout(clear)
    }
    const mq = window.matchMedia(POINTER_FINE_QUERY)
    const update = () => setPointerFine(mq.matches)
    const initial = setTimeout(update, 0) // async initial read (set-state-in-effect lint)
    mq.addEventListener('change', update)
    return () => {
      clearTimeout(initial)
      mq.removeEventListener('change', update)
    }
  }, [tab])

  // ── Dialog helpers ───────────────────────────────────────────
  function openAdd() {
    setEditing(null)
    setForm({
      doctorId: '', departmentId: '', date: dayDate, startTime: '09:00', endTime: '17:00',
      shiftType: 'MORNING', room: '', notes: '',
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(shift: ShiftItem) {
    setEditing(shift)
    setForm({
      doctorId: shift.doctor.id,
      departmentId: shift.department?.id ?? '',
      date: shift.date.slice(0, 10),
      startTime: shift.startTime,
      endTime: shift.endTime,
      shiftType: (SHIFT_TYPES as readonly string[]).includes(shift.shiftType)
        ? (shift.shiftType as ShiftTypeKey)
        : 'CUSTOM',
      room: shift.room ?? '',
      notes: shift.notes ?? '',
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function onDoctorChange(id: string) {
    const doc = activeDoctors.find((d) => d.id === id)
    setForm((f) => ({ ...f, doctorId: id, departmentId: doc?.department?.id ?? f.departmentId }))
  }

  const timeError =
    form.startTime && form.endTime && form.startTime >= form.endTime
      ? 'Shift start time must be before end time.'
      : null

  // Editing a doctor who is no longer ACTIVE: keep them selectable (marked inactive)
  const doctorOptions = useMemo(() => {
    const opts = activeDoctors.map((d) => ({
      id: d.id,
      label: `Dr. ${d.firstName} ${d.lastName}`,
      hint: d.department?.name ?? d.designation ?? '',
    }))
    if (editing && !opts.some((o) => o.id === editing.doctor.id)) {
      opts.push({
        id: editing.doctor.id,
        label: `Dr. ${editing.doctor.firstName} ${editing.doctor.lastName} (inactive)`,
        hint: '',
      })
    }
    return opts
  }, [activeDoctors, editing])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!form.doctorId) { setFormError('Doctor is required.'); return }
    if (!form.date) { setFormError('Date is required.'); return }
    if (timeError) { setFormError(timeError); return }
    setSaving(true)
    setFormError(null)
    const body = {
      doctorId: form.doctorId,
      departmentId: form.departmentId || null,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      shiftType: form.shiftType,
      room: form.room.trim() || null,
      notes: form.notes.trim() || null,
    }
    try {
      await apiFetch(editing ? `/api/shifts/${editing.id}` : '/api/shifts', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      })
      toast.success(editing ? 'Shift updated' : 'Shift assigned')
      setDialogOpen(false)
      refetchAll()
    } catch (err) {
      const msg = mutationErrorMessage(err)
      if (msg) {
        setFormError(msg)
        toast.error(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmCancel() {
    if (!cancelTarget || cancelling) return
    setCancelling(true)
    try {
      await apiFetch(`/api/shifts/${cancelTarget.id}`, { method: 'DELETE' })
      toast.success('Shift cancelled')
      setCancelTarget(null)
      refetchAll()
    } catch (err) {
      const msg = mutationErrorMessage(err)
      if (msg) toast.error(msg)
    } finally {
      setCancelling(false)
    }
  }

  function gotoDay(iso: string) {
    setDayDate(iso)
    setTab('day')
  }

  /** Duplicate a SCHEDULED shift to the next day (server defaults to +1d). */
  async function duplicateShift(shift: ShiftItem) {
    if (duplicatingId) return
    const doctorName = `Dr. ${shift.doctor.firstName} ${shift.doctor.lastName}`
    setDuplicatingId(shift.id)
    const tid = toast.loading('Duplicating…')
    try {
      const resp = await apiFetch<DuplicateShiftResponse>(`/api/shifts/${shift.id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({}), // no date → server defaults to next day
      })
      toast.success(`Shift duplicated to ${formatShiftDate(resp.shift?.date)}`, {
        id: tid,
        description: `${doctorName} · ${shiftTypeLabel(resp.shift?.shiftType ?? shift.shiftType)} · ${formatTime12h(resp.shift?.startTime ?? shift.startTime)}–${formatTime12h(resp.shift?.endTime ?? shift.endTime)}`,
      })
      refetchAll()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Session expired. Please sign in again.', { id: tid })
        navigate('/super-admin/login')
      } else {
        const serverMsg = err instanceof ApiError && err.message ? err.message : null
        const fallback =
          err instanceof ApiError && err.status === 409
            ? `Time conflict — ${doctorName} already has a shift then`
            : 'Could not duplicate the shift. Please try again.'
        toast.error(serverMsg ?? fallback, { id: tid })
      }
    } finally {
      setDuplicatingId(null)
    }
  }

  // Grouped data
  const dayShifts = dayData?.shifts ?? []
  const weekShifts = weekData?.shifts ?? []
  const weekByDate = useMemo(() => {
    const map = new Map<string, ShiftItem[]>()
    for (const s of weekShifts) {
      const key = s.date.slice(0, 10)
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return map
  }, [weekShifts])
  const calShifts = calData?.shifts ?? []
  const calByDate = useMemo(() => {
    const map = new Map<string, ShiftItem[]>()
    for (const s of calShifts) {
      const key = s.date.slice(0, 10)
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return map
  }, [calShifts])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekAnchor, i)), [weekAnchor])
  const calendarCells = useMemo(() => {
    const leading = (new Date(monthAnchor + 'T00:00:00').getDay() + 6) % 7 // Monday-first
    const total = new Date(Number(monthAnchor.slice(0, 4)), Number(monthAnchor.slice(5, 7)), 0).getDate()
    return [...Array.from({ length: leading }, () => null as string | null), ...Array.from({ length: total }, (_, i) => monthStartOf(monthAnchor).slice(0, 8) + String(i + 1).padStart(2, '0'))]
  }, [monthAnchor])

  const listRows = listData?.shifts ?? []

  // ── Drag-drop reschedule (Week + Calendar views) ─────────────
  const dragEnabled =
    pointerFine &&
    ((tab === 'week' && !weekLoading) || (tab === 'calendar' && !calLoading))

  /** Loaded shifts of the view a drag started in — resolves dropped chips and
   * powers the conflict pre-check (week range, or the whole calendar month).
   * The Calendar grid only renders days inside the fetched month range, so
   * every droppable cell date is covered by this data by construction. */
  const dragShifts = tab === 'calendar' ? calShifts : weekShifts

  /** Client-side pre-check: same doctor + target date + overlapping time
   * (non-CANCELLED only), against the drag source view's loaded data. */
  const moveConflict = useMemo(
    () => (moveTarget ? findMoveConflict(dragShifts, moveTarget.shift, moveTarget.toDate) : null),
    [moveTarget, dragShifts],
  )

  /** PATCH the shift's date. The route currently exports PUT only (PATCH → 405),
   * so fall back to the identical partial-body PUT contract. The server still
   * enforces conflicts (409) and inactive doctors — this is UI sugar over it. */
  async function moveShiftDate(id: string, toDate: string) {
    const body = JSON.stringify({ date: toDate })
    try {
      await apiFetch(`/api/shifts/${id}`, { method: 'PATCH', body })
    } catch (err) {
      if (err instanceof ApiError && err.status === 405) {
        await apiFetch(`/api/shifts/${id}`, { method: 'PUT', body })
        return
      }
      throw err
    }
  }

  async function confirmMove() {
    if (!moveTarget || moving) return
    setMoving(true)
    setMoveServerError(null)
    const { shift, toDate } = moveTarget
    try {
      await moveShiftDate(shift.id, toDate)
      toast.success(`Shift moved to ${formatShiftDate(toDate)}`, {
        description: `${shiftTypeLabel(shift.shiftType)} · Dr. ${shift.doctor.firstName} ${shift.doctor.lastName} · ${formatTime12h(shift.startTime)}–${formatTime12h(shift.endTime)}`,
      })
      setMoveTarget(null)
      refetchAll()
    } catch (err) {
      // 409 keeps the dialog open and surfaces the server message verbatim
      // (time conflict / inactive doctor); "Move anyway" stays available.
      if (err instanceof ApiError && err.status === 409) {
        setMoveServerError(err.message)
        return
      }
      const msg = mutationErrorMessage(err)
      if (msg) toast.error(msg)
    } finally {
      setMoving(false)
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, iso: string) {
    e.preventDefault()
    setDropTargetDate(null)
    const id = e.dataTransfer.getData('text/shift-id')
    if (!id) return
    const shift = dragShifts.find((s) => s.id === id)
    if (!shift || shift.status !== 'SCHEDULED' || shift.doctor.status !== 'ACTIVE') return
    if (shift.date.slice(0, 10) === iso) return // dropped back on its own day
    setMoveServerError(null)
    setMoveTarget({ shift, toDate: iso })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctor Shifts"
        description="Plan and manage doctor scheduling across the hospital"
        actions={
          <Button onClick={openAdd} className="active:scale-[0.98]">
            <Plus className="size-4" aria-hidden /> <CalendarClock className="size-4" aria-hidden /> Add Shift
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <div className="hms-scroll overflow-x-auto">
          <TabsList className="grid w-full min-w-[520px] grid-cols-4">
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>
        </div>

        {/* ── DAY ─────────────────────────────────────────────── */}
        <TabsContent value="day" className="mt-4">
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="size-8" onClick={() => setDayDate(addDaysISO(dayDate, -1))} aria-label="Previous day">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setDayDate(TODAY)}>Today</Button>
                <Button variant="outline" size="icon" className="size-8" onClick={() => setDayDate(addDaysISO(dayDate, 1))} aria-label="Next day">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="date"
                  value={dayDate}
                  onChange={(e) => { if (e.target.value) setDayDate(e.target.value) }}
                  className="w-40"
                  aria-label="Select date"
                />
                <p className="hidden text-sm font-medium text-slate-700 dark:text-slate-300 md:block">
                  {weekdayShort(dayDate)}, {formatShiftDate(dayDate)}
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              {dayLoading && !dayData ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : dayShifts.length === 0 ? (
                <EmptyState
                  illustrated
                  icon={CalendarClock}
                  title="No shifts scheduled"
                  description={`No shifts are scheduled for ${formatShiftDate(dayDate)}.`}
                />
              ) : (
                <div className="space-y-5">
                  {SHIFT_TYPES.map((type) => {
                    const group = dayShifts.filter((s) => s.shiftType === type)
                    if (group.length === 0) return null
                    return (
                      <section key={type} aria-label={`${shiftTypeLabel(type)} shifts`}>
                        <div className="mb-2 flex items-center gap-2">
                          <StatusBadge status={type} />
                          <span className="text-xs text-muted-foreground">
                            {group.length} shift{group.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {group.map((s) => (
                            <div
                              key={s.id}
                              className={cn(
                                'relative flex flex-col gap-3 rounded-lg border py-3 pr-3 pl-4 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 md:flex-row md:items-center md:justify-between',
                                s.status === 'CANCELLED' && 'opacity-60',
                              )}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  'absolute top-1/2 left-1.5 h-[70%] w-[3px] -translate-y-1/2 rounded-full',
                                  STATUS_ACCENT[s.status] ?? 'bg-slate-300',
                                )}
                              />
                              <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
                                <div className="w-32 shrink-0">
                                  <p className="text-sm font-semibold text-foreground">
                                    {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">{shiftDurationLabel(s.startTime, s.endTime)}</p>
                                </div>
                                <DoctorCell shift={s} />
                                <p className="text-sm text-slate-600 dark:text-slate-300">{s.department?.name ?? '—'}</p>
                                <p className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                                  <DoorOpen className="size-3.5 text-muted-foreground" aria-hidden /> {s.room ?? '—'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 md:shrink-0">
                                <StatusBadge status={s.status} />
                                <ShiftActions
                                  shift={s}
                                  onEdit={openEdit}
                                  onCancel={setCancelTarget}
                                  onDuplicate={duplicateShift}
                                  duplicating={duplicatingId === s.id}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── WEEK ────────────────────────────────────────────── */}
        <TabsContent value="week" className="mt-4">
          <div className="space-y-4">
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" className="size-8" onClick={() => setWeekAnchor(addDaysISO(weekAnchor, -7))} aria-label="Previous week">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setWeekAnchor(mondayOf(TODAY))}>This Week</Button>
                <Button variant="outline" size="icon" className="size-8" onClick={() => setWeekAnchor(addDaysISO(weekAnchor, 7))} aria-label="Next week">
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setCopyOpen(true)}
                  aria-label="Copy this week's shifts to another week"
                  data-testid="copy-week-button"
                >
                  <Copy className="size-3.5" aria-hidden /> Copy week
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={handleExportWeek}
                  aria-label="Export this week's shifts as CSV"
                  data-testid="export-week-csv"
                >
                  <Download className="size-3.5" aria-hidden /> Export CSV
                </Button>
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {formatShiftDate(weekAnchor)} — {formatShiftDate(weekEnd)}
              </p>
            </div>

            {pointerFine ? (
              <p
                className="hidden items-center gap-1.5 border-b px-4 py-2 text-xs text-muted-foreground sm:px-5 md:flex"
                data-testid="drag-hint"
              >
                <Move className="size-3.5 shrink-0 text-teal-500/70" aria-hidden />
                Tip: drag a scheduled shift to another day to reschedule it.
              </p>
            ) : null}

            <div className="p-4 sm:p-5">
              {weekLoading && !weekData ? (
                <div className="hms-scroll overflow-x-auto">
                  <div className="grid min-w-[900px] grid-cols-7 gap-3">
                    {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}
                  </div>
                </div>
              ) : (
                <div className="hms-scroll overflow-x-auto">
                  <div className="grid min-w-[900px] grid-cols-7 gap-3">
                    {weekDays.map((iso) => {
                      const items = weekByDate.get(iso) ?? []
                      const isToday = iso === TODAY
                      const isDropTarget = draggingId !== null && dragEnabled && dropTargetDate === iso
                      return (
                        <div
                          key={iso}
                          className={cn(
                            'space-y-1.5 rounded-lg',
                            draggingId !== null && dragEnabled &&
                              'outline-offset-2 outline-2 outline-dashed outline-transparent transition-[outline-color,background-color,box-shadow] duration-150 motion-reduce:transition-none',
                            isDropTarget &&
                              'bg-teal-50/40 outline-teal-400/60 shadow-[inset_0_0_16px_rgba(13,148,136,0.08)] dark:bg-teal-500/10 dark:outline-teal-400/50 dark:shadow-[inset_0_0_16px_rgba(45,212,191,0.12)]',
                          )}
                          onDragOver={
                            dragEnabled
                              ? (e) => {
                                  e.preventDefault()
                                  e.dataTransfer.dropEffect = 'move'
                                  setDropTargetDate((cur) => (cur === iso ? cur : iso))
                                }
                              : undefined
                          }
                          onDragLeave={
                            dragEnabled
                              ? (e) => {
                                  // Guard against child flicker: ignore leaves into own children
                                  const related = e.relatedTarget as Node | null
                                  if (related && e.currentTarget.contains(related)) return
                                  setDropTargetDate((cur) => (cur === iso ? null : cur))
                                }
                              : undefined
                          }
                          onDrop={dragEnabled ? (e) => handleDrop(e, iso) : undefined}
                        >
                          <button
                            type="button"
                            onClick={() => gotoDay(iso)}
                            className={cn(
                              'w-full rounded-lg border px-2 py-1.5 text-center transition-colors',
                              isToday ? 'bg-teal-50 ring-1 ring-teal-400 dark:bg-teal-500/10' : 'bg-slate-50 dark:bg-white/5 hover:bg-teal-50/60 dark:hover:bg-teal-500/10',
                            )}
                            aria-label={`Open day view for ${formatShiftDate(iso)}${isToday ? ' (today)' : ''}`}
                          >
                            <p className="flex items-center justify-center gap-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                              {weekdayShort(iso)}
                              {isToday ? (
                                <span className="rounded-full bg-teal-600 px-1.5 py-px text-[8px] font-semibold normal-case tracking-normal text-white" data-testid="today-pill">
                                  Today
                                </span>
                              ) : null}
                            </p>
                            <p className={cn('text-sm font-semibold', isToday ? 'text-teal-700 dark:text-teal-300' : 'text-slate-700 dark:text-slate-300')}>{dayNum(iso)}</p>
                          </button>
                          <div className="min-h-[120px] space-y-1.5">
                            {items.map((s) => {
                              const chipDraggable =
                                dragEnabled && s.status === 'SCHEDULED' && s.doctor.status === 'ACTIVE'
                              return (
                                <div key={s.id} className="relative">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(s)}
                                    draggable={chipDraggable}
                                    onDragStart={
                                      chipDraggable
                                        ? (e) => {
                                            e.dataTransfer.setData('text/shift-id', s.id)
                                            e.dataTransfer.effectAllowed = 'move'
                                            setDraggingId(s.id)
                                          }
                                        : undefined
                                    }
                                    onDragEnd={
                                      chipDraggable
                                        ? () => {
                                            setDraggingId(null)
                                            setDropTargetDate(null)
                                          }
                                        : undefined
                                    }
                                    className={cn(
                                      'relative w-full rounded-md border py-1.5 pr-5 pl-2.5 text-left text-[11px] leading-tight shadow-sm transition-[background-color,box-shadow,translate] duration-150',
                                      'hover:bg-slate-50 dark:hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                                      'motion-safe:hover:-translate-y-px motion-safe:hover:shadow-md',
                                      isToday ? 'bg-teal-50/40 dark:bg-teal-500/10' : 'bg-white dark:bg-slate-800',
                                      s.status === 'CANCELLED' && 'opacity-55 line-through',
                                      chipDraggable && 'cursor-grab active:cursor-grabbing',
                                      draggingId === s.id &&
                                        'scale-[1.02] opacity-60 ring-2 ring-teal-400/50',
                                    )}
                                    aria-label={`Edit shift: ${shiftTypeLabel(s.shiftType)} for ${s.doctor.lastName} at ${formatTime12h(s.startTime)}${chipDraggable ? ' (drag to move to another day; press Enter for actions)' : ''}`}
                                  >
                                    <span
                                      aria-hidden
                                      className={cn(
                                        'absolute top-1 bottom-1 left-[3px] w-[3px] rounded-full',
                                        STATUS_ACCENT[s.status] ?? 'bg-slate-300',
                                      )}
                                    />
                                    <span className="block font-semibold text-foreground">{formatTime12h(s.startTime)}</span>
                                    <span className="block truncate text-slate-600 dark:text-slate-300">{s.doctor.lastName}</span>
                                    <span className="block truncate text-[10px] text-muted-foreground">
                                      {shiftTypeLabel(s.shiftType)}{s.room ? ` · ${s.room}` : ''}
                                    </span>
                                  </button>
                                  {/* The whole chip is the drag handle; keep presses on the
                                      actions trigger from ever starting a chip drag. */}
                                  <div
                                    className="absolute top-0.5 right-0.5"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <ShiftActions
                                      shift={s}
                                      compact
                                      onEdit={openEdit}
                                      onCancel={setCancelTarget}
                                      onDuplicate={duplicateShift}
                                      duplicating={duplicatingId === s.id}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* This week's load (utilization) — lazily fetched only while the Week tab is open */}
          <WeekUtilizationPanel from={weekAnchor} to={weekEnd} />
          </div>
        </TabsContent>

        {/* ── CALENDAR ────────────────────────────────────────── */}
        <TabsContent value="calendar" className="mt-4">
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="size-8" onClick={() => setMonthAnchor(addMonthsISO(monthAnchor, -1))} aria-label="Previous month">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="icon" className="size-8" onClick={() => setMonthAnchor(addMonthsISO(monthAnchor, 1))} aria-label="Next month">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-foreground">{monthLabel(monthAnchor)}</p>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setMonthAnchor(monthStartOf(TODAY))}>This Month</Button>
              </div>
            </div>

            {pointerFine ? (
              <p
                className="hidden items-center gap-1.5 border-b px-4 py-2 text-xs text-muted-foreground sm:px-5 md:flex"
                data-testid="drag-hint-calendar"
              >
                <Move className="size-3.5 shrink-0 text-teal-500/70" aria-hidden />
                Tip: drag a scheduled shift to another day to reschedule it.
              </p>
            ) : null}

            <div className="p-4 sm:p-5">
              {calLoading && !calData ? (
                <div className="hms-scroll overflow-x-auto">
                  <div className="grid min-w-[770px] grid-cols-7 gap-2">
                    {Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                  </div>
                </div>
              ) : (
                <div className="hms-scroll overflow-x-auto">
                  <div className="min-w-[770px]">
                    <div className="mb-1.5 grid grid-cols-7 gap-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                        <p key={d} className="text-center text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{d}</p>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {calendarCells.map((iso, i) => {
                        if (iso === null) return <div key={`blank-${i}`} aria-hidden />
                        const isDropTarget =
                          draggingId !== null && dragEnabled && dropTargetDate === iso
                        return (
                          <div
                            key={iso}
                            className={cn(
                              'min-h-[104px] rounded-lg border p-1.5',
                              iso === TODAY ? 'bg-teal-50/40 dark:bg-teal-500/10 ring-2 ring-teal-500/50' : '',
                              // Drop-zone highlight parity with the Week view.
                              draggingId !== null && dragEnabled &&
                                'outline-offset-2 outline-2 outline-dashed outline-transparent transition-[outline-color,background-color,box-shadow] duration-150 motion-reduce:transition-none',
                              isDropTarget &&
                                'bg-teal-50/40 outline-teal-400/60 shadow-[inset_0_0_16px_rgba(13,148,136,0.08)] dark:bg-teal-500/10 dark:outline-teal-400/50 dark:shadow-[inset_0_0_16px_rgba(45,212,191,0.12)]',
                            )}
                            onDragOver={
                              dragEnabled
                                ? (e) => {
                                    e.preventDefault()
                                    e.dataTransfer.dropEffect = 'move'
                                    setDropTargetDate((cur) => (cur === iso ? cur : iso))
                                  }
                                : undefined
                            }
                            onDragLeave={
                              dragEnabled
                                ? (e) => {
                                    // Guard against child flicker: ignore leaves into own children
                                    const related = e.relatedTarget as Node | null
                                    if (related && e.currentTarget.contains(related)) return
                                    setDropTargetDate((cur) => (cur === iso ? null : cur))
                                  }
                                : undefined
                            }
                            onDrop={dragEnabled ? (e) => handleDrop(e, iso) : undefined}
                          >
                            <button
                              type="button"
                              onClick={() => gotoDay(iso)}
                              className={cn(
                                'rounded px-1 text-xs font-semibold transition-colors hover:text-teal-700 dark:hover:text-teal-300',
                                iso === TODAY ? 'bg-teal-600 text-white hover:text-white' : 'text-slate-600 dark:text-slate-300',
                              )}
                              aria-label={`Open day view for ${formatShiftDate(iso)}`}
                            >
                              {dayNum(iso)}
                            </button>
                            <div className="mt-1 space-y-1">
                              {(calByDate.get(iso) ?? []).slice(0, 3).map((s) => {
                                const chipDraggable =
                                  dragEnabled && s.status === 'SCHEDULED' && s.doctor.status === 'ACTIVE'
                                return (
                                  <div
                                    key={s.id}
                                    title={`${shiftTypeLabel(s.shiftType)} — Dr. ${s.doctor.firstName} ${s.doctor.lastName}${chipDraggable ? ' (drag to move to another day)' : ''}`}
                                    draggable={chipDraggable}
                                    onDragStart={
                                      chipDraggable
                                        ? (e) => {
                                            e.dataTransfer.setData('text/shift-id', s.id)
                                            e.dataTransfer.effectAllowed = 'move'
                                            setDraggingId(s.id)
                                          }
                                        : undefined
                                    }
                                    onDragEnd={
                                      chipDraggable
                                        ? () => {
                                            setDraggingId(null)
                                            setDropTargetDate(null)
                                          }
                                        : undefined
                                    }
                                    className={cn(
                                      'truncate rounded border-l-2 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300 shadow-sm',
                                      TYPE_BAR[s.shiftType] ?? 'border-l-slate-300',
                                      s.status === 'CANCELLED' && 'opacity-55 line-through',
                                      chipDraggable && 'cursor-grab active:cursor-grabbing',
                                      // Drag ghost parity with the Week view chips.
                                      draggingId === s.id &&
                                        'scale-[1.02] opacity-60 ring-2 ring-teal-400/50',
                                    )}
                                  >
                                    {s.doctor.lastName} · {formatTime12h(s.startTime).replace(' ', '')}
                                  </div>
                                )
                              })}
                              {(calByDate.get(iso)?.length ?? 0) > 3 ? (
                                <button
                                  type="button"
                                  onClick={() => gotoDay(iso)}
                                  className="px-1 text-[10px] font-medium text-teal-700 dark:text-teal-300 hover:underline"
                                >
                                  +{(calByDate.get(iso)?.length ?? 0) - 3} more
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── LIST ────────────────────────────────────────────── */}
        <TabsContent value="list" className="mt-4">
          <div className="rounded-xl border bg-card shadow-sm">
            {/* Filters */}
            <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center sm:p-5">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={fSearch}
                  onChange={(e) => { setFSearch(e.target.value); setPage(1) }}
                  placeholder="Search doctor, room, notes…"
                  className="pl-9"
                  aria-label="Search shifts"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
                <Select value={fDoctor} onValueChange={(v) => { setFDoctor(v); setPage(1) }}>
                  <SelectTrigger className="w-full lg:w-36" aria-label="Filter by doctor"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All doctors</SelectItem>
                    {activeDoctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={fDept} onValueChange={(v) => { setFDept(v); setPage(1) }}>
                  <SelectTrigger className="w-full lg:w-40" aria-label="Filter by department"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={fType} onValueChange={(v) => { setFType(v); setPage(1) }}>
                  <SelectTrigger className="w-full lg:w-36" aria-label="Filter by shift type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    {SHIFT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{SHIFT_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={fStatus} onValueChange={(v) => { setFStatus(v); setPage(1) }}>
                  <SelectTrigger className="w-full lg:w-36" aria-label="Filter by status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {fDoctor !== ALL || fDept !== ALL || fType !== ALL || fStatus !== ALL || fSearch.trim() !== '' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => { setFDoctor(ALL); setFDept(ALL); setFType(ALL); setFStatus(ALL); setFSearch(''); setPage(1) }}
                >
                  <X className="size-3.5" aria-hidden /> Reset
                </Button>
              ) : null}
            </div>

            {/* Table */}
            {listLoading && !listData ? (
              <div className="space-y-3 p-4 sm:p-5">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : listRows.length === 0 ? (
              <div className="p-4 sm:p-5">
                <EmptyState
                  illustrated
                  icon={CalendarClock}
                  title="No shifts found"
                  description="No shifts match your current filters."
                />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Doctor</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead className="w-12 text-right"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {listRows.map((s) => (
                        <TableRow key={s.id} className="hms-row-hover text-sm">
                          <TableCell className="whitespace-nowrap font-medium text-foreground">{formatShiftDate(s.date)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <p className="text-foreground">{formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}</p>
                            <p className="text-[11px] text-muted-foreground">{shiftDurationLabel(s.startTime, s.endTime)}</p>
                          </TableCell>
                          <TableCell><DoctorCell shift={s} /></TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-300">{s.department?.name ?? '—'}</TableCell>
                          <TableCell><StatusBadge status={s.shiftType} /></TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-300">{s.room ?? '—'}</TableCell>
                          <TableCell><StatusBadge status={s.status} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.createdByName ?? '—'}</TableCell>
                          <TableCell className="text-right">
                            <ShiftActions
                              shift={s}
                              onEdit={openEdit}
                              onCancel={setCancelTarget}
                              onDuplicate={duplicateShift}
                              duplicating={duplicatingId === s.id}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t p-4">
                  <PaginationControls
                    page={listData?.page ?? 1}
                    totalPages={listData?.totalPages ?? 1}
                    total={listData?.total ?? 0}
                    pageSize={listData?.pageSize ?? 10}
                    onPage={setPage}
                  />
                </div>
              </>
            )}
          </div>

          {/* Doctor utilization rollup (scheduled vs completed per doctor) — List tab only */}
          <div className="mt-4">
            <DoctorUtilizationCard />
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Add / Edit Shift dialog ───────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open) }}>
        <DialogContent className="max-w-lg sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Shift' : 'Add Shift'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update the shift details. Conflicts with other shifts are validated on save.'
                : 'Assign a shift to an active doctor. Conflicts are validated on save.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {formError ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="shift-doctor">Doctor *</Label>
                <Select value={form.doctorId} onValueChange={onDoctorChange}>
                  <SelectTrigger id="shift-doctor" className="w-full">
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctorOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label}{d.hint ? ` (${d.hint})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Only active doctors can receive shifts.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-dept">Department</Label>
                <Select value={form.departmentId || 'NONE'} onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v === 'NONE' ? '' : v }))}>
                  <SelectTrigger id="shift-dept" className="w-full">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Default (doctor&apos;s department)</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-date">Date *</Label>
                <Input
                  id="shift-date"
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-type">Shift Type *</Label>
                <Select value={form.shiftType} onValueChange={(v) => setForm((f) => ({ ...f, shiftType: v as ShiftTypeKey }))}>
                  <SelectTrigger id="shift-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIFT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{SHIFT_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-start">Start Time *</Label>
                <Input
                  id="shift-start"
                  type="time"
                  required
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-end">End Time *</Label>
                <Input
                  id="shift-end"
                  type="time"
                  required
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                />
                {timeError ? <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{timeError}</p> : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="shift-room">Room</Label>
                <Input
                  id="shift-room"
                  value={form.room}
                  onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
                  placeholder="e.g. Ward 3B"
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="shift-notes">Notes</Label>
                <Textarea
                  id="shift-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional instructions for this shift…"
                  rows={2}
                  maxLength={300}
                />
              </div>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
              Overlapping shifts for the same doctor on the same date are rejected automatically.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || Boolean(timeError)}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {editing ? 'Save Changes' : 'Assign Shift'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Copy week dialog ─────────────────────────────────── */}
      <CopyWeekDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        sourceWeek={weekAnchor}
        onCopied={refetchAll}
      />

      {/* ── Move shift (drag-drop) confirm ────────────────────── */}
      {moveTarget ? (
        <MoveShiftDialog
          target={moveTarget}
          conflict={moveConflict}
          serverError={moveServerError}
          processing={moving}
          onOpenChange={(open) => {
            if (!open && !moving) {
              setMoveTarget(null)
              setMoveServerError(null)
            }
          }}
          onConfirm={confirmMove}
        />
      ) : null}

      {/* ── Cancel shift confirm ──────────────────────────────── */}
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open && !cancelling) setCancelTarget(null) }}
        title="Cancel this shift?"
        description={
          cancelTarget
            ? `${shiftTypeLabel(cancelTarget.shiftType)} shift — Dr. ${cancelTarget.doctor.firstName} ${cancelTarget.doctor.lastName}, ${formatShiftDate(cancelTarget.date)}, ${formatTime12h(cancelTarget.startTime)}–${formatTime12h(cancelTarget.endTime)}. The shift will be marked CANCELLED and kept in history.`
            : undefined
        }
        destructive
        confirmLabel="Cancel Shift"
        processing={cancelling}
        onConfirm={confirmCancel}
      />
    </div>
  )
}
