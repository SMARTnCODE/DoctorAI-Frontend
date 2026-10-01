/**
 * Telehealth appointments.
 *
 * Registration still goes through patientsService.createPatient.
 * This module covers the consultation list shape, doctor slots, reschedule,
 * and meeting validation. The meeting token and URL always come from the backend.
 */
import { ApiError, apiFetch } from '@/lib/api-client'
import { patientActionErrorMessage } from '@/lib/patient-api-error'
import { formatSlotLabel, toStartTime } from '@/services/clinical-visits.service'
import {
  type Patient,
  type PatientDoctorRef,
} from '@/services/patients.service'

export const TELEHEALTH_STATUSES = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] as const
export type TelehealthStatus = (typeof TELEHEALTH_STATUSES)[number]

export const TELEHEALTH_DURATION_MINUTES = 30

export interface TelehealthAppointment {
  id: string
  patientId: string
  doctorId: string
  patientName: string
  patientAge: number | null
  patientGender: string
  purpose: string
  appointmentDate: string
  appointmentTime: string
  durationMinutes: number
  status: string
  meetingLink?: string
  doctorName: string
  doctorSpecialization?: string
}

export interface TelehealthMeeting {
  meetingToken: string
  appointmentId: string
  patientId: string
  patientName: string
  patientAge: number | null
  patientGender: string
  purpose: string
  doctorId: string
  doctorName: string
  doctorSpecialization?: string
  appointmentDate: string
  appointmentTime: string
  status: string
  meetingLink?: string
}

export interface RescheduleTelehealthPayload {
  appointmentDate: string
  appointmentTime: string
}

export const DOCTOR_SLOT_STATUSES = ['AVAILABLE', 'BOOKED', 'BREAK', 'PAST'] as const
export type DoctorSlotStatus = (typeof DOCTOR_SLOT_STATUSES)[number]

export interface DoctorAvailabilitySlot {
  startTime: string
  endTime: string
  available: boolean
  status: DoctorSlotStatus
}

export interface DoctorAvailability {
  doctorId: string
  date: string
  slotDurationMinutes: number | null
  slots: DoctorAvailabilitySlot[]
}

/** In-app room seam. A Google Meet, Zoom, or WebRTC adapter can replace this later. */
export interface TelehealthRoomSession {
  meetingToken: string
  meetingLink?: string
  patientName: string
  doctorName: string
}

export interface TelehealthRoomProvider {
  id: string
  join(session: TelehealthRoomSession): void
}

export const inAppTelehealthRoom: TelehealthRoomProvider = {
  id: 'in-app',
  join() {
    /* The meeting page renders the room. Providers must not be hardcoded here. */
  },
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function pickNumber(source: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value)
  }
  return null
}

