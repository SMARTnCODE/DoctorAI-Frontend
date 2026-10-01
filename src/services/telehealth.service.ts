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

/** Late window matches the backend default. The Meet URL itself is never built here. */
const JOIN_LATE_MINUTES = 30

/**
 * True only for an https://meet.google.com meeting URL from the backend.
 * App routes such as /telehealth/{token} are not meeting URLs.
 */
export function isGoogleMeetLink(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'meet.google.com') return false
  if (parsed.username || parsed.password) return false
  const segments = parsed.pathname.split('/').map((segment) => segment.trim().toLowerCase()).filter(Boolean)
  if (segments.length === 0 || segments.includes('telehealth')) return false
  const haystack = parsed.pathname.toLowerCase()
  return !['mock', 'dummy', 'localhost', '127.0.0.1'].some((marker) => haystack.includes(marker))
}

export function isAppMeetingLink(link: string): boolean {
  return /\/telehealth\/[^/?#\s]+/i.test(link)
}

export function isTelehealthJoinExpired(
  appointment: {
    appointmentDate?: string | null
    appointmentTime?: string | null
    durationMinutes?: number | null
  },
  now: Date = new Date(),
): boolean {
  const day = appointment.appointmentDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  const time = toStartTime(appointment.appointmentTime ?? '')
  if (!day || !time) return false
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const start = new Date(year, month - 1, date, hour, minute, 0, 0)
  const duration = appointment.durationMinutes && appointment.durationMinutes > 0
    ? appointment.durationMinutes
    : TELEHEALTH_DURATION_MINUTES
  const closes = start.getTime() + (duration + JOIN_LATE_MINUTES) * 60_000
  return now.getTime() > closes
}

export function telehealthJoinBlockReason(input: {
  status?: string | null
  meetingLink?: string | null
  appointmentDate?: string | null
  appointmentTime?: string | null
  durationMinutes?: number | null
}): string | null {
  const status = normalizeTelehealthStatus(input.status)
  if (status === 'CANCELLED') return 'This appointment has been cancelled.'
  if (status === 'COMPLETED') return 'This consultation can no longer be joined.'
  if (!isGoogleMeetLink(input.meetingLink)) {
    return 'Google Meet link is not available for this appointment.'
  }
  if (isTelehealthJoinExpired(input)) return 'This consultation is outside the allowed joining window.'
  return null
}

export function canJoinTelehealth(
  status: string | null | undefined,
  meetingLink?: string | null,
  schedule?: {
    appointmentDate?: string | null
    appointmentTime?: string | null
    durationMinutes?: number | null
  },
): boolean {
  return telehealthJoinBlockReason({
    status,
    meetingLink,
    appointmentDate: schedule?.appointmentDate,
    appointmentTime: schedule?.appointmentTime,
    durationMinutes: schedule?.durationMinutes,
  }) == null
}

/** Opens the backend Meet URL. Returns false when the link is missing or not a Google Meet URL. */
export function openGoogleMeet(meetingLink: string | null | undefined): boolean {
  if (!isGoogleMeetLink(meetingLink)) return false
  window.open(meetingLink.trim(), '_blank', 'noopener,noreferrer')
  return true
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
    id: patient.appointmentId?.trim() || '',
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
    meetingLink: isGoogleMeetLink(link) ? link.trim() : undefined,
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
  if (`${error.message ?? ''}`.toLowerCase().includes('completed')) {
    return 'Completed appointments cannot be rescheduled.'
  }
  return RESCHEDULE_MESSAGES.GENERIC
}

const CANCEL_MESSAGES = {
  ALREADY: 'This appointment is already cancelled.',
  NOT_FOUND: 'Appointment could not be found.',
  UNAUTHORIZED: 'You do not have permission to cancel this appointment.',
  GENERIC: 'Unable to cancel the appointment. Please try again.',
} as const

export function cancelFailureMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return CANCEL_MESSAGES.GENERIC
  if (error.status === 401) return 'Session expired. Please login again.'
  if (error.status === 403) return CANCEL_MESSAGES.UNAUTHORIZED
  if (error.status === 404) return CANCEL_MESSAGES.NOT_FOUND
  const text = `${error.message ?? ''}`.toLowerCase()
  if (text.includes('already cancelled')) return CANCEL_MESSAGES.ALREADY
  if (error.status === 0 || error.status >= 500) return CANCEL_MESSAGES.GENERIC
  return error.message?.trim() || CANCEL_MESSAGES.GENERIC
}

