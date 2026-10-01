'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, CalendarPlus, Clock, Droplet, HeartPulse, Lock, Search, Sparkles, Thermometer,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/hospital/empty-state'
import { BookOpdDialog } from '@/components/hospital/clinical/book-opd-dialog'
import { PatientFormDialog } from '@/components/hospital/clinical/patient-form-dialog'
import { RescheduleTelehealthDialog } from '@/components/hospital/clinical/reschedule-telehealth-dialog'
import { useClinicalStore } from '@/components/hospital/clinical/clinical-store'
import { StatusBadge } from '@/components/hospital/status-badge'
import { useAuth } from '@/components/hospital/auth-context'
import {
  type Severity,
} from '@/components/hospital/clinical/clinical-data'
import { initials, todayLocalISO } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { handlePatientAuthError, patientActionErrorMessage } from '@/lib/patient-api-error'
import { cn } from '@/lib/utils'
import { isPatientDischarged, PATIENT_WARDS, patientsService, type Patient, type PatientType, type PatientVitals } from '@/services/patients.service'
import {
  clinicalVisitStatusKey,
  clinicalVisitStatusLabel,
  clinicalVisitsService,
  formatSlotLabel,
  type ClinicalVisit,
  type OpdQueueParams,
  type OpdSummary,
} from '@/services/clinical-visits.service'
import {
  appointmentInWindow,
  appointmentMatchesSearch,
  appointmentMatchesStatus,
  canJoinTelehealth,
  formatTelehealthDate,
  formatTelehealthTime,
  normalizeTelehealthStatus,
  telehealthAppointmentFromPatient,
  type TelehealthAppointment,
} from '@/services/telehealth.service'
import { toast } from 'sonner'

function openChart(patientId: string) {
  navigate(`/doctor/patients/${patientId}`)
}

function askAi(patientId: string) {
  navigate(`/doctor/ai/${patientId}`)
}

const WARD_CHIPS = PATIENT_WARDS

const AVATAR_TONES = [
  'bg-teal-100 text-teal-800',
  'bg-emerald-100 text-emerald-800',
  'bg-cyan-100 text-cyan-800',
  'bg-amber-100 text-amber-900',
  'bg-lime-100 text-lime-800',
  'bg-sky-100 text-sky-800',
  'bg-orange-100 text-orange-800',
  'bg-rose-100 text-rose-800',
]

const SEVERITY_PILL: Record<Severity, { dot: string; chip: string; label: string }> = {
  stable: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', label: 'Stable' },
  moderate: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', label: 'Moderate' },
  critical: { dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700', label: 'Critical' },
}

function avatarTone(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i) * (i + 3)) % AVATAR_TONES.length
  return AVATAR_TONES[hash]
}

function admitStamp(iso: string): { when: string; ago: string } {
  const date = new Date(iso)
  const when = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
  const days = Math.max(0, Math.round((Date.now() - date.getTime()) / 86_400_000))
  return { when, ago: days === 0 ? 'today' : `${days}d ago` }
}