export function normalizeTelehealthStatus(value: string | null | undefined): string {
  const compact = (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (!compact) return ''
  if (compact === 'CANCELED') return 'CANCELLED'
  if (compact === 'IN_PROGRESS' || compact === 'CHECKED_IN' || compact === 'WAITING') return 'ACTIVE'
  return compact
}

export function telehealthStatusLabel(value: string | null | undefined): string {
  const key = normalizeTelehealthStatus(value)
  if (key === 'SCHEDULED') return 'Scheduled'
  if (key === 'ACTIVE') return 'Active'
  if (key === 'COMPLETED') return 'Completed'
  if (key === 'CANCELLED') return 'Cancelled'
  if (key === 'RESCHEDULED') return 'Rescheduled'
  return value?.trim() || '—'
}

export function canJoinTelehealth(status: string | null | undefined, meetingLink?: string | null): boolean {
  if (!meetingLink?.trim()) return false
  const key = normalizeTelehealthStatus(status)
  return key !== 'CANCELLED' && key !== 'COMPLETED'
}

export function isAppMeetingLink(link: string): boolean {
  return /\/telehealth\/[^/?#\s]+/i.test(link)
}

export function formatTelehealthDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return value || '—'
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatTelehealthTime(value: string): string {
  const time = toStartTime(value)
  return time ? formatSlotLabel(time) : (value || '—')
}

export function telehealthAppointmentFromPatient(patient: Patient): TelehealthAppointment {
  const doctor: PatientDoctorRef | null | undefined = patient.primaryDoctor
  const date = patient.appointmentDate?.trim() || ''
  const time = toStartTime(patient.appointmentTime ?? '') ?? patient.appointmentTime?.trim() ?? ''
  const link = patient.roomUrl?.trim() || ''
  return {
    id: patient.appointmentId?.trim() || patient.id,
    patientId: patient.id,
    doctorId: doctor?.id ?? '',
    patientName: patient.fullName,
    patientAge: typeof patient.age === 'number' ? patient.age : null,
    patientGender: patient.gender,
    purpose: patient.purpose?.trim() || patient.condition?.trim() || '',
    appointmentDate: date,
    appointmentTime: time,
    durationMinutes: patient.durationMin ?? TELEHEALTH_DURATION_MINUTES,
    status: normalizeTelehealthStatus(patient.visitStatus) || normalizeTelehealthStatus(patient.status),
    meetingLink: link || undefined,
    doctorName: doctor?.name ?? '',
    doctorSpecialization: doctor?.specialty?.trim() || patient.department?.name || undefined,
  }
}

export function appointmentDay(appointment: Pick<TelehealthAppointment, 'appointmentDate'>): string {
  return appointment.appointmentDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
}

export function appointmentInWindow(
  appointment: Pick<TelehealthAppointment, 'appointmentDate'>,
  when: 'today' | 'upcoming',
  today: string,
): boolean {
  const day = appointmentDay(appointment)
  if (!day) return false
  if (when === 'today') return day === today
  return day > today
}

export function appointmentMatchesSearch(appointment: TelehealthAppointment, search: string): boolean {
  const term = search.trim().toLowerCase()
  if (!term) return true
  return [
    appointment.patientName,
    appointment.patientGender,
    appointment.purpose,
    appointment.doctorName,
    appointment.doctorSpecialization,
  ].join(' ').toLowerCase().includes(term)
}

export function appointmentMatchesStatus(appointment: TelehealthAppointment, status: string): boolean {
  if (status === 'all') return true
  return normalizeTelehealthStatus(appointment.status) === normalizeTelehealthStatus(status)
}

const AVAILABILITY_LOAD_ERROR = 'Unable to load doctor availability. Please try again.'

function slotStatus(value: string | null, available: boolean | null): DoctorSlotStatus {
  const key = (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (key === 'AVAILABLE' || key === 'BOOKED' || key === 'BREAK' || key === 'PAST') return key
  return available === true ? 'AVAILABLE' : 'BOOKED'
}

function pickBoolean(source: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'boolean') return value
    if (value === 'true' || value === 1) return true
    if (value === 'false' || value === 0) return false
  }
  return null
}

function mapAvailabilitySlot(value: unknown): DoctorAvailabilitySlot | null {
  if (typeof value === 'string') {
    const startTime = toStartTime(value)
    if (!startTime) return null
    return { startTime, endTime: '', available: true, status: 'AVAILABLE' }
  }
  const source = asRecord(value)
  if (!source) return null
  const startTime = toStartTime(
    pickString(source, 'start_time', 'startTime', 'time', 'start', 'from_time', 'fromTime') ?? '',
  )
  if (!startTime) return null
  const status = slotStatus(pickString(source, 'status', 'slot_status', 'slotStatus'), pickBoolean(source, 'available'))
  return {
    startTime,
    endTime: toStartTime(pickString(source, 'end_time', 'endTime', 'end', 'to_time', 'toTime') ?? '') ?? '',
    available: status === 'AVAILABLE',
    status,
  }
}

/**
 * `apiFetch` already unwraps `{ success, data }`, so the service receives the
 * inner object and reads `slots` from it. `data.slots` is only a fallback when
 * that unwrap did not run. A missing list is a parse failure, not an empty day.
 */
function readAvailabilityPayload(value: unknown): { meta: Record<string, unknown> | null; slots: unknown[] } | null {
  if (Array.isArray(value)) return { meta: null, slots: value }
  const source = asRecord(value)
  if (!source) return null
  if (Array.isArray(source.slots)) return { meta: source, slots: source.slots }
  if (Array.isArray(source.data)) return { meta: source, slots: source.data }
  const nested = asRecord(source.data)
  if (!nested) return null
  if (Array.isArray(nested.slots)) return { meta: nested, slots: nested.slots }
  if (Array.isArray(nested.data)) return { meta: nested, slots: nested.data }
  return null
}

/** Calendar day only. Never pass this through `Date.toISOString()`. */
function availabilityQueryDate(value: string): string {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/)
  if (!match) throw new ApiError(AVAILABILITY_LOAD_ERROR, 400)
  return match[1]
}

