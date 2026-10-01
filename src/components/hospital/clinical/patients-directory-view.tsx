'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ListFilter, Loader2, Send, Share2, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/hospital/empty-state'
import { PaginationControls } from '@/components/hospital/pagination-controls'
import { useAuth } from '@/components/hospital/auth-context'
import { useClinicalStore } from '@/components/hospital/clinical/clinical-store'
import { PatientFormDialog } from '@/components/hospital/clinical/patient-form-dialog'
import { ReferPatientDialog } from '@/components/hospital/clinical/refer-patient-dialog'
import { SharePatientDialog } from '@/components/hospital/clinical/share-patient-dialog'
import { formatDate, initials } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import {
  handlePatientAuthError,
  patientActionErrorMessage,
} from '@/lib/patient-api-error'
import { cn } from '@/lib/utils'
import {
  normalizePatientType,
  patientTypeLabel,
  patientUiActions,
  PATIENT_TYPES,
  PATIENT_TYPE_LABELS,
  patientsService,
  type Patient,
  type PatientDepartmentRef,
  type PatientSummaryCounts,
} from '@/services/patients.service'

const PAGE_SIZE = 10
const ADD_BUTTON = 'h-9 gap-1.5 rounded-lg bg-[#1c6b45] px-3 text-white hover:bg-[#165538]'
const ROW_ACTION = 'inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-background px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10'
const AVATAR_TONES = ['bg-emerald-600', 'bg-teal-600', 'bg-cyan-700', 'bg-emerald-700', 'bg-teal-700', 'bg-green-700']

function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function avatarTone(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length
  return AVATAR_TONES[hash]
}

function genderLabel(gender: string): string {
  const value = gender.trim()
  return value || '—'
}

