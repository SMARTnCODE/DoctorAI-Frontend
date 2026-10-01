'use client'

/**
 * Visits — global patient visit records across the hospital (read + full CRUD).
 *
 * Conventions (mirrors audit-logs-page + patients-page + patient-detail):
 *  - Filters (status/patient/doctor/from/to/q/pageSize) persisted to the hash
 *    query via debounced history.replaceState → shareable URLs, restored on load.
 *  - `q` is debounced 250ms → GET /api/visits `q` param (16-a backend; until it
 *    lands the param is simply ignored server-side and the box filters nothing).
 *  - Stat chips read GET /api/visits/summary (16-a); hidden gracefully on 404/error.
 *  - Record/edit share one dialog (Radix unmount pattern → fresh state per open);
 *    create POSTs /api/patients/{code}/visits, edit PATCHes /api/visits/{id}.
 *  - CSV export is page-scoped (current rows only) via csv-export helpers.
 *  - 401 → session-expired toast + login redirect (codebase convention).
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Ban, CalendarClock, CalendarDays, CalendarPlus, CheckCircle2, Download, Loader2,
  MoreHorizontal, Pencil, RotateCcw, Search, Trash2, Users, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { useApiData } from '@/hooks/use-api-data'
import { doctorListItems, type DoctorListResponse } from '@/services/doctors.service'
import { apiFetch, ApiError } from '@/lib/api-client'
import { buildCsv, downloadTextFile, exportDateStamp } from '@/lib/csv-export'
import { todayLocalISO, weekdayShort } from '@/lib/format'
import { currentHashQuery, navigate, replaceHashQuery } from '@/lib/hash-nav'
import { PageHeader } from '@/components/hospital/page-header'
import { EmptyState } from '@/components/hospital/empty-state'
import { ConfirmDialog } from '@/components/hospital/confirm-dialog'
import { PaginationControls } from '@/components/hospital/pagination-controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

const ALL = 'ALL'
const DEFAULT_PAGE_SIZE = 20
const VISIT_REASON_MAX = 500
const VISIT_NOTES_MAX = 2000
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface PatientOption { id: string; patientId: string; firstName: string; lastName: string }
interface VisitPatient { id: string; code: string; firstName: string; lastName: string }
interface VisitDoctor { id: string; code: string; firstName: string; lastName: string }

interface VisitRow {
  id: string
  patientId: string
  patient: VisitPatient
  doctorId: string | null
  doctor: VisitDoctor | null
  visitDate: string
  reason: string
  diagnosis: string | null
  notes: string | null
  status: string
  createdAt: string
}

interface VisitsListResponse { visits: VisitRow[]; total: number; page: number; pageSize: number }

interface VisitsSummary {
  total: number
  byStatus: { SCHEDULED: number; COMPLETED: number; CANCELLED: number }
  next7Days: number
  upcoming: number
  thisMonth: number
}

// ── Status visuals ───────────────────────────────────────────
// Scheduled uses the violet visit tone (spec for this page); completed/cancelled
// mirror the patient-detail StatusBadge tones (emerald / rose).
const STATUS_PILL: Record<string, string> = {
  SCHEDULED: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300',
}

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Scheduled', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

const VISIT_STATUS_OPTIONS = [
  { value: 'SCHEDULED', label: 'Scheduled', dot: 'bg-teal-500' },
  { value: 'COMPLETED', label: 'Completed', dot: 'bg-emerald-500' },
  { value: 'CANCELLED', label: 'Cancelled', dot: 'bg-rose-500' },
] as const

function VisitStatusPill({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full px-2.5 py-0.5 font-medium whitespace-nowrap',
        STATUS_PILL[status] ?? 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700/60 dark:bg-white/5 dark:text-slate-300',
      )}
    >
      <span className="mr-1 inline-block size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

/** Calendar date of a visit ISO datetime (UTC — date-part only). */
function visitDayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

// ── Hash query ⇄ filter state ────────────────────────────────
interface VisitFilters {
  status: string
  patientId: string
  doctorId: string
  from: string
  to: string
  q: string
  pageSize: number
}

