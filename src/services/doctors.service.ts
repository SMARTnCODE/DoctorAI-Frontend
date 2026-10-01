/**
 * Admin doctors API — /api/admin/doctors
 */
import { apiFetch, ApiError, type AuditLogItem, type DoctorListItem } from '@/lib/api-client'

export interface DoctorListParams {
  department_id?: string
  specialization_id?: string
  status?: string
  search?: string
  page?: number
  page_size?: number
}

export interface DoctorCreatePayload {
  first_name: string
  last_name: string
  email: string
  phone_number: string
  medical_registration_number: string
  gender?: string | null
  date_of_birth?: string | null
  address?: string | null
  photo_url?: string | null
  qualification?: string | null
  university_institution?: string | null
  graduation_year?: number | null
  experience_years?: number | null
  specialization_ids?: string[] | null
  department_id?: string | null
  designation?: string | null
  consultation_type?: string | null
  doctor_status?: string
  employee_id?: string | null
  employment_type?: string | null
  join_date?: string | null
  about_doctor?: string | null
  languages?: string[] | null
  consultation_fee?: number | null
  room_number?: string | null
  available_days?: string[] | null
  create_login?: boolean
  force_password_change?: boolean
  temporary_password?: string | null
  confirm_password?: string | null
}

export type DoctorUpdatePayload = Partial<DoctorCreatePayload>

export interface DoctorDeptApiRef {
  id: string
  name: string
  code?: string
}

export interface DoctorSpecApiRef {
  id?: string
  name?: string
  specialization?: { id?: string; name?: string }
}

export interface DoctorNextShiftApi {
  date: string
  start_time?: string
  startTime?: string
  shift_type?: string
  shiftType?: string
}

/** Raw list item from GET /api/admin/doctors (snake_case; camelCase accepted as fallback). */
export interface DoctorApiItem {
  id: string
  doctor_id?: string
  doctorId?: string
  first_name?: string
  firstName?: string
  last_name?: string
  lastName?: string
  photo_url?: string | null
  photo?: string | null
  gender?: string | null
  phone_number?: string | null
  phone?: string | null
  email?: string
  designation?: string | null
  qualification?: string | null
  doctor_status?: string
  status?: string
  account_status?: string
  accountStatus?: string
  username?: string | null
  employee_id?: string | null
  employeeId?: string | null
  employment_type?: string | null
  employmentType?: string | null
  department?: DoctorDeptApiRef | null
  /** API may return name strings or objects. */
  specializations?: Array<string | DoctorSpecApiRef> | null
  specialization_ids?: string[] | null
  next_shift?: DoctorNextShiftApi | null
  nextShift?: DoctorNextShiftApi | null
  patients_count?: number
  patientsCount?: number
  has_resume?: boolean
  hasResume?: boolean
  resume_file_name?: string | null
  resume_file_url?: string | null
  join_date?: string | null
  updated_by_name?: string | null
  updatedByName?: string | null
  updated_at?: string
  updatedAt?: string
}

/**
 * Unwrapped GET /api/admin/doctors payload.
 * Current backend returns a bare array in `data`; paginated object shape is also accepted.
 */
export type DoctorListResponse =
  | DoctorApiItem[]
  | {
      items?: DoctorApiItem[]
      doctors?: DoctorApiItem[]
      data?: DoctorApiItem[]
      total?: number
      page?: number
      page_size?: number
      pageSize?: number
      total_pages?: number
      totalPages?: number
    }

const DOCTOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Shown when a control has no matching admin doctor endpoint. */
export const DOCTOR_ACTION_UNAVAILABLE =
  'This action is not available on the current doctor admin API.'

/** Route/API id. Rejects empty, literal placeholders, and object stringification. */
export function usableDoctorId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  if (!id || id === 'undefined' || id === 'null' || id === '[object Object]' || id.startsWith(':')) {
    return null
  }
  return id
}

function readId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Id for `/api/admin/doctors/{doctor_id}`.
 * Prefers a UUID from `doctor_id`, then `id`, including nested `doctor` objects.
 */
