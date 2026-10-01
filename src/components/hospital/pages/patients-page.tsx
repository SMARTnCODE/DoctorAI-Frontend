'use client'

/**
 * Patients — sensitive patient directory. Every access is audited server-side.
 * Search and filters are sent to the API. The list is whatever the backend
 * authorizes for this hospital.
 */
import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, Info, Loader2, RotateCcw, Search, ShieldCheck, Users } from 'lucide-react'

import { useApiData } from '@/hooks/use-api-data'
import { useAuth } from '@/components/hospital/auth-context'
import { handlePatientAuthError, patientActionErrorMessage } from '@/lib/patient-api-error'
import { doctorListItems, type DoctorListResponse } from '@/services/doctors.service'
import type { DepartmentListResponse } from '@/services/departments.service'
import { EXPORT_PAGE_SIZE, runCsvExport } from '@/lib/csv-export'
import { ageFrom, formatDate, initials } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { mapPatientList, patientListPath, patientsService, PATIENT_TYPES, PATIENT_TYPE_LABELS, type Patient, type PatientListResponse } from '@/services/patients.service'
import { PageHeader } from '@/components/hospital/page-header'
import { StatusBadge } from '@/components/hospital/status-badge'
import { EmptyState } from '@/components/hospital/empty-state'
import { PaginationControls } from '@/components/hospital/pagination-controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 10

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function ageLabel(age: number | null | undefined, dateOfBirth?: string | null): string {
  if (typeof age === 'number' && Number.isFinite(age)) return `${age} yrs`
  return ageFrom(dateOfBirth)
}

