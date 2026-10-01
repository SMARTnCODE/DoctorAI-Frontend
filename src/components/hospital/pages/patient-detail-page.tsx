'use client'

/**
 * Super Admin patient record. Identity, department, and doctor come from the
 * patient API. Visit rows come from /api/visits when that route is available.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, CalendarPlus, MapPin, Phone, ShieldCheck, TrendingUp, UserPlus, Users,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/hospital/status-badge'
import { ReferralHistoryList } from '@/components/hospital/referral-history'
import { useAuth } from '@/components/hospital/auth-context'
import { apiFetch } from '@/lib/api-client'
import { ageFrom, formatDate, initials } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { handlePatientAuthError, recordAccessMessage } from '@/lib/patient-api-error'
import { cn } from '@/lib/utils'
import { patientsService, type Patient, type PatientReferral } from '@/services/patients.service'

const TREND_RANGES = [7, 14, 30] as const

function clinicalStatusKey(value?: string | null): string {
  return (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
}

interface VisitItem {
  id: string
  visitDate: string
  reason: string
  diagnosis: string | null
  notes: string | null
  status: string
  doctorName: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function doctorName(value: unknown): string | null {
  const source = asRecord(value)
  if (!source) return null
  const name = pickString(source, 'name')
  if (name) return name
  const first = pickString(source, 'first_name', 'firstName') ?? ''
  const last = pickString(source, 'last_name', 'lastName') ?? ''
  const joined = `${first} ${last}`.trim()
  return joined || null
}

function parseVisits(value: unknown): VisitItem[] {
  const source = asRecord(value)
  const rows = Array.isArray(source?.visits)
    ? source.visits
    : Array.isArray(source?.items)
      ? source.items
      : []
  const items: VisitItem[] = []
  for (const row of rows) {
    const record = asRecord(row)
    if (!record) continue
    const id = pickString(record, 'id')
    const visitDate = pickString(record, 'visit_date', 'visitDate', 'date')
    if (!id || !visitDate) continue
    items.push({
      id,
      visitDate,
      reason: pickString(record, 'reason', 'purpose') ?? 'Visit',
      diagnosis: pickString(record, 'diagnosis'),
      notes: pickString(record, 'notes'),
      status: (pickString(record, 'status') ?? 'COMPLETED').toUpperCase(),
      doctorName: doctorName(record.doctor),
    })
  }
  return items.sort((a, b) => b.visitDate.localeCompare(a.visitDate))
}

function ageLabel(patient: Patient): string | null {
  if (typeof patient.age === 'number' && Number.isFinite(patient.age)) return `${patient.age} yrs`
  const fromDob = ageFrom(patient.dateOfBirth)
  return fromDob === '—' ? null : fromDob
}

function dayKey(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function trendTickLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function trendPoints(visits: VisitItem[], days: number): { date: string; count: number }[] {
  const today = new Date()
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const points: { date: string; count: number }[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(end)
    day.setUTCDate(end.getUTCDate() - offset)
    points.push({ date: day.toISOString().slice(0, 10), count: 0 })
  }
  const index = new Map(points.map((point, i) => [point.date, i]))
  for (const visit of visits) {
    const slot = index.get(dayKey(visit.visitDate))
    if (slot != null) points[slot].count += 1
  }
  return points
}

function historyRows(patient: Patient, visits: VisitItem[]): VisitItem[] {
  if (visits.length > 0) return visits
  if (!patient.lastVisit) return []
  return [{
    id: 'last-visit',
    visitDate: patient.lastVisit,
    reason: 'Last visit',
    diagnosis: null,
    notes: null,
    status: 'COMPLETED',
    doctorName: patient.primaryDoctor?.name ?? null,
  }]
}

export default function PatientDetailPage({ patientId }: { patientId: string }) {
  const { logout } = useAuth()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [referrals, setReferrals] = useState<PatientReferral[]>([])
  const [visits, setVisits] = useState<VisitItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<number>(30)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    patientsService.getPatientById(patientId)
      .then(async (record) => {
        if (cancelled) return
        setPatient(record)
        const [history, visitRows] = await Promise.all([
          patientsService.getPatientReferrals(record.id),
          apiFetch<unknown>(`/api/visits?patientId=${encodeURIComponent(record.patientId)}&page=1&pageSize=50`)
            .then(parseVisits)
            .catch(async (err) => {
              if (await handlePatientAuthError(err, logout, '/super-admin/patients')) return []
              return []
            }),
        ])
        if (cancelled) return
        setReferrals(history)
        setVisits(visitRows)
      })
      .catch(async (err) => {
        if (cancelled) return
        if (await handlePatientAuthError(err, logout, '/super-admin/patients')) return
        setPatient(null)
        setReferrals([])
        setVisits([])
        setError(recordAccessMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [patientId, logout])

  const rows = useMemo(() => (patient ? historyRows(patient, visits) : []), [patient, visits])
  const points = useMemo(() => trendPoints(rows, range), [rows, range])
  const trendTotal = points.reduce((sum, point) => sum + point.count, 0)
  const upcoming = rows.filter((visit) => {
    if (visit.status !== 'SCHEDULED') return false
    return new Date(visit.visitDate).getTime() >= Date.now()
  }).length

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !patient) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/super-admin/patients')}>
          <ArrowLeft className="size-4" /> Back to Patients
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {error ?? 'Patient not found or you are not authorized to access this patient.'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const currentReferral = [...referrals]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find((item) => {
      const status = item.status.toUpperCase()
      return status === 'PENDING' || status === 'ACCEPTED' || status === 'COMPLETED'
    })
  const years = ageLabel(patient)
  const summary = patient.knownAllergies?.trim()
  const careCount = patient.primaryDoctor ? 1 : 0

  return (
    <div className="space-y-4" data-testid="admin-patient-detail">
      <button
        type="button"
        onClick={() => navigate('/super-admin/patients')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to Patients
      </button>

      <Card className="py-5">
        <CardContent className="px-5 sm:px-6">
          <div className="flex flex-wrap items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-teal-600/15 text-base font-semibold text-teal-800 dark:bg-teal-500/15 dark:text-teal-100">
              {initials(patient.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{patient.fullName}</h1>
                <StatusBadge status={patient.status} />
                {clinicalStatusKey(patient.severity) ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Clinical status</span>
                    <StatusBadge status={clinicalStatusKey(patient.severity)} />
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{patient.patientId}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {years ? <Chip>{years}</Chip> : null}
                {patient.gender ? <Chip>{patient.gender}</Chip> : null}
                <Chip>
                  <Users className="size-3" aria-hidden /> Care team: {careCount}
                </Chip>
                <Chip>Upcoming visits: {upcoming}</Chip>
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-teal-600 dark:text-teal-400" aria-hidden />
                This record access is recorded in the audit trail.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pt-0">
            <dl>
              <InfoRow label="Date of birth" value={patient.dateOfBirth ? formatDate(patient.dateOfBirth) : '—'} />
              <InfoRow label="Gender" value={patient.gender || '—'} />
              <InfoRow label="Blood group" value="—" />
              <InfoRow label="Phone" value={patient.phone || '—'} icon={<Phone className="size-3.5" aria-hidden />} />
              <InfoRow label="Email" value={patient.email || '—'} />
              <InfoRow label="Address" value={patient.address || '—'} icon={<MapPin className="size-3.5" aria-hidden />} />
              <InfoRow label="Record created" value={formatDate(patient.createdAt)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Medical Summary</CardTitle>
            <p className="text-xs text-amber-700 dark:text-amber-300">Sensitive — handle per privacy policy</p>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
              {summary || 'No clinical summary on file.'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Care Team
            <Badge variant="outline" className="font-normal tabular-nums">{careCount}</Badge>
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => navigate('/super-admin/doctors')}>
            <UserPlus className="size-4" aria-hidden /> Assign doctor
          </Button>
        </CardHeader>
        <CardContent>
          {patient.primaryDoctor ? (
            <button
              type="button"
              onClick={() => navigate(`/super-admin/doctors/${patient.primaryDoctor?.id}`)}
              className="flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left hover:bg-muted/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-600/15 text-xs font-semibold text-teal-800 dark:bg-teal-500/15 dark:text-teal-100">
                {initials(patient.primaryDoctor.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{patient.primaryDoctor.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  Primary doctor{patient.department?.name ? ` · ${patient.department.name}` : ''}
                </span>
              </span>
              {patient.createdAt ? (
                <span className="hidden text-xs text-muted-foreground sm:block">
                  Assigned {formatDate(patient.createdAt)}
                </span>
              ) : null}
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">No doctor is assigned to this patient.</p>
          )}
          {currentReferral ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Referral: {currentReferral.referringDoctor?.name ?? '—'} → {currentReferral.referredDoctor?.name ?? '—'}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Visit Trend
            <Badge variant="outline" className="font-normal tabular-nums">{trendTotal}</Badge>
          </CardTitle>
          <div role="group" aria-label="Visit trend range" className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-white/5">
            {TREND_RANGES.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRange(days)}
                aria-pressed={range === days}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  range === days
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {days}d
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {trendTotal === 0 ? (
            <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              No visits in this period
            </div>
          ) : (
            <div role="img" aria-label={`Bar chart of visits over the last ${range} days`}>
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
                    }}
                    labelFormatter={(label) => trendTickLabel(String(label))}
                    formatter={(value) => [value, 'Visits']}
                  />
                  <Bar dataKey="count" name="Visits" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            Visit History
            <Badge variant="outline" className="font-normal tabular-nums">{patient.visitCount || rows.length}</Badge>
          </CardTitle>
          <Button
            size="sm"
            className="bg-teal-600 text-white hover:bg-teal-700"
            onClick={() => navigate(`/super-admin/visits?patientId=${encodeURIComponent(patient.patientId)}`)}
          >
            <CalendarPlus className="size-4" aria-hidden /> Record visit
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visits recorded.</p>
          ) : (
            <ol className="divide-y">
              {rows.map((visit) => (
                <li key={visit.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{formatDate(visit.visitDate)}</p>
                    <StatusBadge status={visit.status} />
                  </div>
                  <p className="mt-1 text-sm">{visit.reason}</p>
                  {visit.doctorName ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{visit.doctorName}</p>
                  ) : null}
                  {visit.diagnosis ? (
                    <p className="mt-1 text-xs text-muted-foreground">Diagnosis: {visit.diagnosis}</p>
                  ) : null}
                  {visit.notes ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{visit.notes}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Referral history</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferralHistoryList referrals={referrals} />
        </CardContent>
      </Card>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5">
      {children}
    </span>
  )
}

function InfoRow({
  label, value, icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="inline-flex max-w-[60%] items-start justify-end gap-1.5 text-right text-sm">
        {icon ? <span className="mt-0.5 text-muted-foreground">{icon}</span> : null}
        <span className="break-words">{value}</span>
      </dd>
    </div>
  )
}
