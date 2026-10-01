'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays, CalendarPlus, Clock, Loader2, Search, Stethoscope, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { OPD_APPOINTMENT_PURPOSES } from '@/components/hospital/clinical/book-appointment-dialog'
import { useAuth } from '@/components/hospital/auth-context'
import { ApiError } from '@/lib/api-client'
import { handlePatientAuthError, patientActionErrorMessage } from '@/lib/patient-api-error'
import { initials } from '@/lib/format'
import { clinicalVisitsService, type AssignedDoctor } from '@/services/clinical-visits.service'
import type { Patient } from '@/services/patients.service'

const BOOK_BUTTON = 'bg-[#b7e4c7] text-[#0b3430] hover:bg-[#a4dbb8]'
const NO_DOCTOR = 'No doctor is assigned to this patient. Please assign a doctor before booking the OPD visit.'
const OCCUPIED = 'Doctor is already occupied at the selected date and time. Please select another date or time.'

function useDebounced(value: string, delay = 250): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function titleCase(value: string): string {
  return value.trim().toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

function patientMeta(patient: Patient): string {
  const parts: string[] = []
  if (typeof patient.age === 'number' && Number.isFinite(patient.age)) parts.push(`${patient.age}y`)
  if (patient.gender.trim()) parts.push(titleCase(patient.gender))
  const identity = patient.phone?.trim() || patient.patientId || patient.patientCode
  if (identity) parts.push(identity)
  return parts.join(' • ') || '—'
}

function formatVisitDate(value: string): string {
  const parsed = parseIsoDate(value)
  if (!parsed) return value
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseIsoDate(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function toIsoDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}-${month}-${day}`
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function doctorLabel(doctor: AssignedDoctor): string {
  return doctor.specialty ? `${doctor.name} · ${doctor.specialty}` : doctor.name
}

function FieldMessage({ children }: { children: string }) {
  return <p className="text-xs text-destructive">{children}</p>
}

export function BookOpdDialog({
  open,
  onOpenChange,
  onBooked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBooked: (visitDate: string) => void
}) {
  const { logout } = useAuth()
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const debounced = useDebounced(query)
  const [hits, setHits] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [doctor, setDoctor] = useState<AssignedDoctor | null>(null)
  const [doctorLoading, setDoctorLoading] = useState(false)
  const [doctorMessage, setDoctorMessage] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [time, setTime] = useState('')
  const [conflict, setConflict] = useState<string | null>(null)
  const [purpose, setPurpose] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setListOpen(false)
    setHits([])
    setSearching(false)
    setPatient(null)
    setDoctor(null)
    setDoctorLoading(false)
    setDoctorMessage(null)
    setDate('')
    setCalendarOpen(false)
    setTime('')
    setConflict(null)
    setPurpose('')
    setErrors({})
    submittingRef.current = false
    setSubmitting(false)
  }, [open])

  useEffect(() => {
    if (!open || patient || !listOpen) return
    let cancelled = false
    setSearching(true)
    clinicalVisitsService.getOpdPatients(debounced)
      .then((result) => {
        if (!cancelled) setHits(result.items)
      })
      .catch(async (error) => {
        if (cancelled) return
        if (await handlePatientAuthError(error, logout, '/doctor/opd')) return
        setHits([])
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => { cancelled = true }
  }, [open, patient, listOpen, debounced, logout])

  useEffect(() => {
    if (!open || !patient) {
      setDoctor(null)
      setDoctorLoading(false)
      setDoctorMessage(null)
      setDate('')
      setTime('')
      setConflict(null)
      return
    }
    let cancelled = false
    setDoctor(null)
    setDoctorMessage(null)
    setDate('')
    setCalendarOpen(false)
    setTime('')
    setConflict(null)
    setDoctorLoading(true)
    clinicalVisitsService.getAssignedDoctor(patient.id)
      .then((assigned) => {
        if (cancelled) return
        setDoctor(assigned)
        setDoctorMessage(assigned ? null : NO_DOCTOR)
      })
      .catch(async (error) => {
        if (cancelled) return
        if (await handlePatientAuthError(error, logout, '/doctor/opd')) return
        setDoctor(null)
        setDoctorMessage(patientActionErrorMessage(error, 'Could not load the assigned doctor.'))
      })
      .finally(() => {
        if (!cancelled) setDoctorLoading(false)
      })
    return () => { cancelled = true }
  }, [open, patient, logout])

  function selectPatient(next: Patient) {
    setPatient(next)
    setQuery('')
    setHits([])
    setListOpen(false)
    setConflict(null)
    setErrors((current) => ({ ...current, patient: '', doctor: '', date: '', time: '' }))
  }

  function clearPatient() {
    setPatient(null)
    setErrors({})
  }

  function chooseDate(value: string) {
    setDate(value)
    setConflict(null)
    setErrors((current) => ({ ...current, date: '', time: '' }))
  }

  function chooseTime(value: string) {
    setTime(value)
    setConflict(null)
    setErrors((current) => ({ ...current, time: '' }))
  }

  async function submit() {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const next: Record<string, string> = {}
    if (!patient) next.patient = 'Please select a patient.'
    else if (doctorLoading) next.doctor = 'Loading the assigned doctor.'
    else if (!doctor) next.doctor = NO_DOCTOR
    else if (!date) next.date = 'Please select a date.'
    else if (!time) next.time = 'Please select a time.'
    if (patient && doctor && date && time && !purpose) next.purpose = 'Please select a purpose.'
    setErrors(next)
    const first = next.patient || next.doctor || next.date || next.time || next.purpose
    if (first || !patient || !doctor) {
      submittingRef.current = false
      setSubmitting(false)
      if (first) toast.error(first)
      return
    }
    const visitDate = date.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0]
    const startTime = time.trim().match(/^(\d{2}):(\d{2})/)
    if (!visitDate || !startTime) {
      submittingRef.current = false
      setSubmitting(false)
      if (!visitDate) {
        setErrors((current) => ({ ...current, date: 'Please select a date.' }))
        toast.error('Please select a date.')
      } else {
        setErrors((current) => ({ ...current, time: 'Please select a time.' }))
        toast.error('Please select a time.')
      }
      return
    }
    const bookedTime = `${startTime[1]}:${startTime[2]}`
    setConflict(null)
    try {
      await clinicalVisitsService.createClinicalVisit({
        patientId: patient.id,
        doctorId: doctor.id,
        visitDate,
        startTime: bookedTime,
        purpose,
        visitType: 'Clinical',
      })
      toast.success('OPD clinical visit booked successfully.')
      onOpenChange(false)
      onBooked(visitDate)
    } catch (error) {
      submittingRef.current = false
      setSubmitting(false)
      if (await handlePatientAuthError(error, logout, '/doctor/opd')) return
      const message = error instanceof ApiError && error.message?.trim()
        ? error.message.trim()
        : error instanceof ApiError && error.status === 409
          ? OCCUPIED
          : 'Could not book the clinical visit.'
      setConflict(message)
      toast.error(message)
    }
  }

  const canSchedule = Boolean(patient)
  const blockBooking = submitting || Boolean(patient && (doctorLoading || !doctor))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto sm:max-w-[32rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="size-4 text-teal-700" aria-hidden />
            Book new OPD appointment
          </DialogTitle>
          <DialogDescription>
            Book a clinical visit for an existing OPD patient. Choose the date, time, and purpose.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-sm">
            <UserRound className="size-3.5" aria-hidden /> Patient <span className="text-destructive">*</span>
          </Label>
          {patient ? (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span>
                <span className="block font-medium">{patient.fullName}</span>
                <span className="block text-xs text-muted-foreground">{patientMeta(patient)}</span>
              </span>
              <button type="button" className="text-xs text-teal-700" onClick={clearPatient}>Change</button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setListOpen(true) }}
                onFocus={() => setListOpen(true)}
                onBlur={() => { window.setTimeout(() => setListOpen(false), 150) }}
                placeholder="Search by name, MRN, or phone"
                className="h-10 pl-9"
                aria-label="Search OPD patient"
                autoComplete="off"
              />
              {listOpen ? (
                <ul className="absolute top-11 z-20 max-h-52 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
                  {searching ? (
                    <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading OPD patients...
                    </li>
                  ) : hits.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">No OPD patients found.</li>
                  ) : hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => selectPatient(hit)}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-800">
                          {initials(hit.fullName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{hit.fullName}</span>
                          <span className="block truncate text-xs text-muted-foreground">{patientMeta(hit)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          {errors.patient ? <FieldMessage>{errors.patient}</FieldMessage> : null}
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-sm">
            <Stethoscope className="size-3.5" aria-hidden /> Doctor <span className="text-destructive">*</span>
          </Label>
          <Input
            value={doctorLoading ? 'Loading assigned doctor...' : doctor ? doctorLabel(doctor) : ''}
            placeholder={patient ? '' : 'Select a patient first'}
            readOnly
            className="h-10 bg-muted"
            aria-label="Assigned doctor"
          />
          {doctorMessage ? <FieldMessage>{doctorMessage}</FieldMessage> : null}
          {errors.doctor && errors.doctor !== doctorMessage ? <FieldMessage>{errors.doctor}</FieldMessage> : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <CalendarDays className="size-3.5" aria-hidden /> Date <span className="text-destructive">*</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              disabled={!canSchedule}
              className="h-10 w-full justify-start px-3 text-left font-normal shadow-none"
              aria-label="Date"
              aria-expanded={calendarOpen}
              onClick={() => setCalendarOpen((current) => !current)}
            >
              {date ? formatVisitDate(date) : (canSchedule ? 'Select date' : 'Select a patient first')}
            </Button>
            {errors.date ? <FieldMessage>{errors.date}</FieldMessage> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opd-time" className="flex items-center gap-1.5 text-sm">
              <Clock className="size-3.5" aria-hidden /> Time <span className="text-destructive">*</span>
            </Label>
            <Input
              id="opd-time"
              type="time"
              value={time}
              disabled={!canSchedule || !date}
              onChange={(event) => chooseTime(event.target.value)}
              className="h-10"
              aria-label="Time"
            />
            {errors.time ? <FieldMessage>{errors.time}</FieldMessage> : null}
          </div>
          {calendarOpen && canSchedule ? (
            <div className="col-span-2 rounded-md border bg-popover shadow-sm">
              <Calendar
                mode="single"
                selected={parseIsoDate(date) ?? undefined}
                onSelect={(picked) => {
                  if (!picked) return
                  const today = startOfToday()
                  const pickedDay = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate())
                  if (pickedDay < today) return
                  chooseDate(toIsoDate(picked))
                  setCalendarOpen(false)
                }}
                disabled={{ before: startOfToday() }}
              />
            </div>
          ) : null}
          {conflict ? (
            <p className="col-span-2 text-sm text-destructive" role="alert">{conflict}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Purpose <span className="text-destructive">*</span></Label>
          <Select
            value={purpose || undefined}
            onValueChange={(value) => { setPurpose(value); setErrors((current) => ({ ...current, purpose: '' })) }}
          >
            <SelectTrigger className="h-10 w-full" aria-label="Purpose">
              <SelectValue placeholder="Select purpose" />
            </SelectTrigger>
            <SelectContent>
              {OPD_APPOINTMENT_PURPOSES.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.purpose ? <FieldMessage>{errors.purpose}</FieldMessage> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button type="button" className={BOOK_BUTTON} onClick={() => { void submit() }} disabled={submitting || blockBooking}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarPlus className="size-4" aria-hidden />}
            Book appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
