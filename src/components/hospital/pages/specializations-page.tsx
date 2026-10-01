'use client'

/**
 * Specializations — registry of medical specializations linked to departments.
 *
 * APIs:
 * - GET    /api/admin/specializations
 * - GET    /api/admin/specializations/{id}   — Edit prefill
 * - POST   /api/admin/specializations
 * - PUT    /api/admin/specializations/{id}
 * - PATCH  /api/admin/specializations/{id}/status
 * - DELETE /api/admin/specializations/{id}
 * Department select: GET /api/admin/departments
 */
import { useEffect, useMemo, useState } from 'react'
import { HeartPulse, Loader2, MoreHorizontal, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { ApiError } from '@/lib/api-client'
import { useApiData } from '@/hooks/use-api-data'
import { formatDate } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import {
  specializationsService,
  type SpecializationApiItem,
  type SpecializationListResponse,
  type SpecializationUpdatePayload,
} from '@/services/specializations.service'
import type { DepartmentListResponse } from '@/services/departments.service'
import { PageHeader } from '@/components/hospital/page-header'
import { StatusBadge } from '@/components/hospital/status-badge'
import { EmptyState } from '@/components/hospital/empty-state'
import { ConfirmDialog } from '@/components/hospital/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

interface SpecRow {
  id: string
  name: string
  description: string | null
  status: string
  department: { id: string; name: string; code: string } | null
  doctorsCount: number
  createdAt: string
  updatedAt: string
}

type FormState = {
  name: string
  description: string
  departmentId: string
  status: 'ACTIVE' | 'INACTIVE'
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  departmentId: 'NONE',
  status: 'ACTIVE',
}

const PAGE_SIZE = 20

function mapSpecialization(item: SpecializationApiItem): SpecRow {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    status: item.status,
    department: item.department
      ? {
          id: item.department.id,
          name: item.department.name,
          code: item.department.code,
        }
      : null,
    doctorsCount: item.doctors_count ?? 0,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }
}

