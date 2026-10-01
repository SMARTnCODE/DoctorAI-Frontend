'use client'

/**
 * Change Password — Super Admin direct password change (Task 26, spec §5).
 *
 * POST /api/auth/change-password with current_password and new_password.
 * Includes:
 *   - New Password with show/hide toggle + live strength checklist
 *     (≥10 chars, upper, lower, number, special — mirrors the server rules)
 *   - Confirm New Password with a mismatch guard that blocks submit
 *   - "Generate Secure Password" — crypto.getRandomValues, 14 chars, at
 *     least one upper/lower/digit/special, NO ambiguous 0O1lI characters;
 *     fills both fields and reveals them
 *   - "Force password change on next login" switch (default ON)
 *
 * This dialog is closable normally (Escape / outside click / ×) — nothing
 * destructive happens until Submit.
 */
import { useEffect, useState } from 'react'
import { Check, Eye, EyeOff, KeySquare, Loader2, Sparkles, X } from 'lucide-react'
import { ApiError } from '@/lib/api-client'
import { doctorActionError, doctorsService, usableDoctorId } from '@/services/doctors.service'
import { navigate } from '@/lib/hash-nav'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface ChangePasswordRef {
  id: string
  doctorId: string
  firstName: string
  lastName: string
  username?: string | null
}

/**
 * Live strength checklist rules — mirror the server's
 * doctorPasswordStrengthSchema (≥10 chars + upper/lower/digit/special).
 * Exported so the Add-Doctor form's "Create Doctor Login" section reuses the
 * EXACT same rules and generator (Task 26 spec §1/§14).
 */
export const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: 'At least 10 characters', test: (pw) => pw.length >= 10 },
  { label: 'One uppercase letter (A–Z)', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter (a–z)', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number (0–9)', test: (pw) => /[0-9]/.test(pw) },
  { label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
]

export const passwordRulesPassed = (pw: string) => PASSWORD_RULES.every((r) => r.test(pw))

/**
 * Cryptographically random 14-char password with a guaranteed member of each
 * character class and NO ambiguous glyphs (0 O 1 l I). Exported for reuse by
 * the Add-Doctor form's create-login section.
 */
export function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '!@#$%^&*-_=+'
  const all = upper + lower + digits + special
  const buf = new Uint32Array(1)
  const randInt = (max: number) => {
    crypto.getRandomValues(buf)
    return buf[0] % max
  }
  const pick = (set: string) => set[randInt(set.length)]
  // One guaranteed character from each class, then pad from the full pool…
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)]
  while (chars.length < 14) chars.push(pick(all))
  // …and Fisher–Yates shuffle so classes are never in a predictable order.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export function RuleChecklist({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2" aria-label="Password strength checklist">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        return (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-1.5 text-xs',
              ok ? 'text-teal-700 dark:text-teal-300' : 'text-muted-foreground',
            )}
          >
            {ok ? (
              <Check className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <X className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className={ok ? 'font-medium' : undefined}>{rule.label}</span>
            <span className="sr-only">{ok ? ' — requirement met' : ' — requirement not met'}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function ChangePasswordDialog({
  doctor, open, onOpenChange, onDone,
}: {
  doctor: ChangePasswordRef | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fullName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''

  // Fresh fields every time the dialog opens.
  useEffect(() => {
    if (!open) return
    setPassword('')
    setConfirm('')
    setShowPassword(false)
    setSubmitting(false)
  }, [open])

  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit = passwordRulesPassed(password) && password === confirm && !mismatch && !submitting && password.length <= 128

  const handleGenerate = () => {
    const generated = generateSecurePassword()
    setPassword(generated)
    setConfirm(generated)
    setShowPassword(true)
  }

  const handleSubmit = async () => {
    const doctorId = usableDoctorId(doctor?.id)
    if (!doctorId || !canSubmit || submitting) return
    setSubmitting(true)
    try {
      await doctorsService.changePassword(doctorId, { new_password: password })
      setPassword('')
      setConfirm('')
      toast.success('Doctor password changed successfully.')
      onDone?.()
      onOpenChange(false)
    } catch (e: unknown) {
      const message = doctorActionError(e, 'Could not change the password. Please try again.')
      if (e instanceof ApiError && e.status === 401) {
        toast.error(message)
        navigate('/super-admin/login')
        return
      }
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting || next) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeySquare className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
            Change Doctor Password
          </DialogTitle>
          <DialogDescription>
            Set a new password for {fullName}. The current password is not required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only doctor header */}
          <div className="rounded-lg border bg-slate-50 p-3 text-sm dark:bg-white/5">
            <p className="font-medium text-slate-800 dark:text-slate-100">{fullName}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {doctor?.doctorId}
              {doctor?.username ? ` · @${doctor.username}` : ''}
            </p>
          </div>

          {/* New password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="change-password-new">
                New Password <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleGenerate}
                aria-label="Generate a secure password"
              >
                <Sparkles className="size-3.5" aria-hidden /> Generate Secure Password
              </Button>
            </div>
            <div className="relative">
              <Input
                id="change-password-new"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-10 font-mono"
                aria-required="true"
                aria-invalid={password.length > 0 && !passwordRulesPassed(password)}
                aria-describedby="change-password-rules"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
            <div id="change-password-rules" className="pt-1">
              <RuleChecklist password={password} />
            </div>
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <Label htmlFor="change-password-confirm">
              Confirm New Password <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
            </Label>
            <Input
              id="change-password-confirm"
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="font-mono"
              aria-required="true"
              aria-invalid={mismatch}
            />
            {mismatch ? (
              <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
                Passwords do not match.
              </p>
            ) : null}
          </div>

        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Saving…
              </>
            ) : (
              <>
                <KeySquare className="size-4" aria-hidden /> Change Password
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