export function doctorIdFromResponse(res: unknown): string | null {
  if (!res || typeof res !== 'object') return null
  const roots: Record<string, unknown>[] = [res as Record<string, unknown>]
  const nested = (res as Record<string, unknown>).doctor
  if (nested && typeof nested === 'object') roots.push(nested as Record<string, unknown>)

  const candidates: string[] = []
  for (const root of roots) {
    for (const key of ['doctor_id', 'doctorId', 'id'] as const) {
      const id = readId(root[key])
      if (id && !candidates.includes(id)) candidates.push(id)
    }
  }
  return candidates.find((id) => DOCTOR_UUID.test(id)) ?? candidates[0] ?? null
}

function readString(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readNumber(source: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value)
  }
  return null
}

function readStringList(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key]
    if (Array.isArray(value)) {
      const parts = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      return parts.length ? parts.join(', ') : null
    }
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function doctorRecordFromPayload(raw: unknown): { record: Record<string, unknown>; activity: unknown[] } | null {
  if (!raw || typeof raw !== 'object') return null
  const root = raw as Record<string, unknown>
  const activity = Array.isArray(root.activity) ? root.activity : []
  const nested = root.doctor
  if (nested && typeof nested === 'object') {
    return { record: nested as Record<string, unknown>, activity }
  }
  return { record: root, activity }
}

export interface AdminDoctorDetail {
  doctor: {
    id: string
    doctorId: string
    firstName: string
    lastName: string
    photo: string | null
    gender: string | null
    dateOfBirth: string | null
    phone: string | null
    email: string
    address: string | null
    registrationNumber: string
    qualification: string | null
    university: string | null
    graduationYear: number | null
    experienceYears: number | null
    designation: string | null
    consultationType: string | null
    consultationFee: number | null
    about: string | null
    languages: string | null
    roomNumber: string | null
    availableDays: string | null
    status: string
    lastLoginAt: string | null
    passwordChangedAt: string | null
    accountStatus: string
    updatedByName: string | null
    updatedAt: string
    username: string | null
    employeeId: string | null
    employmentType: string | null
    joinDate: string | null
    createdByName: string | null
    createdAt: string
    suspensionReason: string | null
    suspensionStart: string | null
    suspensionEnd: string | null
    suspensionNotes: string | null
    terminationType: string | null
    terminationDate: string | null
    lastWorkingDate: string | null
    terminationReason: string | null
    terminationNotes: string | null
    resume: {
      fileName: string
      fileType: string
      fileSize: number
      uploadedAt: string
      uploadedBy: string | null
    } | null
    department: { id: string; name: string; code: string } | null
    specializations: {
      id: string
      isPrimary: boolean
      specialization: { id: string; name: string; description: string | null; status: string }
    }[]
    patients: {
      id: string
      patientId: string
      firstName: string
      lastName: string
      dateOfBirth: string | null
      gender: string | null
      phone: string | null
      email: string | null
      status: string
      assignedAt: string
      lastVisit: string | null
    }[]
    shifts: {
      id: string
      date: string
      startTime: string
      endTime: string
      shiftType: string
      room: string | null
      notes: string | null
      status: string
      createdByName: string | null
      department: { id: string; name: string } | null
    }[]
  }
  activity: AuditLogItem[]
}