function formFromSpecialization(item: SpecializationApiItem): FormState {
  return {
    name: item.name,
    description: item.description ?? '',
    departmentId: item.department?.id ?? 'NONE',
    status: item.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
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

function buildUpdatePayload(form: FormState, baseline: FormState): SpecializationUpdatePayload {
  const payload: SpecializationUpdatePayload = {}
  const name = form.name.trim()
  const description = form.description.trim() || null
  const departmentId = form.departmentId === 'NONE' ? null : form.departmentId
  const baselineDept = baseline.departmentId === 'NONE' ? null : baseline.departmentId
  const baselineDescription = baseline.description.trim() || null

  if (name !== baseline.name.trim()) payload.name = name
  if (description !== baselineDescription) payload.description = description
  if (departmentId !== baselineDept) payload.department_id = departmentId
  if (form.status !== baseline.status) payload.status = form.status
  return payload
}

export default function SpecializationsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [departmentFilter, setDepartmentFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [baseline, setBaseline] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<SpecRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    if (departmentFilter !== 'ALL') params.set('department_id', departmentFilter)
    params.set('page', String(page))
    params.set('page_size', String(PAGE_SIZE))
    params.set('sort_by', 'name')
    params.set('sort_order', 'asc')
    return `/api/admin/specializations?${params.toString()}`
  }, [debouncedSearch, statusFilter, departmentFilter, page])

  const { data, loading, error, refetch } = useApiData<SpecializationListResponse>(listPath)

  /** Department filter options (always available on the page). */
  const { data: filterDeptsData } = useApiData<DepartmentListResponse>(
    '/api/admin/departments?page_size=100',
  )

  /** Department select in Add/Edit modal. */
  const deptsPath = useMemo(() => {
    if (!dialogOpen) return null
    return '/api/admin/departments?status=ACTIVE&page_size=100'
  }, [dialogOpen])

  const { data: deptsData, loading: deptsLoading } = useApiData<DepartmentListResponse>(deptsPath)

  const editDetailPath = useMemo(() => {
    if (!dialogOpen || !editingId) return null
    return `/api/admin/specializations/${encodeURIComponent(editingId)}`
  }, [dialogOpen, editingId])

  const {
    data: editDetail,
    loading: editDetailLoading,
    error: editDetailError,
  } = useApiData<SpecializationApiItem>(editDetailPath)

  useEffect(() => {
    if (!editDetail || !editingId) return
    if (editDetail.id !== editingId) return
    const next = formFromSpecialization(editDetail)
    setForm(next)
    setBaseline(next)
  }, [editDetail, editingId])

  const rows = useMemo(
    () => (data?.items ?? []).map(mapSpecialization),
    [data],
  )
  const filterDepartments = filterDeptsData?.items ?? []
  const formDepartments = deptsData?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setBaseline(null)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(row: SpecRow) {
    setEditingId(row.id)
    setForm({
      name: row.name,
      description: row.description ?? '',
      departmentId: row.department?.id ?? 'NONE',
      status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    })
    setBaseline(null)
    setFormError(null)
    setDialogOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!form.name.trim()) {
      setFormError('Name is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editingId) {
        if (editDetailLoading || !baseline) {
          setFormError('Still loading specialization details. Please wait.')
          setSaving(false)
          return
        }
        const payload = buildUpdatePayload(form, baseline)
        if (Object.keys(payload).length === 0) {
          toast.message('No changes to save')
          setDialogOpen(false)
          setSaving(false)
          return
        }
        await specializationsService.update(editingId, payload)
        toast.success('Specialization updated')
      } else {
        await specializationsService.create({
          name: form.name.trim(),
          description: form.description.trim() || null,
          department_id: form.departmentId === 'NONE' ? null : form.departmentId,
          status: form.status,
        })
        toast.success('Specialization created')
      }
      setDialogOpen(false)
      void refetch()
    } catch (err) {
      const msg = mutationErrorMessage(err)
      if (msg) setFormError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(row: SpecRow) {
    setBusyId(row.id)
    try {
      await specializationsService.setStatus(row.id, {
        status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      })
      toast.success(row.status === 'ACTIVE' ? 'Specialization deactivated' : 'Specialization activated')
      void refetch()
    } catch (err) {
      const msg = mutationErrorMessage(err)
      if (msg) toast.error(msg)
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await specializationsService.remove(deleteTarget.id)
      toast.success('Specialization deleted')
      setDeleteTarget(null)
      void refetch()
    } catch (err) {
      const msg = mutationErrorMessage(err)
      if (msg) {
        toast.error(msg)
        if (err instanceof ApiError && err.status === 400 && deleteTarget.status === 'ACTIVE') {
          toast.message('Try Deactivate instead if doctors are assigned.')
        }
      }
    } finally {
      setDeleting(false)
    }
  }

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter, departmentFilter])

  /** Include current dept on edit even if it is inactive / missing from ACTIVE list. */
  const departmentOptions = useMemo(() => {
    const map = new Map(formDepartments.map((d) => [d.id, d]))
    if (editDetail?.department && !map.has(editDetail.department.id)) {
      map.set(editDetail.department.id, {
        id: editDetail.department.id,
        name: editDetail.department.name,
        code: editDetail.department.code,
        description: null,
        head_of_department: null,
        doctor_count: 0,
        status: 'ACTIVE',
        created_at: '',
        updated_at: '',
      })
    }
    return Array.from(map.values())
  }, [formDepartments, editDetail])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Specializations"
        description="Medical specialties practiced across hospital departments"
        actions={
          <Button onClick={openAdd}>
            <Plus className="size-4" aria-hidden /> Add Specialization
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full flex-col gap-3 md:max-w-3xl md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="spec-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search specializations…"
              className="pl-9"
              aria-label="Search specializations"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-full md:w-48" aria-label="Filter by department">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All departments</SelectItem>
              {filterDepartments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.code ? `${d.code} — ${d.name}` : d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!loading && data ? (
          <p className="shrink-0 text-xs text-muted-foreground">
            {total} specialization{total === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        {loading && !data ? (
          <div className="space-y-3 p-4 sm:p-6">
            {Array.from({ length: 5 }).map((_, i) => (
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
              icon={HeartPulse}
              title="No specializations found"
              description={
                debouncedSearch || statusFilter !== 'ALL' || departmentFilter !== 'ALL'
                  ? 'No specializations match your current filters.'
                  : 'Get started by adding the first medical specialization.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Specialization</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-center">Doctors</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12 text-right"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="hms-row-hover text-sm">
                    <TableCell className="max-w-xs">
                      <p className="truncate font-medium text-foreground" title={row.name}>{row.name}</p>
                      {row.description ? (
                        <p className="truncate text-xs text-muted-foreground" title={row.description}>{row.description}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.department ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[11px]">{row.department.code}</Badge>
                          <span className="truncate text-sm text-slate-700 dark:text-slate-300">{row.department.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-700 dark:text-slate-300">{row.doctorsCount}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${row.name}`}>
                            {busyId === row.id ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openEdit(row)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStatus(row)}>
                            <Power className="size-4" /> {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-rose-600 focus:text-rose-600"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Specialization' : 'Add Specialization'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update the details of this medical specialization.'
                : 'Register a new medical specialization.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            {editingId && editDetailError ? (
              <Alert variant="destructive">
                <AlertDescription>{editDetailError}</AlertDescription>
              </Alert>
            ) : null}
            {editingId && editDetailLoading ? (
              <p className="text-xs text-muted-foreground">Loading specialization details…</p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="spec-name">Name *</Label>
              <Input
                id="spec-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Cardiology"
                required
                maxLength={255}
                disabled={Boolean(editingId && editDetailLoading)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spec-desc">Description</Label>
              <Textarea
                id="spec-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description of the specialization…"
                rows={3}
                maxLength={2000}
                disabled={Boolean(editingId && editDetailLoading)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="spec-dept">Department</Label>
                <Select
                  value={form.departmentId}
                  onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v }))}
                  disabled={deptsLoading || Boolean(editingId && editDetailLoading)}
                >
                  <SelectTrigger id="spec-dept" className="w-full">
                    <SelectValue placeholder={deptsLoading ? 'Loading departments…' : 'Optional'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No department</SelectItem>
                    {departmentOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.code ? `${d.code} — ${d.name}` : d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spec-status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as 'ACTIVE' | 'INACTIVE' }))}
                  disabled={Boolean(editingId && editDetailLoading)}
                >
                  <SelectTrigger id="spec-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || Boolean(editingId && editDetailLoading)}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {editingId ? 'Save Changes' : 'Create Specialization'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : 'Delete specialization?'}
        description={
          deleteTarget && deleteTarget.doctorsCount > 0
            ? `This specialization has ${deleteTarget.doctorsCount} doctor(s) assigned. Delete is blocked until they are unassigned. Prefer Deactivate instead.`
            : 'This permanently removes the specialization. Only allowed when no doctors are assigned.'
        }
        confirmLabel="Delete specialization"
        destructive
        processing={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