export function isSlotUnavailableError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (`${error.code ?? ''}`.toUpperCase() === 'SLOT_UNAVAILABLE') return true
  const blob = `${error.message ?? ''} ${JSON.stringify(error.payload ?? {})}`.toUpperCase()
  return blob.includes('SLOT_UNAVAILABLE')
}

/** The appointment being moved still owns its current slot, so that time stays selectable. */
export function releaseBookedSlot(slots: DoctorAvailabilitySlot[], startTime: string | null | undefined): DoctorAvailabilitySlot[] {
  const time = toStartTime(startTime ?? '')
  if (!time) return slots
  return slots.map((slot) => (
    slot.startTime === time && slot.status === 'BOOKED'
      ? { ...slot, status: 'AVAILABLE', available: true }
      : slot
  ))
}

/**
 * Close elapsed slots only when the selected date is today.
 * A future date keeps every working-hour slot the API marked available.
 */
export function closeElapsedSlots(
  slots: DoctorAvailabilitySlot[],
  date: string,
  now: Date = new Date(),
): DoctorAvailabilitySlot[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (date !== today) return slots
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  return slots.map((slot) => {
    if (slot.status !== 'AVAILABLE') return slot
    const match = slot.startTime.match(/^(\d{2}):(\d{2})$/)
    if (!match) return slot
    const minutes = Number(match[1]) * 60 + Number(match[2])
    if (minutes > minutesNow) return slot
    return { ...slot, status: 'PAST', available: false }
  })
}

const RESCHEDULE_MESSAGES = {
  SLOT_UNAVAILABLE: 'This time slot was just booked. Please select another available time.',
  APPOINTMENT_NOT_FOUND: 'Appointment could not be found.',
  APPOINTMENT_CANCELLED: 'Cancelled appointments cannot be rescheduled.',
  PAST_TIME: 'Please select a future time.',
  UNAUTHORIZED: 'You do not have permission to reschedule this appointment.',
  GENERIC: 'Unable to reschedule the appointment. Please try again.',
} as const

function rescheduleErrorCode(error: ApiError): string {
  const explicit = `${error.code ?? ''}`.trim().toUpperCase()
  if (explicit) return explicit
  const payloadCode = typeof error.payload?.code === 'string' ? error.payload.code.trim().toUpperCase() : ''
  if (payloadCode) return payloadCode
  if (error.status === 0 || error.status >= 500) return ''
  const blob = `${error.message ?? ''} ${JSON.stringify(error.payload ?? {})}`.toUpperCase()
  if (blob.includes('SLOT_UNAVAILABLE')) return 'SLOT_UNAVAILABLE'
  const text = `${error.message ?? ''}`.toLowerCase()
  if (error.status === 404 || text.includes('not found')) return 'APPOINTMENT_NOT_FOUND'
  if (text.includes('cancel')) return 'APPOINTMENT_CANCELLED'
  if (text.includes('past')) return 'PAST_TIME'
  if (error.status === 401 || error.status === 403 || text.includes('unauthorized') || text.includes('not authorized') || text.includes('permission')) {
    return 'UNAUTHORIZED'
  }
  return ''
}

