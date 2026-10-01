/**
 * Canonical application roles. Compare against these constants — do not
 * repeat role strings at call sites.
 */
export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  DOCTOR: 'doctor',
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]

const ROLE_ALIASES: Record<string, UserRole> = {
  super_admin: USER_ROLES.SUPER_ADMIN,
  superadmin: USER_ROLES.SUPER_ADMIN,
  'super-admin': USER_ROLES.SUPER_ADMIN,
  doctor: USER_ROLES.DOCTOR,
}

/** Map backend role labels (`super_admin`, `SUPER_ADMIN`, `doctor`, …) to a canonical role. */
export function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return ROLE_ALIASES[key] ?? null
}

export function isUserRole(value: unknown): value is UserRole {
  return normalizeRole(value) !== null && value === normalizeRole(value)
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === USER_ROLES.SUPER_ADMIN
}

export function isDoctorRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === USER_ROLES.DOCTOR
}

export function homePathForRole(role: UserRole): string {
  return role === USER_ROLES.DOCTOR ? '/doctor/dashboard' : '/super-admin/dashboard'
}

export function loginPathForArea(path: string): string {
  return path === '/doctor' || path.startsWith('/doctor/') || path === '/doctor-portal' || path.startsWith('/telehealth/')
    ? '/doctor/login'
    : '/super-admin/login'
}

export class AuthRoleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthRoleError'
  }
}

export function unexpectedRoleMessage(expected: UserRole): string {
  if (expected === USER_ROLES.SUPER_ADMIN) {
    return 'This account is not a Super Admin account. Sign in on the Doctor portal.'
  }
  return 'This account is not a Doctor account. Sign in on the Super Admin portal.'
}