/** Map GET /api/admin/doctors/{doctor_id} into the profile/form doctor shape. */
export function mapAdminDoctorDetail(raw: unknown): AdminDoctorDetail | null {
  const parsed = doctorRecordFromPayload(raw)
  if (!parsed) return null
  const source = parsed.record
  const idCandidates = [readId(source.doctor_id), readId(source.doctorId), readId(source.id)].filter(
    (value): value is string => Boolean(value),
  )
  const doctorKey = idCandidates.find((value) => DOCTOR_UUID.test(value)) ?? idCandidates[0]
  if (!doctorKey) return null
  const code = idCandidates.find((value) => !DOCTOR_UUID.test(value)) ?? doctorKey

  const departmentRaw = source.department
  const department = departmentRaw && typeof departmentRaw === 'object'
    ? {
        id: readString(departmentRaw as Record<string, unknown>, 'id') ?? readString(source, 'department_id') ?? '',
        name: readString(departmentRaw as Record<string, unknown>, 'name') ?? '',
        code: readString(departmentRaw as Record<string, unknown>, 'code') ?? '',
      }
    : readString(source, 'department_id')
      ? { id: readString(source, 'department_id') ?? '', name: '', code: '' }
      : null

  const specs = mapSpecializations({ ...source, id: doctorKey } as DoctorApiItem)
  const fileName = readString(source, 'resume_file_name', 'resumeFileName')
  const resume = fileName
    ? {
        fileName,
        fileType: readString(source, 'resume_file_type', 'resumeFileType') ?? '',
        fileSize: readNumber(source, 'resume_file_size', 'resumeFileSize') ?? 0,
        uploadedAt: readString(source, 'resume_uploaded_at', 'resumeUploadedAt') ?? '',
        uploadedBy: readString(source, 'resume_uploaded_by', 'resumeUploadedBy'),
      }
    : null

  return {
    doctor: {
      id: doctorKey,
      doctorId: code,
      firstName: readString(source, 'first_name', 'firstName') ?? '',
      lastName: readString(source, 'last_name', 'lastName') ?? '',
      photo: readString(source, 'photo_url', 'photo'),
      gender: readString(source, 'gender'),
      dateOfBirth: readString(source, 'date_of_birth', 'dateOfBirth'),
      phone: readString(source, 'phone_number', 'phone'),
      email: readString(source, 'email') ?? '',
      address: readString(source, 'address'),
      registrationNumber: readString(source, 'medical_registration_number', 'registrationNumber', 'registration_number') ?? '',
      qualification: readString(source, 'qualification'),
      university: readString(source, 'university_institution', 'university'),
      graduationYear: readNumber(source, 'graduation_year', 'graduationYear'),
      experienceYears: readNumber(source, 'experience_years', 'experienceYears'),
      designation: readString(source, 'designation'),
      consultationType: readString(source, 'consultation_type', 'consultationType'),
      consultationFee: readNumber(source, 'consultation_fee', 'consultationFee'),
      about: readString(source, 'about_doctor', 'about'),
      languages: readStringList(source, 'languages'),
      roomNumber: readString(source, 'room_number', 'roomNumber'),
      availableDays: readStringList(source, 'available_days', 'availableDays'),
      status: readString(source, 'doctor_status', 'status') ?? 'ACTIVE',
      lastLoginAt: readString(source, 'last_login_at', 'lastLoginAt'),
      passwordChangedAt: readString(source, 'password_changed_at', 'passwordChangedAt'),
      accountStatus: readString(source, 'account_status', 'accountStatus') ?? 'ACTIVE',
      updatedByName: readString(source, 'updated_by_name', 'updatedByName'),
      updatedAt: readString(source, 'updated_at', 'updatedAt', 'join_date') ?? '',
      username: readString(source, 'username'),
      employeeId: readString(source, 'employee_id', 'employeeId'),
      employmentType: readString(source, 'employment_type', 'employmentType'),
      joinDate: readString(source, 'join_date', 'joinDate'),
      createdByName: readString(source, 'created_by_name', 'createdByName'),
      createdAt: readString(source, 'created_at', 'createdAt') ?? '',
      suspensionReason: readString(source, 'suspension_reason', 'suspensionReason'),
      suspensionStart: readString(source, 'suspension_start', 'suspensionStart'),
      suspensionEnd: readString(source, 'suspension_end', 'suspensionEnd'),
      suspensionNotes: readString(source, 'suspension_notes', 'suspensionNotes'),
      terminationType: readString(source, 'termination_type', 'terminationType'),
      terminationDate: readString(source, 'termination_date', 'terminationDate'),
      lastWorkingDate: readString(source, 'last_working_date', 'lastWorkingDate'),
      terminationReason: readString(source, 'termination_reason', 'terminationReason'),
      terminationNotes: readString(source, 'termination_notes', 'terminationNotes'),
      resume,
      department: department && department.id ? department : null,
      specializations: specs.map((spec, index) => ({
        id: spec.id,
        isPrimary: index === 0,
        specialization: {
          id: spec.id,
          name: spec.name,
          description: null,
          status: 'ACTIVE',
        },
      })),
      patients: [],
      shifts: mapShiftRows(source),
    },
    activity: [],
  }
}

