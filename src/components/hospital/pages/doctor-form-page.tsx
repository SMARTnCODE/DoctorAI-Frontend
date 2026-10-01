'use client'

/**
 * Doctor form — create / edit a doctor record.
 * Create: POST /api/admin/doctors (snake_case body). Edit: loads the full
 * profile, then PUT /api/admin/doctors/{id}. Resume uploads go to a separate
 * POST /api/admin/doctors/{id}/resume after create/update when a file is pending.
 * Validation is client-side first; server 409/422 messages surface via toast.
 * Create mode always provisions portal login: create_login is true and
 * temporary_password / confirm_password are required (force_password_change
 * still optional).
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft, Briefcase, Eye, EyeOff, Info, KeyRound, Loader2, RefreshCw, Save,
  Sparkles, Stethoscope, UserRound, UserX, X,
} from 'lucide-react'
import { ApiError } from '@/lib/api-client'
import { useApiData } from '@/hooks/use-api-data'
import type { SpecializationDropdownItem } from '@/services/specializations.service'
import type { DepartmentListResponse } from '@/services/departments.service'
import {
  DOCTOR_ACTION_UNAVAILABLE,
  doctorsService,
  doctorIdFromResponse,
  mapAdminDoctorDetail,
  usableDoctorId,
  type DoctorCreatePayload,
} from '@/services/doctors.service'
import { formatDateTime, initials } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { PageHeader } from '@/components/hospital/page-header'
import { EmptyState } from '@/components/hospital/empty-state'
import {
  ResumeDropzone, ResumeFileRow, validateResumeFile, type ResumeMeta,
} from '@/components/hospital/resume-upload'
import {
  generateSecurePassword, passwordRulesPassed, RuleChecklist,
} from '@/components/hospital/change-password-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const DESIGNATIONS = [
  'Consultant', 'Senior Consultant', 'Specialist', 'Senior Specialist',
  'Junior Doctor', 'Medical Officer', 'Head of Department',
] as const
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UNSET = '__UNSET__'

interface DoctorDetailFields {
  id: string; doctorId: string; firstName: string; lastName: string
  photo: string | null; gender: string | null; dateOfBirth: string | null
  phone: string | null; email: string; address: string | null
  registrationNumber: string; qualification: string | null; university: string | null
  graduationYear: number | null; experienceYears: number | null
  designation: string | null; consultationType: string | null; consultationFee: number | null
  /** Task 26 — employment / HR fields. */
  employeeId: string | null; employmentType: string | null; joinDate: string | null
  about: string | null; languages: string | null; roomNumber: string | null
  availableDays: string | null; status: string
  /** Task 23 — resume/CV metadata on file (GET /api/doctors/[id]); null = none. */
  resume: {
    fileName: string; fileType: string; fileSize: number
    uploadedAt: string; uploadedBy: string | null
  } | null
  updatedByName: string | null; updatedAt: string
  department: { id: string; name: string; code: string } | null
  specializations: {
    id: string; isPrimary: boolean
    specialization: { id: string; name: string; description: string | null; status: string }
  }[]
}
interface DoctorDetailResponse { doctor: DoctorDetailFields }

interface DoctorFormState {
  firstName: string; lastName: string; photo: string; gender: string; dateOfBirth: string
  phone: string; email: string; address: string; registrationNumber: string
  qualification: string; university: string; graduationYear: string; experienceYears: string
  designation: string; consultationType: string; consultationFee: string
  about: string; languages: string; roomNumber: string; status: string; departmentId: string
  employeeId: string; employmentType: string; joinDate: string
}

const EMPTY_FORM: DoctorFormState = {
  firstName: '', lastName: '', photo: '', gender: '', dateOfBirth: '',
  phone: '', email: '', address: '', registrationNumber: '',
  qualification: '', university: '', graduationYear: '', experienceYears: '',
  designation: '', consultationType: '', consultationFee: '',
  about: '', languages: '', roomNumber: '', status: 'ACTIVE', departmentId: '',
  employeeId: '', employmentType: '', joinDate: '',
}

