/**
 * OPD clinical visits.
 *
 * Patient lookup reuses GET /api/patients. Booking does not call doctor
 * availability. The backend validates the chosen date and time.
 *   GET  /api/clinical-visits/opd
 *   POST /api/clinical-visits
 */
import { apiFetch } from '@/lib/api-client'
import { patientsService, type Patient, type PatientDoctorRef } from '@/services/patients.service'

export interface AssignedDoctor {
  id: string
  name: string
  specialty: string
}

export interface ClinicalVisit {
  id: string
  patientId: string
  patientName: string
  age: number | null
  gender: string
  phone: string
  mrn: string
  bloodGroup: string | null
  doctorId: string
  doctorName: string
  specialty: string
  visitDate: string
  startTime: string
  purpose: string
  status: string
  durationMin: number | null
}

export interface OpdQueueParams {
  /** Exact visit date for Today, YYYY-MM-DD. Omitted for Upcoming. */
  date?: string
  /** `today` filters visit_date to `date`. `upcoming` is visit_date after today. */
  scope?: 'today' | 'upcoming'
  search?: string
}

export interface OpdSummary {
  totalToday: number
  checkedIn: number
  inProgress: number
  completed: number
  noShows: number
}

export interface CreateClinicalVisitPayload {
  patientId: string
  doctorId: string
  visitDate: string
  startTime: string
  purpose: string
  visitType: 'Clinical'
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  'checked-in': 'Checked-in',
  'in-progress': 'In Progress',
  completed: 'Completed',
  'no-show': 'No-show',
  cancelled: 'Cancelled',
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

function personName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  const source = asRecord(value)
  if (!source) return null
  const name = pickString(source, 'name', 'full_name', 'fullName')
  if (name) return name
  const joined = [pickString(source, 'first_name', 'firstName'), pickString(source, 'last_name', 'lastName')]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim()
  return joined || null
}

export function clinicalVisitStatusKey(value: string | null | undefined): string {
  const compact = (value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (compact === 'noshow' || compact === 'no-show') return 'no-show'
  if (compact === 'checkedin' || compact === 'checked-in') return 'checked-in'
  if (compact === 'inprogress' || compact === 'in-progress') return 'in-progress'
  if (compact === 'canceled' || compact === 'cancelled') return 'cancelled'
  return compact
}

export function clinicalVisitStatusLabel(value: string | null | undefined): string {
  const raw = value?.trim() ?? ''
  if (!raw) return '—'
  return STATUS_LABELS[clinicalVisitStatusKey(raw)] ?? raw
}

/** Normalize "10:00", "10:00:00", and "10:00 AM" to 24-hour HH:mm. */
export function toStartTime(value: string): string | null {
  const text = value.trim()
  const ampm = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)$/i)
  if (ampm) {
    let hour = Number(ampm[1]) % 12
    if (ampm[3].toUpperCase() === 'PM') hour += 12
    return `${String(hour).padStart(2, '0')}:${ampm[2]}`
  }
  const match = text.match(/^(\d{1,2}):(\d{2})/)
  if (match) {
    const hour = Number(match[1])
    if (hour > 23) return null
    return `${String(hour).padStart(2, '0')}:${match[2]}`
  }
  const embedded = text.match(/(?:T|\s)(\d{2}):(\d{2})/)
  if (!embedded) return null
  return `${embedded[1]}:${embedded[2]}`
}