function mapShiftRows(source: Record<string, unknown>): AdminDoctorDetail['doctor']['shifts'] {
  const raw = source.shifts ?? source.assigned_shifts
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = readString(row, 'id', 'shift_id', 'shiftId')
    const date = readString(row, 'date', 'shift_date')
    if (!id || !date) return []
    return [{
      id,
      date,
      startTime: readString(row, 'start_time', 'startTime') ?? '',
      endTime: readString(row, 'end_time', 'endTime') ?? '',
      shiftType: readString(row, 'shift_type', 'shiftType') ?? '',
      room: readString(row, 'room'),
      notes: readString(row, 'notes'),
      status: readString(row, 'status') ?? '',
      createdByName: readString(row, 'created_by_name', 'createdByName'),
      department: null,
    }]
  })
}

function mapSpecializationObject(raw: DoctorSpecApiRef): { id: string; name: string } | null {
  const nested = raw.specialization
  const id = raw.id ?? nested?.id
  const name = raw.name ?? nested?.name
  if (!id || !name) return null
  return { id, name }
}

function mapSpecializations(item: DoctorApiItem): { id: string; name: string }[] {
  const specs = item.specializations ?? []
  const ids = item.specialization_ids ?? []
  const out: { id: string; name: string }[] = []
  specs.forEach((raw, i) => {
    if (typeof raw === 'string') {
      const name = raw.trim()
      if (!name) return
      out.push({ id: ids[i] ?? `spec-${i}`, name })
      return
    }
    const mapped = mapSpecializationObject(raw)
    if (mapped) out.push(mapped)
  })
  return out
}

/** Normalize an admin API doctor row into the UI DoctorListItem shape. */
export function mapDoctorListItem(item: DoctorApiItem): DoctorListItem {
  const next = item.next_shift ?? item.nextShift ?? null
  const hasResume = Boolean(
    item.has_resume ?? item.hasResume ?? item.resume_file_name ?? item.resume_file_url,
  )
  return {
    id: item.id,
    doctorId: item.doctor_id ?? item.doctorId ?? '',
    firstName: item.first_name ?? item.firstName ?? '',
    lastName: item.last_name ?? item.lastName ?? '',
    photo: item.photo_url ?? item.photo ?? null,
    gender: item.gender ?? null,
    phone: item.phone_number ?? item.phone ?? null,
    email: item.email ?? '',
    designation: item.designation ?? null,
    qualification: item.qualification ?? null,
    status: item.doctor_status ?? item.status ?? 'ACTIVE',
    accountStatus: item.account_status ?? item.accountStatus ?? 'ACTIVE',
    username: item.username ?? null,
    employeeId: item.employee_id ?? item.employeeId ?? null,
    employmentType: item.employment_type ?? item.employmentType ?? null,
    department: item.department
      ? {
          id: item.department.id,
          name: item.department.name,
          code: item.department.code ?? '',
        }
      : null,
    specializations: mapSpecializations(item),
    nextShift: next
      ? {
          date: next.date,
          startTime: next.start_time ?? next.startTime ?? '',
          shiftType: next.shift_type ?? next.shiftType ?? '',
        }
      : null,
    patientsCount: item.patients_count ?? item.patientsCount ?? 0,
    hasResume,
    updatedByName: item.updated_by_name ?? item.updatedByName ?? null,
    updatedAt: item.updated_at ?? item.updatedAt ?? item.join_date ?? '',
  }
}

/** Extract raw doctor rows from array or paginated object responses. */
export function normalizeDoctorListPayload(res: DoctorListResponse | null | undefined): DoctorApiItem[] {
  if (!res) return []
  if (Array.isArray(res)) return res
  return res.items ?? res.doctors ?? res.data ?? []
}

export function doctorListItems(res: DoctorListResponse | null | undefined): DoctorListItem[] {
  return normalizeDoctorListPayload(res).map(mapDoctorListItem)
}

