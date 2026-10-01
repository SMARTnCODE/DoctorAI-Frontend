'use client'

/**
 * Doctor forgot-password wizard — a 4-step dialog:
 *   1. identify      — request a 6-digit verification code (anti-enumeration:
 *                      the API always answers 200 and the UI never hints
 *                      whether the account exists).
 *   2. verify        — enter the code via InputOTP; resend with a 30s
 *                      client-side cooldown.
 *   3. new-password  — set the new password with a live 5-rule strength
 *                      checklist; submits the resetToken from step 2.
 *   4. success       — confirmation, back to the Doctor Login form.
 *
 * All wizard state lives in <WizardBody/>, which unmounts together with the
 * dialog content — state therefore resets cleanly on every close/reopen
 * without any reset effects.
 */
import { useEffect, useState } from 'react'
import {
  AlertCircle, Check, CheckCircle2, Eye, EyeOff, Info, KeyRound, Loader2, Lock, Mail, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { ApiError, apiFetch } from '@/lib/api-client'

type Step = 'identify' | 'verify' | 'new-password' | 'success'

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

function StrengthChecklist({ value }: { value: string }) {
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

function WizardError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle className="size-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function DoctorForgotPassword({
  open,
  onOpenChange,
  onCompleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when the flow finishes and the wizard closes (parent resets the login form). */
  onCompleted?: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <WizardBody onOpenChange={onOpenChange} onCompleted={onCompleted} /> : null}
    </Dialog>
  )
}

