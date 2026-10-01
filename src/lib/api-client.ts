'use client'

/**
 * Client-side API helper — talks to the Python backend.
 * - Base URL from VITE_API_URL (default http://192.168.100.115:8060)
 * - Bearer JWT from localStorage (admin vs doctor tokens)
 * - Unwraps `{ success, message, data }` envelopes from DoctorsAI Backend
 * - Surfaces a typed ApiError so pages can react to 401/403/409/429
 */

import { USER_ROLES, normalizeRole, type UserRole } from '@/lib/roles'
import type { DoctorUser } from '@/lib/parse-auth'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://192.168.100.115:8060').replace(/\/$/, '')

export const ADMIN_TOKEN_KEY = 'hms_access_token'
export const DOCTOR_TOKEN_KEY = 'hms_doctor_access_token'
/** Non-secret profile so role survives refresh. Tokens stay in the keys above. */
export const AUTH_PROFILE_KEY = 'hms_auth_profile'

export interface StoredAuthProfile {
  userId: string
  role: UserRole
  name: string
  email: string
  mustChangePassword: boolean
  doctor: DoctorUser | null
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(ADMIN_TOKEN_KEY)
}

export function setAdminToken(token: string | null): void {
  if (typeof window === 'undefined') return
  if (token) window.localStorage.setItem(ADMIN_TOKEN_KEY, token)
  else window.localStorage.removeItem(ADMIN_TOKEN_KEY)
}

export function getDoctorToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(DOCTOR_TOKEN_KEY)
}

export function setDoctorToken(token: string | null): void {
  if (typeof window === 'undefined') return
  if (token) window.localStorage.setItem(DOCTOR_TOKEN_KEY, token)
  else window.localStorage.removeItem(DOCTOR_TOKEN_KEY)
}

export function getAuthProfile(): StoredAuthProfile | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(AUTH_PROFILE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuthProfile>
    const role = normalizeRole(parsed.role)
    if (!role || typeof parsed.userId !== 'string') return null
    return {
      userId: parsed.userId,
      role,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      mustChangePassword: Boolean(parsed.mustChangePassword),
      doctor: parsed.doctor ?? null,
    }
  } catch {
    return null
  }
}

export function setAuthProfile(profile: StoredAuthProfile | null): void {
  if (typeof window === 'undefined') return
  if (profile) window.localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile))
  else window.localStorage.removeItem(AUTH_PROFILE_KEY)
}

/** Store the token for this role and drop the other portal's token. */
export function persistRoleSession(input: {
  role: UserRole
  accessToken: string
  userId: string
  name: string
  email: string
  mustChangePassword: boolean
  doctor: DoctorUser | null
}): void {
  if (input.role === USER_ROLES.DOCTOR) {
    setDoctorToken(input.accessToken)
    setAdminToken(null)
  } else {
    setAdminToken(input.accessToken)
    setDoctorToken(null)
  }
  setAuthProfile({
    userId: input.userId,
    role: input.role,
    name: input.name,
    email: input.email,
    mustChangePassword: input.mustChangePassword,
    doctor: input.role === USER_ROLES.DOCTOR ? input.doctor : null,
  })
}

export function clearAuthStorage(): void {
  setAdminToken(null)
  setDoctorToken(null)
  setAuthProfile(null)
}

export function tokenForRole(role: UserRole | null): string | null {
  if (role === USER_ROLES.DOCTOR) return getDoctorToken()
  if (role === USER_ROLES.SUPER_ADMIN) return getAdminToken()
  return null
}

/**
 * Doctor portal APIs use the doctor JWT.
 * Super Admin APIs — including `/api/doctors` management — use the admin JWT.
 * Patient and referral routes are shared: the active session role picks the token.
 * The backend still decides which records that token may see.
 */