/** Fixed copy for reschedule failures. Never surfaces raw backend text. */
export function rescheduleFailureMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return RESCHEDULE_MESSAGES.GENERIC
  const code = rescheduleErrorCode(error)
  if (code === 'SLOT_UNAVAILABLE') return RESCHEDULE_MESSAGES.SLOT_UNAVAILABLE
  if (code === 'APPOINTMENT_NOT_FOUND') return RESCHEDULE_MESSAGES.APPOINTMENT_NOT_FOUND
  if (code === 'APPOINTMENT_CANCELLED') return RESCHEDULE_MESSAGES.APPOINTMENT_CANCELLED
  if (code === 'PAST_TIME') return RESCHEDULE_MESSAGES.PAST_TIME
  if (code === 'UNAUTHORIZED') return RESCHEDULE_MESSAGES.UNAUTHORIZED
  return RESCHEDULE_MESSAGES.GENERIC
}

export function telehealthErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  const text = `${error.message ?? ''} ${error.payload ? JSON.stringify(error.payload) : ''}`.toLowerCase()
  if (text.includes('not available') || text.includes('unavailable') || text.includes('occupied') || text.includes('conflict')) {
    return 'Doctor is not available at this time.'
  }
  if (text.includes('duplicate') || (text.includes('already') && text.includes('appointment'))) {
    return 'This patient already has a telehealth appointment at that time.'
  }
  if (text.includes('patient') && text.includes('email')) {
    return 'Email is required for telehealth appointments because the meeting link will be sent by email.'
  }
  if (text.includes('doctor') && text.includes('email')) {
    return 'The selected doctor does not have an email address, so the meeting link cannot be sent.'
  }
  if (text.includes('meeting link') || text.includes('session') && text.includes('not')) {
    return 'Meeting link is not available for this appointment.'
  }
  if (text.includes('cancel')) return 'This appointment has been cancelled.'
  if (error.status === 401) return 'Session expired. Please login again.'
  if (error.status === 403) return 'You are not authorized to open this consultation.'
  if (error.status === 404) return error.message?.trim() || 'This consultation could not be found.'
  if (error.status === 0 || error.status >= 500) return 'Something went wrong. Please try again.'
  return patientActionErrorMessage(error, fallback)
}

function mapMeeting(value: unknown, meetingToken: string): TelehealthMeeting | null {
  const source = asRecord(value)
  if (!source) return null
  const nested = asRecord(source.appointment) ?? asRecord(source.consultation) ?? asRecord(source.meeting) ?? source
  const patient = asRecord(nested.patient) ?? asRecord(source.patient)
  const doctor = asRecord(nested.doctor) ?? asRecord(source.doctor)
  const patientName = (patient ? pickString(patient, 'full_name', 'fullName', 'name') : null)
    ?? pickString(nested, 'patient_name', 'patientName')
    ?? pickString(source, 'patient_name', 'patientName')
  if (!patientName) return null
  const date = pickString(nested, 'appointment_date', 'appointmentDate', 'visit_date', 'visitDate')
    ?? pickString(source, 'appointment_date', 'appointmentDate')
    ?? ''
  const time = toStartTime(
    pickString(nested, 'appointment_time', 'appointmentTime', 'start_time', 'startTime')
    ?? pickString(source, 'appointment_time', 'appointmentTime')
    ?? '',
  ) ?? ''
  const link = pickString(nested, 'meeting_link', 'meetingLink', 'session_url', 'sessionUrl')
    ?? pickString(source, 'meeting_link', 'meetingLink', 'session_url', 'sessionUrl')
    ?? undefined
  const doctorName = (doctor ? pickString(doctor, 'name', 'full_name', 'fullName') : null)
    ?? pickString(nested, 'doctor_name', 'doctorName')
    ?? ''
  return {
    meetingToken,
    appointmentId: pickString(nested, 'id', 'appointment_id', 'appointmentId') ?? '',
    patientId: (patient ? pickString(patient, 'id') : null) ?? pickString(nested, 'patient_id', 'patientId') ?? '',
    patientName,
    patientAge: patient ? pickNumber(patient, 'age') : pickNumber(nested, 'patient_age', 'patientAge', 'age'),
    patientGender: (patient ? pickString(patient, 'gender') : null) ?? '',
    purpose: pickString(nested, 'purpose', 'reason') ?? pickString(source, 'purpose') ?? '',
    doctorId: (doctor ? pickString(doctor, 'id', 'doctor_id', 'doctorId') : null)
      ?? pickString(nested, 'doctor_id', 'doctorId')
      ?? '',
    doctorName,
    doctorSpecialization: (doctor ? pickString(doctor, 'specialty', 'specialization') : null) ?? undefined,
    appointmentDate: date.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? date,
    appointmentTime: time,
    status: normalizeTelehealthStatus(pickString(nested, 'status', 'consultation_status', 'consultationStatus') ?? pickString(source, 'status')),
    meetingLink: link,
  }
}

