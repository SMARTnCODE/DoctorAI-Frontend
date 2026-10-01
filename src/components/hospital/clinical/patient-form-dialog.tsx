'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CalendarDays, Check, Copy, Loader2, UserRound } from 'lucide-react'
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
import { useAuth } from '@/components/hospital/auth-context'
import {
  handlePatientAuthError,
  patientActionErrorMessage,
  patientCreateErrorMessage,
  validationFieldErrors,
} from '@/lib/patient-api-error'
import { AvailabilitySlotPicker } from '@/components/hospital/clinical/availability-slot-picker'
import { JoinGoogleMeetButton } from '@/components/hospital/clinical/join-google-meet-button'
import { todayLocalISO } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { cn } from '@/lib/utils'
import {
  CLINICAL_STATUS_LABELS,
  CLINICAL_STATUSES,
  OPTIONAL_CLEAR,
  PATIENT_TYPE_LABELS,
  PATIENT_TYPES,
  PATIENT_WARDS,
  buildPatientUpdatePayload,
  dateOfBirthFromAge,
  normalizeClinicalStatus,
  normalizePatientType,
  normalizeWard,
  patientsService,
  toDatetimeLocalValue,
  type Patient,
  type PatientEditDraft,
  type PatientType,
  type PatientWritePayload,
} from '@/services/patients.service'
import {
  formatTelehealthDate,
  formatTelehealthTime,
  isGoogleMeetLink,
  isSlotUnavailableError,
  telehealthErrorMessage,
  telehealthService,
  type DoctorAvailabilitySlot,
} from '@/services/telehealth.service'
import { googleCalendarService } from '@/services/google-calendar.service'

const MINT_BUTTON = 'rounded-full bg-[#8ed4b0] px-5 text-[#0b3430] hover:bg-[#a4e0c0]'
const PHONE_PATTERN = /^\+?[1-9]\d{6,14}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
const GENDERS = [
  { value: 'Male', label: 'male' },
  { value: 'Female', label: 'female' },
  { value: 'Other', label: 'other' },
] as const

interface AssignableDoctor {
  id: string
  name: string
  specialty: string
}