function clinicalStatusKey(value?: string | null): string {
  return (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
}

export default function PatientsPage() {
  const { logout } = useAuth()
  const [search, setSearch] = useState('')
  const [doctorId, setDoctorId] = useState('ALL')
  const [departmentId, setDepartmentId] = useState('ALL')
  const [patientType, setPatientType] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const debouncedSearch = useDebouncedValue(search)

  const { data: doctorsData } = useApiData<DoctorListResponse>('/api/admin/doctors?page_size=100')
  const { data: deptsData } = useApiData<DepartmentListResponse>('/api/admin/departments?page_size=100')
  const doctors = useMemo(() => doctorListItems(doctorsData), [doctorsData])

  const filters = useMemo(() => ({
    search: debouncedSearch,
    doctorId,
    departmentId,
    patientType,
    status: statusFilter,
  }), [debouncedSearch, doctorId, departmentId, patientType, statusFilter])

  const [data, setData] = useState<PatientListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    patientsService.getPatients({ ...filters, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(async (err) => {
        if (cancelled) return
        if (await handlePatientAuthError(err, logout, '/super-admin/patients')) return
        setData(null)
        setError(patientActionErrorMessage(err, 'Could not load patients.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filters, page, logout])

  const rows: Patient[] = data?.items ?? []
  const filtersActive =
    search.trim() !== '' || doctorId !== 'ALL' || departmentId !== 'ALL' ||
    patientType !== 'ALL' || statusFilter !== 'ALL'

  function resetFilters() {
    setSearch('')
    setDoctorId('ALL')
    setDepartmentId('ALL')
    setPatientType('ALL')
    setStatusFilter('ALL')
    setPage(1)
  }

  function openRecord(id: string) {
    navigate(`/super-admin/patients/${id}`)
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      await runCsvExport<unknown, ReturnType<typeof mapPatientList>['items'][number]>({
        filenameBase: 'patients',
        buildUrl: (exportPage) => patientListPath({ ...filters, page: exportPage, pageSize: EXPORT_PAGE_SIZE }),
        extract: (response) => {
          const mapped = mapPatientList(response)
          return { rows: mapped.items, totalPages: mapped.totalPages || 1 }
        },
        headers: ['Patient ID', 'Name', 'Age', 'Gender', 'Phone', 'Assigned Doctor', 'Department', 'Last Visit', 'Visits', 'Status', 'Clinical Status'],
        mapRow: (row) => [
          row.patientId,
          row.fullName,
          ageLabel(row.age, row.dateOfBirth).replace('—', ''),
          row.gender ?? '',
          row.phone ?? '',
          row.primaryDoctor?.name ?? '',
          row.department?.name ?? '',
          row.lastVisit ? formatDate(row.lastVisit) : '',
          row.visitCount ?? 0,
          row.status,
          clinicalStatusKey(row.severity),
        ],
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        description="Directory of patient records authorized for administration"
        actions={
          <Badge variant="outline" className="gap-1.5 bg-teal-50 px-3 py-1.5 font-medium text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
            <ShieldCheck className="size-3.5" aria-hidden /> Access audited
          </Badge>
        }
      />

      <Alert className="border-teal-200 bg-teal-50/60 text-teal-900 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200">
        <Info className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
        <AlertDescription className="text-sm">
          Patient data is sensitive — every record access is logged to the audit trail.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="pat-search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search by name, patient ID, phone..."
                className="pl-9"
                aria-label="Search patients"
              />
            </div>
            <Button
              variant="outline"
              className="shrink-0 self-start lg:self-auto"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
              Export CSV
            </Button>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
              <Select value={doctorId} onValueChange={(value) => { setDoctorId(value); setPage(1) }}>
                <SelectTrigger className="w-full lg:w-44" aria-label="Filter by doctor">
                  <SelectValue placeholder="All doctors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All doctors</SelectItem>
                  {doctors.map((doctor) => (
                    <SelectItem key={doctor.id} value={doctor.id}>Dr. {doctor.firstName} {doctor.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={departmentId} onValueChange={(value) => { setDepartmentId(value); setPage(1) }}>
                <SelectTrigger className="w-full lg:w-44" aria-label="Filter by department">
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Departments</SelectItem>
                  {(deptsData?.items ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={patientType} onValueChange={(value) => { setPatientType(value); setPage(1) }}>
                <SelectTrigger className="w-full lg:w-44" aria-label="Filter by patient type">
                  <SelectValue placeholder="All patient types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All patient types</SelectItem>
                  {PATIENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{PATIENT_TYPE_LABELS[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1) }}>
                <SelectTrigger className="w-full lg:w-36" aria-label="Filter by status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="shrink-0 text-muted-foreground">
                <RotateCcw className="size-3.5" aria-hidden /> Reset
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-card shadow-sm">
        {loading && !data ? (
          <div className="space-y-3 p-4 sm:p-6">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
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
              icon={Users}
              title="No patient records found."
              description={filtersActive
                ? 'No patients match your current filters. Try adjusting or resetting them.'
                : 'No patient records are available for this hospital yet.'}
            />
          </div>
        ) : (
          <>
            <div className={loading ? 'hms-scroll max-h-[70vh] overflow-auto opacity-60' : 'hms-scroll max-h-[70vh] overflow-auto'}>
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)] hover:bg-transparent">
                    <TableHead>Patient</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Assigned Doctor</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Last Visit</TableHead>
                    <TableHead className="text-center">Visits</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Clinical status</TableHead>
                    <TableHead className="w-12 text-right"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((patient) => (
                    <TableRow
                      key={patient.id}
                      className="hms-row-hover cursor-pointer text-sm"
                      onClick={() => openRecord(patient.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9">
                            <AvatarFallback className="bg-teal-100 text-xs font-semibold text-teal-800 dark:bg-teal-500/20 dark:text-teal-300">
                              {initials(patient.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{patient.fullName}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{patient.patientId}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{ageLabel(patient.age, patient.dateOfBirth)}</TableCell>
                      <TableCell className="text-muted-foreground">{patient.gender || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{patient.phone || '—'}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{patient.primaryDoctor?.name ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{patient.department?.name ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(patient.lastVisit)}</TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">{patient.visitCount ?? 0}</TableCell>
                      <TableCell><StatusBadge status={patient.status} /></TableCell>
                      <TableCell>
                        {clinicalStatusKey(patient.severity)
                          ? <StatusBadge status={clinicalStatusKey(patient.severity)} />
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`View record of ${patient.fullName}`}
                          onClick={(event) => { event.stopPropagation(); openRecord(patient.id) }}
                        >
                          <Eye className="size-4" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t p-4">
              <PaginationControls
                page={data?.page ?? 1}
                totalPages={data?.totalPages ?? 1}
                total={data?.total ?? 0}
                pageSize={data?.pageSize ?? PAGE_SIZE}
                onPage={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
