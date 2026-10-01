'use client'

/**
 * Settings — hospital information, security & session policy, MFA toggle, appearance (theme).
 * PUT /api/settings persists; session timeout is enforced server-side per request.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  Activity, AlertCircle, Building2, CalendarClock, Check, Eye, EyeOff, Gauge, Info, KeyRound,
  Loader2, Lock, RefreshCw, Save, ScrollText, ShieldCheck, Stethoscope, SunMoon, Timer, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'

import { apiFetch, ApiError } from '@/lib/api-client'
import { useApiData } from '@/hooks/use-api-data'
import { timeAgo } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/hospital/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface SettingsData {
  id: string
  hospitalName: string
  hospitalAddress: string | null
  sessionTimeoutMin: number
  mfaEnabled: boolean
  mfaDemoCode: string | null
  updatedAt: string
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

type PasswordField = 'current' | 'next' | 'confirm'

// ── System status (GET /api/system/health) ───────────────────
interface HealthCounts {
  doctors: number; activeDoctors: number; inactiveDoctors: number
  patients: number; shifts: number; upcomingShifts: number; auditLogs: number
}
interface SystemHealth {
  status: string
  database: { ok: boolean; latencyMs: number }
  uptimeSeconds: number
  serverTime: string
  counts: HealthCounts
}

/** 1234 → "20m 34s", 12345 → "3h 25m", 123456 → "1d 10h". */
function humanizeUptime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—'
  const d = Math.floor(totalSeconds / 86_400)
  const h = Math.floor((totalSeconds % 86_400) / 3_600)
  const m = Math.floor((totalSeconds % 3_600) / 60)
  const s = Math.floor(totalSeconds % 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function SystemStatusCard() {
  const { data, loading, error, refetch } = useApiData<SystemHealth>('/api/system/health')
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)

  // Remember when the visible values were fetched (manual refresh keeps it calm — no polling).
  useEffect(() => {
    if (!data) return
    // Deferred to satisfy react-hooks/set-state-in-effect (codebase convention).
    const t = setTimeout(() => setCheckedAt(new Date()), 0)
    return () => clearTimeout(t)
  }, [data])

  const health = data
  const dbOk = health?.database?.ok === true
  const operational = dbOk && health?.status === 'ok'
  const statusLabel = operational ? 'Operational' : dbOk ? 'Degraded' : 'Database issue'
  const dotColor = operational ? 'bg-emerald-500' : dbOk ? 'bg-amber-500' : 'bg-rose-500'
  const pingColor = operational ? 'bg-emerald-400' : dbOk ? 'bg-amber-400' : 'bg-rose-400'

  const counts = health?.counts
  const stats: { icon: typeof Gauge; label: string; value: string }[] = [
    { icon: Gauge, label: 'Database latency', value: health?.database ? `${health.database.latencyMs} ms` : '—' },
    { icon: Timer, label: 'Uptime', value: health ? humanizeUptime(health.uptimeSeconds) : '—' },
    {
      icon: Stethoscope,
      label: 'Doctors',
      value: counts ? `${counts.activeDoctors} active / ${counts.doctors} total` : '—',
    },
    { icon: Users, label: 'Patients', value: counts ? String(counts.patients) : '—' },
    {
      icon: CalendarClock,
      label: 'Shifts',
      value: counts ? `${counts.upcomingShifts} upcoming / ${counts.shifts} total` : '—',
    },
    { icon: ScrollText, label: 'Audit entries', value: counts ? String(counts.auditLogs) : '—' },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400" aria-hidden>
              <Activity className="size-4.5" />
            </span>
            <div>
              <CardTitle className="text-base">System status</CardTitle>
              <CardDescription>Live health of the portal&apos;s database and services.</CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void refetch()}
            disabled={loading}
            aria-label="Refresh system status"
          >
            <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !health ? (
          <div className="space-y-4" aria-hidden>
            <div className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[62px] w-full" />)}
            </div>
          </div>
        ) : error && !health ? (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="size-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                <RefreshCw className="size-4" aria-hidden /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="relative flex size-2.5" aria-hidden>
                <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 [animation-duration:2s] ${pingColor}`} />
                <span className={`relative inline-flex size-2.5 rounded-full ${dotColor}`} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{statusLabel}</p>
                <p className="text-xs text-muted-foreground">
                  Live database check · updated {checkedAt ? timeAgo(checkedAt) : 'just now'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg border bg-slate-50/50 p-3 dark:bg-white/5">
                  <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    <s.icon className="size-3.5" aria-hidden /> {s.label}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-foreground tabular-nums" title={s.value}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Change Password — lets the signed-in Super Admin rotate their OWN credentials.
 * POST /api/auth/change-password → 200 ok | 401 wrong current | 422 policy | 429 rate-limit.
 * NOTE: a 401 from THIS endpoint means "wrong current password" (per contract),
 * so it is surfaced inline instead of the usual session-expiry redirect.
 */
function ChangePasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState<Record<PasswordField, boolean>>({ current: false, next: false, confirm: false })
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const policy = [
    { label: 'At least 10 characters', ok: next.length >= 10 },
    { label: 'An uppercase letter', ok: /[A-Z]/.test(next) },
    { label: 'A lowercase letter', ok: /[a-z]/.test(next) },
    { label: 'A number', ok: /\d/.test(next) },
    { label: 'A special character', ok: /[^A-Za-z0-9]/.test(next) },
  ]
  const policyOk = policy.every((p) => p.ok)
  const confirmMismatch = confirm.length > 0 && confirm !== next
  const canSubmit = current.length > 0 && policyOk && confirm.length > 0 && confirm === next && !submitting

  function toggle(field: PasswordField) {
    setShow((s) => ({ ...s, [field]: !s[field] }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setServerError(null)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next }),
      })
      toast.success('Password changed successfully', {
        description: 'Use your new password the next time you sign in.',
      })
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Unable to change password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const passwordFields: { field: PasswordField; id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string }[] = [
    { field: 'current', id: 'pw-current', label: 'Current password', value: current, onChange: setCurrent, autoComplete: 'current-password' },
    { field: 'next', id: 'pw-new', label: 'New password', value: next, onChange: setNext, autoComplete: 'new-password' },
    { field: 'confirm', id: 'pw-confirm', label: 'Confirm new password', value: confirm, onChange: setConfirm, autoComplete: 'new-password' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Change Password
        </CardTitle>
        <CardDescription>
          Updates your own Super Admin credentials — this action is recorded in the audit trail.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {serverError ? (
            <Alert variant="destructive" role="alert">
              <AlertCircle className="size-4" />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            {passwordFields.map((f) => (
              <div key={f.field} className="space-y-1.5">
                <Label htmlFor={f.id}>{f.label}</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <Input
                    id={f.id}
                    type={show[f.field] ? 'text' : 'password'}
                    autoComplete={f.autoComplete}
                    className="pr-10 pl-9"
                    value={f.value}
                    onChange={(e) => {
                      f.onChange(e.target.value)
                      setServerError(null)
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
                    onClick={() => toggle(f.field)}
                    aria-label={show[f.field] ? `Hide ${f.label.toLowerCase()}` : `Show ${f.label.toLowerCase()}`}
                  >
                    {show[f.field] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {f.field === 'confirm' && confirmMismatch ? (
                  <p className="text-xs font-medium text-rose-600 dark:text-rose-400">Passwords do not match.</p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Live policy checklist */}
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5" aria-label="Password requirements">
            {policy.map((p) => (
              <li
                key={p.label}
                className={cn('flex items-center gap-1.5 text-xs', p.ok ? 'text-teal-700 dark:text-teal-300' : 'text-muted-foreground')}
              >
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded-full transition-colors',
                    p.ok ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300' : 'bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-400',
                  )}
                  aria-hidden
                >
                  <Check className="size-2.5" strokeWidth={3.5} />
                </span>
                {p.label}
              </li>
            ))}
          </ul>

          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit} className="min-w-36">
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
              {submitting ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Appearance (client-side theme preference via next-themes — not part of the saved form) ──
const emptySubscribe = () => () => {}

type ThemeChoice = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeChoice; name: string; description: string }[] = [
  { value: 'light', name: 'Light', description: 'Bright surfaces, default' },
  { value: 'dark', name: 'Dark', description: 'Deep ocean palette, low glare' },
  { value: 'system', name: 'System', description: 'Follows your device setting' },
]

/**
 * Fixed-appearance mini previews. These intentionally do NOT carry dark:
 * variants — each swatch must keep depicting its literal theme (the Light
 * swatch stays white even in dark mode, and vice versa).
 */
function ThemeSwatch({ value }: { value: ThemeChoice }) {
  if (value === 'light') {
    return (
      <div className="flex h-12 flex-col justify-end gap-1 rounded-md border border-slate-300 bg-white p-1.5" aria-hidden>
        <span className="h-1.5 w-3/4 rounded-full bg-teal-500/80" />
        <span className="h-1 w-1/2 rounded-full bg-slate-200" />
      </div>
    )
  }
  if (value === 'dark') {
    return (
      <div className="flex h-12 flex-col justify-end gap-1 rounded-md border border-white/10 bg-slate-950 p-1.5" aria-hidden>
        <span className="h-1.5 w-3/4 rounded-full bg-teal-400/80" />
        <span className="h-1 w-1/2 rounded-full bg-white/20" />
      </div>
    )
  }
  return (
    <div className="relative h-12 overflow-hidden rounded-md border border-slate-300" aria-hidden>
      <div className="absolute inset-0 flex">
        <div className="h-full w-1/2 bg-white" />
        <div className="h-full w-1/2 bg-slate-950" />
      </div>
      <div className="relative flex h-full flex-col justify-end gap-1 p-1.5">
        <span className="h-1.5 w-3/4 rounded-full bg-teal-500/80" />
        <span className="h-1 w-1/2 rounded-full bg-slate-400/60" />
      </div>
    </div>
  )
}

/** Light / Dark / System radio-cards — writes through next-themes (same store as the top-bar ThemeToggle). */
function AppearanceCard() {
  const { theme, setTheme } = useTheme()
  // Hydration-safe "is client" flag (same pattern as theme-toggle.tsx):
  // theme is only stable on the client, so the checked radio renders post-mount.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const activeTheme = mounted ? theme : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SunMoon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Appearance
        </CardTitle>
        <CardDescription>Choose how the portal looks — light, dark, or matching your device.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label="Color theme" className="grid gap-4 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => {
            const checked = activeTheme === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
                  checked
                    ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500 dark:border-teal-400 dark:bg-teal-500/10 dark:ring-teal-400'
                    : 'border-border hover:border-teal-300 dark:hover:border-teal-500/40',
                )}
              >
                <ThemeSwatch value={option.value} />
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{option.name}</span>
                    {checked ? <Check className="size-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden /> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Choosing System follows your device&apos;s light/dark preference automatically.
        </p>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const { data, loading, error, refetch } = useApiData<{ settings: SettingsData }>('/api/settings')
  const settings = data?.settings ?? null

  const [hospitalName, setHospitalName] = useState('')
  const [hospitalAddress, setHospitalAddress] = useState('')
  const [timeoutInput, setTimeoutInput] = useState('30')
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Hydrate local state once settings arrive (deferred via setTimeout)
  useEffect(() => {
    if (!settings) return
    const t = setTimeout(() => {
      setHospitalName(settings.hospitalName)
      setHospitalAddress(settings.hospitalAddress ?? '')
      setTimeoutInput(String(settings.sessionTimeoutMin))
      setMfaEnabled(settings.mfaEnabled)
      setLoaded(true)
    }, 0)
    return () => clearTimeout(t)
  }, [settings])

  const timeoutValue = Number(timeoutInput)
  const timeoutValid = Number.isInteger(timeoutValue) && timeoutValue >= 5 && timeoutValue <= 240
  const dirty =
    loaded && settings !== null &&
    (hospitalName !== settings.hospitalName ||
      hospitalAddress !== (settings.hospitalAddress ?? '') ||
      timeoutInput !== String(settings.sessionTimeoutMin) ||
      mfaEnabled !== settings.mfaEnabled)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (hospitalName.trim().length < 2) {
      toast.error('Hospital name is required (min 2 characters).')
      return
    }
    if (!timeoutValid) {
      toast.error('Session timeout must be a whole number between 5 and 240 minutes.')
      return
    }
    setSaving(true)
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          hospitalName: hospitalName.trim(),
          hospitalAddress: hospitalAddress.trim() || null,
          sessionTimeoutMin: timeoutValue,
          mfaEnabled,
        }),
      })
      toast.success('Settings saved', {
        description: 'Session timeout applies after your next activity.',
      })
      void refetch()
    } catch (err) {
      const msg = mutationErrorMessage(err)
      if (msg) toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Hospital identity, security policy and session configuration"
      />

      {/* Appearance — client-side theme preference (next-themes); independent of the saved settings form */}
      <AppearanceCard />

      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
        <form id="settings-form" onSubmit={save} className="space-y-6">
          {/* Hospital information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Hospital Information
              </CardTitle>
              <CardDescription>Identity shown across the portal and on printed records.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="settings-hospital-name">Hospital Name *</Label>
                <Input
                  id="settings-hospital-name"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  placeholder="e.g. City General Hospital"
                  required
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-hospital-address">Hospital Address</Label>
                <Textarea
                  id="settings-hospital-address"
                  value={hospitalAddress}
                  onChange={(e) => setHospitalAddress(e.target.value)}
                  placeholder="Street, city, postal code…"
                  rows={3}
                  maxLength={200}
                />
              </div>
            </CardContent>
          </Card>

          {/* Security & sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Security &amp; Sessions
              </CardTitle>
              <CardDescription>Session policy and multi-factor authentication for all admins.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="settings-timeout">Session Timeout (minutes)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="settings-timeout"
                    type="number"
                    min={5}
                    max={240}
                    step={1}
                    value={timeoutInput}
                    onChange={(e) => setTimeoutInput(e.target.value)}
                    className="w-28"
                    aria-describedby="settings-timeout-help"
                  />
                  {!timeoutValid ? (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400">Must be between 5 and 240.</p>
                  ) : null}
                </div>
                <p id="settings-timeout-help" className="text-xs text-muted-foreground">
                  Automatic logout after inactivity (minutes). Server enforces this on every request.
                </p>
              </div>

              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="settings-mfa">Multi-Factor Authentication</Label>
                    {mfaEnabled ? (
                      <Badge variant="outline" className="bg-teal-50 text-[10px] text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">Enabled</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-100 text-[10px] text-slate-500 dark:bg-white/5 dark:text-slate-400">Disabled</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Require a 6-digit verification code at login (demo code shown below when enabled).
                  </p>
                  {mfaEnabled && settings?.mfaDemoCode ? (
                    <Badge variant="outline" className="mt-1 font-mono text-[11px] font-normal">
                      Demo code: {settings.mfaDemoCode}
                    </Badge>
                  ) : null}
                </div>
                <Switch
                  id="settings-mfa"
                  checked={mfaEnabled}
                  onCheckedChange={(checked) => setMfaEnabled(checked === true)}
                  aria-describedby="settings-mfa-help"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <KeyRound className="size-3.5 text-muted-foreground" aria-hidden /> Password policy
                </p>
                <ul className="ml-1 list-inside space-y-1 text-xs text-muted-foreground">
                  <li className="flex items-start gap-1.5"><Lock className="mt-0.5 size-3 shrink-0" aria-hidden /> Passwords are hashed with bcrypt — never stored in plain text.</li>
                  <li className="flex items-start gap-1.5"><Lock className="mt-0.5 size-3 shrink-0" aria-hidden /> Passwords are never written to logs or the audit trail.</li>
                  <li className="flex items-start gap-1.5"><Lock className="mt-0.5 size-3 shrink-0" aria-hidden /> Password resets are handled exclusively by IT security.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* System status — live database health (GET /api/system/health) */}
        <SystemStatusCard />

        {/* Change password (own form — nested forms are invalid HTML) */}
        <ChangePasswordCard />

        {/* Demo environment */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4 text-amber-600 dark:text-amber-400" aria-hidden /> Demo Environment
            </CardTitle>
            <CardDescription>Development only — not for production use.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Demo credentials
            </p>
            <div className="flex flex-col gap-1 font-mono text-xs text-slate-700 sm:flex-row sm:gap-4 dark:text-slate-300">
              <span className="rounded-md bg-slate-50 px-2 py-1 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-slate-700/60">superadmin@hospital.com</span>
              <span className="rounded-md bg-slate-50 px-2 py-1 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-slate-700/60">SuperAdmin@2024</span>
            </div>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Do not use default or weak credentials in production.
            </p>
          </CardContent>
        </Card>

        {/* Save — submits the settings form via the `form` attribute */}
        <div className="sticky bottom-4 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur sm:p-5 dark:bg-card/95 dark:shadow-black/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {dirty ? (
                <p className="font-medium text-amber-600 dark:text-amber-400">You have unsaved changes.</p>
              ) : (
                <p>All changes are audited and take effect immediately.</p>
              )}
            </div>
            <Button type="submit" form="settings-form" disabled={saving || !timeoutValid} className="sm:min-w-40 active:scale-[0.98]">
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        </div>
        </>
      )}
    </div>
  )
}