function WizardBody({
  onOpenChange,
  onCompleted,
}: {
  onOpenChange: (open: boolean) => void
  onCompleted?: () => void
}) {
  const [step, setStep] = useState<Step>('identify')
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [sentMessage, setSentMessage] = useState<string | null>(null)

  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  // 30s resend cooldown — politeness only; the server rate-limits regardless.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (sending || !identifier.trim()) return
    setSendError(null)
    setSending(true)
    try {
      // ALWAYS 200 — never hints whether the account exists (anti-enumeration).
      const data = await apiFetch<{ message: string }>('/api/doctor-auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim() }),
      })
      setSentMessage(data.message)
      setCode('')
      setVerifyError(null)
      setCooldown(30)
      setStep('verify')
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Unable to send the verification code. Please try again.')
    } finally {
      setSending(false)
    }
  }

  async function handleResend() {
    if (resending || cooldown > 0 || !identifier.trim()) return
    setResending(true)
    setVerifyError(null)
    try {
      const data = await apiFetch<{ message: string }>('/api/doctor-auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim() }),
      })
      setSentMessage(data.message)
      setCode('')
      setCooldown(30)
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : 'Unable to resend the code. Please try again.')
    } finally {
      setResending(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (verifying || code.length !== 6) return
    setVerifyError(null)
    setVerifying(true)
    try {
      const data = await apiFetch<{ resetToken: string }>('/api/doctor-auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim(), code }),
      })
      setResetToken(data.resetToken)
      setNewPassword('')
      setConfirmPassword('')
      setResetError(null)
      setStep('new-password')
    } catch (err) {
      setVerifyError(err instanceof ApiError ? err.message : 'Verification failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (resetting || !resetToken) return
    const strength = passwordStrength(newPassword)
    if (!Object.values(strength).every(Boolean) || newPassword !== confirmPassword) return
    setResetError(null)
    setResetting(true)
    try {
      await apiFetch<{ message: string }>('/api/doctor-auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ resetToken, newPassword }),
      })
      setStep('success')
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'Unable to reset the password. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  function handleGoToLogin() {
    onCompleted?.()
    onOpenChange(false)
  }

  const strength = passwordStrength(newPassword)
  const allRulesPass = Object.values(strength).every(Boolean)
  const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword

  return (
    <DialogContent className="max-w-sm">
      {step === 'verify' ? (
        <p className="flex items-start gap-2 rounded-md bg-slate-50 p-2.5 text-[11px] leading-relaxed text-muted-foreground dark:bg-white/5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Development note: no mail service is configured in this environment — the 6-digit code is printed to the server console.
        </p>
      ) : null}

      {step === 'identify' ? (
        <form onSubmit={handleSend} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>Enter your Doctor ID or registered email to receive a verification code.</DialogDescription>
          </DialogHeader>

          {sendError ? <WizardError message={sendError} /> : null}

          <div className="space-y-1.5">
            <Label htmlFor="forgot-identifier">Doctor ID / Email</Label>
            <div className="relative rounded-md transition-shadow duration-150 focus-within:ring-4 focus-within:ring-teal-500/10 dark:focus-within:ring-teal-400/20">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                id="forgot-identifier" type="text" autoComplete="username"
                placeholder="ravi@hospital.com or DOC-0001"
                className="h-11 pl-9" value={identifier} required
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="h-11 w-full gap-2 bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98]"
            disabled={sending || !identifier.trim()}
          >
            {sending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Sending…
              </>
            ) : (
              <>
                <KeyRound className="size-4" aria-hidden /> Send Verification Code
              </>
            )}
          </Button>
        </form>
      ) : null}

      {step === 'verify' ? (
        <form onSubmit={handleVerify} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Verification</DialogTitle>
            <DialogDescription>We sent a verification code to your registered contact.</DialogDescription>
          </DialogHeader>

          {sentMessage ? (
            <p className="flex items-start gap-2 rounded-md bg-emerald-50 p-2.5 text-[11px] leading-relaxed text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {sentMessage}
            </p>
          ) : null}

          {verifyError ? <WizardError message={verifyError} /> : null}

          <div className="flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={setCode} disabled={verifying}>
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
            className="h-11 w-full bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98]"
            disabled={verifying || code.length !== 6}
          >
            {verifying ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Verifying…
              </>
            ) : (
              'Verify OTP'
            )}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resending}
              className="mx-auto text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:no-underline dark:text-teal-300 dark:hover:text-teal-200"
            >
              {resending ? 'Resending…' : cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
            </button>
          </div>
        </form>
      ) : null}

      {step === 'new-password' ? (
        <form onSubmit={handleReset} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Create New Password</DialogTitle>
            <DialogDescription>Your new password must meet all the requirements below.</DialogDescription>
          </DialogHeader>

          {resetError ? <WizardError message={resetError} /> : null}

          <div className="space-y-1.5">
            <Label htmlFor="forgot-new-password">New Password</Label>
            <div className="relative rounded-md transition-shadow duration-150 focus-within:ring-4 focus-within:ring-teal-500/10 dark:focus-within:ring-teal-400/20">
              <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                id="forgot-new-password" type={showNew ? 'text' : 'password'}
                autoComplete="new-password" placeholder="Enter a new password"
                className="h-11 pr-10 pl-9" value={newPassword} required
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
              >
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="forgot-confirm-password">Confirm New Password</Label>
            <div className="relative rounded-md transition-shadow duration-150 focus-within:ring-4 focus-within:ring-teal-500/10 dark:focus-within:ring-teal-400/20">
              <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                id="forgot-confirm-password" type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password" placeholder="Repeat the new password"
                className="h-11 pr-10 pl-9" value={confirmPassword} required
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide password confirmation' : 'Show password confirmation'}
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {passwordsMismatch ? (
              <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                Passwords do not match.
              </p>
            ) : null}
          </div>

          <StrengthChecklist value={newPassword} />

          <Button
            type="submit"
            className="h-11 w-full gap-2 bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98]"
            disabled={resetting || !allRulesPass || newPassword !== confirmPassword}
          >
            {resetting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Resetting…
              </>
            ) : (
              <>
                <KeyRound className="size-4" aria-hidden /> Reset Password
              </>
            )}
          </Button>
        </form>
      ) : null}

      {step === 'success' ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/25">
            <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
          </div>
          <DialogHeader className="items-center sm:text-center">
            <DialogTitle>Password Reset Successful</DialogTitle>
            <DialogDescription>Your password has been changed successfully.</DialogDescription>
          </DialogHeader>
          <Button
            type="button"
            onClick={handleGoToLogin}
            className="h-11 w-full bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98]"
          >
            Go to Doctor Login
          </Button>
        </div>
      ) : null}
    </DialogContent>
  )
}