function tokenForPath(path: string): string | null {
  const pathname = path.split('?')[0] ?? path
  if (
    pathname.startsWith('/api/doctor-auth') ||
    pathname === '/api/doctor' ||
    pathname.startsWith('/api/doctor/') ||
    pathname.startsWith('/api/doctors/referral-options')
  ) {
    return getDoctorToken()
  }
  if (
    pathname === '/api/patients' ||
    pathname.startsWith('/api/patients/') ||
    pathname === '/api/referrals' ||
    pathname.startsWith('/api/referrals/') ||
    pathname === '/api/clinical-visits' ||
    pathname.startsWith('/api/clinical-visits/') ||
    pathname.startsWith('/api/telehealth/') ||
    pathname === '/api/google' ||
    pathname.startsWith('/api/google/') ||
    /^\/api\/doctors\/[^/]+\/(availability|available-slots|telehealth-slots)$/.test(pathname)
  ) {
    const profile = getAuthProfile()
    return tokenForRole(profile?.role ?? null) ?? getDoctorToken() ?? getAdminToken()
  }
  return getAdminToken()
}

function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export class ApiError extends Error {
  status: number
  code?: string
  payload?: Record<string, unknown>
  constructor(message: string, status: number, code?: string, payload?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.payload = payload
  }
}

function validationText(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object' || !('msg' in entry)) return null
  const msg = (entry as { msg: unknown }).msg
  return typeof msg === 'string' && msg.trim() ? msg.trim() : null
}

function nestedDetail(data: Record<string, unknown>): Record<string, unknown> | null {
  const detail = data.detail
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null
  return detail as Record<string, unknown>
}

function errorCodeFromBody(data: Record<string, unknown>): string | undefined {
  if (typeof data.code === 'string' && data.code.trim()) return data.code.trim()
  const detail = nestedDetail(data)
  if (detail && typeof detail.code === 'string' && detail.code.trim()) return detail.code.trim()
  return undefined
}

function errorMessageFromBody(data: Record<string, unknown>, status: number): string {
  if (typeof data.message === 'string' && data.message.trim()) return data.message
  if (typeof data.error === 'string' && data.error.trim()) return data.error
  if (typeof data.detail === 'string' && data.detail.trim()) return data.detail
  const detail = nestedDetail(data)
  if (detail && typeof detail.message === 'string' && detail.message.trim()) return detail.message.trim()
  const detailList = Array.isArray(data.detail) ? data.detail : Array.isArray(data.errors) ? data.errors : null
  if (detailList && detailList.length > 0) {
    const parts = detailList.map(validationText).filter((part): part is string => Boolean(part))
    if (parts.length) return parts.join('; ')
  }
  if (status === 403) return 'You do not have permission to perform this action.'
  if (status === 404) return 'Not found.'
  if (status === 500) return 'Something went wrong. Please try again.'
  return `Request failed (${status}).`
}

/** Detect DoctorsAI `{ success, message, data }` envelope and unwrap `data`. */
function unwrapEnvelope<T>(data: Record<string, unknown>): T {
  if (
    Object.prototype.hasOwnProperty.call(data, 'success') &&
    Object.prototype.hasOwnProperty.call(data, 'data')
  ) {
    return data.data as T
  }
  return data as T
}

/** Share in-flight GET promises so React Strict Mode remounts don't hit the network twice. */
const inflightGets = new Map<string, Promise<unknown>>()

function isGetRequest(init?: RequestInit): boolean {
  const method = (init?.method ?? 'GET').toUpperCase()
  return method === 'GET' && init?.body == null
}