function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function useTypedPatients(patientType: PatientType, search: string) {
  const { logout } = useAuth()
  const revision = useClinicalStore((s) => s.patientsRevision)
  const [items, setItems] = useState<Patient[]>([])
  const [total, setTotal] = useState(0)
  const [wardCounts, setWardCounts] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    patientsService.getAllPatients({
      patientType,
      search: search.trim() || undefined,
    })
      .then((result) => {
        if (cancelled) return
        setItems(result.items)
        setTotal(result.total)
        setWardCounts(result.wardCounts)
      })
      .catch(async (err) => {
        if (cancelled) return
        if (await handlePatientAuthError(err, logout, '/doctor/patients')) return
        setItems([])
        setTotal(0)
        setWardCounts(null)
        setError(patientActionErrorMessage(err, 'Could not load patients.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [patientType, search, revision, reloadKey, logout])

  return {
    items,
    total,
    wardCounts,
    loading,
    error,
    retry: () => setReloadKey((value) => value + 1),
  }
}

/**
 * GET /api/patients accepts patientType, search, and record status.
 * It does not accept ward or clinical severity. Those two filters run on the
 * full authorized result until the API supports them. Record status is not
 * used as a stand-in for Stable / Moderate / Critical.
 */
function matchesWard(patient: Patient, ward: string): boolean {
  if (ward === 'all') return true
  return (patient.ward ?? '').toLowerCase() === ward.toLowerCase()
}

function matchesSeverity(patient: Patient, severity: string): boolean {
  if (severity === 'all') return true
  return (patient.severity ?? '').toLowerCase() === severity
}

function wardCountMap(patients: Patient[], apiCounts: Record<string, number> | null): Map<string, number> {
  const map = new Map<string, number>()
  for (const name of WARD_CHIPS) map.set(name, 0)
  if (apiCounts) {
    for (const name of WARD_CHIPS) {
      const match = Object.entries(apiCounts).find(([key]) => key.toLowerCase() === name.toLowerCase())
      if (match) map.set(name, match[1])
    }
    return map
  }
  for (const patient of patients) {
    const ward = patient.ward?.trim()
    if (!ward) continue
    const chip = WARD_CHIPS.find((name) => name.toLowerCase() === ward.toLowerCase())
    if (!chip) continue
    map.set(chip, (map.get(chip) ?? 0) + 1)
  }
  return map
}

function personMeta(age: number | null | undefined, gender: string): string {
  const parts: string[] = []
  if (typeof age === 'number' && Number.isFinite(age)) parts.push(`${age}y`)
  if (gender.trim()) parts.push(gender.trim().toLowerCase())
  return parts.join(' · ') || '—'
}

function clinicalStatus(patient: Patient): { label: string; tone: Severity | null } {
  const raw = patient.severity?.trim()
  if (!raw) return { label: '—', tone: null }
  const key = raw.toLowerCase()
  if (key === 'stable' || key === 'moderate' || key === 'critical') {
    return { label: SEVERITY_PILL[key].label, tone: key }
  }
  return { label: raw, tone: null }
}

function StatusPill({ patient }: { patient: Patient }) {
  const tone = clinicalStatus(patient)
  const pill = tone.tone ? SEVERITY_PILL[tone.tone] : null
  if (!pill) return <span className="text-xs font-medium text-muted-foreground">{tone.label}</span>
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', pill.chip)}>
      <span className={cn('size-1.5 rounded-full', pill.dot)} aria-hidden />
      {pill.label}
    </span>
  )
}

function vitalNumber(vitals: PatientVitals, key: 'systolic' | 'diastolic' | 'oxygen'): number | null {
  if (key === 'systolic') return vitals.systolicBP ?? vitals.bloodPressureS ?? null
  if (key === 'diastolic') return vitals.diastolicBP ?? vitals.bloodPressureD ?? null
  return vitals.oxygenSaturation ?? vitals.oxygenSat ?? null
}

function bloodPressureLabel(vitals: PatientVitals): string {
  const systolic = vitalNumber(vitals, 'systolic')
  const diastolic = vitalNumber(vitals, 'diastolic')
  if (systolic == null && diastolic == null) return '—'
  if (systolic != null && diastolic != null) return `${systolic}/${diastolic}`
  return systolic != null ? String(systolic) : String(diastolic)
}

function VitalReadout({ vitals }: { vitals?: PatientVitals | null }) {
  const systolic = vitals ? vitalNumber(vitals, 'systolic') : null
  const diastolic = vitals ? vitalNumber(vitals, 'diastolic') : null
  const oxygen = vitals ? vitalNumber(vitals, 'oxygen') : null
  if (
    !vitals
    || (
      vitals.heartRate == null
      && oxygen == null
      && systolic == null
      && diastolic == null
      && vitals.temperature == null
    )
  ) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const bpHigh = (systolic ?? 0) >= 140 || (diastolic ?? 0) >= 90
  const hrHigh = vitals.heartRate != null && (vitals.heartRate >= 100 || vitals.heartRate < 50)
  const spoLow = oxygen != null && oxygen < 94
  const tempHigh = vitals.temperature != null && vitals.temperature >= 38
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] leading-4">
      <span className={cn('inline-flex items-center gap-1', hrHigh ? 'font-semibold text-rose-600' : 'text-foreground')}>
        <HeartPulse className="size-3 text-rose-500" aria-hidden /> {vitals.heartRate != null ? `${vitals.heartRate} bpm` : '—'}
      </span>
      <span className={cn(bpHigh && (systolic != null || diastolic != null) ? 'font-semibold text-rose-600' : 'text-foreground')}>
        {bloodPressureLabel(vitals)}
      </span>
      <span className={cn('inline-flex items-center gap-1', spoLow ? 'font-semibold text-rose-600' : 'text-muted-foreground')}>
        <Droplet className="size-3 text-sky-500" aria-hidden /> {oxygen != null ? `${oxygen} %` : '—'}
      </span>
      <span className={cn('inline-flex items-center gap-1', tempHigh ? 'font-medium text-amber-700' : 'text-muted-foreground')}>
        <Thermometer className="size-3 text-amber-500" aria-hidden /> {vitals.temperature != null ? `${vitals.temperature}°C` : '—'}
      </span>
    </div>
  )
}

function TableMessage({
  colSpan,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  onRetry,
}: {
  colSpan: number
  loading: boolean
  error: string | null
  emptyTitle: string
  emptyDescription?: string
  onRetry: () => void
}) {
  if (loading) {
    return (
      <tr>
        <td colSpan={colSpan} className="space-y-2 px-3 py-4">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
          </div>
        </td>
      </tr>
    )
  }
  if (error) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-3 py-8">
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>Retry</Button>
            </AlertDescription>
          </Alert>
        </td>
      </tr>
    )
  }
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10">
        <EmptyState icon={Search} title={emptyTitle} description={emptyDescription} />
      </td>
    </tr>
  )
}