export function formatSlotLabel(value: string): string {
  const time = toStartTime(value)
  if (!time) return value
  const [hourText, minute] = time.split(':')
  const hour = Number(hourText)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${String(hour12).padStart(2, '0')}:${minute} ${suffix}`
}

function isoDate(value: string): string | null {
  const match = value.match(/\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : null
}

function summaryFromVisits(visits: ClinicalVisit[]): OpdSummary {
  const summary: OpdSummary = {
    totalToday: visits.length,
    checkedIn: 0,
    inProgress: 0,
    completed: 0,
    noShows: 0,
  }
  for (const visit of visits) {
    const key = clinicalVisitStatusKey(visit.status)
    if (key === 'checked-in') summary.checkedIn += 1
    else if (key === 'in-progress') summary.inProgress += 1
    else if (key === 'completed') summary.completed += 1
    else if (key === 'no-show') summary.noShows += 1
  }
  return summary
}

function parseSummary(value: unknown, visits: ClinicalVisit[]): OpdSummary {
  const source = asRecord(value)
  const nested = asRecord(source?.summary) ?? asRecord(source?.counts)
  if (!nested) return summaryFromVisits(visits)
  const total = pickNumber(nested, 'total_today', 'totalToday', 'total')
  const checkedIn = pickNumber(nested, 'checked_in', 'checkedIn')
  const inProgress = pickNumber(nested, 'in_progress', 'inProgress')
  const completed = pickNumber(nested, 'completed')
  const noShows = pickNumber(nested, 'no_shows', 'noShows', 'no_show', 'noShow')
  if (total == null && checkedIn == null && inProgress == null && completed == null && noShows == null) {
    return summaryFromVisits(visits)
  }
  return {
    totalToday: total ?? visits.length,
    checkedIn: checkedIn ?? 0,
    inProgress: inProgress ?? 0,
    completed: completed ?? 0,
    noShows: noShows ?? 0,
  }
}

function visitRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  const source = asRecord(value)
  if (!source) return []
  for (const key of ['visits', 'items', 'clinical_visits', 'clinicalVisits', 'appointments', 'results', 'data']) {
    if (Array.isArray(source[key])) return source[key]
  }
  return []
}

function mapVisit(value: unknown): ClinicalVisit | null {
  const source = asRecord(value)
  if (!source) return null
  const patient = asRecord(source.patient)
  const doctor = asRecord(source.doctor ?? source.primary_doctor ?? source.primaryDoctor)
  const id = pickString(source, 'visit_id', 'visitId', 'id')
  const patientId = pickString(source, 'patient_id', 'patientId')
    ?? (patient ? pickString(patient, 'id', 'patient_id', 'patientId') : null)
  const patientName = personName(patient) ?? personName(source.patient_name) ?? pickString(source, 'patient_name', 'patientName')
  if (!id || !patientId || !patientName) return null
  const visitDate = isoDate(
    pickString(source, 'visit_date', 'visitDate', 'date')
    ?? pickString(source, 'scheduled_at', 'scheduledAt')
    ?? '',
  ) ?? ''
  const startTime = toStartTime(
    pickString(source, 'start_time', 'startTime', 'time')
    ?? pickString(source, 'scheduled_at', 'scheduledAt')
    ?? '',
  ) ?? ''
  const department = asRecord(doctor?.department ?? source.department)
  const specialty = (doctor ? pickString(doctor, 'specialty', 'specialization') : null)
    ?? (department ? pickString(department, 'name') : null)
    ?? pickString(source, 'specialty', 'department_name', 'departmentName')
    ?? ''
  return {
    id,
    patientId,
    patientName,
    age: patient ? pickNumber(patient, 'age') : pickNumber(source, 'age'),
    gender: (patient ? pickString(patient, 'gender') : null) ?? pickString(source, 'gender') ?? '',
    phone: (patient ? pickString(patient, 'phone') : null) ?? pickString(source, 'phone') ?? '',
    mrn: (patient ? pickString(patient, 'patient_id', 'patientId', 'mrn', 'patient_code', 'patientCode') : null)
      ?? pickString(source, 'mrn', 'patient_code', 'patientCode')
      ?? '',
    bloodGroup: (patient ? pickString(patient, 'blood_group', 'bloodGroup') : null)
      ?? pickString(source, 'blood_group', 'bloodGroup'),
    doctorId: pickString(source, 'doctor_id', 'doctorId')
      ?? (doctor ? pickString(doctor, 'id', 'doctor_id', 'doctorId') : null)
      ?? '',
    doctorName: personName(doctor) ?? pickString(source, 'doctor_name', 'doctorName') ?? '',
    specialty,
    visitDate,
    startTime,
    purpose: pickString(source, 'purpose', 'reason', 'visit_reason', 'visitReason') ?? '',
    status: pickString(source, 'status', 'visit_status', 'visitStatus') ?? '',
    durationMin: pickNumber(source, 'duration_min', 'durationMin', 'duration'),
  }
}

function doctorFromRef(doctor: PatientDoctorRef | null | undefined, departmentName?: string | null): AssignedDoctor | null {
  if (!doctor?.id || !doctor.name) return null
  return {
    id: doctor.id,
    name: doctor.name,
    specialty: doctor.specialty?.trim() || doctor.department?.name || departmentName?.trim() || '',
  }
}

function queuePath(params: OpdQueueParams): string {
  const query = new URLSearchParams()
  if (params.scope === 'upcoming') {
    query.set('scope', 'upcoming')
  } else {
    query.set('scope', 'today')
    if (params.date) query.set('date', params.date)
  }
  if (params.search?.trim()) query.set('search', params.search.trim())
  const text = query.toString()
  return `/api/clinical-visits/opd${text ? `?${text}` : ''}`
}

export const clinicalVisitsService = {
  /** OPD patients only, via the documented patient list. */
  getOpdPatients(search?: string) {
    return patientsService.getPatients({
      patientType: 'OPD',
      search: search?.trim() || undefined,
      page: 1,
      pageSize: 20,
    })
  },

  async getAssignedDoctor(patientId: string): Promise<AssignedDoctor | null> {
    const patient: Patient = await patientsService.getPatientById(patientId)
    return doctorFromRef(patient.primaryDoctor, patient.department?.name)
  },

  async getOpdQueue(params: OpdQueueParams): Promise<{ visits: ClinicalVisit[]; summary: OpdSummary }> {
    const data = await apiFetch<unknown>(queuePath(params))
    const visits = visitRows(data).map(mapVisit).filter((row): row is ClinicalVisit => row !== null)
    return { visits, summary: parseSummary(data, visits) }
  },

  async getOpdSummary(date: string): Promise<OpdSummary> {
    const queue = await clinicalVisitsService.getOpdQueue({ scope: 'today', date })
    return queue.summary
  },

  createClinicalVisit(payload: CreateClinicalVisitPayload) {
    const visitDate = payload.visitDate.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? payload.visitDate.trim()
    const startMatch = payload.startTime.trim().match(/^(\d{2}):(\d{2})/)
    const startTime = startMatch ? `${startMatch[1]}:${startMatch[2]}` : payload.startTime.trim()
    return apiFetch<unknown>('/api/clinical-visits', {
      method: 'POST',
      body: JSON.stringify({
        patient_id: payload.patientId,
        doctor_id: payload.doctorId,
        visit_date: visitDate,
        start_time: startTime,
        purpose: payload.purpose,
        visit_type: 'Clinical',
      }),
    }).then((data) => mapVisit(data) ?? mapVisit(asRecord(data)?.visit) ?? mapVisit(asRecord(data)?.clinical_visit) ?? mapVisit(asRecord(data)?.clinicalVisit))
  },
}
