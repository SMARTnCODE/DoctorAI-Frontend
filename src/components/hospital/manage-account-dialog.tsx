'use client'

/**
 * Manage Account — "Doctor Account Control Center" (Task 26, spec §4).
 *
 * Read-only control center for one doctor's portal account. When opened it
 * fetches GET /api/admin/doctors/{id} and shows:
 *   - Doctor Profile block (avatar/monogram, name, IDs, username, email,
 *     department, specializations, designation)
 *   - Account Status + Employment Status badges, Last Login, Password Status
 *   - Account Created (date + by) / Last Updated (date + by)
 *   - Suspension / Termination details (when present) as amber / rose boxes
 *   - "Management Controls": buttons that hand off to the parent-owned action
 *     flows via onRequestAction (this dialog performs NO mutations itself).
 *
 * The parent owns every action flow (change/reset password dialogs, account
 * enable/disable/lock/unlock + force-password-change confirms); each control
 * closes this dialog and delegates. `onRefresh` fires when the dialog closes
 * after a successful load so the directory list can re-sync.
 */
import {
  AlertTriangle, KeyRound, KeySquare, Loader2, RefreshCw, UserCheck, UserCog, UserX,
} from 'lucide-react'
import { useApiData } from '@/hooks/use-api-data'
import { doctorControlFlags, mapAdminDoctorDetail, type DoctorAccount } from '@/services/doctors.service'
import { formatDate, formatDateTime, initials } from '@/lib/format'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/hospital/status-badge'

export type ManagedAccountAction =
  | 'change-password' | 'reset-password' | 'force-password-change'
  | 'enable' | 'disable' | 'lock' | 'unlock'

export interface AccountCenterRef {
  id: string
  doctorId: string
  firstName: string
  lastName: string
}

const TERMINATION_TYPE_LABELS: Record<string, string> = {
  RESIGNATION: 'Resignation',
  CONTRACT_COMPLETED: 'Contract Completed',
  RETIREMENT: 'Retirement',
  DISMISSAL: 'Dismissal',
  OTHER: 'Other',
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-slate-800 dark:text-slate-100">
        {children}
      </dd>
    </div>
  )
}

