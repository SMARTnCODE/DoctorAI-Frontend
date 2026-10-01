'use client'

/**
 * Hospital Super Admin signup — full-page registration matching the
 * Create Hospital Admin Account design. No email/mobile OTP verification.
 * Extra fields (name, mobile, country, consent) are validated client-side
 * and sent with the signup payload. On success the user is sent to login.
 */
import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  Hospital,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/components/hospital/auth-context'
import { navigate } from '@/lib/hash-nav'
import { ApiError } from '@/lib/api-client'

const STEPS = ['Account Details', 'Finish'] as const

const COUNTRIES = [
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
  { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
] as const

type CountryCode = (typeof COUNTRIES)[number]['code']

function passwordChecks(password: string) {
  return [
    { label: 'Minimum 8 characters', ok: password.length >= 8 },
    { label: 'At least 1 uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'At least 1 lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'At least 1 number', ok: /\d/.test(password) },
    { label: 'At least 1 special character', ok: /[^A-Za-z0-9]/.test(password) },
  ]
}

const fieldClass =
  'h-11 w-full rounded-lg border border-white/10 bg-[#141A1C] text-white shadow-none placeholder:text-slate-500 focus-visible:border-teal-500/60 focus-visible:ring-teal-500/20'

export function SignupPage() {
  const { signup } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [dialCountry, setDialCountry] = useState<CountryCode>('IN')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [hospitalName, setHospitalName] = useState('')
  const [country, setCountry] = useState<string>('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checks = useMemo(() => passwordChecks(password), [password])
  const passwordValid = checks.every((c) => c.ok)
  const dial = COUNTRIES.find((c) => c.code === dialCountry) ?? COUNTRIES[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (!passwordValid) {
      setError('Password does not meet the required strength rules.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!agreeTerms || !agreePrivacy) {
      setError('Please accept the Terms & Conditions and Privacy Policy.')
      return
    }
    if (!country) {
      setError('Please select your country.')
      return
    }

    const selectedCountry = COUNTRIES.find((c) => c.code === country)

    setSubmitting(true)
    try {
      await signup({
        full_name: fullName.trim(),
        work_email: email.trim(),
        country_code: dial.dial,
        mobile_number: mobile.trim(),
        password,
        confirm_password: confirmPassword,
        hospital_name: hospitalName.trim(),
        country: selectedCountry?.name ?? country,
        terms_accepted: agreeTerms,
        privacy_policy_accepted: agreePrivacy,
      })
      navigate('/super-admin/login?registered=1')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to create account. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="hms-login-backdrop min-h-screen px-4 py-10 text-white sm:px-6 lg:px-8"
      data-testid="super-admin-signup"
    >
      <div className="mx-auto flex w-full max-w-[640px] flex-col items-center">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-teal-500/20 ring-1 ring-teal-400/40">
            <Hospital className="size-6 text-teal-300" aria-hidden />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-[28px]">
            Create Hospital Admin Account
          </h1>
          <p className="mt-2 max-w-md text-sm text-white/55">
            Register your hospital and create your administrator account.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-teal-400/35 bg-teal-500/10 px-3 py-1 text-[10px] font-semibold tracking-[0.14em] text-teal-300 uppercase">
            <Sparkles className="size-3" aria-hidden />
            Doctor AI · Healthcare Platform
          </span>
        </div>

        {/* Stepper — Account Details → Finish (no email/mobile verification) */}
        <ol className="mt-8 flex w-full max-w-sm items-center justify-between" aria-label="Signup progress">
          {STEPS.map((label, i) => {
            const active = i === 0
            return (
              <li key={label} className="relative flex flex-1 flex-col items-center gap-2">
                {i < STEPS.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-4 left-[calc(50%+18px)] h-px w-[calc(100%-36px)] bg-white/15"
                  />
                ) : null}
                <span
                  className={
                    active
                      ? 'relative z-10 flex size-8 items-center justify-center rounded-full bg-teal-500 text-sm font-semibold text-white'
                      : 'relative z-10 flex size-8 items-center justify-center rounded-full border border-white/20 bg-[#0E1416] text-sm font-medium text-white/45'
                  }
                >
                  {i + 1}
                </span>
                <span
                  className={
                    active
                      ? 'text-[11px] font-semibold text-teal-300'
                      : 'text-[11px] font-medium text-white/40'
                  }
                >
                  {label}
                </span>
              </li>
            )
          })}
        </ol>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-8 w-full rounded-2xl border border-white/10 bg-[#11181C]/95 p-5 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-7"
        >
          {error ? (
            <Alert variant="destructive" role="alert" className="mb-6" data-testid="signup-error">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {/* Super Admin Details */}
          <SectionHeader icon={User} title="Super Admin Details" />
          <div className="mt-4 space-y-4">
            <Field label="Full Name" htmlFor="signup-full-name" required>
              <Input
                id="signup-full-name"
                type="text"
                autoComplete="name"
                placeholder="Enter your full name"
                className={fieldClass}
                value={fullName}
                required
                minLength={2}
                onChange={(e) => setFullName(e.target.value)}
                data-testid="signup-full-name"
              />
            </Field>

            <Field label="Work Email" htmlFor="signup-email" required>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your official email"
                  className={`${fieldClass} pl-9`}
                  value={email}
                  required
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="signup-email"
                />
              </div>
            </Field>

            <Field label="Mobile Number" htmlFor="signup-mobile" required>
              <div className="flex items-stretch gap-2">
                <Select value={dialCountry} onValueChange={(v) => setDialCountry(v as CountryCode)}>
                  <SelectTrigger
                    className="!h-11 h-11 w-[128px] shrink-0 rounded-lg border border-white/10 bg-[#141A1C] px-2.5 py-0 text-white shadow-none focus:ring-teal-500/20 data-[size=default]:!h-11 data-[size=default]:h-11"
                    aria-label="Country dial code"
                  >
                    <SelectValue>
                      <span className="flex items-center gap-1 text-sm leading-none">
                        <span aria-hidden>{dial.flag}</span>
                        <span>{dial.code}</span>
                        <span className="text-slate-400">{dial.dial}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.flag} {c.code} {c.dial}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative min-w-0 flex-1">
                  <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
                  <Input
                    id="signup-mobile"
                    type="tel"
                    autoComplete="tel-national"
                    inputMode="numeric"
                    placeholder="Enter mobile number"
                    className={`${fieldClass} !h-11 h-11 py-0 pl-9 leading-none`}
                    value={mobile}
                    required
                    pattern="[0-9]{8,15}"
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 15))}
                    data-testid="signup-mobile"
                  />
                </div>
              </div>
            </Field>

            <Field label="Password" htmlFor="signup-password" required>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <Input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  className={`${fieldClass} pr-10 pl-9`}
                  value={password}
                  required
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="signup-password"
                  aria-describedby="password-requirements"
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:text-white"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <ul
                id="password-requirements"
                className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2"
              >
                {checks.map((c) => (
                  <li
                    key={c.label}
                    className={`flex items-center gap-1.5 text-[11px] ${c.ok ? 'text-teal-400' : 'text-slate-500'}`}
                  >
                    {c.ok ? (
                      <Check className="size-3 shrink-0" aria-hidden />
                    ) : (
                      <X className="size-3 shrink-0 text-rose-400/80" aria-hidden />
                    )}
                    {c.label}
                  </li>
                ))}
              </ul>
            </Field>

            <Field label="Confirm Password" htmlFor="signup-confirm" required>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <Input
                  id="signup-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Confirm your password"
                  className={`${fieldClass} pr-10 pl-9`}
                  value={confirmPassword}
                  required
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  data-testid="signup-confirm-password"
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:text-white"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
          </div>

          {/* Hospital Details */}
          <div className="mt-8">
            <SectionHeader icon={Building2} title="Hospital Details" />
            <div className="mt-4 space-y-4">
              <Field label="Hospital / Organization Name" htmlFor="signup-hospital" required>
                <Input
                  id="signup-hospital"
                  type="text"
                  autoComplete="organization"
                  placeholder="Enter hospital name"
                  className={fieldClass}
                  value={hospitalName}
                  required
                  minLength={2}
                  onChange={(e) => setHospitalName(e.target.value)}
                  data-testid="signup-hospital-name"
                />
              </Field>

              <Field label="Country" htmlFor="signup-country" required>
                <Select value={country || undefined} onValueChange={setCountry}>
                  <SelectTrigger
                    id="signup-country"
                    className={`h-11 w-full rounded-lg border-white/10 bg-[#141A1C] text-white focus:ring-teal-500/20 ${
                      country ? '' : 'text-slate-500'
                    }`}
                    data-testid="signup-country"
                  >
                    <SelectValue placeholder="Select your country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.flag} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          {/* Consent */}
          <div className="mt-8">
            <SectionHeader icon={ShieldCheck} title="Consent" />
            <div className="mt-4 space-y-3">
              <ConsentRow
                id="agree-terms"
                checked={agreeTerms}
                onCheckedChange={setAgreeTerms}
                testId="signup-agree-terms"
              >
                I agree to the{' '}
                <a href="#/legal/terms" className="font-medium text-teal-400 hover:underline">
                  Terms &amp; Conditions
                </a>
              </ConsentRow>
              <ConsentRow
                id="agree-privacy"
                checked={agreePrivacy}
                onCheckedChange={setAgreePrivacy}
                testId="signup-agree-privacy"
              >
                I have read and agree to the{' '}
                <a href="#/legal/privacy" className="font-medium text-teal-400 hover:underline">
                  Privacy Policy
                </a>
              </ConsentRow>
            </div>
          </div>

          <Button
            type="submit"
            className="mt-8 h-11 w-full gap-2 rounded-lg bg-teal-600 text-sm font-semibold text-white shadow-sm shadow-teal-600/25 hover:bg-teal-500 active:scale-[0.99]"
            disabled={submitting}
            data-testid="signup-submit"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Creating account…
              </>
            ) : (
              <>
                Create Hospital Account
                <ArrowRight className="size-4" aria-hidden />
              </>
            )}
          </Button>

          <p className="mt-5 text-center text-sm text-white/50">
            Already have an account?{' '}
            <button
              type="button"
              className="font-semibold text-teal-400 hover:underline"
              onClick={() => navigate('/super-admin/login')}
              data-testid="signup-signin-link"
            >
              Sign in
            </button>
          </p>
        </form>

        <p className="mt-8 max-w-md text-center text-[11px] leading-relaxed text-white/35">
          Protected health information (ePHI) is encrypted in transit and monitored. HIPAA-aligned
          safeguards.
        </p>
      </div>
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: typeof User
  title: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-teal-400" aria-hidden />
      <h2 className="text-[11px] font-semibold tracking-[0.14em] text-teal-400 uppercase">
        {title}
      </h2>
      <div className="h-px flex-1 bg-white/10" aria-hidden />
    </div>
  )
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] text-slate-300">
        {label}
        {required ? <span className="text-rose-400"> *</span> : null}
      </Label>
      {children}
    </div>
  )
}

function ConsentRow({
  id,
  checked,
  onCheckedChange,
  children,
  testId,
}: {
  id: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  children: React.ReactNode
  testId: string
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-[#141A1C]/80 px-3.5 py-3 text-sm text-slate-300 transition-colors hover:border-white/15"
      data-testid={testId}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5 border-white/25 data-[state=checked]:border-teal-500 data-[state=checked]:bg-teal-600"
      />
      <span>{children}</span>
    </label>
  )
}