async function apiFetchOnce<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
  if (!isFormData && !headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  // FormData must set its own multipart boundary — strip any forced Content-Type.
  if (isFormData && headers.has('Content-Type')) {
    headers.delete('Content-Type')
  }

  const token = tokenForPath(path)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let res: Response
  try {
    res = await fetch(resolveUrl(path), {
      ...init,
      headers,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError('Network error. Check your connection and try again.', 0)
  }

  let data: Record<string, unknown> = {}
  try {
    data = await res.json()
  } catch {
    /* empty body is fine */
  }

  const failed = !res.ok || data.success === false
  if (failed) {
    throw new ApiError(
      errorMessageFromBody(data, res.status),
      res.status,
      errorCodeFromBody(data),
      data,
    )
  }
  return unwrapEnvelope<T>(data)
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Don't dedupe when caller passes an AbortSignal — each consumer owns cancellation.
  if (!isGetRequest(init) || init?.signal) {
    return apiFetchOnce<T>(path, init)
  }

  const key = resolveUrl(path)
  const existing = inflightGets.get(key)
  if (existing) return existing as Promise<T>

  const promise = apiFetchOnce<T>(path, init).finally(() => {
    if (inflightGets.get(key) === promise) inflightGets.delete(key)
  })
  inflightGets.set(key, promise)
  return promise
}

/** Authenticated binary download (e.g. doctor resume). Returns blob + optional filename. */
export async function apiFetchBlob(
  path: string,
  init?: RequestInit,
): Promise<{ blob: Blob; fileName: string | null }> {
  const headers = new Headers(init?.headers)
  const token = tokenForPath(path)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let res: Response
  try {
    res = await fetch(resolveUrl(path), { ...init, headers })
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', 0)
  }

  if (!res.ok) {
    let data: Record<string, unknown> = {}
    try {
      data = await res.json()
    } catch {
      /* ignore */
    }
    throw new ApiError(
      (data.error as string) || `Request failed (${res.status}).`,
      res.status,
      data.code as string | undefined,
      data,
    )
  }

  const disposition = res.headers.get('Content-Disposition')
  let fileName: string | null = null
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?["']?([^;"']+)/i)
  if (match) fileName = decodeURIComponent(match[1])

  return { blob: await res.blob(), fileName }
}

// ── Shared API types ─────────────────────────────────────────
export interface UserSession {
  id: string
  name: string
  email: string
  role: string
}

export interface DeptRef { id: string; name: string; code?: string }
export interface SpecRef { id: string; name: string; description?: string | null }

export interface DoctorListItem {
  id: string; doctorId: string; firstName: string; lastName: string
  photo: string | null; gender: string | null; phone: string | null; email: string
  designation: string | null; qualification: string | null; status: string
  /** Task 24 — portal account lifecycle: ACTIVE | LOCKED | PASSWORD_RESET_REQUIRED | DEACTIVATED. */
  accountStatus: string
  /** Task 26 — portal username (login accepts email OR doctor ID OR username). */
  username: string | null
  /** Task 26 — employment / HR fields. */
  employeeId: string | null
  employmentType: string | null
  department: DeptRef | null
  specializations: SpecRef[]
  nextShift: { date: string; startTime: string; shiftType: string } | null
  patientsCount: number
  /** Task 23 — true when a professional resume/CV is on file (indicator only). */
  hasResume: boolean
  updatedByName: string | null
  updatedAt: string
}

/**
 * Minimal doctor reference (Task 24) for dialogs/components that only need to
 * identify a doctor (e.g. login-status / account actions payloads).
 */
export interface DoctorRef {
  id: string
  doctorId: string
  firstName: string
  lastName: string
}

export interface ShiftItem {
  id: string
  date: string
  startTime: string
  endTime: string
  shiftType: string
  room: string | null
  notes: string | null
  status: string
  createdByName: string | null
  doctor: {
    id: string; doctorId: string; firstName: string; lastName: string
    photo: string | null; status: string; designation: string | null
    department: DeptRef | null
  }
  department: DeptRef | null
}

export interface PatientListItem {
  id: string; patientId: string; firstName: string; lastName: string
  dateOfBirth: string | null; gender: string | null; phone: string | null
  email: string | null; status: string
  doctors: { id: string; doctorId: string; name: string }[]
  department: DeptRef | null
  lastVisit: string | null
  visitsCount: number
}

export interface AuditLogItem {
  id: string; userId: string | null; userName: string | null
  action: string; module: string; recordId: string | null
  recordLabel: string | null; description: string
  ipAddress: string | null; userAgent: string | null; timestamp: string
}

export interface Paged<T> { total: number; page: number; pageSize: number; totalPages: number }