export function ManageAccountDialog({
  doctor, open, onOpenChange, onRequestAction, onRefresh,
}: {
  doctor: AccountCenterRef | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequestAction: (doctor: AccountCenterRef, action: ManagedAccountAction) => void
  onRefresh?: () => void
}) {
  const detailPath = open && doctor?.id ? `/api/admin/doctors/${encodeURIComponent(doctor.id)}` : null
  const accountPath = open && doctor?.id ? `/api/admin/doctors/${encodeURIComponent(doctor.id)}/account` : null
  const detail = useApiData<unknown>(detailPath)
  const accountQuery = useApiData<DoctorAccount>(accountPath)
  const { loading, error, refetch } = detail
  const d = mapAdminDoctorDetail(detail.data)?.doctor ?? null
  const account = accountQuery.data

  const fullName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''
  const ready = !loading && !error && d !== null

  // Closing after a successful load lets the parent re-sync its list data.
  const handleOpenChange = (next: boolean) => {
    if (!next && d) onRefresh?.()
    onOpenChange(next)
  }

  /** Hand the action off to the parent and close this dialog. */
  const request = (action: ManagedAccountAction) => {
    if (!doctor) return
    onOpenChange(false)
    onRequestAction(doctor, action)
  }

  const flags = doctorControlFlags(account?.doctor_status ?? d?.status, account?.account_status ?? d?.accountStatus)

  const controlButton = (
    action: ManagedAccountAction,
    label: string,
    Icon: typeof UserCog,
    className?: string,
    disabled = false,
  ) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={disabled}
      onClick={() => request(action)}
      aria-label={`${label} — ${fullName}`}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="hms-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
            Doctor Account Control Center
          </DialogTitle>
          <DialogDescription>
            Account, credentials and employment controls for {fullName}.
          </DialogDescription>
        </DialogHeader>

        {loading || (!error && !d) ? (
          <div className="space-y-3" aria-hidden>
            <div className="flex items-center gap-3 rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground" aria-live="polite">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading account details…
            </div>
          </div>
        ) : error || !d ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="space-y-2">
              <p>{error ?? 'Doctor not found.'}</p>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                <RefreshCw className="size-4" aria-hidden /> Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {/* ── Doctor Profile ─────────────────────────────────── */}
            <div className="flex items-center gap-3 rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
              <Avatar className="size-10">
                {d.photo ? <AvatarImage src={d.photo} alt={`Photo of ${fullName}`} /> : null}
                <AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                  {initials(`${d.firstName} ${d.lastName}`)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                  {fullName}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{d.doctorId}</p>
              </div>
            </div>
            <dl className="space-y-1.5 rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
              <InfoRow label="Doctor ID">{d.doctorId}</InfoRow>
              <InfoRow label="Employee ID">{d.employeeId ?? '—'}</InfoRow>
              <InfoRow label="Username">{d.username ?? '—'}</InfoRow>
              <InfoRow label="Email">{account?.email || d.email || 'N/A'}</InfoRow>
              <InfoRow label="Department">{d.department?.name ?? '—'}</InfoRow>
              <InfoRow label="Specialization(s)">
                {d.specializations.length > 0
                  ? d.specializations.map((s) => s.specialization.name).join(', ')
                  : '—'}
              </InfoRow>
              <InfoRow label="Designation">{d.designation ?? '—'}</InfoRow>
            </dl>

            {/* ── Status & credentials ───────────────────────────── */}
            <dl className="space-y-1.5 rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Account Status</dt>
                <dd><StatusBadge status={d.accountStatus} /></dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Employment Status</dt>
                <dd><StatusBadge status={d.status} /></dd>
              </div>
              <InfoRow label="Last Login">{account?.last_login ? formatDateTime(account.last_login) : d.lastLoginAt ? formatDateTime(d.lastLoginAt) : 'N/A'}</InfoRow>
              <InfoRow label="Login">{account ? (account.login_enabled ? 'Enabled' : 'Disabled') : 'N/A'}</InfoRow>
              <InfoRow label="Email verification">{account ? (account.email_verified ? 'Verified' : 'Not verified') : 'N/A'}</InfoRow>
              <InfoRow label="Invitation">{account?.invitation_status || 'N/A'}</InfoRow>
              <InfoRow label="Password change required">
                {account ? ((account.password_change_required || account.must_change_password) ? 'Yes' : 'No') : 'N/A'}
              </InfoRow>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Password Status</dt>
                <dd>
                  {d.accountStatus === 'PASSWORD_RESET_REQUIRED' ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      Password Change Required
                    </span>
                  ) : (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                      Normal
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            {/* ── Record keeping ─────────────────────────────────── */}
            <dl className="space-y-1.5 rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
              <InfoRow label="Account Created">
                {formatDate(d.createdAt)}
                {d.createdByName ? <span className="font-normal text-muted-foreground"> · by {d.createdByName}</span> : null}
              </InfoRow>
              <InfoRow label="Last Updated">
                {formatDate(d.updatedAt)}
                {d.updatedByName ? <span className="font-normal text-muted-foreground"> · by {d.updatedByName}</span> : null}
              </InfoRow>
            </dl>

            {/* ── Suspension details (when present) ──────────────── */}
            {d.suspensionReason || d.suspensionStart ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/25 dark:bg-amber-500/10">
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-200">
                  <AlertTriangle className="size-3.5" aria-hidden /> Suspension details
                </p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <InfoRow label="Reason">{d.suspensionReason ?? '—'}</InfoRow>
                  <InfoRow label="Start">{formatDate(d.suspensionStart)}</InfoRow>
                  <InfoRow label="End">{d.suspensionEnd ? formatDate(d.suspensionEnd) : 'Open-ended'}</InfoRow>
                  {d.suspensionNotes ? <InfoRow label="Notes">{d.suspensionNotes}</InfoRow> : null}
                </dl>
              </div>
            ) : null}

            {/* ── Termination details (when present) ─────────────── */}
            {d.terminationType ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-rose-700 uppercase dark:text-rose-300">
                  <UserX className="size-3.5" aria-hidden /> Termination details
                </p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <InfoRow label="Type">{TERMINATION_TYPE_LABELS[d.terminationType] ?? d.terminationType}</InfoRow>
                  <InfoRow label="Termination date">{formatDate(d.terminationDate)}</InfoRow>
                  <InfoRow label="Last working date">{formatDate(d.lastWorkingDate)}</InfoRow>
                  <InfoRow label="Reason">{d.terminationReason ?? '—'}</InfoRow>
                  {d.terminationNotes ? <InfoRow label="Notes">{d.terminationNotes}</InfoRow> : null}
                </dl>
              </div>
            ) : null}

            {/* ── Management Controls ────────────────────────────── */}
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Management Controls
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Doctor account management controls">
                {flags.changePassword ? controlButton('change-password', 'Change Password', KeySquare) : null}
                {flags.resetPassword ? controlButton('reset-password', 'Reset Password', KeyRound) : null}
                {flags.disable
                  ? controlButton('disable', 'Disable Account', UserX, 'border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-600 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400')
                  : null}
                {flags.reactivate
                  ? controlButton('enable', 'Reactivate', UserCheck, 'border-teal-300 text-teal-700 hover:bg-teal-50 hover:text-teal-700 dark:border-teal-500/40 dark:text-teal-300 dark:hover:bg-teal-500/10 dark:hover:text-teal-300')
                  : null}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
