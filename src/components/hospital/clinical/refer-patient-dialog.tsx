'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Search, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { patientById } from '@/components/hospital/clinical/clinical-data'
import { useReferralDoctors } from '@/components/hospital/clinical/use-referral-doctors'
import { initials } from '@/lib/format'
import {
  handlePatientAuthError,
  referralActionErrorMessage,
  validationFieldErrors,
} from '@/lib/patient-api-error'
import { cn } from '@/lib/utils'
import {
  patientTypeLabel,
  patientsService,
  type Patient,
  type ReferralDoctorOption,
} from '@/services/patients.service'
import { useAuth } from '@/components/hospital/auth-context'

const SEND_BUTTON = 'bg-[#1f8a5b] text-white hover:bg-[#187a4e]'

const REVIEW_LEFT = [
  ['demographics', 'Patient demographics'],
  ['encounters', 'Clinical encounters'],
  ['labs', 'Lab reports'],
  ['images', 'Health image reports'],
  ['notes', 'Notes'],
] as const

const REVIEW_RIGHT = [
  ['history', 'Clinical history'],
  ['vitals', 'Vitals'],
  ['diagnostics', 'Diagnostic reports'],
  ['prescriptions', 'Prescriptions'],
  ['visits', 'Previous visit history'],
] as const

const REVIEW_ITEMS = [...REVIEW_LEFT, ...REVIEW_RIGHT]

function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function doctorLine(doctor: ReferralDoctorOption): string {
  return doctor.specialization || doctor.specializations[0] || doctor.department?.name || 'Physician'
}

export function ReferPatientDialog({
  patient,
  open,
  onOpenChange,
  onSent,
}: {
  patient: Patient | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: () => void
}) {
  const { logout } = useAuth()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const { doctors, loading: loadingDoctors } = useReferralDoctors(open, debouncedSearch)
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [shared, setShared] = useState<Record<string, boolean>>(() => Object.fromEntries(REVIEW_ITEMS.map(([id]) => [id, true])))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedId('')
    setReason('')
    setMessage('')
    setShared(Object.fromEntries(REVIEW_ITEMS.map(([id]) => [id, true])))
    setErrors({})
    setSubmitting(false)
  }, [open, patient?.id])

  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedId) ?? null

  function selectDoctor(doctor: ReferralDoctorOption) {
    setSelectedId(doctor.id)
    setErrors((current) => {
      const next = { ...current }
      delete next.referredDoctorId
      if (!doctor.department?.id || !doctor.department.name) {
        next.referredDoctorId = 'This doctor is not assigned to a department and cannot receive referrals.'
      }
      return next
    })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!patient || submitting) return
    const next: Record<string, string> = {}
    if (!selectedId) next.referredDoctorId = 'Select a doctor'
    else if (!selectedDoctor?.department?.id || !selectedDoctor.department.name) {
      next.referredDoctorId = 'This doctor is not assigned to a department and cannot receive referrals.'
    }
    if (!reason.trim()) next.referralReason = 'Referral reason is required'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (patientById(patient.id)) {
      toast.success('Patient referred successfully.')
      onOpenChange(false)
      onSent()
      return
    }

    setSubmitting(true)
    try {
      await patientsService.createReferral(patient.id, {
        referredDoctorId: selectedId,
        referralReason: reason.trim(),
        message: message.trim() || null,
      })
      toast.success('Patient referred successfully.')
      onOpenChange(false)
      onSent()
    } catch (error) {
      if (await handlePatientAuthError(error, logout, '/doctor/patients')) return
      const fieldErrors = validationFieldErrors(error)
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors)
      toast.error(referralActionErrorMessage(error, 'Could not send the referral.'))
    } finally {
      setSubmitting(false)
    }
  }

  const ageLabel = patient?.age != null && patient.age >= 0 ? `${patient.age}y` : 'Age —'
  const genderLabel = patient?.gender ? patient.gender : '—'
  const typeLabel = patientTypeLabel(patient?.patientType)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto sm:max-w-[34rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Send className="size-4 text-teal-700" aria-hidden />
            Refer Patient
          </DialogTitle>
          <DialogDescription>
            Refer this patient to another doctor for clinical review or a second opinion.
          </DialogDescription>
        </DialogHeader>
        {patient ? (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                {initials(patient.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{patient.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {patient.patientId} · {ageLabel} · {genderLabel}
                  {patient.department?.name ? ` · ${patient.department.name}` : ''}
                </p>
              </div>
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{typeLabel}</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Refer to doctor</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search doctor by name, specialty, department..."
                  aria-label="Search doctors"
                  className="h-10 pl-9"
                />
              </div>
              <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border p-1">
                {loadingDoctors ? (
                  <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Searching doctors...
                  </p>
                ) : doctors.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No matching doctors in your hospital.</p>
                ) : doctors.map((doctor) => {
                  const selected = selectedId === doctor.id
                  return (
                    <button
                      key={doctor.id}
                      type="button"
                      onClick={() => selectDoctor(doctor)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm',
                        selected ? 'bg-emerald-50' : 'hover:bg-muted',
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-semibold text-white">
                        {initials(doctor.name.replace(/^Dr\.?\s*/, ''))}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{doctor.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{doctorLine(doctor)}</span>
                      </span>
                      <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition', selected ? 'bg-emerald-600' : 'bg-muted')}>
                        <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition', selected ? 'left-4' : 'left-0.5')} />
                      </span>
                    </button>
                  )
                })}
              </div>
              {errors.referredDoctorId ? <p className="text-xs text-rose-600">{errors.referredDoctorId}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="referral-reason" className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Referral reason</Label>
              <Textarea
                id="referral-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter why you are referring this patient..."
                rows={3}
              />
              {errors.referralReason ? <p className="text-xs text-rose-600">{errors.referralReason}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="referral-message" className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Optional message</Label>
              <Textarea
                id="referral-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a message for the reviewing doctor..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Information available for review</p>
              <div className="grid grid-cols-2 gap-x-4">
                <div className="space-y-2">
                  {REVIEW_LEFT.map(([id, label]) => (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={shared[id]}
                        onCheckedChange={(checked) => setShared((current) => ({ ...current, [id]: checked === true }))}
                        className="data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="space-y-2">
                  {REVIEW_RIGHT.map(([id, label]) => (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={shared[id]}
                        onCheckedChange={(checked) => setShared((current) => ({ ...current, [id]: checked === true }))}
                        className="data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">The patient data stays within your care — this referral requests a clinical opinion only.</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                type="submit"
                className={SEND_BUTTON}
                disabled={submitting || Boolean(selectedDoctor && !selectedDoctor.department?.name)}
              >
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                {submitting ? 'Sending...' : 'Send Referral'}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
