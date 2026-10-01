'use client'

/**
 * Doctors — searchable, filterable registry of all doctors and the Super
 * Admin's central doctor control panel (Task 26). List: GET /api/admin/doctors.
 * Row actions: view/edit, Manage Account (control center), change/reset password,
 * enable/disable + lock/unlock account (portal-access lifecycle via PATCH /account),
 * assign shift (via session-storage prefill hand-off to the shifts page), view
 * shifts/patients/activity (session-storage tab deep-links to the profile),
 * and a SUPER_ADMIN-only suspend / lift-suspension / terminate / delete
 * workflow. The Status column stacks the account badge over the employment
 * badge; SUSPENDED and TERMINATED join the status filter.
 */
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, Ban, CalendarClock, CalendarDays, Download, Eye, FileText, KeyRound, KeySquare,
  Loader2, Lock, LockOpen, MoreHorizontal, Pencil, Plus, RefreshCw, Search, ShieldCheck,
  Stethoscope, Trash2, UserCheck, UserCog, UserMinus, UserX, Users, X,
} from 'lucide-react'
import {
  ApiError, type DoctorListItem, type DoctorRef,
} from '@/lib/api-client'
import { EXPORT_PAGE_SIZE, runCsvExport } from '@/lib/csv-export'
import { useApiData } from '@/hooks/use-api-data'
import type { SpecializationDropdownItem } from '@/services/specializations.service'
import type { DepartmentListResponse } from '@/services/departments.service'
import {
  DOCTOR_ACTION_UNAVAILABLE,
  doctorActionError,
  doctorControlFlags,
  doctorListItems,
  doctorListMeta,
  doctorsService,
  isDoctorListArray,
  usableDoctorId,
  type DoctorListResponse,
} from '@/services/doctors.service'
import { AssignShiftDialog } from '@/components/hospital/assign-shift-dialog'
import {
  formatShiftDate, formatTime12h, initials, shiftTypeLabel, timeAgo,
} from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { useAuth } from '@/components/hospital/auth-context'
import { isSuperAdminRole } from '@/lib/roles'
import {
  ChangePasswordDialog, type ChangePasswordRef,
} from '@/components/hospital/change-password-dialog'
import { DeleteDoctorDialog } from '@/components/hospital/delete-doctor-dialog'
import {
  ManageAccountDialog,
  type AccountCenterRef,
  type ManagedAccountAction,
} from '@/components/hospital/manage-account-dialog'
import { ResetPasswordDialog } from '@/components/hospital/reset-password-dialog'
import { SuspendDoctorDialog } from '@/components/hospital/suspend-doctor-dialog'
import { TerminateDoctorDialog } from '@/components/hospital/terminate-doctor-dialog'
import { PageHeader } from '@/components/hospital/page-header'
import { StatusBadge } from '@/components/hospital/status-badge'
import { EmptyState } from '@/components/hospital/empty-state'
import { PaginationControls } from '@/components/hospital/pagination-controls'
import { ConfirmDialog } from '@/components/hospital/confirm-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

const PAGE_SIZE = 10
const ALL = '__ALL__'
const BULK_LIMIT = 50 // mirrors the bulk-status API contract (1–50 per request)

/** Shared mutation error handling — 401 kicks the user back to the login view. */
function handleApiError(e: unknown, fallback = 'Something went wrong. Please try again.') {
  if (e instanceof ApiError && e.status === 401) {
    toast.error('Session expired. Please sign in again.')
    navigate('/super-admin/login')
    return
  }
  toast.error(e instanceof ApiError ? e.message : fallback)
}

/**
 * Portal-account lifecycle actions offered by the row menu + control center.
 * Task 26 added enable/disable + force-password-change alongside the existing
 * lock/unlock — all go through the same PATCH /account confirm flow.
 */
type AccountActionKind = 'lock' | 'unlock' | 'enable' | 'disable' | 'force-password-change'

const ACCOUNT_ACTION_CONFIRM: Record<
  AccountActionKind,
  { title: string; description: (name: string) => string; confirmLabel: string; destructive: boolean }
> = {
  lock: {
    title: 'Lock this doctor account?',
    description: (n) => `${n} will immediately lose portal access. Their records remain fully preserved. Unlock to restore access.`,
    confirmLabel: 'Lock Account',
    destructive: true,
  },
  unlock: {
    title: 'Unlock this doctor account?',
    description: (n) => `${n} will regain portal access with their existing credentials.`,
    confirmLabel: 'Unlock Account',
    destructive: false,
  },
  enable: {
    title: 'Reactivate this doctor?',
    description: (n) => `${n} will be set back to active and can sign in again when the account allows it.`,
    confirmLabel: 'Reactivate',
    destructive: false,
  },
  disable: {
    title: 'Disable this doctor\'s account?',
    description: (n) => `${n} will not be able to log in while the account is disabled. Historical records stay in place.`,
    confirmLabel: 'Disable Account',
    destructive: true,
  },
  'force-password-change': {
    title: 'Force a password change?',
    description: (n) => `${n} will be required to set a new password at their next portal sign-in. The current password keeps working until then.`,
    confirmLabel: 'Force Password Change',
    destructive: false,
  },
}

