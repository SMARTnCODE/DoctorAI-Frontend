'use client'

/**
 * Doctor Portal — calm, read-only home for authenticated doctor accounts.
 * Independent from the Super Admin app: a separate session cookie
 * (`hms_doctor_session`), a dedicated profile view and self-service password
 * change. When the Hospital Super Admin has reset the doctor's password
 * (mustChangePassword), ONLY the forced password-reset state renders — no
 * portal content is reachable until a new password is set.
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle, Check, Eye, EyeOff, Hospital, KeyRound, Loader2, Lock, LogOut,
  ShieldAlert, ShieldCheck, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useDoctorAuth, type DoctorUser } from '@/components/hospital/doctor-auth-context'
import { StatusBadge } from '@/components/hospital/status-badge'
import { ApiError } from '@/lib/api-client'
import { navigate } from '@/lib/hash-nav'
import { formatDateTime, initials } from '@/lib/format'

// ── Password strength (duplicated from the forgot-password wizard on purpose —
//    small, stable copy; kept local to avoid cross-file churn) ──
interface PasswordStrength {
  length: boolean
  upper: boolean
  lower: boolean
  number: boolean
  special: boolean
}

/** Mirrors the server-side rule: ≥10 chars, upper, lower, number, special. */
function passwordStrength(pw: string): PasswordStrength {
  return {
    length: pw.length >= 10,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  }
}

const STRENGTH_RULES: { key: keyof PasswordStrength; label: string }[] = [
  { key: 'length', label: 'At least 10 characters' },
  { key: 'upper', label: 'An uppercase letter' },
  { key: 'lower', label: 'A lowercase letter' },
  { key: 'number', label: 'A number' },
  { key: 'special', label: 'A special character' },
]

