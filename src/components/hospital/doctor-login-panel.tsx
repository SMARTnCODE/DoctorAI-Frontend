'use client'

/**
 * Doctor login form. Authenticates against POST /api/auth/doctor/login and
 * lands on the doctor dashboard. Server error messages are surfaced verbatim.
 */
import { useState } from 'react'
import {
  AlertCircle, ArrowRight, Eye, EyeOff, Info, Loader2, Lock, LockKeyhole, Mail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDoctorAuth } from '@/components/hospital/doctor-auth-context'
import { ApiError } from '@/lib/api-client'
import { AuthRoleError } from '@/lib/roles'
import { navigate } from '@/lib/hash-nav'

// Provisioned by backend QA — development only.
const DEMO_DOCTOR_ID = 'DOC-0001'
const DEMO_DOCTOR_PASSWORD = 'Doctor@2026'

export function DoctorLoginForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const { login } = useDoctorAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await login(identifier.trim(), password, remember)
      // Clear any stale logout banner, then open the doctor application.
      window.dispatchEvent(new Event('hms-login'))
      navigate('/doctor/dashboard')
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof AuthRoleError
          ? err.message
          : 'Unable to sign in. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function fillDemo() {
    setIdentifier(DEMO_DOCTOR_ID)
    setPassword(DEMO_DOCTOR_PASSWORD)
    setError(null)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate data-testid="doctor-login-form">
      {error ? (
        <Alert variant="destructive" role="alert" data-testid="doctor-login-error">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="doctor-login-identifier">Email</Label>
        <div className="relative rounded-md transition-shadow duration-150 focus-within:ring-4 focus-within:ring-teal-500/10 dark:focus-within:ring-teal-400/20">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            id="doctor-login-identifier" type="email" autoComplete="username"
            placeholder="doctor@hospital.com"
            className="h-11 pl-9" value={identifier} required
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="doctor-login-password">Password</Label>
        <div className="relative rounded-md transition-shadow duration-150 focus-within:ring-4 focus-within:ring-teal-500/10 dark:focus-within:ring-teal-400/20">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            id="doctor-login-password" type={showPassword ? 'text' : 'password'}
            autoComplete="current-password" placeholder="Enter your password"
            className="h-11 pr-10 pl-9" value={password} required
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label
          className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
          htmlFor="doctor-remember-me"
        >
          <Checkbox id="doctor-remember-me" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          Remember me
        </label>
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          <LockKeyhole className="size-3" aria-hidden /> Encrypted session
        </span>
      </div>

      <Button
        type="submit"
        className="h-11 w-full gap-2 bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98]"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden /> Signing in…
          </>
        ) : (
          <>
            Login <ArrowRight className="size-4" aria-hidden />
          </>
        )}
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={onForgotPassword}
          data-testid="doctor-forgot-password-link"
          className="text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline dark:text-teal-300 dark:hover:text-teal-200"
        >
          Forgot Password?
        </button>
      </div>

      {/* Demo credentials — DEVELOPMENT ONLY (provisioned by backend QA) */}
      {/* <div className="rounded-lg border border-dashed border-teal-300 bg-teal-50/60 p-3 text-xs dark:border-teal-500/25 dark:bg-teal-500/10">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
          <div className="flex-1 space-y-1 text-teal-800 dark:text-teal-200">
            <p className="font-semibold">Demo doctor credentials (development only)</p>
            <p className="font-mono">{DEMO_DOCTOR_ID}</p>
            <p className="font-mono">{DEMO_DOCTOR_PASSWORD}</p>
          </div>
          <Button
            type="button" variant="outline" size="sm"
            className="h-7 border-teal-300 text-teal-700 hover:bg-teal-100 dark:border-teal-500/25 dark:text-teal-300 dark:hover:bg-teal-500/20"
            onClick={fillDemo}
          >
            Fill
          </Button>
        </div>
      </div> */}
    </form>
  )
}