function parseHashFilters(): VisitFilters {
  const defaults: VisitFilters = { status: ALL, patientId: '', doctorId: '', from: '', to: '', q: '', pageSize: DEFAULT_PAGE_SIZE }
  if (typeof window === 'undefined') return defaults
  try {
    const q = currentHashQuery()
    const rawPageSize = q.get('pageSize') ?? ''
    const parsedPageSize = /^\d+$/.test(rawPageSize) ? parseInt(rawPageSize, 10) : DEFAULT_PAGE_SIZE
    return {
      status: ['SCHEDULED', 'COMPLETED', 'CANCELLED'].includes(q.get('status') ?? '')
        ? (q.get('status') as string)
        : ALL,
      patientId: (q.get('patientId') ?? '').trim().slice(0, 40),
      doctorId: (q.get('doctorId') ?? '').trim().slice(0, 40),
      from: ISO_DATE_RE.test(q.get('from') ?? '') ? (q.get('from') as string) : '',
      to: ISO_DATE_RE.test(q.get('to') ?? '') ? (q.get('to') as string) : '',
      q: (q.get('q') ?? '').trim().slice(0, 80),
      pageSize: Math.min(100, Math.max(1, parsedPageSize)),
    }
  } catch {
    return defaults
  }
}

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** Shared mutation error handling — 401 kicks the user back to the login view. */
function handleMutationError(e: unknown, fallback = 'Something went wrong. Please try again.') {
  if (e instanceof ApiError && e.status === 401) {
    toast.error('Session expired. Please sign in again.')
    navigate('/super-admin/login')
    return
  }
  toast.error(e instanceof ApiError ? e.message : fallback)
}

// ── Stat chips ───────────────────────────────────────────────
type ChipTone = 'slate' | 'violet' | 'emerald' | 'rose' | 'teal'

const CHIP_TONES: Record<ChipTone, { idle: string; active: string; count: string; dot: string }> = {
  slate: {
    idle: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/60 dark:bg-white/5 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-white/10',
    active: 'border-slate-400 bg-slate-100 text-slate-900 ring-1 ring-slate-300 shadow-sm dark:border-slate-500 dark:bg-slate-700/60 dark:text-slate-100 dark:ring-slate-500/60',
    count: 'text-slate-900 dark:text-slate-100',
    dot: 'bg-slate-400',
  },
  violet: {
    idle: 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700/60 dark:bg-white/5 dark:text-slate-300 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/10',
    active: 'border-violet-300 bg-violet-100 text-violet-900 ring-1 ring-violet-300 shadow-sm dark:border-violet-500/60 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-500/50',
    count: 'text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  emerald: {
    idle: 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700/60 dark:bg-white/5 dark:text-slate-300 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10',
    active: 'border-emerald-300 bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300 shadow-sm dark:border-emerald-500/60 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/50',
    count: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  rose: {
    idle: 'border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50 dark:border-slate-700/60 dark:bg-white/5 dark:text-slate-300 dark:hover:border-rose-500/40 dark:hover:bg-rose-500/10',
    active: 'border-rose-300 bg-rose-100 text-rose-900 ring-1 ring-rose-300 shadow-sm dark:border-rose-500/60 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-500/50',
    count: 'text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  teal: {
    idle: 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50 dark:border-slate-700/60 dark:bg-white/5 dark:text-slate-300 dark:hover:border-teal-500/40 dark:hover:bg-teal-500/10',
    active: 'border-teal-400 bg-teal-100 text-teal-900 ring-1 ring-teal-400 shadow-sm dark:border-teal-500/60 dark:bg-teal-500/20 dark:text-teal-200 dark:ring-teal-500/50',
    count: 'text-teal-700 dark:text-teal-300',
    dot: 'bg-teal-500',
  },
}

function StatChip({ tone, icon: Icon, label, count, active, onClick, ariaLabel }: {
  tone: ChipTone
  icon: typeof CalendarDays
  label: string
  count: number | null
  active: boolean
  onClick: () => void
  ariaLabel: string
}) {
  const t = CHIP_TONES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
        active ? `${t.active} font-semibold` : `${t.idle} font-medium`,
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', active ? '' : 'text-muted-foreground')} aria-hidden />
      <span>{label}</span>
      <span className={cn('min-w-4 text-center font-semibold tabular-nums', t.count)}>
        {count === null ? '—' : count}
      </span>
    </button>
  )
}