export function telehealthErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  const text = `${error.message ?? ''} ${error.payload ? JSON.stringify(error.payload) : ''}`.toLowerCase()
  if (
    text.includes('connect google calendar')
    || text.includes('no longer connected')
    || text.includes('authorization expired')
    || text.includes('google calendar permission')
  ) {
    return 'Google Calendar is not connected. Connect it in Settings before scheduling a telehealth appointment.'
  }
  if (text.includes('could not be created') || text.includes('meet link could not')) {
    return 'Google Meet link could not be created. Please try again.'
  }
  if (text.includes('meet link is not available') || text.includes('meeting link is not available')) {
    return 'Google Meet link is not available for this appointment.'
  }
  if (text.includes('outside the allowed joining window')) {
    return 'This consultation is outside the allowed joining window.'
  }
  if (text.includes('can no longer be joined')) {
    return 'This consultation can no longer be joined.'
  }
  if (text.includes('already cancelled') || text.includes('has been cancelled')) {
    return 'This appointment has been cancelled.'
  }
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
  const date = pickString(nested, 'appointment_date', 'appointmentDate', 'visit_date', 'visitDate', 'date')
    ?? pickString(source, 'appointment_date', 'appointmentDate', 'date')
    ?? ''
  const time = toStartTime(
    pickString(nested, 'appointment_time', 'appointmentTime', 'start_time', 'startTime', 'time')
    ?? pickString(source, 'appointment_time', 'appointmentTime', 'time')
    ?? '',
  ) ?? ''
  const rawLink = pickString(nested, 'meeting_link', 'meetingLink')
    ?? pickString(source, 'meeting_link', 'meetingLink')
  const link = isGoogleMeetLink(rawLink) ? rawLink.trim() : undefined
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

function mapTelehealthDetails(value: unknown, fallbackId?: string): TelehealthAppointment | null {
  const source = asRecord(value)
  if (!source) return null
  const nested = asRecord(source.telehealth_appointment)
    ?? asRecord(source.telehealthAppointment)
    ?? asRecord(source.appointment)
    ?? asRecord(source.consultation)
    ?? source
  const patient = asRecord(nested.patient) ?? asRecord(source.patient)
  const doctor = asRecord(nested.doctor) ?? asRecord(source.doctor)
  const id = pickString(nested, 'appointment_id', 'appointmentId', 'id')
    ?? (nested === source ? null : pickString(source, 'appointment_id', 'appointmentId'))
    ?? (fallbackId?.trim() || null)
  if (!id) return null
  const rawLink = pickString(nested, 'meeting_link', 'meetingLink')
    ?? pickString(source, 'meeting_link', 'meetingLink')
  const date = pickString(nested, 'appointment_date', 'appointmentDate', 'date', 'visit_date', 'visitDate')
    ?? pickString(source, 'appointment_date', 'appointmentDate', 'date')
    ?? ''
  const time = toStartTime(
    pickString(nested, 'appointment_time', 'appointmentTime', 'time', 'start_time', 'startTime')
    ?? pickString(source, 'appointment_time', 'appointmentTime', 'time')
    ?? '',
  ) ?? ''
  const patientName = (patient ? pickString(patient, 'full_name', 'fullName', 'name') : null)
    ?? pickString(nested, 'patient_name', 'patientName')
    ?? ''
  const doctorName = (doctor ? pickString(doctor, 'name', 'full_name', 'fullName') : null)
    ?? pickString(nested, 'doctor_name', 'doctorName')
    ?? ''
  return {
    id,
    patientId: (patient ? pickString(patient, 'id', 'patient_id', 'patientId') : null)
      ?? pickString(nested, 'patient_id', 'patientId')
      ?? '',
    doctorId: (doctor ? pickString(doctor, 'id', 'doctor_id', 'doctorId') : null)
      ?? pickString(nested, 'doctor_id', 'doctorId')
      ?? '',
    patientName,
    patientAge: patient ? pickNumber(patient, 'age') : pickNumber(nested, 'age'),
    patientGender: (patient ? pickString(patient, 'gender') : null) ?? '',
    purpose: pickString(nested, 'purpose', 'reason') ?? '',
    appointmentDate: date.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? date,
    appointmentTime: time,
    durationMinutes: pickNumber(nested, 'duration_minutes', 'durationMinutes', 'duration') ?? TELEHEALTH_DURATION_MINUTES,
    status: normalizeTelehealthStatus(pickString(nested, 'status', 'consultation_status', 'consultationStatus')),
    meetingLink: isGoogleMeetLink(rawLink) ? rawLink.trim() : undefined,
    doctorName,
    doctorSpecialization: (doctor ? pickString(doctor, 'specialization', 'specialty') : null) ?? undefined,
  }
}

