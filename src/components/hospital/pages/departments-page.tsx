'use client'

/**
 * Departments — hospital departments with code, head doctor and linked doctors.
 * "View doctors" hands the department over to the Doctors page via sessionStorage.
 *
 * APIs:
 * - GET    /api/admin/departments
 * - GET    /api/admin/departments/eligible-heads
 * - GET    /api/admin/departments/{id}   — View / Edit prefill
 * - POST   /api/admin/departments
 * - PUT    /api/admin/departments/{id}   — Edit / Activate-Deactivate
 * - DELETE /api/admin/departments/{id}
 */
import { useEffect, useMemo, useState } from 'react'
import { Building2, Eye, Loader2, MoreHorizontal, Pencil, Plus, Power, Search, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'

import { ApiError } from '@/lib/api-client'
import { useApiData } from '@/hooks/use-api-data'
import { navigate } from '@/lib/hash-nav'
import {
  departmentsService,
  type DepartmentApiItem,
  type DepartmentListResponse,
  type DepartmentUpdatePayload,
  type EligibleHeadsResponse,
} from '@/services/departments.service'
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

interface DeptRow {
  id: string
  name: string
  code: string
  description: string | null
  status: string
  headDoctor: { id: string; name: string; doctorId: string } | null
  doctorsCount: number
  createdAt: string
  updatedAt: string
}

type FormState = {
  name: string
  code: string
  description: string
  headDoctorId: string
  status: 'ACTIVE' | 'INACTIVE'
}

const EMPTY_FORM: FormState = {
  name: '',
  code: '',
  description: '',
  headDoctorId: 'NONE',
  status: 'ACTIVE',
}

function headDisplayName(head: DepartmentApiItem['head_of_department']): string {
  if (!head) return ''
  if (head.name?.trim()) return head.name.trim()
  const first = head.first_name ?? head.firstName ?? ''
  const last = head.last_name ?? head.lastName ?? ''
  const full = `${first} ${last}`.trim()
  return full || '—'
}

function mapDepartment(item: DepartmentApiItem): DeptRow {
  const head = item.head_of_department
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    description: item.description ?? null,
    status: item.status,
    headDoctor: head
      ? {
          id: head.id,
          name: headDisplayName(head),
          doctorId: head.doctor_id ?? head.doctorId ?? '',
        }
      : null,
    doctorsCount: item.doctor_count ?? 0,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }
}

