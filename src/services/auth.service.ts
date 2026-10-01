/**
 * Auth API service — Super Admin signup/login and Doctor login.
 * Base URL: VITE_API_URL (see src/lib/api-client.ts)
 */
import { apiFetch, persistRoleSession, type UserSession } from '@/lib/api-client'
import { isMfaChallenge, parseLoginPayload, type ParsedLogin } from '@/lib/parse-auth'
import { AuthRoleError, unexpectedRoleMessage, USER_ROLES, normalizeRole, type UserRole } from '@/lib/roles'

export interface SignupPayload {
  full_name: string
  work_email: string
  country_code: string
  mobile_number: string
  password: string
  confirm_password: string
  hospital_name: string
  country: string
  terms_accepted: boolean
  privacy_policy_accepted: boolean
}

export interface LoginPayload {
  email: string
  password: string
}

export interface AuthAccountData {
  access_token?: string
  token_type?: string
  /** Legacy field. Prefer `role` when the backend sends it. */
  account_type?: string
  role?: string
  user_id?: string
  id?: string
  hospital_name?: string
  /** Prefer work_email when backend returns the new signup shape. */
  email?: string
  work_email?: string
  full_name?: string
  name?: string
}

export interface ActivateAccountPayload {
  token: string
  password: string
}

export interface ChangePasswordPayload {
  current_password: string
  new_password: string
}

/** Map backend account payload → frontend UserSession. Returns null when role is missing. */
export function toUserSession(account: AuthAccountData): UserSession | null {
  const role = normalizeRole(account.role ?? account.account_type)
  if (!role) return null
  const email = account.work_email || account.email || ''
  return {
    id: account.user_id || account.id || '',
    name: account.full_name || account.name || account.hospital_name || email,
    email,
    role,
  }
}

export type LoginResult =
  | { mfaRequired: true; challengeId: string }
  | ParsedLogin

function assertRole(session: ParsedLogin, expected: UserRole): ParsedLogin {
  if (session.role !== expected) {
    throw new AuthRoleError(unexpectedRoleMessage(expected))
  }
  return session
}

function storeSession(session: ParsedLogin): ParsedLogin {
  persistRoleSession({
    role: session.role,
    accessToken: session.accessToken,
    userId: session.userId,
    name: session.name,
    email: session.email,
    mustChangePassword: session.mustChangePassword,
    doctor: session.doctor,
  })
  return session
}

export const authService = {
  /** POST /api/auth/signup — register Super Admin + hospital. */
  signup(payload: SignupPayload) {
    return apiFetch<AuthAccountData>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  /** POST /api/auth/login — shared login. Pages should use the role-specific routes. */
  login(payload: LoginPayload) {
    return apiFetch<AuthAccountData>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  /**
   * POST /api/auth/super-admin/login.
   * Rejects any role other than super_admin and does not persist a token then.
   */
  async loginSuperAdmin(payload: LoginPayload): Promise<LoginResult> {
    const data = await apiFetch<unknown>('/api/auth/super-admin/login', {
      method: 'POST',
      body: JSON.stringify({ email: payload.email, password: payload.password }),
    })
    if (isMfaChallenge(data)) {
      return { mfaRequired: true, challengeId: String((data as { challengeId?: string }).challengeId ?? '') }
    }
    return storeSession(assertRole(parseLoginPayload(data), USER_ROLES.SUPER_ADMIN))
  },

  /**
   * POST /api/auth/doctor/login.
   * Rejects any role other than doctor and does not persist a token then.
   */
  async loginDoctor(payload: { email: string; password: string }): Promise<ParsedLogin> {
    const data = await apiFetch<unknown>('/api/auth/doctor/login', {
      method: 'POST',
      body: JSON.stringify({ email: payload.email, password: payload.password }),
    })
    return storeSession(assertRole(parseLoginPayload(data), USER_ROLES.DOCTOR))
  },

  /** GET /api/auth/me — current authenticated account. */
  me() {
    return apiFetch<AuthAccountData>('/api/auth/me')
  },

  /** POST /api/auth/logout */
  logout() {
    return apiFetch<{ ok?: boolean } | void>('/api/auth/logout', { method: 'POST' })
  },

  /** POST /api/auth/activate-account — doctor invitation activation. */
  activateAccount(payload: ActivateAccountPayload) {
    return apiFetch<unknown>('/api/auth/activate-account', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  /** POST /api/auth/change-password */
  changePassword(payload: ChangePasswordPayload) {
    return apiFetch<unknown>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  /** Signup only — registration does not start a session. */
  async signupAndStoreToken(payload: SignupPayload): Promise<AuthAccountData> {
    return authService.signup(payload)
  },

  /**
   * @deprecated Prefer loginSuperAdmin so a doctor role cannot be stored as Super Admin.
   * Kept for callers that already expect the raw login-then-store sequence.
   */
  async loginAndStoreToken(payload: LoginPayload): Promise<LoginResult> {
    return authService.loginSuperAdmin(payload)
  },
}