/** Prefer the refreshed appointment, and keep a Meet link the refresh omitted. */
function mergeTelehealthAppointment(
  primary: TelehealthAppointment | null,
  fallback: TelehealthAppointment | null,
): TelehealthAppointment | null {
  if (!primary) return fallback
  if (!fallback) return primary
  return {
    ...fallback,
    ...primary,
    patientName: primary.patientName || fallback.patientName,
    doctorName: primary.doctorName || fallback.doctorName,
    doctorSpecialization: primary.doctorSpecialization || fallback.doctorSpecialization,
    purpose: primary.purpose || fallback.purpose,
    appointmentDate: primary.appointmentDate || fallback.appointmentDate,
    appointmentTime: primary.appointmentTime || fallback.appointmentTime,
    status: primary.status || fallback.status,
    meetingLink: primary.meetingLink || fallback.meetingLink,
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

  async getAppointment(appointmentId: string): Promise<TelehealthAppointment> {
    const id = appointmentId.trim()
    if (!id) throw new ApiError('Appointment could not be found.', 404)
    const data = await apiFetch<unknown>(`/api/telehealth/${encodeURIComponent(id)}`)
    const appointment = mapTelehealthDetails(data, id) ?? mapTelehealthDetails(asRecord(data)?.data, id)
    if (!appointment) throw new ApiError('Appointment could not be found.', 404)
    return appointment
  },

  async reschedule(appointmentId: string, payload: RescheduleTelehealthPayload): Promise<TelehealthAppointment> {
    const id = appointmentId.trim()
    const appointmentDate = payload.appointmentDate.trim()
    const appointmentTime = toStartTime(payload.appointmentTime)
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate) || !appointmentTime) {
      throw new ApiError(RESCHEDULE_MESSAGES.GENERIC, 400)
    }
    const data = await apiFetch<unknown>(`/api/telehealth/${encodeURIComponent(id)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
      }),
    })
    const moved = mapTelehealthDetails(data, id) ?? mapTelehealthDetails(asRecord(data)?.data, id)
    const fresh = await this.getAppointment(id).catch(() => null)
    const appointment = mergeTelehealthAppointment(fresh, moved)
    if (!appointment) throw new ApiError(RESCHEDULE_MESSAGES.GENERIC, 502)
    return {
      ...appointment,
      appointmentDate: moved?.appointmentDate || appointmentDate,
      appointmentTime: moved?.appointmentTime || appointmentTime,
      meetingLink: fresh?.meetingLink || moved?.meetingLink || appointment.meetingLink,
    }
  },

  async cancel(appointmentId: string): Promise<TelehealthAppointment> {
    const id = appointmentId.trim()
    if (!id) throw new ApiError(CANCEL_MESSAGES.NOT_FOUND, 404)
    const data = await apiFetch<unknown>(`/api/telehealth/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    })
    const cancelled = mapTelehealthDetails(data, id) ?? mapTelehealthDetails(asRecord(data)?.data, id)
    const fresh = await this.getAppointment(id).catch(() => null)
    const appointment = mergeTelehealthAppointment(
      fresh ? { ...fresh, status: 'CANCELLED' } : null,
      cancelled ? { ...cancelled, status: 'CANCELLED' } : null,
    )
    if (!appointment) throw new ApiError(CANCEL_MESSAGES.GENERIC, 502)
    return { ...appointment, status: 'CANCELLED' }
  },

  async validateMeeting(meetingToken: string): Promise<TelehealthMeeting> {
    const data = await apiFetch<unknown>(`/api/telehealth/meeting/${encodeURIComponent(meetingToken)}`)
    const meeting = mapMeeting(data, meetingToken) ?? mapMeeting(asRecord(data)?.data, meetingToken)
    if (!meeting) throw new ApiError('This consultation could not be verified.', 404)
    return meeting
  },
}