function toFormState(d: DoctorDetailFields): DoctorFormState {
  return {
    firstName: d.firstName,
    lastName: d.lastName,
    photo: d.photo ?? '',
    gender: d.gender ?? '',
    dateOfBirth: d.dateOfBirth ? d.dateOfBirth.slice(0, 10) : '',
    phone: d.phone ?? '',
    email: d.email,
    address: d.address ?? '',
    registrationNumber: d.registrationNumber,
    qualification: d.qualification ?? '',
    university: d.university ?? '',
    graduationYear: d.graduationYear != null ? String(d.graduationYear) : '',
    experienceYears: d.experienceYears != null ? String(d.experienceYears) : '',
    designation: d.designation ?? '',
    consultationType: d.consultationType ?? '',
    consultationFee: d.consultationFee != null ? String(d.consultationFee) : '',
    about: d.about ?? '',
    languages: d.languages ?? '',
    roomNumber: d.roomNumber ?? '',
    status: d.status,
    departmentId: d.department?.id ?? '',
    employeeId: d.employeeId ?? '',
    employmentType: d.employmentType ?? '',
    joinDate: d.joinDate ? d.joinDate.slice(0, 10) : '',
  }
}

function handleApiError(e: unknown, fallback = 'Something went wrong. Please try again.') {
  if (e instanceof ApiError && e.status === 401) {
    toast.error('Session expired. Please sign in again.')
    navigate('/super-admin/login')
    return
  }
  toast.error(e instanceof ApiError ? e.message : fallback)
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">{message}</p>
  )
}

function FormSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-64" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function DoctorForm({ mode, doctorId, doctorIdDisplay, initial, initialSpecIds, initialDays, initialResume }: {
  mode: 'create' | 'edit'
  doctorId?: string
  doctorIdDisplay?: string
  initial: DoctorFormState
  initialSpecIds: string[]
  initialDays: string[]
  /** Task 23 — resume already stored server-side (edit mode); create mode passes null. */
  initialResume: ResumeMeta | null
}) {
  const [form, setForm] = useState<DoctorFormState>(initial)
  const [specializationId, setSpecializationId] = useState(initialSpecIds[0] ?? '')
  const [days, setDays] = useState<string[]>(initialDays)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  // Task 23 — resume upload state machine:
  //   storedResume  — resume already on the server (edit mode); nulled only by Remove.
  //   resumeRemoved — stored resume was removed this session (drives PUT resume:null).
  //   pendingFile   — newly picked File, not yet saved (row shows "Not saved yet").
  //   showDropzone  — Replace was clicked; the dropzone overlays the row until a pick.
  const [storedResume, setStoredResume] = useState<ResumeMeta | null>(initialResume)
  const [resumeRemoved, setResumeRemoved] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showDropzone, setShowDropzone] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  // Create-time login is always provisioned. temporary_password and
  // confirm_password are required; force_password_change stays optional.
  const [loginPassword, setLoginPassword] = useState('')
  const [loginConfirm, setLoginConfirm] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [forceLoginChange, setForceLoginChange] = useState(true)

  const { data: deptData } = useApiData<DepartmentListResponse>(
    '/api/admin/departments?status=ACTIVE&page_size=100',
  )
  const departments = deptData?.items ?? []

  /** Specialization dropdown — GET /api/admin/specializations/dropdown (scoped by department when set). */
  const specsDropdownPath = useMemo(() => {
    const params = new URLSearchParams()
    if (form.departmentId) params.set('department_id', form.departmentId)
    const qs = params.toString()
    return `/api/admin/specializations/dropdown${qs ? `?${qs}` : ''}`
  }, [form.departmentId])

  const { data: specOptions } = useApiData<SpecializationDropdownItem[]>(specsDropdownPath)
  const specializations = specOptions ?? []

  // Drop specialization if it is no longer in the department-scoped list.
  useEffect(() => {
    if (!specializationId || !specOptions) return
    if (!specOptions.some((sp) => sp.id === specializationId)) {
      setSpecializationId('')
    }
  }, [specOptions, specializationId])

  const setField = (key: keyof DoctorFormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const toggleDay = (day: string) => {
    setDays((prev) => (prev.includes(day) ? prev.filter((x) => x !== day) : [...prev, day]))
  }

  /** Clear a login-section validation error as the admin types. */
  const clearError = (key: string) => {
    setErrors((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const handleGenerateLoginPassword = () => {
    const generated = generateSecurePassword()
    setLoginPassword(generated)
    setLoginConfirm(generated)
    setShowLoginPassword(true)
    clearError('loginPassword')
    clearError('loginConfirm')
  }

  // Resume pick/clear handlers. An invalid file is never accepted:
  // the dropzone keeps its inline error and a toast mirrors the message.
  const handleResumePick = (file: File) => {
    const message = validateResumeFile(file)
    if (message) {
      setResumeError(message)
      toast.error(message)
      return
    }
    setResumeError(null)
    setPendingFile(file)
    setShowDropzone(false)
  }

  const handleRemoveStoredResume = () => {
    setStoredResume(null)
    setResumeRemoved(true)
  }

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {}
    if (!form.firstName.trim()) errs.firstName = 'First name is required'
    if (!form.lastName.trim()) errs.lastName = 'Last name is required'
    if (!form.phone.trim()) errs.phone = 'Phone number is required'
    else if (form.phone.trim().length < 7) errs.phone = 'Enter at least 7 characters'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!EMAIL_RE.test(form.email.trim())) errs.email = 'Enter a valid email address'
    if (mode === 'create' && !form.registrationNumber.trim()) {
      errs.registrationNumber = 'Medical registration number is required'
    }
    if (!form.departmentId) errs.departmentId = 'Department is required'
    if (!specializationId) errs.specializationId = 'Specialization is required'
    else if (specializations.length > 0 && !specializations.some((sp) => sp.id === specializationId)) {
      errs.specializationId = 'The selected specialization must belong to the selected department.'
    }
    // Portal credentials are required on create so the login email is always sent.
    if (mode === 'create') {
      if (!loginPassword) {
        errs.loginPassword = 'Temporary password is required'
      } else if (!passwordRulesPassed(loginPassword)) {
        errs.loginPassword = 'Password does not meet the strength requirements below.'
      }
      if (!loginConfirm) {
        errs.loginConfirm = 'Confirm password is required'
      } else if (loginPassword !== loginConfirm) {
        errs.loginConfirm = 'Passwords do not match.'
      }
    }
    return errs
  }

  const numOrNull = (v: string): number | null => {
    const t = v.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isNaN(n) ? null : n
  }

  const languagesToArray = (raw: string): string[] =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

  const buildPayload = (): DoctorCreatePayload => {
    const payload: DoctorCreatePayload = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      gender: form.gender || null,
      date_of_birth: form.dateOfBirth || null,
      phone_number: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim() || null,
      photo_url: form.photo.trim() || null,
      medical_registration_number: form.registrationNumber.trim(),
      qualification: form.qualification.trim() || null,
      university_institution: form.university.trim() || null,
      graduation_year: numOrNull(form.graduationYear),
      experience_years: numOrNull(form.experienceYears),
      specialization_ids: specializationId ? [specializationId] : [],
      department_id: form.departmentId || null,
      designation: form.designation || null,
      consultation_type: form.consultationType || null,
      doctor_status: form.status || 'ACTIVE',
      employee_id: form.employeeId.trim() || null,
      employment_type: form.employmentType || null,
      join_date: form.joinDate || null,
      about_doctor: form.about.trim() || null,
      languages: languagesToArray(form.languages),
      consultation_fee: numOrNull(form.consultationFee),
      room_number: form.roomNumber.trim() || null,
      available_days: days.length > 0 ? days : [],
    }

    if (mode === 'create') {
      payload.create_login = true
      payload.force_password_change = forceLoginChange
      payload.temporary_password = loginPassword
      payload.confirm_password = loginConfirm
    }

    return payload
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      toast.error('Please fix the highlighted fields.')
      return
    }
    setSubmitting(true)
    try {
      const payload = buildPayload()

      let savedId: string | null = null
      if (mode === 'create') {
        const res = await doctorsService.create(payload)
        savedId = doctorIdFromResponse(res)
        toast.success('Doctor created')
        toast.success('Doctor login credentials created')
      } else {
        if (!doctorId) throw new Error('Missing doctor id')
        const res = await doctorsService.update(doctorId, payload)
        savedId = doctorIdFromResponse(res) ?? doctorId
        toast.success('Doctor updated')
      }

      // Resume is a separate multipart upload (not in the JSON create body).
      if (pendingFile && savedId) {
        try {
          await doctorsService.uploadResume(savedId, pendingFile)
          toast.success('Resume uploaded')
        } catch (resumeErr: unknown) {
          handleApiError(resumeErr, 'Doctor saved, but resume upload failed.')
        }
      } else if (mode === 'edit' && resumeRemoved && savedId) {
        toast.info(DOCTOR_ACTION_UNAVAILABLE)
      }

      navigate(
        mode === 'create' && savedId
          ? `/super-admin/doctors/${savedId}`
          : `/super-admin/doctors/${doctorId ?? savedId}`,
      )
    } catch (err: unknown) {
      handleApiError(err, mode === 'create' ? 'Failed to create doctor.' : 'Failed to update doctor.')
    } finally {
      setSubmitting(false)
    }
  }

  const previewInitials = initials(`${form.firstName} ${form.lastName}`.trim()) || 'DR'

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-6">
      {/* ── Personal Information ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Personal Information
          </CardTitle>
          <CardDescription>Identity and contact details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="doctor-photo">Photo URL</Label>
              <Input
                id="doctor-photo"
                value={form.photo}
                onChange={(e) => setField('photo', e.target.value)}
                placeholder="https://example.com/portrait.jpg"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Optional — paste an image URL. A monogram is shown when empty.
              </p>
            </div>
            <Avatar className="size-16 shrink-0 border bg-slate-50 dark:bg-white/5">
              {form.photo.trim() ? (
                <AvatarImage src={form.photo.trim()} alt="Doctor photo preview" />
              ) : null}
              <AvatarFallback className="bg-teal-50 text-sm font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                {previewInitials}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="first-name">
                First Name <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
              </Label>
              <Input
                id="first-name"
                value={form.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
                autoComplete="given-name"
                aria-required="true"
                aria-invalid={Boolean(errors.firstName)}
              />
              <FieldError message={errors.firstName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last-name">
                Last Name <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
              </Label>
              <Input
                id="last-name"
                value={form.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
                autoComplete="family-name"
                aria-required="true"
                aria-invalid={Boolean(errors.lastName)}
              />
              <FieldError message={errors.lastName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={form.gender || UNSET}
                onValueChange={(v) => setField('gender', v === UNSET ? '' : v)}
              >
                <SelectTrigger id="gender" className="w-full">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not specified</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dob">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setField('dateOfBirth', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                Phone Number <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="+1 555 0100"
                autoComplete="tel"
                aria-required="true"
                aria-invalid={Boolean(errors.phone)}
              />
              <FieldError message={errors.phone} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">
                Email <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="doctor@hospital.com"
                autoComplete="email"
                aria-required="true"
                aria-invalid={Boolean(errors.email)}
              />
              <FieldError message={errors.email} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
                rows={2}
                placeholder="Street, city, postal code"
              />
            </div>
          </div>

          {/* Task 23 — Doctor Resume / CV: optional upload (PDF/DOC/DOCX, ≤ 5 MB).
              Dropzone shows when Replace is clicked or nothing is stored/pending;
              otherwise a pending-draft or stored-resume row takes its place. */}
          <div className="space-y-1.5">
            <Label htmlFor="doctor-resume-upload">Doctor Resume / CV</Label>
            {showDropzone ? (
              <ResumeDropzone
                id="doctor-resume-upload"
                onFile={handleResumePick}
                disabled={submitting}
                error={resumeError}
              />
            ) : pendingFile ? (
              <ResumeFileRow
                meta={{ fileName: pendingFile.name, fileSize: pendingFile.size }}
                pending
                testId="doctor-resume-row-pending"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => setShowDropzone(true)}
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => setPendingFile(null)}
                >
                  <X className="size-3.5" aria-hidden /> Remove
                </Button>
              </ResumeFileRow>
            ) : storedResume ? (
              <ResumeFileRow meta={storedResume} testId="doctor-resume-row-stored">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => setShowDropzone(true)}
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={handleRemoveStoredResume}
                >
                  Remove
                </Button>
              </ResumeFileRow>
            ) : (
              <ResumeDropzone
                id="doctor-resume-upload"
                onFile={handleResumePick}
                disabled={submitting}
                error={resumeError}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Optional — Upload the doctor's professional resume/CV.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Professional Information ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Professional Information
          </CardTitle>
          <CardDescription>Registration, qualifications and assignment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* <div className="space-y-1.5">
              <Label htmlFor="doctor-id">Doctor ID</Label>
              {mode === 'edit' && doctorIdDisplay ? (
                <Input id="doctor-id" value={doctorIdDisplay} readOnly disabled className="font-mono text-muted-foreground" />
              ) : (
                <Input
                  id="doctor-id"
                  value="Automatically generated on save"
                  disabled
                  className="text-muted-foreground"
                />
              )}
            </div> */}
            <div className="space-y-1.5">
              <Label htmlFor="reg-number">
                Medical Registration Number{' '}
                {mode === 'create' ? <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span> : null}
              </Label>
              <Input
                id="reg-number"
                value={form.registrationNumber}
                onChange={(e) => setField('registrationNumber', e.target.value)}
                placeholder="e.g. MCI-2019-44821"
                aria-required={mode === 'create'}
                aria-invalid={Boolean(errors.registrationNumber)}
              />
              <FieldError message={errors.registrationNumber} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qualification">Qualification</Label>
              <Input
                id="qualification"
                value={form.qualification}
                onChange={(e) => setField('qualification', e.target.value)}
                placeholder="MBBS, MD"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="university">University / Institution</Label>
              <Input
                id="university"
                value={form.university}
                onChange={(e) => setField('university', e.target.value)}
                placeholder="e.g. Johns Hopkins University"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grad-year">Graduation Year</Label>
              <Input
                id="grad-year"
                type="number"
                min={1950}
                max={2100}
                value={form.graduationYear}
                onChange={(e) => setField('graduationYear', e.target.value)}
                placeholder="e.g. 2015"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="experience">Experience (years)</Label>
              <Input
                id="experience"
                type="number"
                min={0}
                max={70}
                value={form.experienceYears}
                onChange={(e) => setField('experienceYears', e.target.value)}
                placeholder="e.g. 8"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="department">
                Department <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
              </Label>
              <Select
                value={form.departmentId || undefined}
                onValueChange={(v) => setField('departmentId', v)}
              >
                <SelectTrigger
                  id="department"
                  className="w-full"
                  aria-required="true"
                  aria-invalid={Boolean(errors.departmentId)}
                >
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dep) => (
                    <SelectItem key={dep.id} value={dep.id}>
                      {dep.name} ({dep.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.departmentId} />
              {deptData && departments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active departments available.</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="specialization">
                Specialization <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
              </Label>
              <Select
                value={specializationId || undefined}
                onValueChange={(v) => {
                  setSpecializationId(v)
                  clearError('specializationId')
                }}
              >
                <SelectTrigger
                  id="specialization"
                  className="w-full"
                  aria-required="true"
                  aria-invalid={Boolean(errors.specializationId)}
                >
                  <SelectValue placeholder="Select specialization" />
                </SelectTrigger>
                <SelectContent>
                  {specializations.map((sp) => (
                    <SelectItem key={sp.id} value={sp.id}>
                      {sp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.specializationId} />
              {specOptions && specializations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {form.departmentId
                    ? 'No specializations for this department.'
                    : 'No active specializations available.'}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="designation">Designation / Post</Label>
              <Select
                value={form.designation || UNSET}
                onValueChange={(v) => setField('designation', v === UNSET ? '' : v)}
              >
                <SelectTrigger id="designation" className="w-full">
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not specified</SelectItem>
                  {DESIGNATIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="consult-type">Consultation Type</Label>
              <Select
                value={form.consultationType || UNSET}
                onValueChange={(v) => setField('consultationType', v === UNSET ? '' : v)}
              >
                <SelectTrigger id="consult-type" className="w-full">
                  <SelectValue placeholder="Select consultation type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not specified</SelectItem>
                  <SelectItem value="In-Person">In-Person</SelectItem>
                  <SelectItem value="Video">Video</SelectItem>
                  <SelectItem value="Both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doctor-status">Doctor Status</Label>
              <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                <SelectTrigger id="doctor-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Employment (Task 26) ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Employment
          </CardTitle>
          <CardDescription>HR classification and joining details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="employee-id">Employee ID</Label>
              <Input
                id="employee-id"
                value={form.employeeId}
                onChange={(e) => setField('employeeId', e.target.value)}
                placeholder="e.g. EMP-10234"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="employment-type">Employment Type</Label>
              <Select
                value={form.employmentType || UNSET}
                onValueChange={(v) => setField('employmentType', v === UNSET ? '' : v)}
              >
                <SelectTrigger id="employment-type" className="w-full">
                  <SelectValue placeholder="Select employment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not specified</SelectItem>
                  <SelectItem value="FULL_TIME">Full-time</SelectItem>
                  <SelectItem value="PART_TIME">Part-time</SelectItem>
                  <SelectItem value="CONTRACT">Contract</SelectItem>
                  <SelectItem value="LOCUM">Locum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="join-date">Join Date</Label>
              <Input
                id="join-date"
                type="date"
                value={form.joinDate}
                onChange={(e) => setField('joinDate', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Additional Information ───────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Additional Information
          </CardTitle>
          <CardDescription>Practice details shown on the doctor profile</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="about">About Doctor</Label>
            <Textarea
              id="about"
              value={form.about}
              onChange={(e) => setField('about', e.target.value)}
              rows={4}
              placeholder="Short professional biography…"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="languages">Languages</Label>
              <Input
                id="languages"
                value={form.languages}
                onChange={(e) => setField('languages', e.target.value)}
                placeholder="English, Mandarin, Hindi"
              />
              <p className="text-xs text-muted-foreground">Comma separated.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee">Consultation Fee</Label>
              <Input
                id="fee"
                type="number"
                min={0}
                step="0.01"
                value={form.consultationFee}
                onChange={(e) => setField('consultationFee', e.target.value)}
                placeholder="e.g. 120"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room">Room Number</Label>
              <Input
                id="room"
                value={form.roomNumber}
                onChange={(e) => setField('roomNumber', e.target.value)}
                placeholder="e.g. 204-B"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Available Days</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Select available days">
              {WEEK_DAYS.map((day) => {
                const selected = days.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none',
                      selected
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-teal-500/40 dark:hover:text-teal-300',
                    )}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Create Doctor Login (create mode only, Task 26) ──── */}
      {mode === 'create' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> Create Doctor Login
            </CardTitle>
            <CardDescription>
              Portal credentials are required and sent to the doctor&apos;s email
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A portal login is created with the doctor. The temporary password is emailed so they can sign in.
            </p>
            <div className="space-y-4 rounded-lg border p-4">
                {/* Temporary password + generator + live strength checklist */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="login-password">
                      Temporary Password <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleGenerateLoginPassword}
                      disabled={submitting}
                      aria-label="Generate a secure password"
                    >
                      <Sparkles className="size-3.5" aria-hidden /> Generate Secure Password
                    </Button>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value)
                        clearError('loginPassword')
                      }}
                      autoComplete="new-password"
                      className="pr-10 font-mono"
                      disabled={submitting}
                      aria-required="true"
                      aria-invalid={Boolean(errors.loginPassword)}
                      aria-describedby="login-password-rules"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    >
                      {showLoginPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  </div>
                  <div id="login-password-rules" className="pt-1">
                    <RuleChecklist password={loginPassword} />
                  </div>
                  <FieldError message={errors.loginPassword} />
                </div>

                {/* Confirm password — mismatch guard blocks submit */}
                <div className="space-y-1.5">
                  <Label htmlFor="login-confirm">
                    Confirm Password <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
                  </Label>
                  <Input
                    id="login-confirm"
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginConfirm}
                    onChange={(e) => {
                      setLoginConfirm(e.target.value)
                      clearError('loginConfirm')
                    }}
                    autoComplete="new-password"
                    className="font-mono"
                    disabled={submitting}
                    aria-required="true"
                    aria-invalid={Boolean(errors.loginConfirm)}
                  />
                  <FieldError message={errors.loginConfirm} />
                </div>

                {/* Force change at first login */}
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
                  <Label
                    htmlFor="login-force-change"
                    className="cursor-pointer font-normal leading-snug text-slate-700 dark:text-slate-300"
                  >
                    Force password change at first login
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {forceLoginChange
                        ? 'The doctor must set their own password the first time they sign in.'
                        : 'This password becomes the doctor\u2019s working password.'}
                    </span>
                  </Label>
                  <Switch
                    id="login-force-change"
                    checked={forceLoginChange}
                    onCheckedChange={setForceLoginChange}
                    disabled={submitting}
                  />
                </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Actions ──────────────────────────────────────────── */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={() => navigate('/super-admin/doctors')}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {submitting ? 'Saving…' : 'Save Doctor'}
        </Button>
      </div>
    </form>
  )
}

export default function DoctorFormPage({ mode, doctorId }: { mode: 'create' | 'edit'; doctorId?: string }) {
  const doctorKey = usableDoctorId(doctorId)
  const isEdit = mode === 'edit' && Boolean(doctorKey)
  const detail = useApiData<unknown>(
    isEdit && doctorKey ? `/api/admin/doctors/${encodeURIComponent(doctorKey)}` : null,
  )
  const data = mapAdminDoctorDetail(detail.data)
  const { loading, error, refetch } = detail

  // Server 401s surface as "...sign in..." messages — back to the login view.
  useEffect(() => {
    if (error && error.includes('sign in')) {
      toast.error('Session expired. Please sign in again.')
      navigate('/super-admin/login')
    }
  }, [error])

  const title = mode === 'create' ? 'Add Doctor' : 'Edit Doctor'
  const description =
    mode === 'create'
      ? 'Register a new doctor with qualifications, department and consultation details'
      : 'Update the doctor record, qualifications and assignments'
  const backBtn = (
    <Button variant="outline" onClick={() => navigate('/super-admin/doctors')}>
      <ArrowLeft className="size-4" aria-hidden /> Back to doctors
    </Button>
  )

  if (isEdit) {
    if (loading) {
      return (
        <div className="space-y-6">
          <PageHeader title={title} description={description} actions={backBtn} />
          <FormSkeleton />
        </div>
      )
    }
    if (error && error.toLowerCase().includes('not found')) {
      return (
        <div className="space-y-6">
          <PageHeader title={title} description={description} actions={backBtn} />
          <EmptyState
            icon={UserX}
            title="Doctor not found"
            description="This doctor may have been removed or the link is incorrect."
            action={backBtn}
          />
        </div>
      )
    }
    if (error || !data?.doctor) {
      return (
        <div className="space-y-6">
          <PageHeader title={title} description={description} actions={backBtn} />
          <Alert variant="destructive" role="alert">
            <RefreshCw className="size-4" aria-hidden />
            <AlertTitle>Could not load doctor</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{error ?? 'Unknown error.'}</span>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                <RefreshCw className="size-4" aria-hidden /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )
    }

    const d = data.doctor
    return (
      <div className="space-y-6">
        <PageHeader title={title} description={description} actions={backBtn} />
        <div className="flex items-start gap-2.5 rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-3 text-sm text-slate-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-slate-300">
          <Info className="mt-0.5 size-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
          <p>
            Last updated {formatDateTime(d.updatedAt)} by{' '}
            <span className="font-medium text-slate-800 dark:text-slate-100">{d.updatedByName ?? '—'}</span>
          </p>
        </div>
        <DoctorForm
          key={d.id}
          mode="edit"
          doctorId={doctorKey ?? undefined}
          doctorIdDisplay={d.doctorId}
          initial={toFormState(d)}
          initialSpecIds={(() => {
            const primary = d.specializations.find((s) => s.isPrimary)
            const ordered = primary
              ? [primary, ...d.specializations.filter((s) => s !== primary)]
              : d.specializations
            return ordered.map((s) => s.specialization.id)
          })()}
          initialDays={
            d.availableDays
              ? d.availableDays.split(',').map((x) => x.trim()).filter(Boolean)
              : []
          }
          initialResume={d.resume}
        />
      </div>
    )
  }

  if (mode === 'edit') {
    return (
      <div className="space-y-6">
        <PageHeader title={title} description={description} actions={backBtn} />
        <EmptyState
          icon={UserX}
          title="Doctor not found"
          description="This doctor may have been removed or the link is incorrect."
          action={backBtn}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} actions={backBtn} />
      <DoctorForm
        mode="create"
        initial={EMPTY_FORM}
        initialSpecIds={[]}
        initialDays={[]}
        initialResume={null}
      />
    </div>
  )
}