export const telehealthService = {
  /**
   * Telehealth slot grid. `availability` is the date-range API (fromDate/toDate)
   * and `available-slots` is free OPD times only.
   */
  async getDoctorAvailability(
    doctorId: string,
    date: string,
    options?: { appointmentId?: string },
  ): Promise<DoctorAvailability> {
    const queryDate = availabilityQueryDate(date)
    const doctor = doctorId.trim()
    if (!doctor) throw new ApiError(AVAILABILITY_LOAD_ERROR, 400)
    const query = new URLSearchParams({ date: queryDate })
    // The date-range `/availability` API requires fromDate and toDate and does
    // not accept excludeAppointmentId. Slot status comes from telehealth-slots.
    // appointmentId keeps the consultation being moved selectable.
    if (options?.appointmentId) query.set('appointmentId', options.appointmentId)
    const data = await apiFetch<unknown>(
      `/api/doctors/${encodeURIComponent(doctor)}/telehealth-slots?${query.toString()}`,
    )
    const payload = readAvailabilityPayload(data)
    if (!payload) throw new ApiError(AVAILABILITY_LOAD_ERROR, 502)
    const slots = payload.slots
      .map(mapAvailabilitySlot)
      .filter((slot): slot is DoctorAvailabilitySlot => slot !== null)
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
    if (payload.slots.length > 0 && slots.length === 0) {
      throw new ApiError(AVAILABILITY_LOAD_ERROR, 502)
    }
    const source = payload.meta
    return {
      doctorId: (source ? pickString(source, 'doctor_id', 'doctorId') : null) ?? doctor,
      date: source?.date && typeof source.date === 'string'
        ? (source.date.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? queryDate)
        : queryDate,
      slotDurationMinutes: source ? pickNumber(source, 'slot_duration_minutes', 'slotDurationMinutes') : null,
      slots,
    }
  },

  async reschedule(appointmentId: string, payload: RescheduleTelehealthPayload) {
    const id = appointmentId.trim()
    const appointmentDate = payload.appointmentDate.trim()
    const appointmentTime = toStartTime(payload.appointmentTime)
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate) || !appointmentTime) {
      throw new ApiError(RESCHEDULE_MESSAGES.GENERIC, 400)
    }
    return apiFetch<unknown>(`/api/telehealth/${encodeURIComponent(id)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
      }),
    })
  },

  async validateMeeting(meetingToken: string): Promise<TelehealthMeeting> {
    const data = await apiFetch<unknown>(`/api/telehealth/meetings/${encodeURIComponent(meetingToken)}`)
    const meeting = mapMeeting(data, meetingToken) ?? mapMeeting(asRecord(data)?.data, meetingToken)
    if (!meeting) throw new ApiError('This consultation could not be verified.', 404)
    return meeting
  },
}