interface ScheduledVisit {
  patientName: string
  doctorName: string
  doctorSpecialty: string
  purpose: string
  date: string
  time: string
  status: string
  durationMinutes: number | null
  meetingLink: string | null
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

function vitalInput(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '' : String(value)
}

export function PatientFormDialog({
  open,
  mode,
  patient,
  initialPatientType,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  mode: 'create' | 'edit'
  patient?: Patient | null
  initialPatientType?: PatientType
  onOpenChange: (open: boolean) => void
  onSaved: (patient: Patient) => void
}) {
  const { logout, doctorProfile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [patientType, setPatientType] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [bloodGroup, setBloodGroup] = useState('NONE')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [knownAllergies, setKnownAllergies] = useState('')
  const [purpose, setPurpose] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [doctorId, setDoctorId] = useState('')
  const [doctors, setDoctors] = useState<AssignableDoctor[]>([])
  const [doctorsLoading, setDoctorsLoading] = useState(false)
  const [availabilitySlots, setAvailabilitySlots] = useState<DoctorAvailabilitySlot[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [availabilityReload, setAvailabilityReload] = useState(0)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null)
  const [scheduled, setScheduled] = useState<ScheduledVisit | null>(null)
  const [condition, setCondition] = useState('')
  const [ward, setWard] = useState('')
  const [bed, setBed] = useState('')
  const [clinicalStatus, setClinicalStatus] = useState('')
  const [admittedAtLocal, setAdmittedAtLocal] = useState('')
  const [heartRate, setHeartRate] = useState('')
  const [systolicBP, setSystolicBP] = useState('')
  const [diastolicBP, setDiastolicBP] = useState('')
  const [oxygenSaturation, setOxygenSaturation] = useState('')
  const [temperature, setTemperature] = useState('')
  const [weight, setWeight] = useState('')
  const [respiratoryRate, setRespiratoryRate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const telehealth = mode === 'create' && normalizePatientType(patientType) === 'TELEHEALTH'

  useEffect(() => {
    if (!open) return
    const vitals = patient?.latestVitals
    setFullName(patient?.fullName ?? '')
    setPatientType(normalizePatientType(patient?.patientType) ?? (mode === 'create' ? initialPatientType ?? '' : ''))
    setAge(patient?.age != null ? String(patient.age) : '')
    setGender(patient?.gender ?? '')
    setBloodGroup('NONE')
    setPhone(patient?.phone ?? '')
    setEmail(patient?.email ?? '')
    setAddress(patient?.address ?? '')
    setKnownAllergies(patient?.knownAllergies ?? '')
    setPurpose('')
    setAppointmentDate('')
    setAppointmentTime('')
    setCalendarOpen(false)
    setDoctorId(doctorProfile?.id ?? '')
    setAvailabilitySlots([])
    setAvailabilityLoading(false)
    setAvailabilityError(null)
    setAvailabilityReload(0)
    setScheduleError(null)
    setCondition(patient?.condition ?? '')
    setWard(normalizeWard(patient?.ward))
    setBed(patient?.bed ?? '')
    setClinicalStatus(normalizeClinicalStatus(patient?.severity))
    setAdmittedAtLocal(toDatetimeLocalValue(patient?.admittedAt))
    setHeartRate(vitalInput(vitals?.heartRate))
    setSystolicBP(vitalInput(vitals?.systolicBP ?? vitals?.bloodPressureS))
    setDiastolicBP(vitalInput(vitals?.diastolicBP ?? vitals?.bloodPressureD))
    setOxygenSaturation(vitalInput(vitals?.oxygenSaturation ?? vitals?.oxygenSat))
    setTemperature(vitalInput(vitals?.temperature))
    setWeight(vitalInput(vitals?.weight))
    setRespiratoryRate(vitalInput(vitals?.respiratoryRate))
    setErrors({})
    submittingRef.current = false
    setSubmitting(false)
  }, [open, patient, mode, initialPatientType, doctorProfile?.id])

  useEffect(() => {
    if (!open || !telehealth) return
    let cancelled = false
    setDoctorsLoading(true)
    patientsService.getReferralDoctors({ page: 1, pageSize: 100 })
      .then((result) => {
        if (cancelled) return
        const options: AssignableDoctor[] = result.items.map((doctor) => ({
          id: doctor.id,
          name: doctor.name,
          specialty: doctor.specialization || doctor.department?.name || '',
        }))
        if (doctorProfile?.id && !options.some((doctor) => doctor.id === doctorProfile.id)) {
          options.unshift({
            id: doctorProfile.id,
            name: doctorProfile.name,
            specialty: doctorProfile.department || doctorProfile.designation || '',
          })
        }
        setDoctors(options)
      })
      .catch(async (error) => {
        if (cancelled) return
        if (await handlePatientAuthError(error, logout, '/doctor/patients')) return
        const self = doctorProfile?.id
          ? [{ id: doctorProfile.id, name: doctorProfile.name, specialty: doctorProfile.department || doctorProfile.designation || '' }]
          : []
        setDoctors(self)
      })
      .finally(() => {
        if (!cancelled) setDoctorsLoading(false)
      })
    return () => { cancelled = true }
  }, [open, telehealth, logout, doctorProfile])

  useEffect(() => {
    if (!open || !telehealth) {
      setCalendarConnected(null)
      return
    }
    let cancelled = false
    googleCalendarService.status()
      .then((status) => {
        if (!cancelled) setCalendarConnected(status?.connected === true)
      })
      .catch(() => {
        if (!cancelled) setCalendarConnected(null)
      })
    return () => { cancelled = true }
  }, [open, telehealth])

  useEffect(() => {
    const dateReady = /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
    if (!open || !telehealth || !doctorId || !dateReady) {
      setAvailabilitySlots([])
      setAvailabilityLoading(false)
      setAvailabilityError(null)
      return
    }
    let cancelled = false
    setAvailabilitySlots([])
    setAvailabilityLoading(true)
    setAvailabilityError(null)
    void (async () => {
      try {
        const result = await telehealthService.getDoctorAvailability(doctorId, appointmentDate)
        if (!cancelled) setAvailabilitySlots(result.slots)
      } catch (error) {
        if (cancelled) return
        if (await handlePatientAuthError(error, logout, '/doctor/patients')) return
        if (cancelled) return
        setAvailabilitySlots([])
        setAvailabilityError('Unable to load doctor availability. Please try again.')
      } finally {
        if (!cancelled) setAvailabilityLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, telehealth, doctorId, appointmentDate, availabilityReload, logout])

  useEffect(() => {
    if (!telehealth || availabilityLoading || !appointmentTime || availabilitySlots.length === 0) return
    const stillOpen = availabilitySlots.some((slot) => slot.startTime === appointmentTime && slot.status === 'AVAILABLE')
    if (!stillOpen) setAppointmentTime('')
  }, [telehealth, availabilityLoading, availabilitySlots, appointmentTime])

  function validate(): PatientWritePayload | null {
    const next: Record<string, string> = {}
    if (!fullName.trim()) next.fullName = 'Full name is required'
    const type = normalizePatientType(patientType)
    if (!type) next.patientType = 'Select a patient type'
    const ageNumber = Number(age)
    if (!age.trim()) next.age = 'Age is required'
    else if (!Number.isInteger(ageNumber) || ageNumber < 0 || ageNumber > 120) next.age = 'Enter an age from 0 to 120'
    else if (new Date().getFullYear() - ageNumber < 1900) next.age = 'Age is not valid'
    if (!gender) next.gender = 'Select a gender'
    const compactPhone = phone.replace(/[\s\-()]/g, '')
    if (compactPhone && !PHONE_PATTERN.test(compactPhone)) next.phone = 'Enter a valid phone number'
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address'
    if (type === 'TELEHEALTH') {
      if (!email.trim()) next.email = 'Email is required for telehealth appointments because the meeting link will be sent by email.'
      if (!purpose.trim()) next.purpose = 'Purpose is required for telehealth appointments.'
      if (!appointmentDate) next.appointmentDate = 'Date is required for telehealth appointments.'
      else if (appointmentDate < todayLocalISO()) next.appointmentDate = 'Choose today or a future date.'
      const chosen = availabilitySlots.find((slot) => slot.startTime === appointmentTime && slot.status === 'AVAILABLE')
      if (!appointmentTime) next.appointmentTime = 'Time is required for telehealth appointments.'
      else if (!chosen) next.appointmentTime = 'Please select an available appointment time.'
      if (!doctorId) next.doctorId = 'Select a doctor.'
    }
    setErrors(next)
    setScheduleError(next.appointmentDate || next.appointmentTime || null)
    if (Object.keys(next).length > 0 || !type) return null
    return {
      fullName: fullName.trim(),
      patientType: type,
      gender,
      dateOfBirth: dateOfBirthFromAge(ageNumber),
      phone: compactPhone || null,
      email: email.trim() || null,
      address: address.trim() || null,
      knownAllergies: knownAllergies.trim() || null,
      ...(type === 'TELEHEALTH' ? {
        age: ageNumber,
        bloodGroup: bloodGroup !== 'NONE' ? bloodGroup : null,
        purpose: purpose.trim(),
        appointmentDate,
        appointmentTime,
        doctorId,
      } : {}),
    }
  }

  function editDraft(): PatientEditDraft {
    return {
      fullName,
      patientType,
      age,
      gender,
      phone,
      email,
      address,
      knownAllergies,
      condition,
      ward,
      bed,
      clinicalStatus,
      admittedAtLocal,
      heartRate,
      systolicBP,
      diastolicBP,
      oxygenSaturation,
      temperature,
      weight,
      respiratoryRate,
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    if (mode === 'edit' && patient) {
      const result = buildPatientUpdatePayload(editDraft(), patient)
      setErrors(result.errors)
      if (Object.keys(result.errors).length > 0) return
      if (Object.keys(result.payload).length === 0) {
        toast.message('No changes to save.')
        return
      }
      setSubmitting(true)
      try {
        const saved = await patientsService.updatePatient(patient.id, result.payload)
        toast.success('Patient updated successfully.')
        onOpenChange(false)
        onSaved(saved)
      } catch (error) {
        if (await handlePatientAuthError(error, logout, '/doctor/patients')) return
        const fieldErrors = validationFieldErrors(error)
        if (fieldErrors.systolicBp && !fieldErrors.systolicBP) fieldErrors.systolicBP = fieldErrors.systolicBp
        if (fieldErrors.diastolicBp && !fieldErrors.diastolicBP) fieldErrors.diastolicBP = fieldErrors.diastolicBp
        const message = patientActionErrorMessage(error, 'Could not update the patient.')
        if (/temperature/i.test(message)) fieldErrors.temperature = 'Enter a temperature from 30 to 45 °C'
        if (/heart rate/i.test(message)) fieldErrors.heartRate = 'Enter a heart rate from 1 to 300'
        if (/oxygen/i.test(message)) fieldErrors.oxygenSaturation = 'Enter an SpO2 from 0 to 100'
        if (/systolic/i.test(message)) fieldErrors.systolicBP = 'Enter a systolic BP from 1 to 300'
        if (/diastolic/i.test(message)) fieldErrors.diastolicBP = 'Enter a diastolic BP from 1 to 300'
        if (/weight/i.test(message)) fieldErrors.weight = 'Enter a weight greater than 0'
        if (/respiratory/i.test(message)) fieldErrors.respiratoryRate = 'Enter a respiratory rate from 1 to 100'
        if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors)
        toast.error(message)
      } finally {
        setSubmitting(false)
      }
      return
    }
    const payload = validate()
    if (!payload) return
    if (payload.patientType === 'TELEHEALTH' && calendarConnected === false) {
      toast.error('Google Calendar is not connected. Connect it in Settings before scheduling a telehealth appointment.')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const saved = await patientsService.createPatient(payload)
      if (payload.patientType === 'TELEHEALTH') {
        const selected = doctors.find((doctor) => doctor.id === payload.doctorId)
        const doctorName = saved.primaryDoctor?.name || selected?.name || ''
        let appointmentDate = saved.appointmentDate || payload.appointmentDate || ''
        let appointmentTime = saved.appointmentTime || payload.appointmentTime || ''
        let purpose = saved.purpose || payload.purpose || ''
        let status = saved.visitStatus || 'SCHEDULED'
        let durationMinutes = saved.durationMin ?? null
        let meetingLink = isGoogleMeetLink(saved.roomUrl) ? saved.roomUrl.trim() : null
        if (saved.appointmentId) {
          try {
            const appointment = await telehealthService.getAppointment(saved.appointmentId)
            appointmentDate = appointment.appointmentDate || appointmentDate
            appointmentTime = appointment.appointmentTime || appointmentTime
            purpose = appointment.purpose || purpose
            status = appointment.status || status
            durationMinutes = appointment.durationMinutes || durationMinutes
            meetingLink = appointment.meetingLink || meetingLink
          } catch {
            /* The booking response still supplies the Meet link when the refresh fails. */
          }
        }
        toast.success('Telehealth appointment scheduled successfully.')
        setScheduled({
          patientName: saved.fullName,
          doctorName,
          doctorSpecialty: saved.primaryDoctor?.specialty || selected?.specialty || saved.department?.name || '',
          purpose,
          date: appointmentDate,
          time: appointmentTime,
          status,
          durationMinutes,
          meetingLink,
        })
      } else {
        const departmentName = saved.department?.name
        toast.success(
          departmentName
            ? `Patient added successfully. Department: ${departmentName}`
            : 'Patient added successfully.',
        )
      }
      onOpenChange(false)
      onSaved(saved)
    } catch (error) {
      if (await handlePatientAuthError(error, logout, '/doctor/patients')) return
      if (payload.patientType === 'TELEHEALTH' && isSlotUnavailableError(error)) {
        setAppointmentTime('')
        setAvailabilityReload((value) => value + 1)
        setErrors((current) => ({
          ...current,
          appointmentTime: 'This time slot was just booked. Please select another available time.',
        }))
        toast.error('This time slot was just booked. Please select another available time.')
        return
      }
      const fieldErrors = validationFieldErrors(error)
      const message = telehealth && payload.patientType === 'TELEHEALTH'
        ? telehealthErrorMessage(error, patientCreateErrorMessage(error, 'Could not add the patient.'))
        : patientCreateErrorMessage(error, 'Could not add the patient.')
      if (/not available/i.test(message)) {
        fieldErrors.appointmentTime = 'Please select an available appointment time.'
        setScheduleError(fieldErrors.appointmentTime)
      }
      if (/email/i.test(message) && !fieldErrors.email) fieldErrors.email = message
      if (Object.keys(fieldErrors).length > 0) setErrors((current) => ({ ...current, ...fieldErrors }))
      toast.error(message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const inHospital = mode === 'edit' && normalizePatientType(patientType) === 'IN_HOSPITAL'
  const wardOptions = ward && ward !== OPTIONAL_CLEAR && !(PATIENT_WARDS as readonly string[]).includes(ward)
    ? [ward, ...PATIENT_WARDS]
    : [...PATIENT_WARDS]
  const statusValue = normalizeClinicalStatus(clinicalStatus)
  const statusOptions = statusValue && !(CLINICAL_STATUSES as readonly string[]).includes(statusValue)
    ? [statusValue, ...CLINICAL_STATUSES]
    : [...CLINICAL_STATUSES]
  const title = mode === 'edit' ? 'Edit patient' : 'Register new patient'
  const submitLabel = submitting
    ? (mode === 'edit' ? 'Saving...' : 'Adding...')
    : (mode === 'edit' ? 'Save changes' : 'Register patient')

  return (
    <>
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent className={cn('max-h-[90vh] overflow-y-auto', inHospital || telehealth ? 'sm:max-w-xl' : 'sm:max-w-lg')}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? (inHospital
                ? 'Update any details you have. In-hospital fields are optional.'
                : 'Update any details you have.')
              : 'Fill in demographics. Department is assigned automatically and cannot be selected here.'}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Full name" required error={errors.fullName}>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Doe"
              autoComplete="name"
            />
          </Field>
          <Field label="Patient type" required error={errors.patientType}>
            <Select value={patientType || undefined} onValueChange={setPatientType}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select patient type" /></SelectTrigger>
              <SelectContent>
                {PATIENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{PATIENT_TYPE_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {telehealth ? (
            <section className="space-y-4 rounded-lg border p-3">
              {calendarConnected === false ? (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
                  <p>Google Calendar is not connected. Connect it in Settings before scheduling a telehealth appointment.</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => navigate('/doctor/settings')}>
                    Open settings
                  </Button>
                </div>
              ) : null}
              <Field label="Purpose" required error={errors.purpose}>
                <Input
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="e.g. Skin rash consultation"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date" required error={errors.appointmentDate}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full justify-start px-3 text-left font-normal shadow-none"
                    aria-label="Appointment date"
                    onClick={() => setCalendarOpen((current) => !current)}
                  >
                    <CalendarDays className="mr-2 size-3.5 text-muted-foreground" aria-hidden />
                    {appointmentDate ? formatTelehealthDate(appointmentDate) : 'Select date'}
                  </Button>
                </Field>
                <Field label="Doctor" required error={errors.doctorId}>
                  <Select
                    value={doctorId || undefined}
                    onValueChange={(value) => {
                      setDoctorId(value)
                      setAppointmentTime('')
                      setAvailabilitySlots([])
                      setAvailabilityError(null)
                      if (/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) setAvailabilityLoading(true)
                      setScheduleError(null)
                      setErrors((current) => ({ ...current, doctorId: '', appointmentTime: '' }))
                    }}
                    disabled={doctorsLoading || doctors.length === 0}
                  >
                    <SelectTrigger className="w-full" aria-label="Doctor">
                      <SelectValue placeholder={doctorsLoading ? 'Loading doctors...' : 'Select doctor'} />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.map((doctor) => (
                        <SelectItem key={doctor.id} value={doctor.id}>
                          {doctor.specialty ? `${doctor.name} · ${doctor.specialty}` : doctor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {calendarOpen ? (
                <div className="rounded-md border bg-popover shadow-sm">
                  <Calendar
                    mode="single"
                    selected={appointmentDate ? parseIsoDate(appointmentDate) ?? undefined : undefined}
                    onSelect={(picked) => {
                      if (!picked) return
                      const today = startOfToday()
                      const pickedDay = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate())
                      if (pickedDay < today) return
                      setAppointmentDate(toIsoDate(picked))
                      setAppointmentTime('')
                      setAvailabilitySlots([])
                      setAvailabilityError(null)
                      if (doctorId) setAvailabilityLoading(true)
                      setCalendarOpen(false)
                      setScheduleError(null)
                      setErrors((current) => ({ ...current, appointmentDate: '', appointmentTime: '' }))
                    }}
                    disabled={{ before: startOfToday() }}
                  />
                </div>
              ) : null}
              <Field label="Time" required error={errors.appointmentTime}>
                <AvailabilitySlotPicker
                  slots={availabilitySlots}
                  loading={availabilityLoading}
                  error={availabilityError}
                  selectedTime={appointmentTime}
                  date={appointmentDate}
                  ready={Boolean(doctorId) && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)}
                  onRetry={() => setAvailabilityReload((value) => value + 1)}
                  onSelect={(startTime) => {
                    setAppointmentTime(startTime)
                    setScheduleError(null)
                    setErrors((current) => ({ ...current, appointmentTime: '' }))
                  }}
                />
              </Field>
              {scheduleError && !errors.appointmentDate && !errors.appointmentTime ? (
                <p className="text-xs text-rose-600" role="alert">{scheduleError}</p>
              ) : null}
            </section>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Age" required error={errors.age}>
              <Input
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="e.g. 45"
                inputMode="numeric"
              />
            </Field>
            <Field label="Gender" required error={errors.gender}>
              <Select value={gender || undefined} onValueChange={setGender}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {GENDERS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Blood group" error={errors.bloodGroup}>
              <Select value={bloodGroup} onValueChange={setBloodGroup}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Select</SelectItem>
                  {BLOOD_GROUPS.map((group) => <SelectItem key={group} value={group}>{group}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9300000000"
                inputMode="tel"
              />
            </Field>
          </div>
          <Field label="Email" required={telehealth} error={errors.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="patient@example.com"
            />
          </Field>
          <Field label="Address" error={errors.address}>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, City" />
          </Field>
          <Field label="Known allergies" error={errors.knownAllergies}>
            <Input
              value={knownAllergies}
              onChange={(e) => setKnownAllergies(e.target.value)}
              placeholder="e.g. Penicillin, Sulfa drugs"
            />
          </Field>
          {mode === 'edit' && !inHospital ? (
            <Field label="Condition" error={errors.condition}>
              <Input
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                placeholder="e.g. Cholecystitis"
              />
            </Field>
          ) : null}
          {inHospital ? (
            <section className="space-y-4 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">In-Hospital Details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ward" error={errors.ward}>
                  <Select value={ward || undefined} onValueChange={setWard}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select ward" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={OPTIONAL_CLEAR}>Not set</SelectItem>
                      {wardOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Bed" error={errors.bed}>
                  <Input value={bed} onChange={(e) => setBed(e.target.value)} placeholder="e.g. 12A" />
                </Field>
              </div>
              {mode === 'edit' ? (
                <Field label="Condition" error={errors.condition}>
                  <Input
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    placeholder="e.g. Cholecystitis"
                  />
                </Field>
              ) : null}
              <Field label="Status" error={errors.clinicalStatus}>
                <Select value={clinicalStatus || undefined} onValueChange={setClinicalStatus}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OPTIONAL_CLEAR}>Not set</SelectItem>
                    {statusOptions.map((item) => (
                      <SelectItem key={item} value={item}>
                        {(CLINICAL_STATUSES as readonly string[]).includes(item)
                          ? CLINICAL_STATUS_LABELS[item as typeof CLINICAL_STATUSES[number]]
                          : item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="space-y-3">
                <p className="text-sm font-medium">Latest Vitals</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <VitalField
                    label="Heart Rate"
                    unit="bpm"
                    value={heartRate}
                    error={errors.heartRate}
                    onChange={setHeartRate}
                  />
                  <VitalField
                    label="Systolic BP"
                    unit="mmHg"
                    value={systolicBP}
                    error={errors.systolicBP}
                    onChange={setSystolicBP}
                  />
                  <VitalField
                    label="Diastolic BP"
                    unit="mmHg"
                    value={diastolicBP}
                    error={errors.diastolicBP}
                    onChange={setDiastolicBP}
                  />
                  <VitalField
                    label="SpO2"
                    unit="%"
                    value={oxygenSaturation}
                    error={errors.oxygenSaturation}
                    onChange={setOxygenSaturation}
                  />
                  <VitalField
                    label="Temperature"
                    unit="°C"
                    value={temperature}
                    error={errors.temperature}
                    onChange={setTemperature}
                    placeholder="30–45"
                  />
                  <VitalField
                    label="Weight"
                    unit="kg"
                    value={weight}
                    error={errors.weight}
                    onChange={setWeight}
                    numeric="decimal"
                  />
                  <VitalField
                    label="Respiratory Rate"
                    unit="breaths/min"
                    value={respiratoryRate}
                    error={errors.respiratoryRate}
                    onChange={setRespiratoryRate}
                    numeric="integer"
                  />
                </div>
              </div>
              <Field label="Admitted Date & Time" error={errors.admittedAt}>
                <Input
                  type="datetime-local"
                  value={admittedAtLocal}
                  onChange={(e) => setAdmittedAtLocal(e.target.value)}
                />
              </Field>
            </section>
          ) : null}
          {errors.form ? <p className="text-sm text-rose-600">{errors.form}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className={MINT_BUTTON}
              disabled={submitting || (telehealth && calendarConnected === false)}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={scheduled != null} onOpenChange={(next) => { if (!next) setScheduled(null) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Telehealth Appointment Scheduled</DialogTitle>
          <DialogDescription>
            The Google Meet link comes from the appointment that was just booked.
          </DialogDescription>
        </DialogHeader>
        {scheduled ? (
          <div className="space-y-3 text-sm">
            <SummaryRow label="Patient" value={scheduled.patientName} />
            <SummaryRow label="Doctor" value={[scheduled.doctorName, scheduled.doctorSpecialty].filter(Boolean).join(' · ') || '—'} />
            <SummaryRow label="Purpose" value={scheduled.purpose || '—'} />
            <SummaryRow label="Date" value={scheduled.date ? formatTelehealthDate(scheduled.date) : '—'} />
            <SummaryRow label="Time" value={scheduled.time ? formatTelehealthTime(scheduled.time) : '—'} />
            {scheduled.meetingLink ? (
              <div className="space-y-2 rounded-lg border px-3 py-3">
                <p className="text-xs font-medium text-muted-foreground">Google Meet</p>
                <p className="break-all text-xs">{scheduled.meetingLink}</p>
                <div className="flex flex-wrap gap-2">
                  <JoinGoogleMeetButton
                    meetingLink={scheduled.meetingLink}
                    status={scheduled.status}
                    appointmentDate={scheduled.date}
                    appointmentTime={scheduled.time}
                    durationMinutes={scheduled.durationMinutes}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const link = scheduled.meetingLink
                      if (!link) return
                      void navigator.clipboard.writeText(link).then(
                        () => toast.success('Meeting link copied.'),
                        () => toast.error('Could not copy the meeting link.'),
                      )
                    }}
                  >
                    <Copy className="size-3.5" aria-hidden /> Copy meeting link
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-amber-700" role="alert">
                Google Meet link is not available for this appointment.
              </p>
            )}
            <div className="rounded-lg border px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">Notifications sent</p>
              <p className="mt-1 flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" aria-hidden /> Patient email</p>
              <p className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" aria-hidden /> Doctor email</p>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" className={MINT_BUTTON} onClick={() => setScheduled(null)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function VitalField({
  label, unit, value, error, onChange, placeholder, numeric,
}: {
  label: string
  unit: string
  value: string
  error?: string
  onChange: (value: string) => void
  placeholder?: string
  numeric?: 'decimal' | 'integer'
}) {
  return (
    <Field label={label} error={error}>
      <div className="flex items-center gap-2">
        <Input
          type={numeric ? 'number' : undefined}
          step={numeric === 'integer' ? '1' : numeric === 'decimal' ? 'any' : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={numeric === 'integer' ? 'numeric' : 'decimal'}
          aria-label={label}
          placeholder={placeholder}
        />
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{unit}</span>
      </div>
    </Field>
  )
}

function Field({
  label, required, error, children,
}: {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  )
}