// ── Record / edit visit dialog ───────────────────────────────
type DialogState = { mode: 'create' } | { mode: 'edit'; visit: VisitRow }

function VisitDialog({ state, defaultPatientCode, onClose, onSaved }: {
  state: DialogState
  /** patientId hash filter value — pre-selects the patient on create. */
  defaultPatientCode: string
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg" data-testid="record-visit-dialog">
        {state.mode === 'create' ? (
          <VisitDialogBody
            key="create"
            visit={null}
            defaultPatientCode={defaultPatientCode}
            onSaved={onSaved}
            onDone={onClose}
          />
        ) : (
          <VisitDialogBody
            key={`edit-${state.visit.id}`}
            visit={state.visit}
            defaultPatientCode={state.visit.patient.code}
            onSaved={onSaved}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function VisitDialogBody({ visit, defaultPatientCode, onSaved, onDone }: {
  visit: VisitRow | null
  defaultPatientCode: string
  onSaved: () => void
  onDone: () => void
}) {
  const isEdit = visit !== null
  const [patientCode, setPatientCode] = useState(isEdit ? visit.patient.code : defaultPatientCode)
  const [visitDate, setVisitDate] = useState(visit ? visit.visitDate.slice(0, 10) : todayLocalISO())
  const [status, setStatus] = useState(visit?.status ?? 'SCHEDULED')
  const [reason, setReason] = useState(visit?.reason ?? '')
  const [diagnosis, setDiagnosis] = useState(visit?.diagnosis ?? '')
  const [notes, setNotes] = useState(visit?.notes ?? '')
  const [doctorId, setDoctorId] = useState(visit?.doctor?.id ?? 'unassigned')
  const [patientError, setPatientError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const {
    data: patientsData, error: patientsError, refetch: patientsRefetch,
  } = useApiData<{ patients: PatientOption[] }>('/api/patients?pageSize=100')
  const patients = useMemo(() => patientsData?.patients ?? [], [patientsData])

  const {
    data: doctorsData, error: doctorsError, refetch: doctorsRefetch,
  } = useApiData<DoctorListResponse>('/api/admin/doctors?status=ACTIVE')
  const doctors = useMemo(() => doctorListItems(doctorsData).map((d) => ({
    id: d.id,
    doctorId: d.doctorId,
    firstName: d.firstName,
    lastName: d.lastName,
    department: d.department ? { id: d.department.id, name: d.department.name } : null,
  })), [doctorsData])

  // Editing a visit whose doctor is missing from the ACTIVE list (e.g. since
  // deactivated) — keep them selectable so the existing value round-trips.
  const currentDoctorMissing = Boolean(
    isEdit && visit?.doctor && doctorId === visit.doctor.id && !doctors.some((d) => d.id === visit.doctor?.id),
  )

  const selectedPatient = patients.find((p) => p.patientId === patientCode)

  const submit = async () => {
    if (submitting) return
    if (!isEdit && !patientCode) {
      setServerError(null)
      setPatientError('Patient is required.')
      return
    }
    if (!visitDate) {
      setServerError('Visit date is required.')
      return
    }
    const trimmedReason = reason.trim()
    if (trimmedReason.length === 0) {
      setServerError(null)
      setPatientError(null)
      setReasonError('Reason is required.')
      return
    }
    if (trimmedReason.length > VISIT_REASON_MAX) {
      setServerError(null)
      setPatientError(null)
      setReasonError(`Reason must be ${VISIT_REASON_MAX} characters or fewer.`)
      return
    }
    setServerError(null)
    setPatientError(null)
    setReasonError(null)
    setSubmitting(true)
    try {
      // Optional fields are omitted when empty on create; PATCH sends null to
      // clear them so edits behave as the form shows.
      const payload: Record<string, unknown> = { visitDate, reason: trimmedReason, status }
      if (doctorId !== 'unassigned') payload.doctorId = doctorId
      else if (isEdit) payload.doctorId = null
      if (diagnosis.trim()) payload.diagnosis = diagnosis.trim()
      else if (isEdit) payload.diagnosis = null
      if (notes.trim()) payload.notes = notes.trim()
      else if (isEdit) payload.notes = null

      if (isEdit && visit) {
        await apiFetch(`/api/visits/${encodeURIComponent(visit.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        toast.success('Visit updated')
      } else {
        await apiFetch(`/api/patients/${encodeURIComponent(patientCode)}/visits`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        const name = selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : patientCode
        toast.success(`Visit recorded for ${name}`)
      }
      onSaved()
      onDone()
    } catch (e: unknown) {
      handleMutationError(e, 'Could not save the visit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      noValidate
    >
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Edit visit' : 'Record visit'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Update the details of this visit record.'
            : 'Add a visit record for any patient in the hospital.'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="visit-patient">
              Patient {!isEdit ? <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span> : null}
            </Label>
            {isEdit && visit ? (
              <span className="font-mono text-[11px] text-muted-foreground">{visit.patient.code}</span>
            ) : null}
          </div>
          <Select
            value={patientCode || undefined}
            onValueChange={(v) => {
              setPatientCode(v)
              if (patientError) setPatientError(null)
            }}
            disabled={isEdit}
          >
            <SelectTrigger
              id="visit-patient"
              className="w-full"
              aria-label={isEdit ? `Visit patient: ${visit?.patient.firstName} ${visit?.patient.lastName}` : 'Visit patient'}
              aria-required={isEdit ? undefined : 'true'}
              aria-invalid={patientError ? true : undefined}
            >
              <SelectValue placeholder={isEdit ? 'Patient' : 'Select patient…'} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {patients.map((p) => (
                <SelectItem key={p.id} value={p.patientId}>
                  {p.firstName} {p.lastName} ({p.patientId})
                </SelectItem>
              ))}
              {patientCode && !patients.some((p) => p.patientId === patientCode) ? (
                <SelectItem value={patientCode}>{patientCode} · not in patient list</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          {isEdit ? (
            <p className="text-[11px] text-muted-foreground">The patient of an existing visit cannot be changed.</p>
          ) : null}
          {patientsError ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-rose-200 bg-rose-50/60 px-2.5 py-1.5 text-xs text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
              <span>Couldn&apos;t load patients — please retry.</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-rose-700 dark:text-rose-300 focus-visible:ring-2 focus-visible:ring-teal-500"
                onClick={() => void patientsRefetch()}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {patientError ? (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">{patientError}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="visit-date">Visit date</Label>
            <Input
              id="visit-date"
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              aria-required="true"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Status</span>
            <div role="group" aria-label="Visit status" className="flex w-full items-center rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
              {VISIT_STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  aria-pressed={status === s.value}
                  className={cn(
                    'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                    status === s.value ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100' : 'text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300',
                  )}
                >
                  <span className={cn('size-1.5 shrink-0 rounded-full', s.dot)} aria-hidden />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visit-doctor">Doctor</Label>
          <Select value={doctorId} onValueChange={setDoctorId}>
            <SelectTrigger id="visit-doctor" className="w-full" aria-label="Visit doctor">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {doctors.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  Dr. {d.lastName}{d.department?.name ? ` (${d.department.name})` : ''}
                </SelectItem>
              ))}
              {currentDoctorMissing && visit?.doctor ? (
                <SelectItem value={visit.doctor.id}>
                  Dr. {visit.doctor.lastName} ({visit.doctor.code}) · not in active list
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          {doctorsError ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-rose-200 bg-rose-50/60 px-2.5 py-1.5 text-xs text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
              <span>Couldn&apos;t load doctors — you can still save the visit unassigned.</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-rose-700 dark:text-rose-300 focus-visible:ring-2 focus-visible:ring-teal-500"
                onClick={() => void doctorsRefetch()}
              >
                Retry
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visit-reason">
            Reason <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
          </Label>
          <Input
            id="visit-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (reasonError) setReasonError(null)
            }}
            maxLength={VISIT_REASON_MAX}
            placeholder="e.g. Follow-up consultation"
            aria-required="true"
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? 'visit-reason-error' : undefined}
          />
          {reasonError ? (
            <p id="visit-reason-error" className="text-xs text-rose-600" role="alert">{reasonError}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visit-diagnosis">Diagnosis</Label>
          <Input
            id="visit-diagnosis"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            maxLength={500}
            placeholder="Optional"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="visit-notes">Notes</Label>
            <span className="text-[11px] tabular-nums text-muted-foreground" aria-hidden>
              {notes.length}/{VISIT_NOTES_MAX}
            </span>
          </div>
          <Textarea
            id="visit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={VISIT_NOTES_MAX}
            rows={3}
            placeholder="Optional — consultation notes, follow-up plan…"
            className="min-h-20 resize-none"
          />
        </div>

        {serverError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} data-testid="record-visit-submit">
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarDays className="size-4" aria-hidden />}
          {isEdit ? 'Save changes' : 'Record visit'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Per-row actions menu — Edit / quick status / Delete. */
function VisitActionsMenu({ visit, busy, onEdit, onStatus, onDelete }: {
  visit: VisitRow
  busy: boolean
  onEdit: (visit: VisitRow) => void
  onStatus: (visit: VisitRow, status: 'COMPLETED' | 'CANCELLED') => void
  onDelete: (visit: VisitRow) => void
}) {
  const dayLabel = visitDayLabel(visit.visitDate)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-300 focus-visible:ring-2 focus-visible:ring-teal-500 data-[state=open]:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
          aria-label={`Actions for ${visit.patient.firstName} ${visit.patient.lastName}'s visit on ${dayLabel}`}
          data-testid="visit-row-actions"
          disabled={busy}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => onEdit(visit)}>
          <Pencil className="size-4" aria-hidden /> Edit
        </DropdownMenuItem>
        {visit.status === 'SCHEDULED' ? (
          <>
            <DropdownMenuItem onSelect={() => onStatus(visit, 'COMPLETED')}>
              <CheckCircle2 className="size-4" aria-hidden /> Mark completed
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onStatus(visit, 'CANCELLED')}>
              <Ban className="size-4" aria-hidden /> Cancel visit
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDelete(visit)}
          className="text-rose-600 focus:bg-rose-50 focus:text-rose-700 dark:text-rose-400 dark:focus:bg-rose-500/10 dark:focus:text-rose-300"
        >
          <Trash2 className="size-4" aria-hidden /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Page ─────────────────────────────────────────────────────
export default function VisitsPage() {
  // Filters hydrated once from the hash query (client-only page — safe to read window).
  const [initialFilters] = useState(parseHashFilters)
  const [status, setStatus] = useState(initialFilters.status)
  const [patientId, setPatientId] = useState(initialFilters.patientId)
  const [doctorId, setDoctorId] = useState(initialFilters.doctorId)
  const [from, setFrom] = useState(initialFilters.from)
  const [to, setTo] = useState(initialFilters.to)
  const [search, setSearch] = useState(initialFilters.q)
  const [pageSize, setPageSize] = useState(initialFilters.pageSize)
  const debouncedQ = useDebouncedValue(search, 250)
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [dialogState, setDialogState] = useState<DialogState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VisitRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Reference data for filters
  const { data: patientsData } = useApiData<{ patients: PatientOption[] }>('/api/patients?pageSize=100')
  const { data: doctorsData } = useApiData<DoctorListResponse>('/api/admin/doctors')

  // Stat chips — 16-a endpoint; hidden gracefully on 404/error (mid-rollout safe).
  const {
    data: summary, error: summaryError, refetch: refetchSummary,
  } = useApiData<VisitsSummary>('/api/visits/summary')

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (status !== ALL) params.set('status', status)
    if (patientId) params.set('patientId', patientId)
    if (doctorId) params.set('doctorId', doctorId)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (debouncedQ.trim()) params.set('q', debouncedQ.trim())
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    return `/api/visits?${params.toString()}`
  }, [status, patientId, doctorId, from, to, debouncedQ, page, pageSize])

  const { data, loading, error, refetch } = useApiData<VisitsListResponse>(listPath)

  const rows = data?.visits ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize ?? pageSize)))
  const filtersActive =
    status !== ALL || patientId !== '' || doctorId !== '' || from !== '' || to !== '' || search.trim() !== ''

  function refetchAll() {
    void refetch()
    void refetchSummary()
  }

  // Persist filters into the hash query (debounced so typing doesn't thrash replaceState).
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (status !== ALL) params.set('status', status)
      if (patientId) params.set('patientId', patientId)
      if (doctorId) params.set('doctorId', doctorId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const q = search.trim()
      if (q) params.set('q', q)
      if (pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(pageSize))
      replaceHashQuery(params)
    }, 250)
    return () => clearTimeout(t)
  }, [status, patientId, doctorId, from, to, search, pageSize])

  // Deep links / manual URL edits while the page is already mounted: hashchange
  // only fires for external hash writes (our own updates use replaceState, which
  // never fires it), so re-hydrating here is loop-safe.
  useEffect(() => {
    const onHash = () => {
      const f = parseHashFilters()
      setStatus(f.status)
      setPatientId(f.patientId)
      setDoctorId(f.doctorId)
      setFrom(f.from)
      setTo(f.to)
      setSearch(f.q)
      setPageSize(f.pageSize)
      setPage(1)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function setFilter(run: () => void) {
    run()
    setPage(1)
  }

  function resetFilters() {
    setStatus(ALL)
    setPatientId('')
    setDoctorId('')
    setFrom('')
    setTo('')
    setSearch('')
    setPageSize(DEFAULT_PAGE_SIZE)
    setPage(1)
  }

  // ── Quick status transitions ────────────────────────────────
  async function patchStatus(visit: VisitRow, next: 'COMPLETED' | 'CANCELLED') {
    if (statusUpdatingId) return
    setStatusUpdatingId(visit.id)
    try {
      await apiFetch(`/api/visits/${encodeURIComponent(visit.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      })
      toast.success(next === 'COMPLETED' ? 'Visit marked completed' : 'Visit cancelled (record preserved)')
      refetchAll()
    } catch (e: unknown) {
      handleMutationError(e, 'Could not update the visit. Please try again.')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  // ── Delete ──────────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/api/visits/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' })
      toast.success('Visit deleted')
      setDeleteTarget(null)
      refetchAll()
    } catch (e: unknown) {
      handleMutationError(e, 'Could not delete the visit. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  // ── Page-scoped CSV export ──────────────────────────────────
  function handleExport() {
    if (exporting) return
    if (rows.length === 0) {
      toast.info('No visits on this page to export.')
      return
    }
    setExporting(true)
    try {
      const csv = buildCsv(
        ['Date', 'Patient Code', 'Patient', 'Doctor Code', 'Doctor', 'Status', 'Reason', 'Diagnosis', 'Notes'],
        rows.map((v) => [
          v.visitDate.slice(0, 10),
          v.patient.code,
          `${v.patient.firstName} ${v.patient.lastName}`,
          v.doctor?.code ?? '',
          v.doctor ? `Dr. ${v.doctor.firstName} ${v.doctor.lastName}` : '',
          STATUS_LABELS[v.status] ?? v.status,
          v.reason,
          v.diagnosis ?? '',
          v.notes ?? '',
        ]),
      )
      const filename = `visits-${exportDateStamp()}.csv`
      downloadTextFile(filename, csv)
      toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`, {
        description: `${filename} · current page only`,
      })
    } finally {
      setExporting(false)
    }
  }

  // ── Select options (with synthetic entries for missing filter values) ──
  const patientOptions = useMemo(() => {
    const list = (patientsData?.patients ?? []).map((p) => ({
      value: p.patientId,
      label: `${p.firstName} ${p.lastName} (${p.patientId})`,
    }))
    if (patientId && !list.some((o) => o.value === patientId)) {
      list.unshift({ value: patientId, label: patientId })
    }
    return list
  }, [patientsData, patientId])

  const doctorOptions = useMemo(() => {
    const list = doctorListItems(doctorsData).map((d) => ({
      value: d.doctorId || d.id,
      label: `Dr. ${d.firstName} ${d.lastName}`,
    }))
    if (doctorId && !list.some((o) => o.value === doctorId)) {
      list.unshift({ value: doctorId, label: doctorId })
    }
    return list
  }, [doctorsData, doctorId])

  // ── Stat chips ──────────────────────────────────────────────
  const today = todayLocalISO()
  const summaryReady = !summaryError
  const totalCount = summary ? summary.total : null
  const scheduledCount = summary?.byStatus?.SCHEDULED ?? null
  const completedCount = summary?.byStatus?.COMPLETED ?? null
  const cancelledCount = summary?.byStatus?.CANCELLED ?? null
  const upcomingCount = summary?.upcoming ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visits"
        description="Patient visit records across the hospital"
        actions={
          <Button onClick={() => setDialogState({ mode: 'create' })} data-testid="record-visit-button">
            <CalendarPlus className="size-4" aria-hidden /> Record visit
          </Button>
        }
      />

      {/* Stat chips — hidden entirely when the summary endpoint is unavailable */}
      {summaryReady ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Visit summary">
          <StatChip
            tone="slate"
            icon={CalendarDays}
            label="Total"
            count={totalCount}
            active={status === ALL && from === ''}
            onClick={() => setFilter(() => { setStatus(ALL); setFrom('') })}
            ariaLabel="Show all visits"
          />
          <StatChip
            tone="violet"
            icon={CalendarClock}
            label="Scheduled"
            count={scheduledCount}
            active={status === 'SCHEDULED'}
            onClick={() => setFilter(() => setStatus('SCHEDULED'))}
            ariaLabel="Filter visits by scheduled status"
          />
          <StatChip
            tone="emerald"
            icon={CheckCircle2}
            label="Completed"
            count={completedCount}
            active={status === 'COMPLETED'}
            onClick={() => setFilter(() => setStatus('COMPLETED'))}
            ariaLabel="Filter visits by completed status"
          />
          <StatChip
            tone="rose"
            icon={XCircle}
            label="Cancelled"
            count={cancelledCount}
            active={status === 'CANCELLED'}
            onClick={() => setFilter(() => setStatus('CANCELLED'))}
            ariaLabel="Filter visits by cancelled status"
          />
          <StatChip
            tone="teal"
            icon={CalendarPlus}
            label="Upcoming"
            count={upcomingCount}
            active={from === today && from !== ''}
            onClick={() => setFilter(() => { setStatus(ALL); setFrom(today) })}
            ariaLabel="Show visits from today onwards"
          />
        </div>
      ) : null}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <Select value={status} onValueChange={(v) => setFilter(() => setStatus(v))}>
              <SelectTrigger className="w-full lg:w-40" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={patientId || ALL} onValueChange={(v) => setFilter(() => setPatientId(v === ALL ? '' : v))}>
              <SelectTrigger className="w-full lg:w-52" aria-label="Filter by patient">
                <SelectValue placeholder="All patients" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value={ALL}>All patients</SelectItem>
                {patientOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={doctorId || ALL} onValueChange={(v) => setFilter(() => setDoctorId(v === ALL ? '' : v))}>
              <SelectTrigger className="w-full lg:w-44" aria-label="Filter by doctor">
                <SelectValue placeholder="All doctors" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value={ALL}>All doctors</SelectItem>
                {doctorOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:w-auto">
              <div className="space-y-1.5">
                <Label htmlFor="visit-from">From</Label>
                <Input
                  id="visit-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFilter(() => setFrom(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visit-to">To</Label>
                <Input
                  id="visit-to"
                  type="date"
                  value={to}
                  onChange={(e) => setFilter(() => setTo(e.target.value))}
                />
              </div>
            </div>
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="visit-q"
                value={search}
                onChange={(e) => setFilter(() => setSearch(e.target.value))}
                placeholder="Search reason, diagnosis or patient…"
                className="pl-9"
                aria-label="Search visits"
                maxLength={80}
              />
            </div>
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="shrink-0 text-muted-foreground">
                <RotateCcw className="size-3.5" aria-hidden /> Reset
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="shrink-0 self-start lg:self-auto"
              onClick={handleExport}
              disabled={exporting}
              data-testid="export-visits-csv"
              aria-label="Export current page of visits as CSV"
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table card */}
      <div className="rounded-xl border bg-card shadow-sm">
        {loading && !data ? (
          <div className="space-y-3 p-4 sm:p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 sm:p-6">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState
              illustrated
              icon={CalendarDays}
              title={filtersActive ? 'No visits match your filters' : 'No visits recorded yet'}
              description={
                filtersActive
                  ? 'Nothing matches the current filters. Try adjusting or clearing them.'
                  : 'Patient visit records will appear here as they are recorded.'
              }
              action={
                filtersActive ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    <RotateCcw className="size-3.5" aria-hidden /> Clear filters
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setDialogState({ mode: 'create' })}>
                    <CalendarPlus className="size-3.5" aria-hidden /> Record visit
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            <div className="hms-scroll max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)] hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Diagnosis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12 text-right"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((v) => (
                    <TableRow
                      key={v.id}
                      className="group border-b border-slate-200/60 text-sm transition-colors duration-150 hover:bg-muted/40 last:border-0 dark:border-slate-700/60"
                    >
                      <TableCell className="whitespace-nowrap">
                        <p className="font-medium text-foreground">{visitDayLabel(v.visitDate)}</p>
                        <p className="text-[11px] text-muted-foreground">{weekdayShort(v.visitDate.slice(0, 10))}</p>
                      </TableCell>
                      <TableCell>
                        <p className="truncate font-medium text-foreground">
                          {v.patient.firstName} {v.patient.lastName}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">{v.patient.code}</p>
                      </TableCell>
                      <TableCell className="max-w-[150px]">
                        {v.doctor ? (
                          <>
                            <p className="truncate text-muted-foreground">Dr. {v.doctor.lastName}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{v.doctor.code}</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <p className="truncate font-medium text-foreground" title={v.reason}>{v.reason}</p>
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <p className="truncate text-muted-foreground" title={v.diagnosis ?? ''}>{v.diagnosis ?? '—'}</p>
                      </TableCell>
                      <TableCell><VisitStatusPill status={v.status} /></TableCell>
                      <TableCell className="text-right">
                        <VisitActionsMenu
                          visit={v}
                          busy={statusUpdatingId === v.id}
                          onEdit={(visit) => setDialogState({ mode: 'edit', visit })}
                          onStatus={(visit, next) => void patchStatus(visit, next)}
                          onDelete={(visit) => setDeleteTarget(visit)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t p-4">
              <PaginationControls
                page={data?.page ?? 1}
                totalPages={totalPages}
                total={total}
                pageSize={data?.pageSize ?? pageSize}
                onPage={setPage}
              />
            </div>
          </>
        )}
      </div>

      {/* Record / edit dialog */}
      {dialogState ? (
        <VisitDialog
          state={dialogState}
          defaultPatientCode={patientId}
          onClose={() => setDialogState(null)}
          onSaved={refetchAll}
        />
      ) : null}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title={deleteTarget ? `Delete visit on ${visitDayLabel(deleteTarget.visitDate)}?` : 'Delete visit?'}
        description="This permanently removes the record."
        confirmLabel="Delete visit"
        destructive
        processing={deleting}
        onConfirm={() => void confirmDelete()}
      >
        {deleteTarget ? (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-200 dark:bg-white/5 dark:ring-slate-700/60">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {deleteTarget.patient.firstName} {deleteTarget.patient.lastName} ({deleteTarget.patient.code})
            </span>
            {' · '}{STATUS_LABELS[deleteTarget.status] ?? deleteTarget.status} · {deleteTarget.reason}
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}
