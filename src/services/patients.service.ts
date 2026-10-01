/**
 * Patient and referral APIs.
 * List, detail, and referral queries return only what the backend authorizes
 * for the current token. The UI renders that payload and does not re-filter
 * by doctor id.
 */
import { ApiError, apiFetch } from '@/lib/api-client'

export const PATIENT_TYPES = ['IN_HOSPITAL', 'OPD', 'TELEHEALTH'] as const
export const PATIENT_GENDERS = ['Male', 'Female', 'Other'] as const
export const REFERRAL_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'] as const

export type PatientType = (typeof PATIENT_TYPES)[number]
export type PatientGender = (typeof PATIENT_GENDERS)[number]

/** Display labels. API values stay IN_HOSPITAL, OPD, and TELEHEALTH. */
export const PATIENT_TYPE_LABELS: Record<PatientType, string> = {
  IN_HOSPITAL: 'In-Hospital',
  OPD: 'OPD',
  TELEHEALTH: 'Telehealth',
}

const LEGACY_PATIENT_TYPES: Record<string, PatientType> = {
  'in-hospital patient': 'IN_HOSPITAL',
  'in hospital patient': 'IN_HOSPITAL',
  'op patient': 'OPD',
  'opd patient': 'OPD',
  'telehealth patient': 'TELEHEALTH',
}

export function normalizePatientType(value: string | null | undefined): PatientType | null {
  const text = value?.trim()
  if (!text) return null
  const compact = text.toUpperCase().replace(/[\s-]+/g, '_')
  if (compact === 'IN_HOSPITAL' || compact === 'INHOSPITAL') return 'IN_HOSPITAL'
  if (compact === 'OPD' || compact === 'OP') return 'OPD'
  if (compact === 'TELEHEALTH') return 'TELEHEALTH'
  return LEGACY_PATIENT_TYPES[text.toLowerCase()] ?? null
}

export function isPatientDischarged(
  status: string | null | undefined,
  clinicalStatus?: string | null,
): boolean {
  return [status, clinicalStatus].some((value) => (value ?? '').trim().toUpperCase() === 'DISCHARGED')
}

export function patientTypeLabel(value: string | null | undefined): string {
  const normalized = normalizePatientType(value)
  if (normalized) return PATIENT_TYPE_LABELS[normalized]
  const text = value?.trim()
  return text || '—'
}

export function isPatientType(value: string): value is PatientType {
  return (PATIENT_TYPES as readonly string[]).includes(value)
}
export type PatientAccessType = 'OWNED' | 'REFERRED'
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number]

export interface PatientDoctorRef {
  id: string
  doctorId?: string
  name: string
  specialty?: string | null
  department?: PatientDepartmentRef | null
}

export interface PatientDepartmentRef {
  id: string
  name: string
  code?: string
}

/** In-hospital vitals. Every field is optional; partial updates send only the keys that changed. */
export interface LatestVitals {
  heartRate?: number | null
  systolicBP?: number | null
  diastolicBP?: number | null
  oxygenSaturation?: number | null
  temperature?: number | null
  weight?: number | null
  respiratoryRate?: number | null
}

/** One stored vital row, including when it was recorded. */
export interface PatientVitalReading {
  recordedAt?: string | null
  heartRate?: number | null
  systolicBP?: number | null
  diastolicBP?: number | null
  oxygenSaturation?: number | null
  temperature?: number | null
  weight?: number | null
  respiratoryRate?: number | null
}

/** Display model. Legacy keys stay populated so existing vitals readouts keep working. */
export interface PatientVitals extends LatestVitals {
  oxygenSat?: number | null
  bloodPressureS?: number | null
  bloodPressureD?: number | null
}

/** Ward master used by the in-hospital list and the edit form. */
export const PATIENT_WARDS = ['A-Ward', 'B-Ward', 'ICU', 'CCU', 'Pediatrics', 'General'] as const

/** Clinical severity for in-hospital patients. Record status (ACTIVE) is separate. */
export const CLINICAL_STATUSES = ['STABLE', 'MODERATE', 'CRITICAL'] as const
export type ClinicalStatus = (typeof CLINICAL_STATUSES)[number]

export const CLINICAL_STATUS_LABELS: Record<ClinicalStatus, string> = {
  STABLE: 'Stable',
  MODERATE: 'Moderate',
  CRITICAL: 'Critical',
}

/** Select value meaning the user explicitly cleared an optional dropdown. */
export const OPTIONAL_CLEAR = '__unset__'

export function normalizeClinicalStatus(value: string | null | undefined): string {
  const text = value?.trim() ?? ''
  if (!text || text === OPTIONAL_CLEAR) return ''
  const key = text.toUpperCase().replace(/[\s-]+/g, '_')
  if ((CLINICAL_STATUSES as readonly string[]).includes(key)) return key
  return text
}

export function clinicalStatusLabel(value: string | null | undefined): string {
  const normalized = normalizeClinicalStatus(value)
  if (!normalized) return '—'
  if ((CLINICAL_STATUSES as readonly string[]).includes(normalized)) {
    return CLINICAL_STATUS_LABELS[normalized as ClinicalStatus]
  }
  return normalized
}