const ACCOUNT_ACTION_TOASTS: Record<AccountActionKind, string> = {
  lock: 'Doctor account locked',
  unlock: 'Doctor account unlocked',
  enable: 'Doctor reactivated successfully.',
  disable: 'Doctor account disabled successfully.',
  'force-password-change': 'Password change forced',
}

/**
 * Per-row ⋯ menu (Task 26, spec §3 exact order): view/edit, Manage Account,
 * change/reset password, enable/disable + lock/unlock account, assign shift,
 * view shifts/patients/activity, then a SUPER_ADMIN-gated group with Suspend /
 * Lift Suspension, Terminate and Delete Doctor.
 */
function RowActionMenu({ doctor, onManageAccountAction, onChangePasswordAction, onResetPasswordAction, onResendInviteAction, onAccountAction, onAssignShiftAction, onDeleteAction, onSuspendAction, onTerminateAction }: {
  doctor: DoctorListItem
  onManageAccountAction: (doctor: DoctorListItem) => void
  onChangePasswordAction: (doctor: DoctorListItem) => void
  onResetPasswordAction: (doctor: DoctorListItem) => void
  onResendInviteAction: (doctor: DoctorListItem) => void
  onAccountAction: (doctor: DoctorListItem, action: 'enable' | 'disable') => void
  onAssignShiftAction: (doctor: DoctorListItem) => void
  onDeleteAction: (doctor: DoctorListItem) => void
  onSuspendAction: (doctor: DoctorListItem) => void
  onTerminateAction: (doctor: DoctorListItem) => void
}) {
  const { user } = useAuth()
  const name = `Dr. ${doctor.firstName} ${doctor.lastName}`
  const controls = doctorControlFlags(doctor.status, doctor.accountStatus)
  const openProfile = (tab: 'shifts' | 'patients' | 'activity') => {
    sessionStorage.setItem('hms-doctor-profile-tab', tab)
    navigate(`/super-admin/doctors/${doctor.id}`)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => navigate(`/super-admin/doctors/${doctor.id}`)}>
          <Eye className="size-4" aria-hidden /> View Doctor
        </DropdownMenuItem>
        {controls.edit ? (
          <DropdownMenuItem onClick={() => navigate(`/super-admin/doctors/${doctor.id}/edit`)}>
            <Pencil className="size-4" aria-hidden /> Edit Doctor
          </DropdownMenuItem>
        ) : null}
        {controls.manageAccount ? (
          <DropdownMenuItem onClick={() => onManageAccountAction(doctor)}>
            <UserCog className="size-4" aria-hidden /> Manage Account
          </DropdownMenuItem>
        ) : null}
        {controls.changePassword ? (
          <DropdownMenuItem onClick={() => onChangePasswordAction(doctor)}>
            <KeySquare className="size-4" aria-hidden /> Change Password
          </DropdownMenuItem>
        ) : null}
        {controls.resetPassword ? (
          <DropdownMenuItem onClick={() => onResetPasswordAction(doctor)}>
            <KeyRound className="size-4" aria-hidden /> Reset Password
          </DropdownMenuItem>
        ) : null}
        {controls.resendInvite ? (
          <DropdownMenuItem onClick={() => onResendInviteAction(doctor)}>
            <RefreshCw className="size-4" aria-hidden /> Resend Invitation
          </DropdownMenuItem>
        ) : null}
        {controls.disable ? (
          <DropdownMenuItem
            className="text-rose-600 focus:bg-rose-50 focus:text-rose-600 dark:text-rose-400 dark:focus:bg-rose-500/10 dark:focus:text-rose-400"
            onClick={() => onAccountAction(doctor, 'disable')}
          >
            <UserX className="size-4" aria-hidden /> Disable Account
          </DropdownMenuItem>
        ) : null}
        {controls.reactivate ? (
          <DropdownMenuItem
            className="text-teal-700 focus:bg-teal-50 focus:text-teal-700 dark:text-teal-300 dark:focus:bg-teal-500/10 dark:focus:text-teal-300"
            onClick={() => onAccountAction(doctor, 'enable')}
          >
            <UserCheck className="size-4" aria-hidden /> Reactivate
          </DropdownMenuItem>
        ) : null}
        {controls.assignShift ? (
          <DropdownMenuItem onClick={() => onAssignShiftAction(doctor)}>
            <CalendarClock className="size-4" aria-hidden /> Assign Shift
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => openProfile('shifts')}>
          <CalendarDays className="size-4" aria-hidden /> View Shifts
        </DropdownMenuItem>
        {controls.viewPatients ? (
          <DropdownMenuItem onClick={() => openProfile('patients')}>
            <Users className="size-4" aria-hidden /> View Patients
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => openProfile('activity')}>
          <Activity className="size-4" aria-hidden /> View Activity
        </DropdownMenuItem>
        {isSuperAdminRole(user?.role) && (controls.suspend || controls.terminate || controls.deactivate) ? (
          <>
            <DropdownMenuSeparator />
            {controls.suspend ? (
              <DropdownMenuItem
                className="text-amber-600 focus:bg-amber-50 focus:text-amber-600 dark:text-amber-400 dark:focus:bg-amber-500/10 dark:focus:text-amber-400"
                onClick={() => onSuspendAction(doctor)}
              >
                <Ban className="size-4" aria-hidden /> Suspend Doctor
              </DropdownMenuItem>
            ) : null}
            {controls.terminate ? (
              <DropdownMenuItem
                className="text-rose-600 focus:bg-rose-50 focus:text-rose-600 dark:text-rose-400 dark:focus:bg-rose-500/10 dark:focus:text-rose-400"
                onClick={() => onTerminateAction(doctor)}
              >
                <UserMinus className="size-4" aria-hidden /> Terminate Doctor
              </DropdownMenuItem>
            ) : null}
            {controls.deactivate ? (
              <DropdownMenuItem
                className="text-rose-600 focus:bg-rose-50 focus:text-rose-600 dark:text-rose-400 dark:focus:bg-rose-500/10 dark:focus:text-rose-400"
                onClick={() => onDeleteAction(doctor)}
              >
                <Trash2 className="size-4" aria-hidden /> Delete Doctor
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NextShiftChip({ doctor }: { doctor: DoctorListItem }) {
  if (!doctor.nextShift) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex max-w-48 items-center truncate rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300">
      {shiftTypeLabel(doctor.nextShift.shiftType)} · {formatShiftDate(doctor.nextShift.date)} ·{' '}
      {formatTime12h(doctor.nextShift.startTime)}
    </span>
  )
}

/**
 * Status cell — TWO stacked compact badges (spec §18): the portal-account
 * lifecycle on top (Active / Locked / Password Reset Required / Disabled) and
 * the employment status underneath (Active / Inactive / On Leave / Suspended /
 * Terminated).
 */
function StatusCell({ doctor }: { doctor: DoctorListItem }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge status={doctor.accountStatus} />
      <StatusBadge status={doctor.status} />
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4 sm:p-6" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-28 sm:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export default function DoctorsPage() {
  // Filters (search is debounced into `search`)
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState(ALL)
  const [specializationId, setSpecializationId] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)

  // Portal-account lifecycle action (enable/disable/lock/unlock/force) —
  // confirmed via ConfirmDialog, then PATCH /account
  const [accountAction, setAccountAction] = useState<{
    action: AccountActionKind; doctor: DoctorRef
  } | null>(null)
  const [accountProcessing, setAccountProcessing] = useState(false)
  // Delete doctor dialog state (multi-stage destructive workflow)
  const [deleteTarget, setDeleteTarget] = useState<DoctorListItem | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Reset password dialog state (one-time temporary password)
  const [resetTarget, setResetTarget] = useState<DoctorRef | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  // Manage Account control center (spec §4) — hands actions back via onRequestAction
  const [manageAccountTarget, setManageAccountTarget] = useState<DoctorListItem | null>(null)
  const [manageAccountOpen, setManageAccountOpen] = useState(false)
  // Change password dialog (spec §5)
  const [changePasswordTarget, setChangePasswordTarget] = useState<ChangePasswordRef | null>(null)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  // Suspend / terminate / lift-suspension workflows (spec §8/§9)
  const [suspendTarget, setSuspendTarget] = useState<DoctorListItem | null>(null)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [terminateTarget, setTerminateTarget] = useState<DoctorListItem | null>(null)
  const [terminateOpen, setTerminateOpen] = useState(false)
  const [liftSuspensionTarget, setLiftSuspensionTarget] = useState<DoctorListItem | null>(null)
  const [liftProcessing, setLiftProcessing] = useState(false)
  const [resendTarget, setResendTarget] = useState<DoctorListItem | null>(null)
  const [resending, setResending] = useState(false)
  const [assignTarget, setAssignTarget] = useState<DoctorListItem | null>(null)
  const [exporting, setExporting] = useState(false)

  // Bulk selection (persists across pages via a Set; filter changes reset it)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDialog, setBulkDialog] = useState<'deactivate' | 'activate' | null>(null)
  const [bulkCancelShifts, setBulkCancelShifts] = useState(true)
  const [bulkProcessing] = useState(false)

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (departmentId !== ALL) params.set('department_id', departmentId)
    if (specializationId !== ALL) params.set('specialization_id', specializationId)
    if (status !== ALL) params.set('status', status)
    params.set('page', String(page))
    params.set('page_size', String(PAGE_SIZE))
    return `/api/admin/doctors?${params.toString()}`
  }, [search, departmentId, specializationId, status, page])

  const { data, loading, error, refetch } = useApiData<DoctorListResponse>(listPath)
  const { data: deptData } = useApiData<DepartmentListResponse>(
    '/api/admin/departments?page_size=100',
  )
  const { data: specOptions } = useApiData<SpecializationDropdownItem[]>(
    '/api/admin/specializations/dropdown',
  )
  const specializations = specOptions ?? []
  const departments = deptData?.items ?? []

  const allDoctors = useMemo(() => doctorListItems(data), [data])
  const listMeta = useMemo(
    () => doctorListMeta(data, { page, pageSize: PAGE_SIZE }),
    [data, page],
  )
  // Backend currently returns a bare array — paginate client-side. Paginated
  // object responses are shown as returned for the requested page.
  const doctors = useMemo(() => {
    if (!isDoctorListArray(data)) return allDoctors
    const start = (page - 1) * PAGE_SIZE
    return allDoctors.slice(start, start + PAGE_SIZE)
  }, [data, allDoctors, page])

  // ── Selection helpers: select-all toggles only the current page, the Set
  // keeps ids from any visited page so bulk actions can span pages.
  const pageIds = useMemo(() => doctors.map((d) => d.id), [doctors])
  const pageSelectedCount = pageIds.filter((id) => selectedIds.has(id)).length
  const pageAllSelected = doctors.length > 0 && pageSelectedCount === doctors.length
  const pageSomeSelected = pageSelectedCount > 0 && !pageAllSelected

  const clearSelection = () => setSelectedIds(new Set())
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const togglePageAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (pageAllSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })

  // Debounced search text (300ms) — also resets to the first page. Any filter
  // change resets the bulk selection.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchText)
      setPage(1)
      setSelectedIds(new Set())
    }, 300)
    return () => clearTimeout(t)
  }, [searchText])

  // Cross-page prefill from the departments page ("View doctors").
  useEffect(() => {
    const raw = sessionStorage.getItem('hms-doctors-prefill')
    if (!raw) return
    sessionStorage.removeItem('hms-doctors-prefill')
    try {
      const pre = JSON.parse(raw) as { departmentId?: string }
      if (pre.departmentId) {
        Promise.resolve().then(() => {
          setDepartmentId(pre.departmentId as string)
        })
      }
    } catch {
      /* ignore malformed prefill */
    }
  }, [])

  // Server 401s surface as "...sign in..." messages — back to the login view.
  useEffect(() => {
    if (error && error.includes('sign in')) {
      toast.error('Session expired. Please sign in again.')
      navigate('/super-admin/login')
    }
  }, [error])

  const openManageAccountDialog = (doctor: DoctorListItem) => {
    setManageAccountTarget(doctor)
    setManageAccountOpen(true)
  }

  const openChangePasswordDialog = (doctor: DoctorListItem) => {
    setChangePasswordTarget(doctor)
    setChangePasswordOpen(true)
  }

  const openDeleteDialog = (doctor: DoctorListItem) => {
    setDeleteTarget(doctor)
    setDeleteOpen(true)
  }

  const openSuspendDialog = (doctor: DoctorListItem) => {
    setSuspendTarget(doctor)
    setSuspendOpen(true)
  }

  const openTerminateDialog = (doctor: DoctorListItem) => {
    setTerminateTarget(doctor)
    setTerminateOpen(true)
  }

  const openResetPasswordDialog = (doctor: DoctorRef) => {
    setResetTarget(doctor)
    setResetOpen(true)
  }

  /**
   * The Manage Account control center performs no mutations — it hands every
   * action back here. Password flows open their dialogs directly; the account
   * lifecycle actions (enable/disable/lock/unlock/force-password-change) go
   * through the shared ConfirmDialog below.
   */
  const handleManagedAccountAction = (doc: AccountCenterRef, action: ManagedAccountAction) => {
    if (action === 'change-password') {
      setChangePasswordTarget(doc)
      setChangePasswordOpen(true)
    } else if (action === 'reset-password') {
      setResetTarget(doc)
      setResetOpen(true)
    } else {
      setAccountAction({ action, doctor: doc })
    }
  }

  const accountName = accountAction
    ? `Dr. ${accountAction.doctor.firstName} ${accountAction.doctor.lastName}`
    : ''

  /** Enable/disable/lock/unlock/force-password-change (PATCH /account) —
   *  records are never touched; only sign-in access / password policy flips. */
  const confirmAccountAction = async () => {
    if (!accountAction || accountProcessing) return
    const id = usableDoctorId(accountAction.doctor.id)
    if (!id) {
      toast.error('Missing doctor id.')
      return
    }
    if (accountAction.action !== 'disable' && accountAction.action !== 'enable') {
      toast.info(DOCTOR_ACTION_UNAVAILABLE)
      setAccountAction(null)
      return
    }
    setAccountProcessing(true)
    try {
      if (accountAction.action === 'disable') await doctorsService.disable(id)
      else await doctorsService.reactivate(id)
      toast.success(ACCOUNT_ACTION_TOASTS[accountAction.action])
      setAccountAction(null)
      void refetch()
    } catch (e) {
      toast.error(doctorActionError(e))
      if (e instanceof ApiError && e.status === 401) navigate('/super-admin/login')
    } finally {
      setAccountProcessing(false)
    }
  }

  const confirmLiftSuspension = async () => {
    if (!liftSuspensionTarget || liftProcessing) return
    const id = usableDoctorId(liftSuspensionTarget.id)
    if (!id) {
      toast.error('Missing doctor id.')
      return
    }
    setLiftProcessing(true)
    try {
      await doctorsService.reactivate(id)
      toast.success('Doctor reactivated successfully.')
      setLiftSuspensionTarget(null)
      void refetch()
    } catch (e) {
      toast.error(doctorActionError(e))
      if (e instanceof ApiError && e.status === 401) navigate('/super-admin/login')
    } finally {
      setLiftProcessing(false)
    }
  }

  /** After a successful delete: drop the doctor from selection, keep the
   *  current page populated (step back if it was the last row on this page),
   *  and refresh — count, search and filters all re-read from the server. */
  const handleDeleted = () => {
    const removedId = deleteTarget?.id
    if (removedId) {
      setSelectedIds((prev) => {
        if (!prev.has(removedId)) return prev
        const next = new Set(prev)
        next.delete(removedId)
        return next
      })
    }
    if (data && doctors.length === 1 && page > 1) setPage((p) => p - 1)
    else void refetch()
  }

  /** Bulk activate/deactivate — submits every selected id (any visited page). */
  const confirmBulkStatus = async () => {
    if (!bulkDialog) return
    toast.info(DOCTOR_ACTION_UNAVAILABLE)
    setBulkDialog(null)
  }

  const resendInvite = async () => {
    if (!resendTarget || resending) return
    const id = usableDoctorId(resendTarget.id)
    if (!id) {
      toast.error('Missing doctor id.')
      return
    }
    setResending(true)
    try {
      await doctorsService.resendInvite(id)
      toast.success('Doctor invitation sent successfully.')
      setResendTarget(null)
    } catch (e: unknown) {
      toast.error(doctorActionError(e, 'Could not resend the invitation.'))
      if (e instanceof ApiError && e.status === 401) navigate('/super-admin/login')
    } finally {
      setResending(false)
    }
  }

  /** Export ALL doctors matching the current filters (up to 500 rows) as CSV. */
  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      await runCsvExport<DoctorListResponse, DoctorListItem>({
        filenameBase: 'doctors',
        buildUrl: (p) => {
          const q = new URLSearchParams()
          if (search.trim()) q.set('search', search.trim())
          if (departmentId !== ALL) q.set('department_id', departmentId)
          if (specializationId !== ALL) q.set('specialization_id', specializationId)
          if (status !== ALL) q.set('status', status)
          q.set('page', String(p))
          q.set('page_size', String(EXPORT_PAGE_SIZE))
          return `/api/admin/doctors?${q.toString()}`
        },
        extract: (r) => ({
          rows: doctorListItems(r),
          // Bare-array responses already include every row — stop after page 1.
          totalPages: isDoctorListArray(r) ? 1 : doctorListMeta(r).totalPages,
        }),
        headers: ['Doctor ID', 'Name', 'Department', 'Specializations', 'Designation', 'Qualification', 'Phone', 'Email', 'Status', 'Patients'],
        mapRow: (d) => [
          d.doctorId,
          `Dr. ${d.firstName} ${d.lastName}`,
          d.department?.name ?? '',
          d.specializations.map((s) => s.name).join(', '),
          d.designation ?? '',
          d.qualification ?? '',
          d.phone ?? '',
          d.email,
          d.status,
          d.patientsCount,
        ],
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctors"
        description="Manage the medical staff directory, assignments and account status"
        actions={
          <Button onClick={() => navigate('/super-admin/doctors/new')}>
            <Plus className="size-4" aria-hidden /> Add Doctor
          </Button>
        }
      />

      {error ? (
        <Alert variant="destructive" role="alert">
          <RefreshCw className="size-4" aria-hidden />
          <AlertTitle>Could not load doctors</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              <RefreshCw className="size-4" aria-hidden /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-wrap">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400 dark:text-muted-foreground" aria-hidden />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search by name, ID, email, phone…"
                className="pl-9"
                aria-label="Search doctors"
              />
            </div>
            <Button
              variant="outline"
              className="shrink-0 self-start md:self-auto"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              Export CSV
            </Button>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select
                value={departmentId}
                onValueChange={(v) => {
                  setDepartmentId(v)
                  setPage(1)
                  clearSelection()
                }}
              >
                <SelectTrigger className="w-full md:w-44" aria-label="Filter by department">
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All departments</SelectItem>
                  {departments.map((dep) => (
                    <SelectItem key={dep.id} value={dep.id}>{dep.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={specializationId}
                onValueChange={(v) => {
                  setSpecializationId(v)
                  setPage(1)
                  clearSelection()
                }}
              >
                <SelectTrigger className="w-full md:w-44" aria-label="Filter by specialization">
                  <SelectValue placeholder="All specializations" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={ALL}>All specializations</SelectItem>
                  {specializations.map((sp) => (
                    <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v)
                  setPage(1)
                  clearSelection()
                }}
              >
                <SelectTrigger className="w-full md:w-40" aria-label="Filter by status">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="TERMINATED">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk action bar — animated in above the table, sticky under the topbar */}
      <AnimatePresence initial={false}>
        {selectedIds.size > 0 ? (
          <motion.div
            key="bulk-action-bar"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            role="toolbar"
            aria-label="Bulk doctor actions"
            className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/70 p-2 text-teal-900 shadow-sm backdrop-blur sm:gap-3 dark:border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-300"
          >
            <span className="px-1 text-sm font-medium" aria-live="polite">
              {selectedIds.size} selected
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-300 bg-white/80 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-200"
                onClick={() => {
                  setBulkCancelShifts(true)
                  setBulkDialog('activate')
                }}
                disabled={bulkProcessing || selectedIds.size > BULK_LIMIT}
              >
                <UserCheck className="size-4" aria-hidden /> Activate
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-rose-300 bg-white/80 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20 dark:hover:text-rose-200"
                onClick={() => {
                  setBulkCancelShifts(true)
                  setBulkDialog('deactivate')
                }}
                disabled={bulkProcessing || selectedIds.size > BULK_LIMIT}
              >
                <UserX className="size-4" aria-hidden /> Deactivate
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-teal-700 hover:bg-teal-100/70 dark:text-teal-300 dark:hover:bg-teal-500/15"
                onClick={clearSelection}
                aria-label="Clear selection"
                disabled={bulkProcessing}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            {selectedIds.size > BULK_LIMIT ? (
              <p className="w-full px-1 text-xs text-rose-600 dark:text-rose-400">
                Bulk updates are limited to {BULK_LIMIT} doctors at a time.
              </p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Doctor table */}
      <Card className="overflow-hidden">
        <CardHeader className="p-4 sm:p-6 sm:pb-4">
          <CardTitle className="text-base">Doctor Directory</CardTitle>
          <CardDescription>
            {data
              ? `${listMeta.total} doctor${listMeta.total === 1 ? '' : 's'} found`
              : 'Loading…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !data ? (
            <TableSkeleton />
          ) : doctors.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                illustrated
                icon={Stethoscope}
                title="No doctors found"
                description="Try adjusting the search or filters, or register a new doctor."
                action={
                  <Button size="sm" onClick={() => navigate('/super-admin/doctors/new')}>
                    <Plus className="size-4" aria-hidden /> Add Doctor
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="hms-scroll max-h-[70vh] overflow-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)] hover:bg-transparent">
                    <TableHead className="w-10 pr-0">
                      <Checkbox
                        checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                        onCheckedChange={togglePageAll}
                        aria-label={pageAllSelected ? 'Deselect all doctors on this page' : 'Select all doctors on this page'}
                        disabled={doctors.length === 0}
                      />
                    </TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Specialization</TableHead>
                    <TableHead className="hidden lg:table-cell">Designation</TableHead>
                    <TableHead className="hidden lg:table-cell">Qualification</TableHead>
                    <TableHead className="hidden xl:table-cell">Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Next Shift</TableHead>
                    <TableHead className="text-right">Patients</TableHead>
                    <TableHead className="hidden sm:table-cell">Updated</TableHead>
                    <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doctors.map((d) => (
                    <TableRow key={d.id} className="hms-row-hover" data-state={selectedIds.has(d.id) ? 'selected' : undefined}>
                      <TableCell className="w-10 pr-0">
                        <Checkbox
                          checked={selectedIds.has(d.id)}
                          onCheckedChange={() => toggleOne(d.id)}
                          aria-label={`Select Dr. ${d.firstName} ${d.lastName}`}
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="flex items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                          onClick={() => navigate(`/super-admin/doctors/${d.id}`)}
                          aria-label={`Open profile of Dr. ${d.firstName} ${d.lastName}`}
                        >
                          <Avatar className="size-9">
                            {d.photo ? <AvatarImage src={d.photo} alt={`Photo of Dr. ${d.firstName} ${d.lastName}`} /> : null}
                            <AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                              {initials(`${d.firstName} ${d.lastName}`)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block max-w-40 truncate text-sm font-medium text-slate-800 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-300">
                              Dr. {d.firstName} {d.lastName}
                              {d.hasResume ? (
                                <span
                                  title="Resume / CV on file"
                                  className="ml-1 inline-flex shrink-0 align-[-2px]"
                                >
                                  <FileText className="size-3.5 text-teal-600 dark:text-teal-400" aria-hidden />
                                  <span className="sr-only">· Resume on file</span>
                                </span>
                              ) : null}
                            </span>
                            <span className="block font-mono text-xs text-muted-foreground">{d.doctorId}</span>
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="text-sm">{d.department?.name ?? '—'}</TableCell>
                      <TableCell className="max-w-40 truncate text-sm">
                        {d.specializations.length > 0
                          ? d.specializations.map((s) => s.name).join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell className="hidden max-w-36 truncate text-sm lg:table-cell">
                        {d.designation ?? '—'}
                      </TableCell>
                      <TableCell className="hidden max-w-36 truncate text-sm lg:table-cell">
                        {d.qualification ?? '—'}
                      </TableCell>
                      <TableCell className="hidden text-xs xl:table-cell">
                        <span className="block text-slate-700 dark:text-slate-300">{d.phone ?? '—'}</span>
                        <span className="block max-w-40 truncate text-muted-foreground">{d.email}</span>
                      </TableCell>
                      <TableCell><StatusCell doctor={d} /></TableCell>
                      <TableCell className="hidden md:table-cell"><NextShiftChip doctor={d} /></TableCell>
                      <TableCell className="text-right text-sm font-medium">{d.patientsCount}</TableCell>
                      <TableCell className="hidden text-xs sm:table-cell">
                        <span className="block text-slate-700 dark:text-slate-300">{timeAgo(d.updatedAt)}</span>
                        <span className="block text-muted-foreground">{d.updatedByName ?? '—'}</span>
                      </TableCell>
                      <TableCell>
                        <RowActionMenu
                          doctor={d}
                          onManageAccountAction={(doc) => openManageAccountDialog(doc)}
                          onChangePasswordAction={(doc) => openChangePasswordDialog(doc)}
                          onResetPasswordAction={(doc) => openResetPasswordDialog(doc)}
                          onResendInviteAction={(doc) => setResendTarget(doc)}
                          onAccountAction={(doc, action) => setAccountAction({ action, doctor: doc })}
                          onAssignShiftAction={(doc) => setAssignTarget(doc)}
                          onDeleteAction={(doc) => openDeleteDialog(doc)}
                          onSuspendAction={(doc) => openSuspendDialog(doc)}
                          onTerminateAction={(doc) => openTerminateDialog(doc)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t p-4 sm:px-6">
          {data ? (
            <PaginationControls
              page={listMeta.page}
              totalPages={listMeta.totalPages}
              total={listMeta.total}
              pageSize={listMeta.pageSize}
              onPage={setPage}
            />
          ) : null}
        </CardFooter>
      </Card>

      {/* Delete doctor — warning → review → typed-name confirmation (spec §10) */}
      <DeleteDoctorDialog
        doctor={deleteTarget}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={handleDeleted}
      />

      {/* Manage Account — Doctor Account Control Center (spec §4, read-only;
          every control hands off to the parent-owned flows below) */}
      <ManageAccountDialog
        doctor={manageAccountTarget}
        open={manageAccountOpen}
        onOpenChange={setManageAccountOpen}
        onRequestAction={handleManagedAccountAction}
        onRefresh={() => void refetch()}
      />

      {/* Change password — Super Admin sets a new password (spec §5) */}
      <ChangePasswordDialog
        doctor={changePasswordTarget}
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
        onDone={() => void refetch()}
      />

      {/* Reset password — one-time temporary password workflow */}
      <ResetPasswordDialog
        doctor={resetTarget}
        open={resetOpen}
        onOpenChange={setResetOpen}
        onReset={() => void refetch()}
      />

      {/* Bulk activate / deactivate confirmation */}
      <ConfirmDialog
        open={bulkDialog !== null}
        onOpenChange={(open) => {
          if (!open) setBulkDialog(null)
        }}
        title={
          bulkDialog === 'deactivate'
            ? `Deactivate ${selectedIds.size} doctor${selectedIds.size === 1 ? '' : 's'}?`
            : `Activate ${selectedIds.size} doctor${selectedIds.size === 1 ? '' : 's'}?`
        }
        description={
          bulkDialog === 'deactivate'
            ? 'Historical records will be preserved. The doctors will be marked inactive rather than deleted.'
            : 'The doctors will regain access to the roster and can be assigned new shifts.'
        }
        confirmLabel={bulkDialog === 'deactivate' ? 'Deactivate Doctors' : 'Activate Doctors'}
        destructive={bulkDialog === 'deactivate'}
        processing={bulkProcessing}
        onConfirm={() => void confirmBulkStatus()}
      >
        {bulkDialog === 'deactivate' ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10 p-3">
            <Checkbox
              id="bulk-cancel-upcoming-shifts"
              checked={bulkCancelShifts}
              onCheckedChange={(v) => setBulkCancelShifts(v === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="bulk-cancel-upcoming-shifts"
              className="cursor-pointer font-normal leading-snug text-slate-700 dark:text-slate-300"
            >
              Also cancel their upcoming shifts
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Cancels scheduled shifts from today onwards for every deactivated doctor.
              </span>
            </Label>
          </div>
        ) : (
          <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300">
            No data will be lost
          </Badge>
        )}
      </ConfirmDialog>

      {/* Suspend doctor (spec §8) */}
      <SuspendDoctorDialog
        doctor={suspendTarget}
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        onDone={() => void refetch()}
      />

      {/* Terminate doctor (spec §9) — department context comes from the row */}
      <TerminateDoctorDialog
        doctor={terminateTarget
          ? {
              id: terminateTarget.id,
              doctorId: terminateTarget.doctorId,
              firstName: terminateTarget.firstName,
              lastName: terminateTarget.lastName,
              departmentName: terminateTarget.department?.name ?? null,
              specializationNames: terminateTarget.specializations.map((s) => s.name).join(', '),
              designation: terminateTarget.designation,
            }
          : null}
        open={terminateOpen}
        onOpenChange={setTerminateOpen}
        onDone={() => void refetch()}
      />

      <ConfirmDialog
        open={resendTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResendTarget(null)
        }}
        title="Resend invitation?"
        description={
          resendTarget
            ? `A new invitation will be sent to Dr. ${resendTarget.firstName} ${resendTarget.lastName}'s registered email. The backend generates any temporary password.`
            : ''
        }
        confirmLabel="Resend Invitation"
        processing={resending}
        onConfirm={() => void resendInvite()}
      />
      <AssignShiftDialog
        doctorId={assignTarget?.id ?? ''}
        doctorName={assignTarget ? `Dr. ${assignTarget.firstName} ${assignTarget.lastName}` : 'this doctor'}
        employmentStatus={assignTarget?.status ?? ''}
        accountStatus={assignTarget?.accountStatus ?? ''}
        shifts={[]}
        open={assignTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAssignTarget(null)
        }}
        onAssigned={() => void refetch()}
      />

      {/* Lift suspension confirmation (employment returns to Active) */}
      <ConfirmDialog
        open={liftSuspensionTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLiftSuspensionTarget(null)
        }}
        title="Lift this suspension?"
        description={
          liftSuspensionTarget
            ? `Dr. ${liftSuspensionTarget.firstName} ${liftSuspensionTarget.lastName}'s employment returns to Active and portal login is re-enabled.`
            : ''
        }
        confirmLabel="Lift Suspension"
        processing={liftProcessing}
        onConfirm={() => void confirmLiftSuspension()}
      >
        <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300">
          Employment returns to Active · login re-enabled
        </Badge>
      </ConfirmDialog>

      {/* Account lifecycle confirmation (enable/disable/lock/unlock/force) */}
      <ConfirmDialog
        open={accountAction !== null}
        onOpenChange={(open) => {
          if (!open) setAccountAction(null)
        }}
        title={accountAction ? ACCOUNT_ACTION_CONFIRM[accountAction.action].title : ''}
        description={accountAction ? ACCOUNT_ACTION_CONFIRM[accountAction.action].description(accountName) : ''}
        confirmLabel={accountAction ? ACCOUNT_ACTION_CONFIRM[accountAction.action].confirmLabel : 'Confirm'}
        destructive={accountAction ? ACCOUNT_ACTION_CONFIRM[accountAction.action].destructive : false}
        processing={accountProcessing}
        onConfirm={() => void confirmAccountAction()}
      />
    </div>
  )
}
