/**
 * Reads role, user id, and token from login/session payloads.
 * Supports the current envelope (`user_id`, `role`, `access_token`) and the
 * older account / nested-user shapes. Never invents a role.
 */
import { AuthRoleError, normalizeRole, USER_ROLES, type UserRole } from '@/lib/roles'

export interface DoctorUser {
  id: string
  doctorId: string
  name: string
  email: string
  designation: string
  department: string
  accountStatus: string
  lastLoginAt: string | null
  passwordChangedAt: string | null
  mustChangePassword: boolean
}

export interface ParsedLogin {
  userId: string
  role: UserRole
  accessToken: string
  name: string
  email: string
  mustChangePassword: boolean
  doctor: DoctorUser | null
}

export interface ParsedAccount {
  userId: string
  role: UserRole | null
  name: string
  email: string
  mustChangePassword: boolean
  doctor: DoctorUser | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(source: Record<string, unknown> | null, ...keys: string[]): string {
  if (!source) return ''
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function readNullableString(source: Record<string, unknown> | null, ...keys: string[]): string | null {
  const value = readString(source, ...keys)
  return value || null
}

function nestedUser(data: Record<string, unknown>): Record<string, unknown> | null {
  return asRecord(data.user)
}

function departmentLabel(source: Record<string, unknown> | null): string {
  if (!source) return ''
  const value = source.department
  if (typeof value === 'string') return value
  const record = asRecord(value)
  if (!record) return ''
  return readString(record, 'name')
}

function readRole(data: Record<string, unknown>, user: Record<string, unknown> | null) {
  return normalizeRole(
    data.role ?? data.account_type ?? data.accountType ?? user?.role ?? user?.account_type ?? user?.accountType,
  )
}

export function isMfaChallenge(raw: unknown): raw is { mfaRequired: true; challengeId?: string } {
  const data = asRecord(raw)
  if (!data || data.mfaRequired !== true) return false
  return !readString(data, 'access_token', 'accessToken')
}

function toDoctorUser(
  user: Record<string, unknown> | null,
  fallback: { userId: string; name: string; email: string; mustChangePassword: boolean },
): DoctorUser {
  const id = readString(user, 'id', 'user_id', 'userId') || fallback.userId
  return {
    id,
    doctorId: readString(user, 'doctorId', 'doctor_id') || id,
    name: readString(user, 'name', 'full_name') || fallback.name || 'Doctor',
    email: readString(user, 'email', 'work_email') || fallback.email,
    designation: readString(user, 'designation'),
    department: departmentLabel(user),
    accountStatus: readString(user, 'accountStatus', 'account_status') || 'ACTIVE',
    lastLoginAt: readNullableString(user, 'lastLoginAt', 'last_login_at'),
    passwordChangedAt: readNullableString(user, 'passwordChangedAt', 'password_changed_at'),
    mustChangePassword: Boolean(user?.mustChangePassword ?? user?.must_change_password ?? fallback.mustChangePassword),
  }
}

export function parseAccountPayload(raw: unknown): ParsedAccount | null {
  const data = asRecord(raw)
  if (!data) return null
  const user = nestedUser(data)
  const role = readRole(data, user)
  const userId = readString(data, 'user_id', 'userId', 'id') || readString(user, 'id', 'user_id', 'userId')
  const email = readString(data, 'work_email', 'email') || readString(user, 'email', 'work_email')
  const name =
    readString(data, 'full_name', 'name', 'hospital_name') ||
    readString(user, 'name', 'full_name') ||
    email
  const mustChangePassword = Boolean(
    data.mustChangePassword ?? data.must_change_password ?? user?.mustChangePassword ?? user?.must_change_password,
  )
  const doctor = role === USER_ROLES.DOCTOR
    ? toDoctorUser(user ?? data, { userId, name, email, mustChangePassword })
    : null
  return {
    userId,
    role,
    name,
    email,
    mustChangePassword,
    doctor,
  }
}

/** Login payloads must include both a recognized role and an access token. */
export function parseLoginPayload(raw: unknown): ParsedLogin {
  const account = parseAccountPayload(raw)
  const data = asRecord(raw)
  const accessToken = readString(data, 'access_token', 'accessToken')
  if (!account?.role) {
    throw new AuthRoleError('Sign-in response did not include a recognized role. You were not signed in.')
  }
  if (!accessToken) {
    throw new AuthRoleError('Sign-in response did not include an access token. You were not signed in.')
  }
  return {
    userId: account.userId,
    role: account.role,
    accessToken,
    name: account.name,
    email: account.email,
    mustChangePassword: account.mustChangePassword,
    doctor: account.role === USER_ROLES.DOCTOR ? account.doctor : null,
  }
}
