'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ShieldCheck, Lock, Mail, Eye, EyeOff, Hospital, Loader2, AlertCircle, TriangleAlert,
  KeyRound, ArrowRight, Info, LockKeyhole, CircleCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { useAuth } from '@/components/hospital/auth-context'
import { navigate, currentHashQuery, replaceHashQuery } from '@/lib/hash-nav'
import { ApiError } from '@/lib/api-client'
import { AuthRoleError, homePathForRole } from '@/lib/roles'

const DEMO_EMAIL = 'superadmin@hospital.com'
const DEMO_PASSWORD = 'SuperAdmin@2024'

/* ── Enterprise palette (layout-only restyle of the login screen) ── */
const C = {
  text: 'text-[#102A27] dark:text-foreground',
  muted: 'text-[#667A75] dark:text-muted-foreground',
  border: 'border-[#D9E2DE] dark:border-slate-700',
  teal: 'bg-[#187C70] hover:bg-[#14655C]',
}

export function LoginPage({ reason }: { reason?: string }) {
  const { login, verifyMfa } = useAuth()
  const reduceMotion = useReducedMotion()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(reason ?? null)
  const [success, setSuccess] = useState<string | null>(null)
  const [capsLockOn, setCapsLockOn] = useState(false)

  // Caps Lock detection — works for both masked and visible password states.
  function trackCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLockOn(e.getModifierState?.('CapsLock') ?? false)
  }

  // MFA step (enabled from Settings → ready-to-enable)
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState<string | null>(null)

  useEffect(() => setError(reason ?? null), [reason])

  useEffect(() => {
    if (currentHashQuery().get('registered') !== '1') return
    setSuccess('Account created successfully. Please sign in to continue.')
    setError(null)
    replaceHashQuery(null)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      if (mfaChallengeId) {
        try {
          await verifyMfa(mfaChallengeId, mfaCode)
        } catch (err) {
          setMfaError(err instanceof ApiError ? err.message : 'Verification failed.')
        }
      } else {
        const result = await login(email.trim(), password, remember)
        if (result.mfaRequired && result.challengeId) {
          setMfaChallengeId(result.challengeId)
          setMfaCode('')
        } else if (result.role) {
          window.dispatchEvent(new Event('hms-login'))
          navigate(homePathForRole(result.role))
        }
      }
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
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    setError(null)
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row" data-testid="super-admin-login">
      {/* ── Branding panel (desktop) ── */}
      <div className="hms-login-backdrop relative hidden shrink-0 flex-col overflow-hidden p-10 text-white lg:flex lg:w-[44%] xl:w-[46%] xl:p-14">
        {/* Slow-floating gradient orbs (decorative) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <motion.div
            className="absolute -top-24 -left-20 size-96 rounded-full bg-teal-400/15 blur-3xl"
            animate={reduceMotion ? undefined : { x: [0, 40, -15, 0], y: [0, -25, 12, 0] }}
            transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-1/3 -right-24 size-80 rounded-full bg-emerald-300/10 blur-3xl"
            animate={reduceMotion ? undefined : { x: [0, -35, 15, 0], y: [0, 25, -12, 0] }}
            transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />
          <motion.div
            className="absolute -bottom-28 left-1/4 size-96 rounded-full bg-teal-300/10 blur-3xl"
            animate={reduceMotion ? undefined : { x: [0, 30, -25, 0], y: [0, -18, 10, 0] }}
            transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
          />
        </div>

        {/* Hospital branding */}
        <div className="relative flex items-center gap-3">
          <div className="relative flex size-11 items-center justify-center rounded-xl bg-teal-400/15 ring-1 ring-teal-300/30">
            {/* Faint pulse ring around the hospital logo */}
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-xl border border-teal-300/50"
              animate={reduceMotion ? undefined : { scale: [1, 1.45], opacity: [0.7, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', repeatDelay: 0.6 }}
            />
            <Hospital className="size-6 text-teal-300" aria-hidden />
          </div>
          <div>
            <p className="text-[15px] font-semibold tracking-wide">City General Hospital</p>
            <p className="text-xs text-white/55">Healthcare Administration</p>
          </div>
        </div>

        {/* Super Admin messaging */}
        <div className="relative my-auto max-w-md py-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-teal-200/90 uppercase">
            <ShieldCheck className="size-3.5" aria-hidden /> Super Admin Portal
          </span>
          <h2 className="mt-5 text-3xl leading-[1.15] font-semibold tracking-tight xl:text-[34px]">
            Centralized control over your hospital&apos;s clinical operations.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/65">
            Manage doctors, specializations, departments, patient assignments and doctor shifts —
            with every sensitive action recorded in a tamper-evident audit trail.
          </p>
          <ul className="mt-9 space-y-2.5">
            {[
              'Role-based access with deny-by-default authorization',
              'Session expiration & automatic inactivity logout',
              'Full audit logging of administrative actions',
            ].map((line) => (
              <li
                key={line}
                className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-4 py-3 text-sm text-white/80 ring-1 ring-white/10 backdrop-blur-sm"
              >
                <ShieldCheck className="size-4 shrink-0 text-teal-300" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* Privacy / security statement */}
        <div className="relative">
          <div aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <p className="mt-5 text-xs leading-relaxed text-white/45">
            Protected health information (ePHI) access is monitored. HIPAA-aligned safeguards.
          </p>
        </div>
      </div>

      {/* ── Branding strip (mobile / tablet stack) ── */}
      <div className="hms-login-backdrop relative flex items-center gap-3 overflow-hidden px-5 py-7 text-white sm:px-8 lg:hidden">
        <div className="flex size-10 items-center justify-center rounded-xl bg-teal-400/15 ring-1 ring-teal-300/30">
          <Hospital className="size-5 text-teal-300" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide">City General Hospital</p>
          <p className="text-xs text-white/55">Healthcare Administration</p>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-5 py-10 sm:px-10 lg:px-16 dark:bg-card">
        <div className="w-full max-w-[420px]">
          <div>
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-[#102A27] sm:text-[28px] dark:text-foreground">
              Hospital Super Admin
            </h1>
            <p className="mt-2 text-sm text-[#667A75] dark:text-muted-foreground">
              Secure Hospital Administration Portal
            </p>
          </div>

          {!mfaChallengeId ? (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
              {error ? (
                <Alert variant="destructive" role="alert" data-testid="login-error">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {success ? (
                <Alert
                  role="status"
                  data-testid="signup-success"
                  className="border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-200"
                >
                  <CircleCheck className="size-4 text-teal-600 dark:text-teal-400" />
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="login-email" className={`text-[13px] ${C.text}`}>
                  Email or Username
                </Label>
                <div className="relative rounded-lg transition-shadow duration-150 focus-within:ring-4 focus-within:ring-[#187C70]/10 dark:focus-within:ring-teal-400/20">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#667A75]" aria-hidden />
                  <Input
                    id="login-email" type="email" autoComplete="username" placeholder="admin@hospital.com"
                    className={`h-11 rounded-lg border-[#D9E2DE] bg-white pl-9 shadow-none ${C.text} placeholder:text-[#8FA09A] focus-visible:border-[#187C70] focus-visible:ring-[#187C70]/15 dark:border-slate-700 dark:bg-input/30 dark:placeholder:text-muted-foreground`}
                    value={email} required
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password" className={`text-[13px] ${C.text}`}>
                  Password
                </Label>
                <div className="relative rounded-lg transition-shadow duration-150 focus-within:ring-4 focus-within:ring-[#187C70]/10 dark:focus-within:ring-teal-400/20">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#667A75]" aria-hidden />
                  <Input
                    id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                    placeholder="Enter your password"
                    className={`h-11 rounded-lg border-[#D9E2DE] bg-white pr-10 pl-9 shadow-none ${C.text} placeholder:text-[#8FA09A] focus-visible:border-[#187C70] focus-visible:ring-[#187C70]/15 dark:border-slate-700 dark:bg-input/30 dark:placeholder:text-muted-foreground`}
                    value={password} required
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={trackCapsLock}
                    onKeyUp={trackCapsLock}
                    onBlur={() => setCapsLockOn(false)}
                    aria-describedby={capsLockOn ? 'caps-lock-hint' : undefined}
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-[#667A75] transition-colors hover:bg-slate-100 hover:text-[#102A27] dark:hover:bg-white/5 dark:hover:text-slate-300"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {capsLockOn ? (
                  <p
                    id="caps-lock-hint"
                    role="status"
                    data-testid="caps-lock-hint"
                    className="flex animate-in items-center gap-1 text-xs font-medium text-amber-600 fade-in slide-in-from-top-1 dark:text-amber-400"
                  >
                    <TriangleAlert className="size-3 shrink-0" aria-hidden /> Caps Lock is on
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between">
                <label className={`flex cursor-pointer items-center gap-2 text-sm text-[#102A27] dark:text-slate-300`} htmlFor="remember-me">
                  <Checkbox id="remember-me" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                  Remember me
                </label>
                <ForgotPasswordDialog />
              </div>

              <div className="space-y-2.5">
                <Button
                  type="submit"
                  className={`h-11 w-full gap-2 rounded-lg text-sm font-semibold text-white shadow-sm shadow-[#187C70]/20 active:scale-[0.98] ${C.teal}`}
                  disabled={submitting}
                  data-testid="login-submit"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in securely <ArrowRight className="size-4" aria-hidden />
                    </>
                  )}
                </Button>
                <p className={`flex items-center justify-center gap-1.5 text-[11px] ${C.muted}`}>
                  <LockKeyhole className="size-3" aria-hidden /> Encrypted session
                </p>
              </div>

              {/* Demo credentials — DEVELOPMENT ONLY */}
              {/* <div className="rounded-xl border border-[#D9E2DE] bg-[#F4F7F5] p-3.5 text-xs dark:border-teal-500/20 dark:bg-teal-500/10">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-[#187C70] dark:text-teal-400" aria-hidden />
                  <div className="flex-1 space-y-1 text-[#2C4A43] dark:text-teal-200">
                    <p className="font-semibold">Demo credentials (development only)</p>
                    <p className="font-mono">{DEMO_EMAIL}</p>
                    <p className="font-mono">{DEMO_PASSWORD}</p>
                  </div>
                  <Button
                    type="button" variant="outline" size="sm"
                    className="h-7 border-[#C9D6D1] text-[#187C70] hover:bg-white dark:border-teal-500/25 dark:text-teal-300 dark:hover:bg-teal-500/20"
                    onClick={fillDemo}
                  >
                    Fill
                  </Button>
                </div>
              </div> */}
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
              {mfaError ? (
                <Alert variant="destructive" role="alert">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{mfaError}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-[#F4F7F5] ring-1 ring-[#D9E2DE] dark:bg-teal-500/10 dark:ring-teal-500/25">
                  <KeyRound className="size-5 text-[#187C70] dark:text-teal-400" aria-hidden />
                </div>
                <p className="text-sm font-semibold text-[#102A27] dark:text-slate-200">Two-factor verification</p>
                <p className={`text-xs ${C.muted}`}>Enter the 6-digit code from your authenticator app.</p>
              </div>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={mfaCode} onChange={setMfaCode}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button
                type="submit"
                className={`h-11 w-full rounded-lg text-sm font-semibold text-white shadow-sm shadow-[#187C70]/20 ${C.teal}`}
                disabled={submitting || mfaCode.length !== 6}
              >
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Verify & sign in'}
              </Button>
              <p className={`text-center text-xs ${C.muted}`}>
                Demo MFA is enabled in Settings — demo code: <span className="font-mono font-semibold">482913</span>
              </p>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-[#667A75] dark:text-muted-foreground">
            New here?{' '}
            <button
              type="button"
              className="font-semibold text-[#187C70] hover:underline dark:text-teal-300"
              onClick={() => navigate('/super-admin/signup')}
              data-testid="create-account-link"
            >
              Create Hospital Admin Account
            </button>
          </p>
          <p className="mt-3 text-center text-sm text-[#667A75] dark:text-muted-foreground">
            Clinical staff?{' '}
            <button
              type="button"
              className="font-semibold text-[#187C70] hover:underline dark:text-teal-300"
              onClick={() => navigate('/doctor/login')}
              data-testid="doctor-login-link"
            >
              Doctor sign in
            </button>
          </p>

          <div className="mt-8 border-t border-[#D9E2DE] pt-5 dark:border-white/10">
            <p className={`text-[11px] leading-relaxed ${C.muted}`}>
              Authorized personnel only. All activity is logged and monitored.<br />
              Unauthorized access attempts will be reported to hospital IT security.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ForgotPasswordDialog() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-xs font-medium text-[#187C70] hover:text-[#14655C] hover:underline dark:text-teal-300 dark:hover:text-teal-200">
          Forgot password?
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Password reset</DialogTitle>
          <DialogDescription>
            For security, Super Admin passwords can only be reset by the hospital IT security team.
            Contact <span className="font-medium text-slate-700 dark:text-slate-300">security@citygeneral.com</span> or extension 4400.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md bg-slate-50 p-3 text-xs text-muted-foreground dark:bg-white/5">
          Identity verification is required before any credential change. This portal uses hashed
          passwords and never displays or emails existing credentials.
        </p>
      </DialogContent>
    </Dialog>
  )
}
