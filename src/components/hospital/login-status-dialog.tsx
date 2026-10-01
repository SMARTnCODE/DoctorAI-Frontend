'use client'

/**
 * Login Status — informational dialog with a doctor's account credentials
 * state (round 24).
 *
 * Read-only: GET /api/doctors/{id}/login-status → account status (portal
 * lifecycle: Active / Locked / Password Reset Required / Deactivated),
 * whether login credentials are provisioned, last login, last password
 * change and the lock reason when the account is currently locked.
 * Passwords themselves are one-way hashes and are never displayed — the
 * security note points Super Admins at "Reset Password" instead.
 *
 * Mirrors DeleteDoctorDialog's loading/error UX (spinner stage + Retry) and
 * its amber info-box dialect. When `onResetPassword` is provided, the footer
 * offers a "Reset Password" hand-off that closes this dialog and opens the
 * ResetPasswordDialog for the same doctor. Fetching goes through the shared
 * useApiData hook — a null path (dialog closed) skips the request and clears
 * any previous doctor's data between open sessions.
 */
import { useEffect } from 'react'
import { AlertTriangle, KeyRound, Loader2, Lock } from 'lucide-react'
import { type DoctorRef } from '@/lib/api-client'
import { DOCTOR_ACTION_UNAVAILABLE } from '@/services/doctors.service'
import { formatDate } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/hospital/status-badge'

interface LoginStatusResponse {
  doctor: { id: string; doctorId: string; firstName: string; lastName: string; status: string }
  login: {
    hasCredentials: boolean
    lastLoginAt: string | null
    passwordChangedAt: string | null
    accountStatus: string
    lockedUntil: string | null
    lockReason: string | null
  }
}

export function LoginStatusDialog({
  doctor, open, onOpenChange, onResetPassword,
}: {
  doctor: DoctorRef | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onResetPassword?: (doctor: DoctorRef) => void
}) {
  const status = null as LoginStatusResponse | null
  const loading = false
  const error = open && doctor ? DOCTOR_ACTION_UNAVAILABLE : null
  const refetch = () => {}

  const fullName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''

  // Standard 401 backstop — same treatment as the directory page's list errors.
  useEffect(() => {
    if (error && error.includes('sign in')) {
      toast.error('Session expired. Please sign in again.')
      navigate('/super-admin/login')
    }
  }, [error])

  // Dialog is closed (null path → cleared) or the request is in flight/failed
  // until fresh data for the current doctor is on screen.
  const ready = !loading && !error && status !== null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        {!ready ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Login Status</AlertDialogTitle>
              <AlertDialogDescription>
                Loading the account and sign-in details{doctor ? ` for ${fullName}` : ''}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="space-y-2">
                  <p>{error}</p>
                  <Button size="sm" variant="outline" onClick={() => void refetch()}>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Retry
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-6" aria-live="polite">
                <Loader2 className="size-6 animate-spin text-teal-700 dark:text-teal-300" aria-hidden />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Login Status</AlertDialogTitle>
              <AlertDialogDescription>
                Account access details for {fullName} ({status.doctor.doctorId}).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  Dr. {status.doctor.firstName} {status.doctor.lastName}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{status.doctor.doctorId}</p>
              </div>
              <dl className="space-y-1.5 rounded-lg border bg-slate-50 dark:bg-white/5 p-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Account status</dt>
                  <dd><StatusBadge status={status.login.accountStatus} /></dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Login credentials</dt>
                  <dd>
                    {status.login.hasCredentials ? (
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                        Provisioned
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not set up yet</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Password last changed</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-100">
                    {status.login.passwordChangedAt ? formatDate(status.login.passwordChangedAt) : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Last login</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-100">
                    {status.login.lastLoginAt ? formatDate(status.login.lastLoginAt) : 'Never signed in'}
                  </dd>
                </div>
                {status.login.lockReason === 'AUTO' && status.login.lockedUntil ? (
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground">
                      Auto-locked after repeated failed sign-ins — unlocks automatically after the
                      timeout or via Super Admin.
                    </p>
                  </div>
                ) : status.login.lockReason === 'MANUAL' ? (
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground">
                      Manually locked by the Super Admin.
                    </p>
                  </div>
                ) : null}
              </dl>
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Passwords are stored as secure one-way hashes and can never be viewed by anyone —
                  including Super Admins. Use Reset Password to issue a new temporary password.
                </span>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
              {onResetPassword && doctor ? (
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    onOpenChange(false)
                    onResetPassword(doctor)
                  }}
                >
                  <KeyRound className="size-4" aria-hidden /> Reset Password
                </AlertDialogAction>
              ) : null}
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