export function InpatientsView() {
  const [ward, setWard] = useState('all')
  const [severity, setSeverity] = useState('all')
  const [query, setQuery] = useState('')
  const debouncedSearch = useDebounced(query)
  const roster = useTypedPatients('IN_HOSPITAL', '')
  const listed = useTypedPatients('IN_HOSPITAL', debouncedSearch)
  const admittedRoster = useMemo(
    () => roster.items.filter((patient) => !isPatientDischarged(patient.status, patient.severity)),
    [roster.items],
  )
  const counts = useMemo(
    () => wardCountMap(admittedRoster, roster.wardCounts),
    [admittedRoster, roster.wardCounts],
  )
  const activeListed = listed.items.filter((patient) => !isPatientDischarged(patient.status, patient.severity))
  const rows = activeListed.filter((patient) => matchesWard(patient, ward) && matchesSeverity(patient, severity))
  const filteredOut = !listed.loading && !listed.error && activeListed.length > 0 && rows.length === 0

  return (
    <div className="space-y-4" data-testid="doctor-inpatients">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">In-Hospital</h1>
          <p className="mt-1 text-sm text-muted-foreground">Currently admitted patients across all wards.</p>
        </header>
        <div className="flex flex-wrap gap-2">
          {WARD_CHIPS.map((name) => {
            const selected = ward === name
            return (
              <button
                key={name}
                type="button"
                onClick={() => setWard(selected ? 'all' : name)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium',
                  selected
                    ? 'border-[#0b3430] bg-[#0b3430] text-white'
                    : 'border-border bg-card text-foreground hover:bg-muted/60',
                )}
              >
                {name}
                {roster.loading ? (
                  <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-current/30" />
                ) : (
                  <span className={cn('tabular-nums', selected ? 'text-white/80' : 'text-muted-foreground')}>{counts.get(name) ?? 0}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by patient, condition, bed, doctor..."
            className="h-10 rounded-lg border-border bg-card pl-9 shadow-none"
            aria-label="Search admitted patients"
          />
        </div>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="h-10 w-full rounded-lg bg-card shadow-none sm:w-[180px]" aria-label="Severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical only</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="stable">Stable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="text-left text-[11px] tracking-wider text-muted-foreground uppercase">
            <tr className="border-b">
              {['Patient', 'Condition', 'Status', 'Ward', 'Bed', 'Doctor', 'Latest vitals', 'Admitted', 'Actions'].map((heading) => (
                <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {listed.loading || listed.error || rows.length === 0 ? (
              <TableMessage
                colSpan={9}
                loading={listed.loading}
                error={listed.error}
                emptyTitle={filteredOut ? 'No admitted patients match the filter.' : 'No in-hospital patients found.'}
                emptyDescription={filteredOut ? 'Try clearing filters or selecting another ward.' : undefined}
                onRetry={listed.retry}
              />
            ) : rows.map((patient) => {
              const tone = clinicalStatus(patient)
              const admitted = patient.admittedAt ? admitStamp(patient.admittedAt) : null
              return (
                <tr
                  key={patient.id}
                  className={cn('border-b last:border-b-0', tone.tone === 'critical' ? 'bg-rose-50/80' : 'bg-card')}
                >
                  <td className="px-3 py-3">
                    <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => openChart(patient.id)}>
                      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', avatarTone(patient.id))}>
                        {initials(patient.fullName)}
                      </span>
                      <span>
                        <span className="block font-medium">{patient.fullName}</span>
                        <span className="block text-xs text-muted-foreground">{personMeta(patient.age, patient.gender)}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3">{patient.condition?.trim() || '—'}</td>
                  <td className="px-3 py-3"><StatusPill patient={patient} /></td>
                  <td className="px-3 py-3">{patient.ward || '—'}</td>
                  <td className="px-3 py-3">{patient.bed || '—'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{patient.primaryDoctor?.name || '—'}</td>
                  <td className="px-3 py-3"><VitalReadout vitals={patient.latestVitals} /></td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {admitted ? (
                      <>
                        <p>{admitted.when}</p>
                        <p className="text-xs text-muted-foreground">{admitted.ago}</p>
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-8 rounded-lg bg-[#1f7a4d] px-3 text-xs text-white hover:bg-[#186540]"
                        onClick={() => openChart(patient.id)}
                      >
                        View record
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 rounded-lg bg-card px-3 text-xs shadow-none"
                        onClick={() => askAi(patient.id)}
                      >
                        <Sparkles className="size-3.5" aria-hidden /> Ask AI
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[4.25rem]">
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums leading-none">{value}</p>
    </div>
  )
}

function DaySwitch({ value, onChange }: { value: 'today' | 'upcoming'; onChange: (value: 'today' | 'upcoming') => void }) {
  return (
    <div className="flex items-center gap-1">
      {(['today', 'upcoming'] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn(
            'h-9 rounded-lg px-3 text-sm font-medium capitalize',
            value === item ? 'bg-[#0b3430] text-white' : 'border bg-card text-foreground hover:bg-muted',
          )}
        >
          {item === 'today' ? 'Today' : 'Upcoming'}
        </button>
      ))}
    </div>
  )
}

function StatusFilter({ value, onChange, includeNoShow }: { value: string; onChange: (value: string) => void; includeNoShow?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[150px] bg-card shadow-none" aria-label="Status"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        <SelectItem value="scheduled">Scheduled</SelectItem>
        <SelectItem value="checked-in">Checked-in</SelectItem>
        <SelectItem value="in-progress">In progress</SelectItem>
        <SelectItem value="completed">Completed</SelectItem>
        {includeNoShow ? <SelectItem value="no-show">No-show</SelectItem> : null}
        {includeNoShow ? <SelectItem value="cancelled">Cancelled</SelectItem> : null}
      </SelectContent>
    </Select>
  )
}

const EMPTY_SUMMARY: OpdSummary = {
  totalToday: 0,
  checkedIn: 0,
  inProgress: 0,
  completed: 0,
  noShows: 0,
}

function visitMeta(visit: ClinicalVisit): string {
  const parts: string[] = []
  if (typeof visit.age === 'number' && Number.isFinite(visit.age)) parts.push(`${visit.age}y`)
  if (visit.gender.trim()) parts.push(visit.gender.trim().toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()))
  return parts.join(' • ') || '—'
}

function visitMatchesSearch(visit: ClinicalVisit, search: string): boolean {
  const term = search.trim().toLowerCase()
  if (!term) return true
  return [visit.patientName, visit.mrn, visit.phone, visit.doctorName, visit.specialty, visit.purpose]
    .join(' ')
    .toLowerCase()
    .includes(term)
}

function visitMatchesStatus(visit: ClinicalVisit, status: string): boolean {
  if (status === 'all') return true
  return clinicalVisitStatusKey(visit.status) === status
}

function visitInWindow(visit: ClinicalVisit, when: 'today' | 'upcoming', today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visit.visitDate)) return false
  if (when === 'today') return visit.visitDate === today
  return visit.visitDate > today
}

function visitSortKey(visit: ClinicalVisit): string {
  return `${visit.visitDate}T${visit.startTime || '99:99'}`
}

function OpdStatusChip({ value }: { value: string }) {
  const key = clinicalVisitStatusKey(value)
  const tone = key === 'completed'
    ? 'bg-emerald-50 text-emerald-700'
    : key === 'checked-in' || key === 'in-progress'
      ? 'bg-teal-50 text-teal-800'
      : key === 'no-show' || key === 'cancelled'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-slate-100 text-slate-600'
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>
      {clinicalVisitStatusLabel(value)}
    </span>
  )
}

function useOpdQueue(params: OpdQueueParams, reloadKey: number) {
  const { logout } = useAuth()
  const [visits, setVisits] = useState<ClinicalVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    clinicalVisitsService.getOpdQueue(params)
      .then((result) => {
        if (!cancelled) setVisits(result.visits)
      })
      .catch(async (err) => {
        if (cancelled) return
        if (await handlePatientAuthError(err, logout, '/doctor/opd')) return
        setVisits([])
        setError(patientActionErrorMessage(err, 'Could not load the OPD queue.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [params.date, params.scope, params.search, reloadKey, logout])

  return { visits, loading, error }
}

function useOpdSummary(date: string, reloadKey: number) {
  const { logout } = useAuth()
  const [summary, setSummary] = useState<OpdSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    clinicalVisitsService.getOpdSummary(date)
      .then((result) => {
        if (!cancelled) setSummary(result)
      })
      .catch(async (err) => {
        if (cancelled) return
        if (await handlePatientAuthError(err, logout, '/doctor/opd')) return
        setSummary(EMPTY_SUMMARY)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [date, reloadKey, logout])

  return { summary, loading }
}

function OpdTable({
  rows,
  loading,
  error,
  onRetry,
  emptyTitle,
}: {
  rows: ClinicalVisit[]
  loading: boolean
  error: string | null
  onRetry: () => void
  emptyTitle: string
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="text-left text-[11px] tracking-wider text-muted-foreground uppercase">
          <tr className="border-b">
            {['Time', 'Patient', 'Purpose', 'Doctor', 'Status', 'Actions'].map((heading) => (
              <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading || error || rows.length === 0 ? (
            <TableMessage colSpan={6} loading={loading} error={error} emptyTitle={emptyTitle} onRetry={onRetry} />
          ) : rows.map((visit) => (
            <tr key={visit.id} className="border-b last:border-b-0">
              <td className="px-3 py-3 whitespace-nowrap">
                <p className="inline-flex items-center gap-1.5 font-medium">
                  <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                  {visit.startTime ? formatSlotLabel(visit.startTime) : '—'}
                </p>
                <p className="pl-5 text-xs text-muted-foreground">{visit.durationMin != null ? `${visit.durationMin} min` : '—'}</p>
              </td>
              <td className="px-3 py-3">
                <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => openChart(visit.patientId)}>
                  <span className="flex size-8 items-center justify-center rounded-full bg-teal-100 text-[11px] font-semibold text-teal-800">
                    {initials(visit.patientName)}
                  </span>
                  <span>
                    <span className="block font-medium">{visit.patientName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {visitMeta(visit)}{visit.bloodGroup ? ` · ${visit.bloodGroup}` : ''}
                    </span>
                  </span>
                </button>
              </td>
              <td className="px-3 py-3">{visit.purpose || '—'}</td>
              <td className="px-3 py-3">
                <p>{visit.doctorName || '—'}</p>
                <p className="text-xs text-muted-foreground">{visit.specialty}</p>
              </td>
              <td className="px-3 py-3"><OpdStatusChip value={visit.status} /></td>
              <td className="px-3 py-3">
                <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => openChart(visit.patientId)}>
                  Record <ArrowRight className="size-3.5" aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TelehealthStatusFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[160px] bg-card shadow-none" aria-label="Status"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        <SelectItem value="SCHEDULED">Scheduled</SelectItem>
        <SelectItem value="ACTIVE">Active</SelectItem>
        <SelectItem value="COMPLETED">Completed</SelectItem>
        <SelectItem value="CANCELLED">Cancelled</SelectItem>
        <SelectItem value="RESCHEDULED">Rescheduled</SelectItem>
      </SelectContent>
    </Select>
  )
}

function TeleTable({
  rows,
  loading,
  error,
  onRetry,
  emptyTitle,
  onReschedule,
}: {
  rows: TelehealthAppointment[]
  loading: boolean
  error: string | null
  onRetry: () => void
  emptyTitle: string
  onReschedule: (appointment: TelehealthAppointment) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full min-w-[1080px] text-sm">
        <thead className="text-left text-[11px] tracking-wider text-muted-foreground uppercase">
          <tr className="border-b">
            {['Patient', 'Purpose', 'Doctor', 'Time', 'Duration', 'Status', 'Actions'].map((heading) => (
              <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading || error || rows.length === 0 ? (
            <TableMessage colSpan={7} loading={loading} error={error} emptyTitle={emptyTitle} onRetry={onRetry} />
          ) : rows.map((visit) => {
            const status = normalizeTelehealthStatus(visit.status)
            const joinable = canJoinTelehealth(status, visit.meetingLink)
            const closed = status === 'CANCELLED' || status === 'COMPLETED'
            return (
              <tr key={`${visit.id}-${visit.appointmentDate}-${visit.appointmentTime}`} className="border-b last:border-b-0">
                <td className="px-3 py-3">
                  <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => openChart(visit.patientId)}>
                    <span className="flex size-8 items-center justify-center rounded-full bg-cyan-100 text-[11px] font-semibold text-cyan-800">
                      {initials(visit.patientName)}
                    </span>
                    <span>
                      <span className="block font-medium">{visit.patientName}</span>
                      <span className="block text-xs text-muted-foreground">{personMeta(visit.patientAge, visit.patientGender)}</span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-3">{visit.purpose || '—'}</td>
                <td className="px-3 py-3">
                  <p>{visit.doctorName || '—'}</p>
                  <p className="text-xs text-muted-foreground">{visit.doctorSpecialization || ''}</p>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <p className="font-medium">{visit.appointmentTime ? formatTelehealthTime(visit.appointmentTime) : '—'}</p>
                  <p className="text-xs text-muted-foreground">{visit.appointmentDate ? formatTelehealthDate(visit.appointmentDate) : '—'}</p>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{visit.durationMinutes} min</td>
                <td className="px-3 py-3">
                  {status ? <StatusBadge status={status} /> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg bg-[#1f7a4d] px-3 text-xs text-white hover:bg-[#186540]"
                      disabled={!joinable}
                      title={status === 'CANCELLED'
                        ? 'This appointment has been cancelled.'
                        : visit.meetingLink
                          ? 'Join video call'
                          : 'Meeting link is not available for this appointment.'}
                      onClick={() => {
                        const link = visit.meetingLink?.trim()
                        if (!link) {
                          toast.error('Meeting link is not available for this appointment.')
                          return
                        }
                        if (status === 'CANCELLED') {
                          toast.error('This appointment has been cancelled.')
                          return
                        }
                        window.open(link, '_blank', 'noopener,noreferrer')
                      }}
                    >
                      <Video className="size-3.5" aria-hidden /> Join Video Call
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg bg-card px-3 text-xs shadow-none" onClick={() => askAi(visit.patientId)}>
                      <Sparkles className="size-3.5" aria-hidden /> Review with AI
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 rounded-lg bg-card px-3 text-xs shadow-none"
                      disabled={closed}
                      onClick={() => onReschedule(visit)}
                    >
                      <CalendarPlus className="size-3.5" aria-hidden /> Reschedule
                    </Button>
                    <button type="button" className="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => openChart(visit.patientId)}>
                      Record <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function OpdView() {
  const [when, setWhen] = useState<'today' | 'upcoming'>('today')
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [booking, setBooking] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const debouncedSearch = useDebounced(query)
  const today = todayLocalISO()
  const queueParams = useMemo<OpdQueueParams>(() => (
    when === 'today'
      ? { scope: 'today', date: today, search: debouncedSearch.trim() || undefined }
      : { scope: 'upcoming', search: debouncedSearch.trim() || undefined }
  ), [when, today, debouncedSearch])
  const listed = useOpdQueue(queueParams, reloadKey)
  const totals = useOpdSummary(today, reloadKey)

  const rows = useMemo(() => listed.visits.filter((visit) => (
    visitInWindow(visit, when, today)
    && visitMatchesSearch(visit, debouncedSearch)
    && visitMatchesStatus(visit, status)
  )).sort((a, b) => visitSortKey(a).localeCompare(visitSortKey(b)) || a.patientName.localeCompare(b.patientName)), [
    listed.visits,
    when,
    today,
    debouncedSearch,
    status,
  ])

  return (
    <div className="space-y-4" data-testid="doctor-opd">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">OPD Patients</h1>
          <p className="mt-1 text-sm text-muted-foreground">Today&apos;s outpatient queue.</p>
        </div>
        <div className="flex flex-wrap gap-5">
          <QueueStat label="Total today" value={totals.loading ? 0 : totals.summary.totalToday} />
          <QueueStat label="Checked-in" value={totals.loading ? 0 : totals.summary.checkedIn} />
          <QueueStat label="In progress" value={totals.loading ? 0 : totals.summary.inProgress} />
          <QueueStat label="Completed" value={totals.loading ? 0 : totals.summary.completed} />
          <QueueStat label="No-shows" value={totals.loading ? 0 : totals.summary.noShows} />
        </div>
      </header>

      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <DaySwitch value={when} onChange={setWhen} />
        <Button className="h-9 gap-1.5 rounded-lg bg-[#1f7a4d] px-3 text-white hover:bg-[#186540]" onClick={() => setBooking(true)}>
          <CalendarPlus className="size-4" aria-hidden /> Book OPD
        </Button>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patient, doctor, purpose..." className="h-9 bg-card pl-9 shadow-none" aria-label="Search OPD queue" />
        </div>
        <StatusFilter value={status} onChange={setStatus} includeNoShow />
      </div>

      <OpdTable
        rows={rows}
        loading={listed.loading}
        error={listed.error}
        onRetry={() => setReloadKey((value) => value + 1)}
        emptyTitle={when === 'today' ? 'No clinical visits booked for today.' : 'No upcoming clinical visits.'}
      />
      <BookOpdDialog
        open={booking}
        onOpenChange={setBooking}
        onBooked={(visitDate) => {
          setWhen(visitDate > today ? 'upcoming' : 'today')
          setReloadKey((value) => value + 1)
        }}
      />
    </div>
  )
}

export function TelehealthView() {
  const [when, setWhen] = useState<'today' | 'upcoming'>('today')
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [registering, setRegistering] = useState(false)
  const [reschedule, setReschedule] = useState<TelehealthAppointment | null>(null)
  const debouncedSearch = useDebounced(query)
  const listed = useTypedPatients('TELEHEALTH', '')
  const today = todayLocalISO()
  const appointments = useMemo(
    () => listed.items.map(telehealthAppointmentFromPatient),
    [listed.items],
  )

  const rows = useMemo(() => appointments.filter((visit) => (
    appointmentInWindow(visit, when, today)
    && appointmentMatchesSearch(visit, debouncedSearch)
    && appointmentMatchesStatus(visit, status)
  )).sort((a, b) => {
    const left = `${a.appointmentDate}T${a.appointmentTime || '99:99'}`
    const right = `${b.appointmentDate}T${b.appointmentTime || '99:99'}`
    return left.localeCompare(right) || a.patientName.localeCompare(b.patientName)
  }), [appointments, when, today, debouncedSearch, status])

  const todayCount = appointments.filter((visit) => visit.appointmentDate === today).length

  return (
    <div className="space-y-4" data-testid="doctor-telehealth">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-xl font-semibold tracking-tight">Virtual consultations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Secure, one-click join for today&apos;s telehealth visits. Reschedule instantly and review the patient context with your AI Co-Pilot before the call.
          </p>
        </div>
        <Button className="h-9 gap-1.5 self-start rounded-lg bg-[#1f7a4d] px-3 text-white hover:bg-[#186540]" onClick={() => setRegistering(true)}>
          <Video className="size-4" aria-hidden /> Book virtual visit
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border bg-card px-2.5 py-1 font-medium">{todayCount} sessions today</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
          <Lock className="size-3" aria-hidden /> Encrypted
        </span>
        <span className="rounded-full border bg-card px-2.5 py-1 text-muted-foreground">Auto reminders on</span>
      </div>

      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <DaySwitch value={when} onChange={setWhen} />
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patient, doctor, purpose..." className="h-9 bg-card pl-9 shadow-none" aria-label="Search telehealth visits" />
        </div>
        <TelehealthStatusFilter value={status} onChange={setStatus} />
      </div>

      <TeleTable
        rows={rows}
        loading={listed.loading}
        error={listed.error}
        onRetry={listed.retry}
        emptyTitle={appointments.length > 0 ? 'No telehealth visits in this view.' : 'No telehealth patients found.'}
        onReschedule={setReschedule}
      />
      <PatientFormDialog
        open={registering}
        mode="create"
        initialPatientType="TELEHEALTH"
        onOpenChange={setRegistering}
        onSaved={() => { useClinicalStore.getState().bumpPatients() }}
      />
      <RescheduleTelehealthDialog
        appointment={reschedule}
        open={reschedule != null}
        onOpenChange={(open) => { if (!open) setReschedule(null) }}
        onSaved={(result) => {
          setWhen(result.appointmentDate > today ? 'upcoming' : 'today')
          setStatus((current) => (current === 'all' || current === 'RESCHEDULED' ? current : 'all'))
          useClinicalStore.getState().bumpPatients()
          listed.retry()
        }}
      />
    </div>
  )
}