export function doctorListMeta(
  res: DoctorListResponse | null | undefined,
  opts?: { page?: number; pageSize?: number },
) {
  const items = normalizeDoctorListPayload(res)
  const fallbackPageSize = opts?.pageSize ?? 10
  const fallbackPage = opts?.page ?? 1

  if (Array.isArray(res)) {
    const total = items.length
    const pageSize = fallbackPageSize
    return {
      total,
      page: fallbackPage,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
    }
  }

  return {
    total: res?.total ?? items.length,
    page: res?.page ?? fallbackPage,
    pageSize: res?.page_size ?? res?.pageSize ?? fallbackPageSize,
    totalPages: res?.total_pages ?? res?.totalPages ?? Math.max(1, Math.ceil((res?.total ?? items.length) / fallbackPageSize) || 1),
  }
}

/** True when the API returned a bare array (client-side paging applies). */
export function isDoctorListArray(res: DoctorListResponse | null | undefined): boolean {
  return Array.isArray(res)
}

export type DoctorStatus = 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | 'TERMINATED' | 'DEACTIVATED'

export interface ChangeDoctorPasswordRequest {
  new_password: string
}

export interface SuspendDoctorRequest {
  reason: string
}

export type TerminateDoctorRequest = SuspendDoctorRequest

export interface AssignShiftRequest {
  shift_id: string
}

export interface DoctorAccount {
  doctor_id: string
  account_status: string | null
  doctor_status: string | null
  email: string | null
  email_verified: boolean
  login_enabled: boolean
  last_login: string | null
  password_change_required: boolean
  must_change_password: boolean
  invitation_status: string | null
}

export interface DoctorPatient {
  id: string
  patient_id: string
  full_name: string
  gender: string | null
  phone: string | null
  email: string | null
  patient_type: string | null
  status: string | null
  last_visit: string | null
  visit_count: number
  department: Record<string, unknown> | null
}

export interface DoctorPatientList {
  items: DoctorPatient[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface DoctorStatusResult {
  status: string
  doctor_status: string | null
  account_status: string | null
}

export interface DoctorControlFlags {
  edit: boolean
  manageAccount: boolean
  changePassword: boolean
  resetPassword: boolean
  disable: boolean
  assignShift: boolean
  viewPatients: boolean
  suspend: boolean
  terminate: boolean
  deactivate: boolean
  resendInvite: boolean
  reactivate: boolean
}

const CONTROL_RANK = ['TERMINATED', 'DEACTIVATED', 'SUSPENDED', 'DISABLED'] as const

/** Employment status wins; account status fills in when employment is still active. */
export function primaryDoctorStatus(
  employmentStatus: string | null | undefined,
  accountStatus?: string | null,
): string {
  const employment = (employmentStatus ?? '').trim().toUpperCase()
  const account = (accountStatus ?? '').trim().toUpperCase()
  for (const status of CONTROL_RANK) {
    if (employment === status || account === status) return status
  }
  if (employment === 'INACTIVE' || account === 'INACTIVE') return 'DEACTIVATED'
  return employment || account || 'ACTIVE'
}

export function doctorControlFlags(
  employmentStatus: string | null | undefined,
  accountStatus?: string | null,
): DoctorControlFlags {
  const status = primaryDoctorStatus(employmentStatus, accountStatus)
  const active = status === 'ACTIVE'
  const terminated = status === 'TERMINATED'
  return {
    edit: active,
    manageAccount: true,
    changePassword: active,
    resetPassword: active || status === 'DISABLED',
    disable: active,
    assignShift: active,
    viewPatients: true,
    suspend: active,
    terminate: active,
    deactivate: active,
    resendInvite: !terminated,
    reactivate: status === 'DISABLED' || status === 'SUSPENDED' || status === 'DEACTIVATED',
  }
}

export function doctorActionError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!(error instanceof ApiError)) return fallback
  const raw = error.message?.trim() ?? ''
  const generic = !raw || raw.startsWith('Request failed') || raw === 'Not found.'
  if (error.status === 401) return 'Session expired. Please sign in again.'
  if (error.status === 403) return generic ? 'You do not have permission to perform this action.' : raw
  if (error.status === 404) return generic ? 'Doctor not found.' : raw
  if (error.status === 500) return generic ? 'Something went wrong. Please try again.' : raw
  return raw || fallback
}