export function normalizeWard(value: string | null | undefined): string {
  const text = value?.trim() ?? ''
  if (!text || text === OPTIONAL_CLEAR) return ''
  const match = PATIENT_WARDS.find((ward) => ward.toLowerCase() === text.toLowerCase())
  return match ?? text
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export interface Patient {
  id: string
  patientId: string
  patientCode: string
  fullName: string
  firstName?: string | null
  lastName?: string | null
  age?: number | null
  dateOfBirth?: string | null
  gender: string
  phone?: string | null
  email?: string | null
  address?: string | null
  patientType: PatientType | string
  knownAllergies?: string | null
  condition?: string | null
  ward?: string | null
  bed?: string | null
  /** Clinical severity (STABLE, MODERATE, CRITICAL). Record status stays on `status`. */
  severity?: string | null
  admittedAt?: string | null
  latestVitals?: PatientVitals | null
  /** Saved vital rows, oldest first. Used by the vitals trend charts. */
  vitalReadings?: PatientVitalReading[]
  purpose?: string | null
  /** Visit day as YYYY-MM-DD when the backend sends a telehealth appointment. */
  appointmentDate?: string | null
  /** Visit time as HH:mm when the backend sends a telehealth appointment. */
  appointmentTime?: string | null
  /** Appointment id when it is separate from the patient id. */
  appointmentId?: string | null
  scheduledAt?: string | null
  durationMin?: number | null
  visitStatus?: string | null
  /** Backend meeting URL. The patient table does not render this value. */
  roomUrl?: string | null
  bloodGroup?: string | null
  status: string
  dischargeNote?: string | null
  dischargedAt?: string | null
  dischargedBy?: string | null
  accessType?: PatientAccessType | null
  primaryDoctor?: PatientDoctorRef | null
  department?: PatientDepartmentRef | null
  lastVisit?: string | null
  visitCount?: number
  referralCount?: number
  activeReferral?: boolean
  createdAt?: string | null
  updatedAt?: string | null
}

export interface PatientListResponse {
  items: Patient[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** Present only when the list payload includes authorized ward totals. */
  wardCounts: Record<string, number> | null
}

export interface PatientListParams {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  patientType?: string
  departmentId?: string
  doctorId?: string
  sortBy?: string
  sortOrder?: string
}

/** Demographics only. Department, doctor, and hospital are assigned by the backend. */
export interface PatientWritePayload {
  fullName: string
  patientType: PatientType
  dateOfBirth?: string | null
  gender: string
  phone?: string | null
  email?: string | null
  address?: string | null
  knownAllergies?: string | null
  /** Sent only when patientType is TELEHEALTH. */
  age?: number | null
  bloodGroup?: string | null
  purpose?: string | null
  appointmentDate?: string | null
  appointmentTime?: string | null
  doctorId?: string | null
}

/**
 * Partial patient update. Undefined keys are omitted.
 * Null is sent only when the user explicitly cleared a value the backend can clear.
 */
export interface PatientUpdatePayload {
  fullName?: string
  patientType?: PatientType
  dateOfBirth?: string | null
  gender?: string
  phone?: string | null
  email?: string | null
  address?: string | null
  knownAllergies?: string | null
  condition?: string | null
  clinicalStatus?: string | null
  ward?: string | null
  bed?: string | null
  admittedAt?: string | null
  latestVitals?: LatestVitals | null
  /** Telehealth reschedule fallback. Omitted from ordinary patient edits. */
  consultationAt?: string | null
}

/** Edit-form values compared with the loaded patient to build a partial update. */
export interface PatientEditDraft {
  fullName: string
  patientType: string
  age: string
  gender: string
  phone: string
  email: string
  address: string
  knownAllergies: string
  condition: string
  ward: string
  bed: string
  clinicalStatus: string
  admittedAtLocal: string
  heartRate: string
  systolicBP: string
  diastolicBP: string
  oxygenSaturation: string
  temperature: string
  weight: string
  respiratoryRate: string
}

export interface PatientSummaryCounts {
  total: number
  inHospital: number
  opPatients: number
  telehealth: number
}

export interface PatientReferral {
  id: string
  patientId: string
  patient?: {
    id: string
    patientId: string
    fullName: string
  } | null
  referringDoctor?: PatientDoctorRef | null
  referredDoctor?: PatientDoctorRef | null
  /** Department before this referral, when the backend includes it. */
  previousDepartment?: PatientDepartmentRef | null
  /** Department after this referral, when the backend includes it. */
  referredDepartment?: PatientDepartmentRef | null
  referralReason: string
  message?: string | null
  status: ReferralStatus | string
  rejectionReason?: string | null
  createdAt: string
  acceptedAt?: string | null
  rejectedAt?: string | null
  cancelledAt?: string | null
  completedAt?: string | null
}

export interface ReferralListResponse {
  items: PatientReferral[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ReferralListParams {
  page?: number
  pageSize?: number
  status?: string
  patientId?: string
  search?: string
}

export interface ReferralCreatePayload {
  referredDoctorId: string
  referralReason: string
  message?: string | null
}

export interface ReferralDoctorOption {
  id: string
  doctorId?: string
  name: string
  department: { id: string; name: string } | null
  specialization?: string
  specializations: string[]
}

export interface ReferralDoctorListResponse {
  items: ReferralDoctorOption[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** UI hints from the backend access type. Not an authorization check. */
export function patientUiActions(patient: Pick<Patient, 'accessType' | 'status'>) {
  const owned = patient.accessType === 'OWNED'
  const active = patient.status === 'ACTIVE'
  return {
    canEdit: owned,
    canRefer: owned && active,
    canDeactivate: owned && active,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string') return value
  }
  return null
}

function personName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  const source = asRecord(value)
  if (!source) return null
  const name = pickString(source, 'name', 'full_name', 'fullName')
  if (name?.trim()) return name.trim()
  const combined = [pickString(source, 'first_name', 'firstName'), pickString(source, 'last_name', 'lastName')]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim()
  return combined || null
}

function pickNumber(source: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value)
  }
  return null
}

function doctorSpecialty(source: Record<string, unknown>): string | null {
  const direct = pickString(source, 'specialty', 'specialization', 'speciality')
  if (direct?.trim()) return direct.trim()
  const specs = source.specializations ?? source.specialization
  if (Array.isArray(specs)) {
    for (const item of specs) {
      if (typeof item === 'string' && item.trim()) return item.trim()
      const record = asRecord(item)
      const name = record ? pickString(record, 'name', 'specialization') : null
      if (name?.trim()) return name.trim()
    }
  }
  const nested = asRecord(specs)
  const nestedName = nested ? pickString(nested, 'name') : null
  return nestedName?.trim() || null
}

function firstListItem(value: unknown): unknown {
  return Array.isArray(value) && value.length > 0 ? value[0] : null
}

function mapDoctorRef(value: unknown): PatientDoctorRef | null {
  const source = asRecord(value)
  if (!source) return null
  const id = pickString(source, 'id') ?? pickString(source, 'doctor_id', 'doctorId')
  const name = personName(source)
  if (!id || !name) return null
  const department = mapDepartment(source.department)
  return {
    id,
    doctorId: pickString(source, 'doctor_id', 'doctorId') ?? undefined,
    name,
    specialty: doctorSpecialty(source) ?? department?.name ?? null,
    department,
  }
}

function mapVitals(value: unknown): PatientVitals | null {
  const source = asRecord(value)
  if (!source) return null
  let bloodPressureS = pickNumber(
    source,
    'systolic_bp', 'systolicBP', 'systolicBp', 'blood_pressure_s', 'bloodPressureS', 'systolic',
  )
  let bloodPressureD = pickNumber(
    source,
    'diastolic_bp', 'diastolicBP', 'diastolicBp', 'blood_pressure_d', 'bloodPressureD', 'diastolic',
  )
  const combined = pickString(source, 'blood_pressure', 'bloodPressure')
  if ((bloodPressureS == null || bloodPressureD == null) && combined?.includes('/')) {
    const [systolic, diastolic] = combined.split('/')
    if (bloodPressureS == null && systolic?.trim()) bloodPressureS = Number(systolic)
    if (bloodPressureD == null && diastolic?.trim()) bloodPressureD = Number(diastolic)
    if (Number.isNaN(bloodPressureS)) bloodPressureS = null
    if (Number.isNaN(bloodPressureD)) bloodPressureD = null
  }
  const oxygen = pickNumber(source, 'oxygen_saturation', 'oxygenSaturation', 'oxygen_sat', 'oxygenSat', 'spo2')
  const vitals: PatientVitals = {
    heartRate: pickNumber(source, 'heart_rate', 'heartRate', 'bpm'),
    oxygenSat: oxygen,
    oxygenSaturation: oxygen,
    bloodPressureS,
    bloodPressureD,
    systolicBP: bloodPressureS,
    diastolicBP: bloodPressureD,
    temperature: pickNumber(source, 'temperature', 'temp'),
    weight: pickNumber(source, 'weight', 'weight_kg', 'weightKg'),
    respiratoryRate: pickNumber(source, 'respiratory_rate', 'respiratoryRate'),
  }
  if (
    vitals.heartRate == null
    && vitals.oxygenSaturation == null
    && vitals.systolicBP == null
    && vitals.diastolicBP == null
    && vitals.temperature == null
    && vitals.weight == null
    && vitals.respiratoryRate == null
  ) return null
  return vitals
}

function mapVitalReadings(value: unknown): PatientVitalReading[] {
  if (!Array.isArray(value)) return []
  const readings: PatientVitalReading[] = []
  for (const item of value) {
    const source = asRecord(item)
    const vitals = mapVitals(source)
    if (!source || !vitals) continue
    readings.push({
      recordedAt: pickString(source, 'recorded_at', 'recordedAt'),
      heartRate: vitals.heartRate,
      systolicBP: vitals.systolicBP,
      diastolicBP: vitals.diastolicBP,
      oxygenSaturation: vitals.oxygenSaturation,
      temperature: vitals.temperature,
      weight: vitals.weight,
      respiratoryRate: vitals.respiratoryRate,
    })
  }
  return readings
}

function mapLatestVitals(source: Record<string, unknown>): PatientVitals | null {
  const direct = source.latest_vitals ?? source.latestVitals ?? source.vitals
  if (Array.isArray(direct)) {
    const last = direct.length > 0 ? direct[direct.length - 1] : null
    return mapVitals(last)
  }
  return mapVitals(direct)
}

function mapWardCounts(value: unknown): Record<string, number> | null {
  const source = asRecord(value)
  if (!source) return null
  const counts: Record<string, number> = {}
  for (const [key, raw] of Object.entries(source)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) counts[key] = raw
    else if (typeof raw === 'string' && raw.trim() && !Number.isNaN(Number(raw))) counts[key] = Number(raw)
  }
  return counts
}

function mapDepartment(value: unknown): PatientDepartmentRef | null {
  const source = asRecord(value)
  if (!source) return null
  const id = pickString(source, 'id')
  const name = pickString(source, 'name')
  if (!id || !name) return null
  const code = pickString(source, 'code')
  return { id, name, code: code ?? undefined }
}

function isLegacyAppMeetingUrl(value: string): boolean {
  return /\/telehealth\/[^/?#\s]+/i.test(value)
}

/**
 * The appointment's meeting_link wins. Older room or session URLs are used only
 * when they are not the in-app /telehealth/{token} route.
 */
function meetingLinkFrom(
  source: Record<string, unknown> | null,
  appointment: Record<string, unknown> | null,
): string | null {
  const records = [appointment, source].filter((record): record is Record<string, unknown> => Boolean(record))
  for (const record of records) {
    const link = pickString(record, 'meeting_link', 'meetingLink')
    if (link) return link
  }
  for (const record of records) {
    const link = pickString(record, 'session_url', 'sessionUrl', 'room_url', 'roomUrl')
    if (link && !isLegacyAppMeetingUrl(link)) return link
  }
  return null
}

function nestedAppointment(source: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!source) return null
  return asRecord(source.telehealth_appointment)
    ?? asRecord(source.telehealthAppointment)
    ?? asRecord(source.telehealth_session)
    ?? asRecord(source.telehealthSession)
    ?? asRecord(source.appointment)
    ?? asRecord(source.next_appointment)
    ?? asRecord(source.nextAppointment)
    ?? asRecord(source.visit)
    ?? asRecord(source.consultation)
}

function localDateAndTime(value: string | null): { date: string | null; time: string | null } {
  if (!value) return { date: null, time: null }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, time: null }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    const embedded = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
    return { date: embedded?.[1] ?? null, time: embedded?.[2] ?? null }
  }
  const date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  const time = `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
  return { date, time }
}

export function mapPatient(value: unknown): Patient | null {
  const source = asRecord(value)
  if (!source) return null
  const id = pickString(source, 'id')
  const patientId = pickString(source, 'patient_id', 'patientId', 'patient_code', 'patientCode')
  const firstName = pickString(source, 'first_name', 'firstName')
  const lastName = pickString(source, 'last_name', 'lastName')
  const fullName = pickString(source, 'full_name', 'fullName')
    ?? ([firstName, lastName].filter((part): part is string => Boolean(part)).join(' ') || null)
  if (!id || !patientId || !fullName) return null
  const access = pickString(source, 'access_type', 'accessType')
  const admission = asRecord(source.admission)
  const rawType = pickString(source, 'patient_type', 'patientType') ?? ''
  const appointment = nestedAppointment(source)
  const consultationAt = pickString(source, 'consultation_at', 'consultationAt', 'visit_at', 'visitAt')
    ?? (appointment ? pickString(appointment, 'consultation_at', 'consultationAt', 'scheduled_at', 'scheduledAt') : null)
  const splitConsultation = localDateAndTime(consultationAt)
  const appointmentDate = pickString(source, 'appointment_date', 'appointmentDate')
    ?? (appointment ? pickString(appointment, 'appointment_date', 'appointmentDate', 'visit_date', 'visitDate') : null)
    ?? splitConsultation.date
  const appointmentTime = pickString(source, 'appointment_time', 'appointmentTime', 'start_time', 'startTime')
    ?? (appointment ? pickString(appointment, 'appointment_time', 'appointmentTime', 'start_time', 'startTime') : null)
    ?? splitConsultation.time
  const scheduledAt = pickString(source, 'scheduled_at', 'scheduledAt', 'appointment_at', 'appointmentAt')
    ?? consultationAt
    ?? (appointmentDate && appointmentTime ? `${appointmentDate}T${appointmentTime}:00` : appointmentDate)
  const meetingLink = meetingLinkFrom(source, appointment)
  return {
    id,
    patientId,
    patientCode: pickString(source, 'patient_code', 'patientCode') ?? patientId,
    fullName,
    firstName,
    lastName,
    age: pickNumber(source, 'age'),
    dateOfBirth: pickString(source, 'date_of_birth', 'dateOfBirth'),
    gender: pickString(source, 'gender') ?? '',
    phone: pickString(source, 'phone'),
    email: pickString(source, 'email'),
    address: pickString(source, 'address'),
    patientType: normalizePatientType(rawType) ?? rawType,
    knownAllergies: pickString(source, 'known_allergies', 'knownAllergies'),
    condition: pickString(source, 'condition', 'diagnosis', 'chief_complaint', 'chiefComplaint')
      ?? (admission ? pickString(admission, 'condition', 'diagnosis') : null),
    ward: pickString(source, 'ward', 'ward_name', 'wardName')
      ?? (admission ? pickString(admission, 'ward', 'ward_name', 'wardName') : null),
    bed: pickString(source, 'bed', 'bed_number', 'bedNumber')
      ?? (admission ? pickString(admission, 'bed', 'bed_number', 'bedNumber') : null),
    severity: pickString(source, 'severity', 'clinical_status', 'clinicalStatus', 'acuity')
      ?? (admission ? pickString(admission, 'severity') : null),
    admittedAt: pickString(source, 'admitted_at', 'admittedAt', 'admission_date', 'admissionDate')
      ?? (admission ? pickString(admission, 'admitted_at', 'admittedAt', 'admit_date', 'admitDate') : null),
    latestVitals: mapLatestVitals(source) ?? (admission ? mapLatestVitals(admission) : null),
    vitalReadings: mapVitalReadings(source.vitals ?? admission?.vitals),
    purpose: pickString(source, 'purpose', 'visit_reason', 'visitReason')
      ?? (appointment ? pickString(appointment, 'purpose', 'reason') : null),
    appointmentDate,
    appointmentTime,
    appointmentId: pickString(source, 'appointment_id', 'appointmentId', 'consultation_id', 'consultationId', 'visit_id', 'visitId')
      ?? (appointment ? pickString(appointment, 'id', 'appointment_id', 'appointmentId', 'visit_id', 'visitId') : null),
    scheduledAt,
    durationMin: pickNumber(source, 'duration_min', 'durationMin', 'duration_minutes', 'durationMinutes')
      ?? (appointment ? pickNumber(appointment, 'duration_min', 'durationMin', 'duration_minutes', 'durationMinutes', 'duration') : null),
    visitStatus: pickString(source, 'consultation_status', 'consultationStatus', 'visit_status', 'visitStatus', 'appointment_status', 'appointmentStatus')
      ?? (appointment ? pickString(appointment, 'status', 'consultation_status', 'consultationStatus') : null),
    roomUrl: meetingLink,
    bloodGroup: pickString(source, 'blood_group', 'bloodGroup'),
    status: pickString(source, 'status') ?? 'ACTIVE',
    dischargeNote: pickString(source, 'discharge_note', 'dischargeNote')
      ?? (admission ? pickString(admission, 'discharge_note', 'dischargeNote') : null),
    dischargedAt: pickString(source, 'discharged_at', 'dischargedAt')
      ?? (admission ? pickString(admission, 'discharged_at', 'dischargedAt') : null),
    dischargedBy: pickString(source, 'discharged_by_name', 'dischargedByName')
      ?? personName(source.discharged_by ?? source.dischargedBy ?? source.discharged_by_doctor ?? source.dischargedByDoctor)
      ?? (admission
        ? personName(admission.discharged_by ?? admission.dischargedBy ?? admission.discharged_by_doctor ?? admission.dischargedByDoctor)
        : null),
    accessType: access === 'OWNED' || access === 'REFERRED' ? access : null,
    primaryDoctor: mapDoctorRef(
      source.primary_doctor
      ?? source.primaryDoctor
      ?? source.assigned_doctor
      ?? source.assignedDoctor
      ?? source.doctor
      ?? (appointment ? (appointment.doctor ?? appointment.primary_doctor ?? appointment.primaryDoctor) : null)
      ?? firstListItem(source.doctors),
    ),
    department: mapDepartment(source.department),
    lastVisit: pickString(source, 'last_visit', 'lastVisit'),
    visitCount: pickNumber(source, 'visit_count', 'visitCount') ?? 0,
    referralCount: pickNumber(source, 'referral_count', 'referralCount') ?? undefined,
    activeReferral: Boolean(source.active_referral ?? source.activeReferral),
    createdAt: pickString(source, 'created_at', 'createdAt'),
    updatedAt: pickString(source, 'updated_at', 'updatedAt'),
  }
}

function mapPatientPayload(value: unknown): Patient | null {
  const direct = mapPatient(value)
  if (direct) return direct
  const source = asRecord(value)
  if (!source) return null
  return mapPatient(source.patient) ?? mapPatient(source.record)
}

export function mapPatientList(value: unknown): PatientListResponse {
  const source = asRecord(value) ?? {}
  const rawRows = Array.isArray(source.items)
    ? source.items
    : Array.isArray(source.patients)
      ? source.patients
      : []
  return {
    items: rawRows.map(mapPatient).filter((row): row is Patient => row !== null),
    total: pickNumber(source, 'total') ?? 0,
    page: pickNumber(source, 'page') ?? 1,
    pageSize: pickNumber(source, 'page_size', 'pageSize') ?? rawRows.length,
    totalPages: pickNumber(source, 'total_pages', 'totalPages') ?? 0,
    wardCounts: mapWardCounts(source.ward_counts ?? source.wardCounts),
  }
}

function mapReferral(value: unknown): PatientReferral | null {
  const source = asRecord(value)
  if (!source) return null
  const id = pickString(source, 'id')
  const patientId = pickString(source, 'patient_id', 'patientId')
  const reason = pickString(source, 'referral_reason', 'referralReason')
  const createdAt = pickString(source, 'created_at', 'createdAt')
  if (!id || !patientId || reason == null || !createdAt) return null
  const patient = asRecord(source.patient)
  return {
    id,
    patientId,
    patient: patient
      ? {
          id: pickString(patient, 'id') ?? '',
          patientId: pickString(patient, 'patient_id', 'patientId') ?? '',
          fullName: pickString(patient, 'full_name', 'fullName') ?? '',
        }
      : null,
    referringDoctor: mapDoctorRef(source.referring_doctor ?? source.referringDoctor),
    referredDoctor: mapDoctorRef(source.referred_doctor ?? source.referredDoctor),
    previousDepartment: mapDepartment(
      source.previous_department ?? source.previousDepartment ?? source.from_department ?? source.fromDepartment,
    ),
    referredDepartment: mapDepartment(
      source.referred_department ?? source.referredDepartment ?? source.to_department ?? source.toDepartment,
    ),
    referralReason: reason,
    message: pickString(source, 'message'),
    status: pickString(source, 'status') ?? 'PENDING',
    rejectionReason: pickString(source, 'rejection_reason', 'rejectionReason'),
    createdAt,
    acceptedAt: pickString(source, 'accepted_at', 'acceptedAt'),
    rejectedAt: pickString(source, 'rejected_at', 'rejectedAt'),
    cancelledAt: pickString(source, 'cancelled_at', 'cancelledAt'),
    completedAt: pickString(source, 'completed_at', 'completedAt'),
  }
}

function mapReferralList(value: unknown): ReferralListResponse {
  const source = asRecord(value) ?? {}
  const rawRows = Array.isArray(source.items) ? source.items : []
  return {
    items: rawRows.map(mapReferral).filter((row): row is PatientReferral => row !== null),
    total: pickNumber(source, 'total') ?? rawRows.length,
    page: pickNumber(source, 'page') ?? 1,
    pageSize: pickNumber(source, 'page_size', 'pageSize') ?? rawRows.length,
    totalPages: pickNumber(source, 'total_pages', 'totalPages') ?? 1,
  }
}

export function patientListPath(params: PatientListParams = {}): string {
  const query = new URLSearchParams()
  if (params.page != null) query.set('page', String(params.page))
  if (params.pageSize != null) query.set('pageSize', String(params.pageSize))
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.status && params.status !== 'ALL') query.set('status', params.status)
  if (params.patientType && params.patientType !== 'ALL') query.set('patientType', params.patientType)
  if (params.departmentId && params.departmentId !== 'ALL') query.set('departmentId', params.departmentId)
  if (params.doctorId && params.doctorId !== 'ALL') query.set('doctorId', params.doctorId)
  if (params.sortBy) query.set('sortBy', params.sortBy)
  if (params.sortOrder) query.set('sortOrder', params.sortOrder)
  const text = query.toString()
  return `/api/patients${text ? `?${text}` : ''}`
}

function referralListPath(params: ReferralListParams = {}): string {
  const query = new URLSearchParams()
  if (params.page != null) query.set('page', String(params.page))
  if (params.pageSize != null) query.set('pageSize', String(params.pageSize))
  if (params.status && params.status !== 'ALL') query.set('status', params.status)
  if (params.patientId) query.set('patientId', params.patientId)
  if (params.search?.trim()) query.set('search', params.search.trim())
  const text = query.toString()
  return `/api/referrals${text ? `?${text}` : ''}`
}

function writeBody(payload: PatientWritePayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    fullName: payload.fullName.trim(),
    patientType: payload.patientType,
    dateOfBirth: payload.dateOfBirth || null,
    gender: payload.gender,
    phone: payload.phone?.trim() || null,
    email: payload.email?.trim() || null,
    address: payload.address?.trim() || null,
    knownAllergies: payload.knownAllergies?.trim() || null,
  }
  if (payload.patientType !== 'TELEHEALTH') return body
  if (payload.age != null) body.age = payload.age
  if (payload.bloodGroup?.trim()) body.bloodGroup = payload.bloodGroup.trim()
  if (payload.purpose?.trim()) body.purpose = payload.purpose.trim()
  if (payload.appointmentDate) body.appointmentDate = payload.appointmentDate
  if (payload.appointmentTime) body.appointmentTime = payload.appointmentTime
  if (payload.doctorId) body.doctorId = payload.doctorId
  return body
}

/**
 * Current patient API stores a telehealth visit on consultation fields and
 * rejects unknown keys. Used only after that rejection, so OPD and in-hospital
 * creates never take this path.
 */
function compatibleTelehealthBody(payload: PatientWritePayload): Record<string, unknown> {
  const body = writeBody({ ...payload, patientType: 'OPD' })
  body.patientType = 'TELEHEALTH'
  if (payload.purpose?.trim()) body.condition = payload.purpose.trim()
  if (payload.appointmentDate && payload.appointmentTime) {
    const [year, month, day] = payload.appointmentDate.split('-').map(Number)
    const [hour, minute] = payload.appointmentTime.split(':').map(Number)
    body.consultationStatus = 'SCHEDULED'
    body.consultationAt = new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
  }
  return body
}

function isExtraFieldRejection(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 422 || !error.payload) return false
  const blob = JSON.stringify(error.payload).toLowerCase()
  return blob.includes('extra_forbidden') || blob.includes('extra inputs') || blob.includes('extra fields')
}

const PHONE_PATTERN = /^\+?[1-9]\d{6,14}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Backend stores date of birth and derives age. Use today's month and day so the saved age matches. */
export function dateOfBirthFromAge(age: number): string {
  const today = new Date()
  const dob = new Date(today.getFullYear() - age, today.getMonth(), today.getDate())
  if (dob.getMonth() !== today.getMonth()) dob.setDate(0)
  const month = String(dob.getMonth() + 1).padStart(2, '0')
  const day = String(dob.getDate()).padStart(2, '0')
  return `${dob.getFullYear()}-${month}-${day}`
}

function compactPhone(value: string): string {
  return value.replace(/[\s\-()]/g, '')
}

function changedText(current: string, previous: string | null | undefined): string | null | undefined {
  const next = current.trim()
  const prev = (previous ?? '').trim()
  if (next === prev) return undefined
  return next ? next : null
}

function vitalValue(vitals: PatientVitals | null | undefined, key: keyof LatestVitals): number | null {
  if (!vitals) return null
  if (key === 'systolicBP') return vitals.systolicBP ?? vitals.bloodPressureS ?? null
  if (key === 'diastolicBP') return vitals.diastolicBP ?? vitals.bloodPressureD ?? null
  if (key === 'oxygenSaturation') return vitals.oxygenSaturation ?? vitals.oxygenSat ?? null
  const value = vitals[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseWholeNumber(raw: string): number | null | 'invalid' {
  const text = raw.trim()
  if (!text) return null
  if (!/^\d+$/.test(text)) return 'invalid'
  return Number(text)
}

function parseDecimal(raw: string): number | null | 'invalid' {
  const text = raw.trim()
  if (!text) return null
  if (!/^\d+(\.\d+)?$/.test(text)) return 'invalid'
  const value = Number(text)
  return Number.isFinite(value) ? value : 'invalid'
}

/** Matches the API: Celsius, one decimal place, inclusive bounds. */
function parseTemperature(raw: string): number | null | 'invalid' | 'range' {
  const parsed = parseDecimal(raw)
  if (parsed == null || parsed === 'invalid') return parsed
  const rounded = Math.round(parsed * 10) / 10
  if (rounded < 30 || rounded > 45) return 'range'
  return rounded
}

/** Weight in kg. Empty stays empty. Zero is not a stand-in for a blank field. */
function parseWeight(raw: string): number | null | 'invalid' | 'range' {
  const parsed = parseDecimal(raw)
  if (parsed == null || parsed === 'invalid') return parsed
  const rounded = Math.round(parsed * 100) / 100
  if (rounded <= 0 || rounded > 1000) return 'range'
  return rounded
}

function assignVital(
  body: LatestVitals,
  key: keyof LatestVitals,
  next: number | null,
  previous: number | null,
) {
  if (next === previous) return
  body[key] = next
}

function patientUpdateBody(payload: PatientUpdatePayload): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const assign = (key: string, value: unknown) => {
    if (value !== undefined) body[key] = value
  }
  assign('fullName', payload.fullName)
  assign('patientType', payload.patientType)
  assign('dateOfBirth', payload.dateOfBirth)
  assign('gender', payload.gender)
  assign('phone', payload.phone)
  assign('email', payload.email)
  assign('address', payload.address)
  assign('knownAllergies', payload.knownAllergies)
  assign('condition', payload.condition)
  assign('clinicalStatus', payload.clinicalStatus)
  assign('ward', payload.ward)
  assign('bed', payload.bed)
  assign('admittedAt', payload.admittedAt)
  assign('consultationAt', payload.consultationAt)
  if (payload.latestVitals !== undefined) {
    if (payload.latestVitals == null) {
      body.latestVitals = null
    } else {
      const vitals: Record<string, number | null> = {}
      for (const key of ['heartRate', 'systolicBP', 'diastolicBP', 'oxygenSaturation', 'temperature', 'weight', 'respiratoryRate'] as const) {
        if (payload.latestVitals[key] !== undefined) vitals[key] = payload.latestVitals[key] ?? null
      }
      body.latestVitals = vitals
    }
  }
  return body
}

/**
 * Builds a partial PUT body. Untouched fields are omitted so existing values stay on the server.
 * In-hospital fields are included only when the draft patient type is IN_HOSPITAL.
 */
export function buildPatientUpdatePayload(
  draft: PatientEditDraft,
  original: Patient,
): { payload: PatientUpdatePayload; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const payload: PatientUpdatePayload = {}
  if (!draft.fullName.trim()) errors.fullName = 'Full name is required'
  const type = normalizePatientType(draft.patientType)
  if (!type) errors.patientType = 'Select a patient type'
  const ageNumber = Number(draft.age)
  if (!draft.age.trim()) errors.age = 'Age is required'
  else if (!Number.isInteger(ageNumber) || ageNumber < 0 || ageNumber > 120) errors.age = 'Enter an age from 0 to 120'
  else if (new Date().getFullYear() - ageNumber < 1900) errors.age = 'Age is not valid'
  if (!draft.gender) errors.gender = 'Select a gender'
  const phone = compactPhone(draft.phone)
  if (phone && !PHONE_PATTERN.test(phone)) errors.phone = 'Enter a valid phone number'
  if (draft.email.trim() && !EMAIL_PATTERN.test(draft.email.trim())) errors.email = 'Enter a valid email address'

  const inHospital = type === 'IN_HOSPITAL'
  const heartRate = inHospital ? parseWholeNumber(draft.heartRate) : null
  const systolicBP = inHospital ? parseWholeNumber(draft.systolicBP) : null
  const diastolicBP = inHospital ? parseWholeNumber(draft.diastolicBP) : null
  const oxygenSaturation = inHospital ? parseWholeNumber(draft.oxygenSaturation) : null
  const temperature = inHospital ? parseTemperature(draft.temperature) : null
  const weight = inHospital ? parseWeight(draft.weight) : null
  const respiratoryRate = inHospital ? parseWholeNumber(draft.respiratoryRate) : null
  if (heartRate === 'invalid') errors.heartRate = 'Enter a whole number'
  else if (typeof heartRate === 'number' && (heartRate < 1 || heartRate > 300)) errors.heartRate = 'Enter a heart rate from 1 to 300'
  if (systolicBP === 'invalid') errors.systolicBP = 'Enter a whole number'
  else if (typeof systolicBP === 'number' && (systolicBP < 1 || systolicBP > 300)) errors.systolicBP = 'Enter a systolic BP from 1 to 300'
  if (diastolicBP === 'invalid') errors.diastolicBP = 'Enter a whole number'
  else if (typeof diastolicBP === 'number' && (diastolicBP < 1 || diastolicBP > 300)) errors.diastolicBP = 'Enter a diastolic BP from 1 to 300'
  if (oxygenSaturation === 'invalid') errors.oxygenSaturation = 'Enter a whole number'
  else if (typeof oxygenSaturation === 'number' && (oxygenSaturation < 0 || oxygenSaturation > 100)) {
    errors.oxygenSaturation = 'Enter an SpO2 from 0 to 100'
  }
  if (temperature === 'invalid') errors.temperature = 'Enter a valid temperature'
  else if (temperature === 'range') errors.temperature = 'Enter a temperature from 30 to 45 °C'
  if (weight === 'invalid') errors.weight = 'Enter a valid weight'
  else if (weight === 'range') errors.weight = 'Enter a weight greater than 0'
  if (respiratoryRate === 'invalid') errors.respiratoryRate = 'Enter a whole number'
  else if (typeof respiratoryRate === 'number' && (respiratoryRate < 1 || respiratoryRate > 100)) {
    errors.respiratoryRate = 'Enter a respiratory rate from 1 to 100'
  }

  let admittedAt: string | null | undefined
  if (inHospital) {
    const originalLocal = toDatetimeLocalValue(original.admittedAt)
    const nextLocal = draft.admittedAtLocal.trim()
    if (nextLocal !== originalLocal) {
      if (!nextLocal) admittedAt = original.admittedAt ? null : undefined
      else {
        const parsed = new Date(nextLocal)
        if (Number.isNaN(parsed.getTime())) errors.admittedAt = 'Enter a valid date and time'
        else admittedAt = parsed.toISOString()
      }
    }
  }

  if (Object.keys(errors).length > 0 || !type) return { payload: {}, errors }

  const name = changedText(draft.fullName, original.fullName)
  if (name) payload.fullName = name
  const originalType = normalizePatientType(original.patientType)
  if (type !== originalType) payload.patientType = type
  if (draft.age.trim() !== (original.age != null ? String(original.age) : '')) {
    payload.dateOfBirth = dateOfBirthFromAge(ageNumber)
  }
  if (draft.gender !== (original.gender ?? '')) payload.gender = draft.gender
  const originalPhone = compactPhone(original.phone ?? '')
  if (phone !== originalPhone) payload.phone = phone || null
  const email = changedText(draft.email, original.email)
  if (email !== undefined) payload.email = email
  const address = changedText(draft.address, original.address)
  if (address !== undefined) payload.address = address
  const allergies = changedText(draft.knownAllergies, original.knownAllergies)
  if (allergies !== undefined) payload.knownAllergies = allergies
  const condition = changedText(draft.condition, original.condition)
  if (condition !== undefined) payload.condition = condition

  if (inHospital) {
    const ward = changedText(normalizeWard(draft.ward), normalizeWard(original.ward))
    if (ward !== undefined) payload.ward = ward
    const bed = changedText(draft.bed, original.bed)
    if (bed !== undefined) payload.bed = bed
    const status = changedText(normalizeClinicalStatus(draft.clinicalStatus), normalizeClinicalStatus(original.severity))
    if (status !== undefined) payload.clinicalStatus = status
    if (admittedAt !== undefined) payload.admittedAt = admittedAt

    const vitals: LatestVitals = {}
    if (heartRate !== 'invalid') assignVital(vitals, 'heartRate', heartRate, vitalValue(original.latestVitals, 'heartRate'))
    if (systolicBP !== 'invalid') assignVital(vitals, 'systolicBP', systolicBP, vitalValue(original.latestVitals, 'systolicBP'))
    if (diastolicBP !== 'invalid') assignVital(vitals, 'diastolicBP', diastolicBP, vitalValue(original.latestVitals, 'diastolicBP'))
    if (oxygenSaturation !== 'invalid') {
      assignVital(vitals, 'oxygenSaturation', oxygenSaturation, vitalValue(original.latestVitals, 'oxygenSaturation'))
    }
    if (temperature !== 'invalid' && temperature !== 'range') {
      assignVital(vitals, 'temperature', temperature, vitalValue(original.latestVitals, 'temperature'))
    }
    if (weight !== 'invalid' && weight !== 'range') {
      assignVital(vitals, 'weight', weight, vitalValue(original.latestVitals, 'weight'))
    }
    if (respiratoryRate !== 'invalid') {
      assignVital(vitals, 'respiratoryRate', respiratoryRate, vitalValue(original.latestVitals, 'respiratoryRate'))
    }
    if (Object.keys(vitals).length > 0) payload.latestVitals = vitals
  }

  return { payload, errors }
}

async function authorizedTotal(patientType?: string): Promise<number> {
  const data = await apiFetch<unknown>(patientListPath({ page: 1, pageSize: 1, patientType }))
  return mapPatientList(data).total
}

export const patientsService = {
  getPatients(params?: PatientListParams) {
    return apiFetch<unknown>(patientListPath(params)).then(mapPatientList)
  },

  /**
   * Walks every authorized page (API max page size is 100) so module lists and
   * ward totals are not limited to the first page.
   */
  async getAllPatients(params?: PatientListParams) {
    const pageSize = 100
    const items: Patient[] = []
    let page = 1
    let total = 0
    let wardCounts: Record<string, number> | null = null
    let totalPages = 1
    while (page <= totalPages && page <= 30) {
      const result = await patientsService.getPatients({ ...params, page, pageSize })
      if (page === 1) {
        total = result.total
        wardCounts = result.wardCounts
        totalPages = result.totalPages > 0 ? result.totalPages : Math.max(1, Math.ceil(total / pageSize))
      }
      items.push(...result.items)
      if (result.items.length < pageSize) break
      page += 1
    }
    return { items, total, wardCounts }
  },

  /**
   * Counts come from authorized list totals (page size 1), not the current table page.
   * The backend has no `/api/patients/summary` route.
   */
  async getSummary(): Promise<PatientSummaryCounts> {
    const [total, inHospital, opPatients, telehealth] = await Promise.all([
      authorizedTotal(),
      authorizedTotal('IN_HOSPITAL'),
      authorizedTotal('OPD'),
      authorizedTotal('TELEHEALTH'),
    ])
    return { total, inHospital, opPatients, telehealth }
  },

  async getPatientById(patientId: string) {
    const data = await apiFetch<unknown>(`/api/patients/${encodeURIComponent(patientId)}`)
    const patient = mapPatientPayload(data)
    if (!patient) throw new Error('Patient response was empty.')
    return patient
  },

  /**
   * Dedicated discharge. An empty note sends `{}` so the call is valid without a summary.
   * Patient type is left unchanged; the backend sets status, time, and discharging doctor.
   */
  async dischargePatient(patientId: string, dischargeNote?: string | null) {
    const note = dischargeNote?.trim() ?? ''
    const data = await apiFetch<unknown>(`/api/patients/${encodeURIComponent(patientId)}/discharge`, {
      method: 'POST',
      body: JSON.stringify(note ? { dischargeNote: note } : {}),
    })
    return mapPatientPayload(data)
  },

  async createPatient(payload: PatientWritePayload) {
    const post = (body: Record<string, unknown>) => apiFetch<unknown>('/api/patients', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    let data: unknown
    try {
      data = await post(writeBody(payload))
    } catch (error) {
      if (payload.patientType !== 'TELEHEALTH' || !isExtraFieldRejection(error)) throw error
      data = await post(compatibleTelehealthBody(payload))
    }
    const patient = mapPatientPayload(data)
    if (!patient) throw new Error('Patient response was empty.')
    const source = asRecord(data)
    const appointment = nestedAppointment(source)
    const link = meetingLinkFrom(source, appointment)
    let next = patient
    if (link && !next.roomUrl) next = { ...next, roomUrl: link }
    if (!next.appointmentId && appointment) {
      const appointmentId = pickString(appointment, 'appointment_id', 'appointmentId', 'id')
      if (appointmentId) next = { ...next, appointmentId }
    }
    return next
  },

  async updatePatient(patientId: string, payload: PatientUpdatePayload) {
    const data = await apiFetch<unknown>(`/api/patients/${encodeURIComponent(patientId)}`, {
      method: 'PUT',
      body: JSON.stringify(patientUpdateBody(payload)),
    })
    const patient = mapPatient(data)
    if (!patient) throw new Error('Patient response was empty.')
    return patient
  },

  deactivatePatient(patientId: string) {
    return apiFetch<unknown>(`/api/patients/${encodeURIComponent(patientId)}`, {
      method: 'DELETE',
    }).then((data) => {
      const patient = mapPatient(data)
      if (!patient) throw new Error('Patient response was empty.')
      return patient
    })
  },

  createReferral(patientId: string, payload: ReferralCreatePayload) {
    return apiFetch<unknown>(`/api/patients/${encodeURIComponent(patientId)}/referrals`, {
      method: 'POST',
      body: JSON.stringify({
        referredDoctorId: payload.referredDoctorId,
        referralReason: payload.referralReason.trim(),
        message: payload.message?.trim() || null,
      }),
    }).then((data) => {
      const referral = mapReferral(data)
      if (!referral) throw new Error('Referral response was empty.')
      return referral
    })
  },

  getReferrals(params?: ReferralListParams) {
    return apiFetch<unknown>(referralListPath(params)).then(mapReferralList)
  },

  getPatientReferrals(patientId: string) {
    return apiFetch<unknown>(`/api/patients/${encodeURIComponent(patientId)}/referrals`).then((data) => {
      const source = asRecord(data)
      const rows = Array.isArray(source?.items) ? source.items : []
      return rows.map(mapReferral).filter((row): row is PatientReferral => row !== null)
    })
  },

  acceptReferral(referralId: string) {
    return apiFetch<unknown>(`/api/referrals/${encodeURIComponent(referralId)}/accept`, {
      method: 'POST',
    }).then((data) => {
      const referral = mapReferral(data)
      if (!referral) throw new Error('Referral response was empty.')
      return referral
    })
  },

  rejectReferral(referralId: string, reason: string) {
    return apiFetch<unknown>(`/api/referrals/${encodeURIComponent(referralId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason.trim() }),
    }).then((data) => {
      const referral = mapReferral(data)
      if (!referral) throw new Error('Referral response was empty.')
      return referral
    })
  },

  cancelReferral(referralId: string) {
    return apiFetch<unknown>(`/api/referrals/${encodeURIComponent(referralId)}/cancel`, {
      method: 'POST',
    }).then((data) => {
      const referral = mapReferral(data)
      if (!referral) throw new Error('Referral response was empty.')
      return referral
    })
  },

  completeReferral(referralId: string) {
    return apiFetch<unknown>(`/api/referrals/${encodeURIComponent(referralId)}/complete`, {
      method: 'POST',
    }).then((data) => {
      const referral = mapReferral(data)
      if (!referral) throw new Error('Referral response was empty.')
      return referral
    })
  },

  getReferralDoctors(params?: { search?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams()
    query.set('page', String(params?.page ?? 1))
    query.set('pageSize', String(params?.pageSize ?? 20))
    if (params?.search?.trim()) query.set('search', params.search.trim())
    return apiFetch<unknown>(`/api/doctors/referral-options?${query.toString()}`).then((data) => {
      const source = asRecord(data) ?? {}
      const rows = Array.isArray(source.items) ? source.items : []
      const items: ReferralDoctorOption[] = []
      for (const row of rows) {
        const record = asRecord(row)
        if (!record) continue
        const id = pickString(record, 'id')
        const name = pickString(record, 'name')
        if (!id || !name) continue
        const specs = Array.isArray(record.specializations)
          ? record.specializations.filter((item): item is string => typeof item === 'string')
          : []
        const specialization = pickString(record, 'specialization')
        if (specialization && !specs.includes(specialization)) specs.unshift(specialization)
        items.push({
          id,
          doctorId: pickString(record, 'doctor_id', 'doctorId') ?? undefined,
          name,
          department: mapDepartment(record.department),
          specialization: specialization ?? specs[0],
          specializations: specs,
        })
      }
      return {
        items,
        total: pickNumber(source, 'total') ?? items.length,
        page: pickNumber(source, 'page') ?? 1,
        pageSize: pickNumber(source, 'page_size', 'pageSize') ?? items.length,
        totalPages: pickNumber(source, 'total_pages', 'totalPages') ?? 1,
      } satisfies ReferralDoctorListResponse
    })
  },
}