export function PatientsView() {
  const { logout } = useAuth()
  const directoryQuery = useClinicalStore((s) => s.directoryQuery)
  const patientsRevision = useClinicalStore((s) => s.patientsRevision)
  const [search, setSearch] = useState(directoryQuery)
  const [patientType, setPatientType] = useState('ALL')
  const [departmentId, setDepartmentId] = useState('ALL')
  const [sort, setSort] = useState('name-asc')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Patient[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<PatientSummaryCounts | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [departments, setDepartments] = useState<PatientDepartmentRef[]>([])
  const [adding, setAdding] = useState(false)
  const [referring, setReferring] = useState<Patient | null>(null)
  const [sharing, setSharing] = useState<Patient | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const debouncedSearch = useDebounced(search)

  useEffect(() => {
    setSearch(directoryQuery)
  }, [directoryQuery])

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      setSummary(await patientsService.getSummary())
    } catch (err) {
      if (await handlePatientAuthError(err, logout, '/doctor/patients')) return
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }, [logout])

  const loadDepartments = useCallback(async () => {
    try {
      const result = await patientsService.getReferralDoctors({ page: 1, pageSize: 100 })
      const seen = new Map<string, PatientDepartmentRef>()
      for (const doctor of result.items) {
        if (doctor.department) seen.set(doctor.department.id, doctor.department)
      }
      setDepartments([...seen.values()].sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      setDepartments([])
    }
  }, [])

  useEffect(() => {
    void loadSummary()
    void loadDepartments()
  }, [loadSummary, loadDepartments, reloadKey, patientsRevision])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const [sortBy, sortOrder] = sort === 'name-desc' ? ['name', 'desc'] as const : ['name', 'asc'] as const
    patientsService.getPatients({
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch,
      patientType,
      departmentId,
      sortBy,
      sortOrder,
    })
      .then((result) => {
        if (cancelled) return
        setRows(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      })
      .catch(async (err) => {
        if (cancelled) return
        if (await handlePatientAuthError(err, logout, '/doctor/patients')) return
        setRows([])
        setError(patientActionErrorMessage(err, 'Could not load patients.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [page, debouncedSearch, patientType, departmentId, sort, reloadKey, patientsRevision, logout])

  const departmentOptions = useMemo(() => {
    const seen = new Map(departments.map((item) => [item.id, item]))
    for (const row of rows) {
      if (row.department) seen.set(row.department.id, row.department)
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [departments, rows])

  function refresh() {
    setReloadKey((value) => value + 1)
    useClinicalStore.getState().bumpPatients()
  }

  const filtersActive = debouncedSearch.trim() !== '' || patientType !== 'ALL' || departmentId !== 'ALL' || sort !== 'name-asc'

  return (
    <div className="space-y-4" data-testid="doctor-patients">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
          <p className="mt-1 text-sm text-muted-foreground">Patients under your active care.</p>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <Stat label="Total" value={summary?.total} loading={summaryLoading} />
          <Stat label="In-Hospital" value={summary?.inHospital} loading={summaryLoading} />
          <Stat label="OPD" value={summary?.opPatients} loading={summaryLoading} />
          <Button className={ADD_BUTTON} onClick={() => setAdding(true)}>
            <UserPlus className="size-4" aria-hidden /> Add new patient
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search by name, phone, email..."
          aria-label="Search patients"
          className="h-9 bg-background sm:max-w-md"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ListFilter className="size-4 text-muted-foreground" aria-hidden />
          <FilterSelect
            value={patientType}
            onChange={(value) => { setPatientType(value); setPage(1) }}
            label="Filter by patient type"
            width="w-[7.5rem]"
          >
            <SelectItem value="ALL">All</SelectItem>
            {PATIENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{PATIENT_TYPE_LABELS[type]}</SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={departmentId}
            onChange={(value) => { setDepartmentId(value); setPage(1) }}
            label="Filter by department"
            width="w-[7.5rem]"
          >
            <SelectItem value="ALL">All</SelectItem>
            {departmentOptions.map((department) => (
              <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
            ))}
          </FilterSelect>
          <FilterSelect
            value={sort}
            onChange={(value) => { setSort(value); setPage(1) }}
            label="Sort patients"
            width="w-[8.5rem]"
          >
            <SelectItem value="name-asc">Name (A-Z)</SelectItem>
            <SelectItem value="name-desc">Name (Z-A)</SelectItem>
          </FilterSelect>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {loading && rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <div className="p-4">
            <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              illustrated
              icon={Users}
              title="No patients found."
              description={filtersActive
                ? 'No patients match your current search or filters.'
                : 'Patients you add or receive through referral will appear here.'}
              action={filtersActive ? undefined : (
                <Button className={ADD_BUTTON} onClick={() => setAdding(true)}>Add Patient</Button>
              )}
            />
          </div>
        ) : (
          <div className={cn('hms-scroll overflow-x-auto', loading && 'opacity-60')}>
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {['Patient', 'Patient ID', 'Type', 'Age / Gender', 'Department', 'Allergies', 'Last Visit', 'Status', 'Actions'].map((heading) => (
                    <th key={heading} className="border-b px-3 py-2.5 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((patient) => {
                  const actions = patientUiActions(patient)
                  const allergy = patient.knownAllergies?.trim()
                  const allergyKnown = Boolean(allergy) && !/^none(\s+known)?$/i.test(allergy ?? '')
                  return (
                    <tr
                      key={patient.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`/doctor/patients/${patient.id}`)}
                    >
                      <td className="border-b px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white', avatarTone(patient.id))}>
                            {initials(patient.fullName)}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{patient.fullName}</span>
                              {patient.accessType === 'REFERRED' ? (
                                <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:text-amber-200">REFERRED</span>
                              ) : null}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{patient.phone || '—'}</span>
                          </span>
                        </div>
                      </td>
                      <td className="border-b px-3 py-2.5 font-mono text-xs text-muted-foreground">{patient.patientId}</td>
                      <td className="border-b px-3 py-2.5"><TypePill type={patient.patientType} /></td>
                      <td className="border-b px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                        {patient.age != null ? patient.age : '—'} / {genderLabel(patient.gender)}
                      </td>
                      <td className="border-b px-3 py-2.5 text-muted-foreground">{patient.department?.name ?? '—'}</td>
                      <td className="border-b px-3 py-2.5">
                        {allergyKnown ? (
                          <span className="inline-flex max-w-[140px] truncate rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                            {allergy}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">None known</span>
                        )}
                      </td>
                      <td className="border-b px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(patient.lastVisit)}</td>
                      <td className="border-b px-3 py-2.5">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-medium',
                          patient.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                        )}>
                          <span className={cn('size-1.5 rounded-full', patient.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400')} aria-hidden />
                          {patient.status === 'ACTIVE' ? 'Active' : patient.status === 'INACTIVE' ? 'Inactive' : patient.status}
                        </span>
                      </td>
                      <td className="border-b px-3 py-2.5">
                        <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                          {actions.canRefer ? (
                            <button type="button" className={ROW_ACTION} onClick={() => setReferring(patient)}>
                              <Send className="size-3.5" aria-hidden /> Refer
                            </button>
                          ) : null}
                          <button type="button" className={ROW_ACTION} onClick={() => setSharing(patient)}>
                            <Share2 className="size-3.5" aria-hidden /> Share
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t p-3">
            {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading page" /> : <span />}
            <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
          </div>
        ) : null}
      </div>

      <PatientFormDialog
        open={adding}
        mode="create"
        onOpenChange={setAdding}
        onSaved={() => { setPage(1); refresh() }}
      />
      <ReferPatientDialog
        patient={referring}
        open={!!referring}
        onOpenChange={(open) => { if (!open) setReferring(null) }}
        onSent={refresh}
      />
      <SharePatientDialog
        patient={sharing}
        open={!!sharing}
        onOpenChange={(open) => { if (!open) setSharing(null) }}
      />
    </div>
  )
}

function FilterSelect({
  value, onChange, label, width, children,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  width: string
  children: ReactNode
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn('h-9 shrink-0 bg-background shadow-none', width)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  )
}

function TypePill({ type }: { type: string }) {
  const normalized = normalizePatientType(type)
  const inHospital = normalized === 'IN_HOSPITAL'
  const telehealth = normalized === 'TELEHEALTH'
  return (
    <span className={cn(
      'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
      inHospital
        ? 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200'
        : telehealth
          ? 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
    )}>
      {patientTypeLabel(type)}
    </span>
  )
}

function Stat({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <div className="min-w-[4.75rem]">
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      {loading ? <Skeleton className="mt-1 h-7 w-10" /> : (
        <p className="mt-1 text-2xl font-semibold tabular-nums leading-none">{value ?? 0}</p>
      )}
    </div>
  )
}