function doctorPath(doctorId: string, suffix = ''): string {
  return `/api/admin/doctors/${encodeURIComponent(doctorId)}${suffix}`
}

function toQuery(params?: DoctorListParams): string {
  if (!params) return ''
  const q = new URLSearchParams()
  if (params.department_id) q.set('department_id', params.department_id)
  if (params.specialization_id) q.set('specialization_id', params.specialization_id)
  if (params.status) q.set('status', params.status)
  if (params.search) q.set('search', params.search)
  if (params.page != null) q.set('page', String(params.page))
  if (params.page_size != null) q.set('page_size', String(params.page_size))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const doctorsService = {
  list(params?: DoctorListParams) {
    return apiFetch<DoctorListResponse>(`/api/admin/doctors${toQuery(params)}`)
  },

  get(doctorId: string) {
    return apiFetch<unknown>(`/api/admin/doctors/${encodeURIComponent(doctorId)}`)
  },

  create(payload: DoctorCreatePayload) {
    return apiFetch<unknown>('/api/admin/doctors', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  update(doctorId: string, payload: DoctorUpdatePayload) {
    return apiFetch<unknown>(`/api/admin/doctors/${encodeURIComponent(doctorId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  /** DELETE is Deactivate Doctor on the admin API. */
  remove(doctorId: string) {
    return apiFetch<unknown>(`/api/admin/doctors/${encodeURIComponent(doctorId)}`, {
      method: 'DELETE',
    })
  },

  resendInvite(doctorId: string) {
    return apiFetch<unknown>(`/api/admin/doctors/${encodeURIComponent(doctorId)}/resend-invite`, {
      method: 'POST',
    })
  },

  uploadResume(doctorId: string, file: File | Blob) {
    const form = new FormData()
    form.append('file', file)
    return apiFetch<unknown>(doctorPath(doctorId, '/resume'), {
      method: 'POST',
      body: form,
      // Let the browser set multipart boundary — do not force JSON Content-Type.
      headers: {},
    })
  },

  changePassword(doctorId: string, data: ChangeDoctorPasswordRequest) {
    return apiFetch<unknown>(doctorPath(doctorId, '/change-password'), {
      method: 'POST',
      body: JSON.stringify({ new_password: data.new_password }),
    })
  },

  resetPassword(doctorId: string) {
    return apiFetch<unknown>(doctorPath(doctorId, '/reset-password'), { method: 'POST' })
  },

  disable(doctorId: string) {
    return apiFetch<unknown>(doctorPath(doctorId, '/disable'), { method: 'POST' })
  },

  suspend(doctorId: string, data: SuspendDoctorRequest) {
    return apiFetch<DoctorStatusResult>(doctorPath(doctorId, '/suspend'), {
      method: 'POST',
      body: JSON.stringify({ reason: data.reason }),
    })
  },

  terminate(doctorId: string, data: TerminateDoctorRequest) {
    return apiFetch<DoctorStatusResult>(doctorPath(doctorId, '/terminate'), {
      method: 'POST',
      body: JSON.stringify({ reason: data.reason }),
    })
  },

  reactivate(doctorId: string) {
    return apiFetch<DoctorStatusResult>(doctorPath(doctorId, '/reactivate'), { method: 'POST' })
  },

  getAccount(doctorId: string) {
    return apiFetch<DoctorAccount>(doctorPath(doctorId, '/account'))
  },

  getPatients(doctorId: string, params?: { page?: number; page_size?: number; search?: string }) {
    const q = new URLSearchParams()
    if (params?.page != null) q.set('page', String(params.page))
    if (params?.page_size != null) q.set('page_size', String(params.page_size))
    if (params?.search?.trim()) q.set('search', params.search.trim())
    const text = q.toString()
    return apiFetch<DoctorPatientList>(`${doctorPath(doctorId, '/patients')}${text ? `?${text}` : ''}`)
  },

  assignShift(doctorId: string, data: AssignShiftRequest) {
    return apiFetch<unknown>(doctorPath(doctorId, '/assign-shift'), {
      method: 'POST',
      body: JSON.stringify({ shift_id: data.shift_id }),
    })
  },
}