function PasswordChecklist({ value }: { value: string }) {
  const strength = passwordStrength(value)
  return (
    <ul className="grid gap-1.5" aria-label="Password requirements">
      {STRENGTH_RULES.map((rule) => {
        const ok = strength[rule.key]
        return (
          <li key={rule.key} className="flex items-center gap-2 text-xs">
            {ok ? (
              <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : (
              <X className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />
            )}
            <span className={ok ? 'font-medium text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}>
              {rule.label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function EyeToggleButton({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
      onClick={onToggle}
      aria-label={show ? 'Hide password' : 'Show password'}
    >
      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  )
}

export function DoctorPortal({ section = 'dashboard' }: { section?: 'dashboard' | 'profile' }) {
  const { status, user, mustChangePassword, logout } = useDoctorAuth()

  useEffect(() => {
    document.title = section === 'profile'
      ? 'Profile · Doctor Portal'
      : 'Dashboard · Doctor Portal'
  }, [section])

  // Deny-by-default: an unauthenticated visitor never sees portal content.
  useEffect(() => {
    if (status === 'unauthenticated') navigate('/doctor/login')
  }, [status])

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="size-8 animate-spin text-teal-600" aria-hidden />
        <p className="text-sm text-muted-foreground">
          {status === 'loading' ? 'Loading your portal…' : 'Redirecting to sign-in…'}
        </p>
      </div>
    )
  }

  async function handleLogout() {
    await logout()
    navigate('/doctor/login')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background" data-testid="doctor-portal">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 shadow-sm shadow-teal-600/20">
              <Hospital className="size-5 text-white" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">Doctor Portal</p>
              <p className="truncate text-[11px] text-muted-foreground">City General Hospital</p>
            </div>
          </div>
          <nav className="flex items-center gap-1" aria-label="Doctor navigation">
            <Button
              variant={section === 'dashboard' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => navigate('/doctor/dashboard')}
            >
              Dashboard
            </Button>
            <Button
              variant={section === 'profile' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => navigate('/doctor/profile')}
            >
              Profile
            </Button>
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden text-sm font-medium text-foreground sm:inline">{user.name}</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleLogout}>
              <LogOut className="size-3.5" aria-hidden /> Logout
            </Button>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 sm:p-6">
        {mustChangePassword ? (
          <DoctorForcedPasswordReset />
        ) : section === 'profile' ? (
          <ProfileCard user={user} />
        ) : (
          <>
            <ProfileCard user={user} />
            <ChangePasswordCard />
            <SecurityNote />
          </>
        )}
      </main>
    </div>
  )
}

/** Full-attention state: rendered INSTEAD of the portal until a new password is set. */
export function DoctorForcedPasswordReset() {
  return (
    <div className="space-y-4" data-testid="forced-password-reset">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
      >
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Password Reset Required</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-800/90 dark:text-amber-200/80">
            For security, you must set a new password before continuing. This is because your password
            was reset by the Hospital Super Admin.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Set a New Password</CardTitle>
          <CardDescription>Choose a strong password to finish activating your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm forced />
        </CardContent>
      </Card>
    </div>
  )
}

function ProfileCard({ user }: { user: DoctorUser }) {
  return (
    <Card data-testid="doctor-profile-card">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-teal-600 text-lg font-semibold text-white shadow-sm shadow-teal-600/20"
            aria-hidden
          >
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-foreground">
              {/* getDoctorPublic already returns "Dr. First Last" — strip a duplicated prefix defensively */}
              {user.name.startsWith('Dr. ') ? user.name : `Dr. ${user.name}`}
            </h2>
            {user.designation ? (
              <Badge
                variant="outline"
                className="mt-1.5 rounded-full border-teal-200 bg-teal-50 font-medium text-teal-700 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-300"
              >
                {user.designation}
              </Badge>
            ) : null}
          </div>
        </div>

        <Separator className="my-5" />

        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Email</dt>
            <dd className="mt-0.5 text-sm font-medium break-words text-foreground">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Department</dt>
            <dd className="mt-0.5 text-sm font-medium break-words text-foreground">{user.department || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Account status</dt>
            <dd className="mt-1">
              <StatusBadge status={user.accountStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Last login</dt>
            <dd className="mt-0.5 text-sm font-medium break-words text-foreground">{formatDateTime(user.lastLoginAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Password last changed</dt>
            <dd className="mt-0.5 text-sm font-medium break-words text-foreground">{formatDateTime(user.passwordChangedAt)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}

function ChangePasswordCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Update your password regularly to keep your account secure.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm forced={false} />
      </CardContent>
    </Card>
  )
}

function ChangePasswordForm({ forced }: { forced: boolean }) {
  const { changePassword } = useDoctorAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strength = passwordStrength(next)
  const allRulesPass = Object.values(strength).every(Boolean)
  const passwordsMismatch = confirm.length > 0 && confirm !== next
  const canSubmit = current.length > 0 && allRulesPass && next === confirm && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      await changePassword(current, next)
      toast.success('Password updated successfully')
      if (forced) toast.success('Your account is now fully activated.')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update your password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error ? (
        <Alert variant="destructive" role="alert" data-testid="change-password-error">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="doctor-current-password">Current password</Label>
        <div className="relative rounded-md transition-shadow duration-150 focus-within:ring-4 focus-within:ring-teal-500/10 dark:focus-within:ring-teal-400/20">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            id="doctor-current-password" type={showCurrent ? 'text' : 'password'}
            autoComplete="current-password" placeholder="Enter your current password"
            className="h-11 pr-10 pl-9" value={current} required
            onChange={(e) => setCurrent(e.target.value)}
          />
          <EyeToggleButton show={showCurrent} onToggle={() => setShowCurrent((v) => !v)} />
        </div>
        {forced ? (
          <p className="text-xs text-muted-foreground">This is the temporary password issued by your Super Admin.</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="doctor-new-password">New password</Label>
        <div className="relative rounded-md transition-shadow duration-150 focus-within:ring-4 focus-within:ring-teal-500/10 dark:focus-within:ring-teal-400/20">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            id="doctor-new-password" type={showNext ? 'text' : 'password'}
            autoComplete="new-password" placeholder="Choose a new password"
            className="h-11 pr-10 pl-9" value={next} required
            onChange={(e) => setNext(e.target.value)}
          />
          <EyeToggleButton show={showNext} onToggle={() => setShowNext((v) => !v)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="doctor-confirm-password">Confirm New Password</Label>
        <div className="relative rounded-md transition-shadow duration-150 focus-within:ring-4 focus-within:ring-teal-500/10 dark:focus-within:ring-teal-400/20">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            id="doctor-confirm-password" type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password" placeholder="Repeat the new password"
            className="h-11 pr-10 pl-9" value={confirm} required
            onChange={(e) => setConfirm(e.target.value)}
          />
          <EyeToggleButton show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
        </div>
        {passwordsMismatch ? (
          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            Passwords do not match.
          </p>
        ) : null}
      </div>

      <PasswordChecklist value={next} />

      <Button
        type="submit"
        className="h-11 w-full gap-2 bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98]"
        disabled={!canSubmit}
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden /> Updating…
          </>
        ) : (
          <>
            <KeyRound className="size-4" aria-hidden /> Update Password
          </>
        )}
      </Button>
    </form>
  )
}

export function DoctorAccountPanel({ user }: { user: DoctorUser }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <ProfileCard user={user} />
      <ChangePasswordCard />
      <SecurityNote />
    </div>
  )
}

function SecurityNote() {
  return (
    <Card className="border-teal-200/70 bg-teal-50/50 dark:border-teal-500/20 dark:bg-teal-500/5">
      <CardContent className="flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
        <p className="text-xs leading-relaxed text-teal-800 dark:text-teal-200">
          Your password is stored as a secure one-way hash. No one — including the Super Admin — can
          view it. Use <span className="font-medium">Logout</span> when leaving a shared workstation.
        </p>
      </CardContent>
    </Card>
  )
}