function formFromDepartment(item: DepartmentApiItem): FormState {
  const headId = item.head_of_department?.id
  return {
    name: item.name,
    code: item.code,
    description: item.description ?? '',
    headDoctorId: headId ?? 'NONE',
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

function buildUpdatePayload(form: FormState, baseline: FormState): DepartmentUpdatePayload {
  const payload: DepartmentUpdatePayload = {}
  const name = form.name.trim()
  const code = form.code.trim().toUpperCase()
  const description = form.description.trim() || null
  const headId = form.headDoctorId === 'NONE' ? null : form.headDoctorId
  const baselineHead = baseline.headDoctorId === 'NONE' ? null : baseline.headDoctorId
  const baselineDescription = baseline.description.trim() || null

  if (name !== baseline.name.trim()) payload.name = name
  if (code !== baseline.code.trim().toUpperCase()) payload.code = code
  if (description !== baselineDescription) payload.description = description
  if (headId !== baselineHead) payload.head_of_department_id = headId
  if (form.status !== baseline.status) payload.status = form.status
  return payload
}

export default function DepartmentsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const debouncedSearch = useDebouncedValue(search)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [baseline, setBaseline] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [viewId, setViewId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeptRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    const qs = params.toString()
    return `/api/admin/departments${qs ? `?${qs}` : ''}`
  }, [debouncedSearch, statusFilter])

  const { data, loading, error, refetch } = useApiData<DepartmentListResponse>(listPath)

  const eligibleHeadsPath = useMemo(() => {
    if (!dialogOpen) return null
    const params = new URLSearchParams()
    if (editingId) params.set('department_id', editingId)
    const qs = params.toString()
    return `/api/admin/departments/eligible-heads${qs ? `?${qs}` : ''}`
  }, [dialogOpen, editingId])

  const { data: headsData, loading: headsLoading } = useApiData<EligibleHeadsResponse>(eligibleHeadsPath)

  const editDetailPath = useMemo(() => {
    if (!dialogOpen || !editingId) return null
    return `/api/admin/departments/${encodeURIComponent(editingId)}`
  }, [dialogOpen, editingId])

  const {
    data: editDetail,
    loading: editDetailLoading,
    error: editDetailError,
  } = useApiData<DepartmentApiItem>(editDetailPath)

  const viewDetailPath = useMemo(() => {
    if (!viewId) return null
    return `/api/admin/departments/${encodeURIComponent(viewId)}`
  }, [viewId])

  const {
    data: viewDetail,
    loading: viewDetailLoading,
    error: viewDetailError,
  } = useApiData<DepartmentApiItem>(viewDetailPath)

  useEffect(() => {
    if (!editDetail || !editingId || editDetail.id !== editingId) return
    const next = formFromDepartment(editDetail)
    setForm(next)
    setBaseline(next)
    setFormError(null)
  }, [editDetail, editingId])

  const rows = useMemo(
    () => (data?.items ?? []).map(mapDepartment),
    [data],
  )
  const total = data?.total ?? 0
  const eligibleHeads = headsData?.items ?? []
  const viewRow = viewDetail ? mapDepartment(viewDetail) : null

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setBaseline(null)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(row: DeptRow) {
    setEditingId(row.id)
    setForm({
      name: row.name,
      code: row.code,
      description: row.description ?? '',
      headDoctorId: row.headDoctor?.id ?? 'NONE',
      status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    })
    setBaseline(null)
    setFormError(null)
    setDialogOpen(true)
  }

  function openView(row: DeptRow) {
    setViewId(row.id)
  }

  function viewDoctors(row: DeptRow) {
    sessionStorage.setItem('hms-doctors-prefill', JSON.stringify({ departmentId: row.id }))
    navigate('/super-admin/doctors')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const code = form.code.trim().toUpperCase()
    if (!form.name.trim()) {
      setFormError('Name is required.')
      return
    }
    if (!/^[A-Z0-9]+$/.test(code)) {
      setFormError('Code is required and must be uppercase letters/numbers only.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editingId) {
        if (!baseline) {
          setFormError('Still loading department details. Please wait.')
          return
        }
        const payload = buildUpdatePayload(form, baseline)
        if (Object.keys(payload).length === 0) {
          toast.message('No changes to save')
          setDialogOpen(false)
          return
        }
        await departmentsService.update(editingId, payload)
        toast.success('Department updated')
      } else {
        await departmentsService.create({
          name: form.name.trim(),
          code,
          description: form.description.trim() || null,
          head_of_department_id: form.headDoctorId === 'NONE' ? null : form.headDoctorId,
          status: form.status,
        })
        toast.success('Department created')
      }
      setDialogOpen(false)
      setEditingId(null)
      void refetch()
    } catch (err) {
      const msg = mutationErrorMessage(err)
      if (msg) setFormError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(row: DeptRow) {
    setBusyId(row.id)
    try {
      await departmentsService.update(row.id, {
        status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      })
      toast.success(row.status === 'ACTIVE' ? 'Department deactivated' : 'Department activated')
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
      await departmentsService.remove(deleteTarget.id)
      toast.success('Department deleted')
      setDeleteTarget(null)
      void refetch()
    } catch (err) {
      const msg = mutationErrorMessage(err)
      if (msg) toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Organizational units grouping doctors, specializations and facilities"
        actions={
          <Button onClick={openAdd}>
            <Plus className="size-4" aria-hidden /> Add Department
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full flex-col gap-3 md:max-w-xl md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="dept-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search departments…"
              className="pl-9"
              aria-label="Search departments"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-44" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!loading && data ? (
          <p className="shrink-0 text-xs text-muted-foreground">
            {total} department{total === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

      {/* List card */}
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
              icon={Building2}
              title="No departments found"
              description={
                debouncedSearch || statusFilter !== 'ALL'
                  ? 'No departments match your current filters.'
                  : 'Get started by creating the first hospital department.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Department</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Head of Department</TableHead>
                  <TableHead className="text-center">Doctors</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 text-right"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="hms-row-hover text-sm">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 ring-1 ring-teal-100 dark:bg-teal-500/10 dark:ring-teal-500/25">
                          <Building2 className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
                        </div>
                        <button
                          type="button"
                          className="text-left font-medium text-foreground hover:underline"
                          onClick={() => openView(row)}
                        >
                          {row.name}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[11px]">{row.code}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {row.description ? (
                        <p className="truncate text-sm text-muted-foreground" title={row.description}>{row.description}</p>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.headDoctor ? (
                        <div className="text-sm">
                          <p className="font-medium text-slate-800 dark:text-slate-200">{row.headDoctor.name}</p>
                          <p className="text-[11px] text-muted-foreground">{row.headDoctor.doctorId || '—'}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-700 dark:text-slate-300">{row.doctorsCount}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${row.name}`}>
                            {busyId === row.id ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => openView(row)}>
                            <Eye className="size-4" /> View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(row)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => viewDoctors(row)}>
                            <Users className="size-4" /> View doctors
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => toggleStatus(row)}>
                            <Power className="size-4" /> {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
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

      {/* Add / Edit dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (saving) return
          setDialogOpen(open)
          if (!open) {
            setEditingId(null)
            setBaseline(null)
            setFormError(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Department' : 'Add Department'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the details of this department.' : 'Create a new hospital department.'}
            </DialogDescription>
          </DialogHeader>
          {editingId && editDetailLoading && !editDetail ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : editingId && editDetailError ? (
            <Alert variant="destructive">
              <AlertDescription>{editDetailError}</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {formError ? (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="dept-name">Name *</Label>
                  <Input
                    id="dept-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Emergency Medicine"
                    required
                    maxLength={80}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dept-code">Code *</Label>
                  <Input
                    id="dept-code"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                    placeholder="e.g. EMER"
                    required
                    maxLength={12}
                    className="font-mono uppercase"
                  />
                  <p className="text-[11px] text-muted-foreground">Uppercase letters and numbers only.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dept-desc">Description</Label>
                <Textarea
                  id="dept-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What this department covers…"
                  rows={3}
                  maxLength={400}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="dept-head">Head of Department</Label>
                  <Select
                    value={form.headDoctorId}
                    onValueChange={(v) => setForm((f) => ({ ...f, headDoctorId: v }))}
                    disabled={headsLoading}
                  >
                    <SelectTrigger id="dept-head" className="w-full">
                      <SelectValue placeholder={headsLoading ? 'Loading…' : 'Optional'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Not assigned</SelectItem>
                      {eligibleHeads.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} ({d.doctor_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!headsLoading && eligibleHeads.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      No eligible heads available (Active · Head of Department · not already assigned).
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dept-status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v as 'ACTIVE' | 'INACTIVE' }))}
                  >
                    <SelectTrigger id="dept-status" className="w-full">
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || (Boolean(editingId) && editDetailLoading)}>
                  {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {editingId ? 'Save Changes' : 'Create Department'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* View dialog — GET /api/admin/departments/{id} */}
      <Dialog
        open={viewId !== null}
        onOpenChange={(open) => {
          if (!open) setViewId(null)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Department details</DialogTitle>
            <DialogDescription>Loaded from the department API.</DialogDescription>
          </DialogHeader>
          {viewDetailLoading && !viewRow ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : viewDetailError ? (
            <Alert variant="destructive">
              <AlertDescription>{viewDetailError}</AlertDescription>
            </Alert>
          ) : viewRow ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-foreground">{viewRow.name}</p>
                  <Badge variant="outline" className="mt-1 font-mono text-[11px]">{viewRow.code}</Badge>
                </div>
                <StatusBadge status={viewRow.status} />
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Description</p>
                <p className="mt-1 text-foreground">{viewRow.description || '—'}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Head of Department</p>
                  {viewRow.headDoctor ? (
                    <div className="mt-1">
                      <p className="font-medium text-foreground">{viewRow.headDoctor.name}</p>
                      <p className="text-[11px] text-muted-foreground">{viewRow.headDoctor.doctorId || '—'}</p>
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Not assigned</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Doctors</p>
                  <p className="mt-1 font-medium text-foreground">{viewRow.doctorsCount}</p>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setViewId(null)
                    openEdit(viewRow)
                  }}
                >
                  <Pencil className="size-4" aria-hidden /> Edit
                </Button>
                <Button type="button" onClick={() => setViewId(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : 'Delete department?'}
        description={
          deleteTarget && deleteTarget.doctorsCount > 0
            ? `This department has ${deleteTarget.doctorsCount} doctor(s) assigned. Delete is blocked until they are reassigned. Prefer Deactivate (status INACTIVE) instead.`
            : 'This permanently removes the department. Only allowed when no doctors are assigned.'
        }
        confirmLabel="Delete department"
        destructive
        processing={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
