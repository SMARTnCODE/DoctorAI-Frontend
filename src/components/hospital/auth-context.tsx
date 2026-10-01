'use client'

/**
 * Auth context — one session for Super Admin and Doctor.
 * Role comes from the login API. Tokens stay in the existing localStorage keys.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  apiFetch,
  clearAuthStorage,
  getAdminToken,
  getAuthProfile,
  getDoctorToken,
  persistRoleSession,
  tokenForRole,
  type UserSession,
} from '@/lib/api-client'
import { ApiError } from '@/lib/api-client'
import { parseAccountPayload, type DoctorUser } from '@/lib/parse-auth'
import { USER_ROLES, type UserRole } from '@/lib/roles'
import { authService, toUserSession, type SignupPayload } from '@/services/auth.service'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface LoginSuccess {
  mfaRequired?: boolean
  challengeId?: string
  role?: UserRole
  userId?: string
}

interface AuthContextValue {
  status: AuthStatus
  isAuthenticated: boolean
  user: UserSession | null
  userId: string | null
  role: UserRole | null
  doctorProfile: DoctorUser | null
  mustChangePassword: boolean
  timeoutMinutes: number
  login: (email: string, password: string, remember: boolean) => Promise<LoginSuccess>
  loginDoctor: (email: string, password: string, remember: boolean) => Promise<{
    role: UserRole
    userId: string
    mustChangePassword: boolean
    user: DoctorUser | null
  }>
  signup: (payload: SignupPayload) => Promise<void>
  verifyMfa: (challengeId: string, code: string) => Promise<void>
  logout: (reason?: string) => Promise<void>
  changeDoctorPassword: (currentPassword: string, newPassword: string) => Promise<DoctorUser | null>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Client-side idle timeout when backend does not expose timeoutMinutes. */
const DEFAULT_TIMEOUT_MINUTES = 30

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

function sessionFromProfile(): {
  status: AuthStatus
  user: UserSession | null
  userId: string | null
  role: UserRole | null
  doctorProfile: DoctorUser | null
  mustChangePassword: boolean
} {
  const profile = getAuthProfile()
  const token = tokenForRole(profile?.role ?? null)
  if (!profile || !token) {
    const hasOrphanToken = Boolean(getAdminToken() || getDoctorToken())
    return {
      status: hasOrphanToken ? 'loading' : 'unauthenticated',
      user: null,
      userId: null,
      role: null,
      doctorProfile: null,
      mustChangePassword: false,
    }
  }
  return {
    status: 'authenticated',
    user: {
      id: profile.userId,
      name: profile.name,
      email: profile.email,
      role: profile.role,
    },
    userId: profile.userId,
    role: profile.role,
    doctorProfile: profile.role === USER_ROLES.DOCTOR ? profile.doctor : null,
    mustChangePassword: profile.mustChangePassword,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = sessionFromProfile()
  const [status, setStatus] = useState<AuthStatus>(initial.status)
  const [user, setUser] = useState<UserSession | null>(initial.user)
  const [userId, setUserId] = useState<string | null>(initial.userId)
  const [role, setRole] = useState<UserRole | null>(initial.role)
  const [doctorProfile, setDoctorProfile] = useState<DoctorUser | null>(initial.doctorProfile)
  const [mustChangePassword, setMustChangePassword] = useState(initial.mustChangePassword)
  const [timeoutMinutes] = useState(DEFAULT_TIMEOUT_MINUTES)
  const lastActivity = useRef(Date.now())
  const roleRef = useRef<UserRole | null>(initial.role)
  roleRef.current = role

  const applyCleared = useCallback(() => {
    clearAuthStorage()
    setUser(null)
    setUserId(null)
    setRole(null)
    setDoctorProfile(null)
    setMustChangePassword(false)
    setStatus('unauthenticated')
  }, [])

  const applyParsed = useCallback((session: {
    userId: string
    role: UserRole
    name: string
    email: string
    mustChangePassword: boolean
    doctor: DoctorUser | null
    accessToken?: string
  }) => {
    if (session.accessToken) {
      persistRoleSession({
        role: session.role,
        accessToken: session.accessToken,
        userId: session.userId,
        name: session.name,
        email: session.email,
        mustChangePassword: session.mustChangePassword,
        doctor: session.doctor,
      })
    } else {
      const token = tokenForRole(session.role)
      if (token) {
        persistRoleSession({
          role: session.role,
          accessToken: token,
          userId: session.userId,
          name: session.name,
          email: session.email,
          mustChangePassword: session.mustChangePassword,
          doctor: session.doctor,
        })
      }
    }
    setUser({
      id: session.userId,
      name: session.name || session.email,
      email: session.email,
      role: session.role,
    })
    setUserId(session.userId)
    setRole(session.role)
    setDoctorProfile(session.role === USER_ROLES.DOCTOR ? session.doctor : null)
    setMustChangePassword(session.mustChangePassword)
    setStatus('authenticated')
  }, [])

  const refreshSession = useCallback(async () => {
    const profile = getAuthProfile()
    const storedRole = profile?.role ?? null
    const token = tokenForRole(storedRole)

    if (!storedRole || !token) {
      const adminToken = getAdminToken()
      const doctorToken = getDoctorToken()
      if (!adminToken && !doctorToken) {
        applyCleared()
        return
      }
      // Recover a role from the server. If the server omits it, sign out —
      // never assume Super Admin.
      if (adminToken) {
        try {
          const account = await authService.me()
          const mapped = toUserSession(account)
          if (mapped?.role === USER_ROLES.SUPER_ADMIN || mapped?.role === USER_ROLES.DOCTOR) {
            applyParsed({
              userId: mapped.id,
              role: mapped.role,
              name: mapped.name,
              email: mapped.email,
              mustChangePassword: false,
              doctor: mapped.role === USER_ROLES.DOCTOR
                ? {
                  id: mapped.id,
                  doctorId: mapped.id,
                  name: mapped.name || 'Doctor',
                  email: mapped.email,
                  designation: '',
                  department: '',
                  accountStatus: 'ACTIVE',
                  lastLoginAt: null,
                  passwordChangedAt: null,
                  mustChangePassword: false,
                }
                : null,
              accessToken: adminToken,
            })
            return
          }
        } catch (err) {
          if (!(err instanceof ApiError) || (err.status !== 401 && err.status !== 403 && err.status !== 404)) {
            applyCleared()
            return
          }
        }
      }
      if (doctorToken) {
        try {
          const raw = await apiFetch<unknown>('/api/auth/me', {
            headers: { Authorization: `Bearer ${doctorToken}` },
          })
          const account = parseAccountPayload(raw)
          if (account?.role === USER_ROLES.DOCTOR) {
            applyParsed({
              userId: account.userId,
              role: USER_ROLES.DOCTOR,
              name: account.name,
              email: account.email,
              mustChangePassword: account.mustChangePassword,
              doctor: account.doctor,
              accessToken: doctorToken,
            })
            return
          }
        } catch (err) {
          if (!(err instanceof ApiError) || (err.status !== 401 && err.status !== 403 && err.status !== 404)) {
            applyCleared()
            return
          }
        }
      }
      applyCleared()
      return
    }

    if (!profile) {
      applyCleared()
      return
    }

    try {
      if (storedRole === USER_ROLES.DOCTOR) {
        const raw = await apiFetch<unknown>('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const account = parseAccountPayload(raw)
        const nextRole = account?.role ?? storedRole
        if (nextRole !== USER_ROLES.DOCTOR) {
          applyCleared()
          return
        }
        applyParsed({
          userId: account?.userId || profile.userId,
          role: USER_ROLES.DOCTOR,
          name: account?.name || profile.name,
          email: account?.email || profile.email,
          mustChangePassword: account?.mustChangePassword ?? profile.mustChangePassword,
          doctor: account?.doctor ?? profile.doctor,
        })
        return
      }

      const account = await authService.me()
      const mapped = toUserSession(account)
      const nextRole = mapped?.role ?? storedRole
      if (nextRole !== USER_ROLES.SUPER_ADMIN) {
        applyCleared()
        return
      }
      applyParsed({
        userId: mapped?.id || profile.userId,
        role: USER_ROLES.SUPER_ADMIN,
        name: mapped?.name || profile.name,
        email: mapped?.email || profile.email,
        mustChangePassword: false,
        doctor: null,
      })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        applyCleared()
        return
      }
      // Keep the restored role on transient failures so a refresh does not
      // drop a doctor into the Super Admin app.
      if (profile && tokenForRole(profile.role)) {
        setStatus('authenticated')
      }
    }
  }, [applyCleared, applyParsed])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  /** Track activity for client-side idle logout (backend has no heartbeat route). */
  useEffect(() => {
    if (status !== 'authenticated') return
    const handler = () => {
      lastActivity.current = Date.now()
    }
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, handler))
  }, [status])

  const login = useCallback(async (email: string, password: string, _remember: boolean) => {
    const result = await authService.loginSuperAdmin({ email, password })
    if ('mfaRequired' in result) {
      return { mfaRequired: true, challengeId: result.challengeId }
    }
    applyParsed(result)
    return { role: result.role, userId: result.userId }
  }, [applyParsed])

  const loginDoctor = useCallback(async (email: string, password: string, _remember: boolean) => {
    const result = await authService.loginDoctor({ email, password })
    applyParsed(result)
    return {
      role: result.role,
      userId: result.userId,
      mustChangePassword: result.mustChangePassword,
      user: result.doctor,
    }
  }, [applyParsed])

  const signup = useCallback(async (payload: SignupPayload) => {
    // Register only — do not persist token or authenticate; user signs in next.
    await authService.signup(payload)
    applyCleared()
  }, [applyCleared])

  const verifyMfa = useCallback(async (_challengeId: string, _code: string) => {
    // Current DoctorsAI backend does not expose MFA; keep signature for UI compatibility.
    throw new Error('MFA is not available on this server.')
  }, [])

  const logout = useCallback(async () => {
    const current = roleRef.current
    const token = tokenForRole(current)
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch {
      /* clear local token regardless */
    }
    applyCleared()
  }, [applyCleared])

  const changeDoctorPassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const doctorToken = getDoctorToken()
    const data = await apiFetch<{ user?: DoctorUser; access_token?: string }>('/api/auth/change-password', {
      method: 'POST',
      headers: doctorToken ? { Authorization: `Bearer ${doctorToken}` } : {},
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
    const account = parseAccountPayload(data)
    const currentUser = getAuthProfile()
    const nextDoctor = account?.doctor ?? (data.user ? { ...data.user, mustChangePassword: false } : currentUser?.doctor ?? null)
    const token = data.access_token || getDoctorToken() || ''
    applyParsed({
      userId: account?.userId || nextDoctor?.id || currentUser?.userId || '',
      role: USER_ROLES.DOCTOR,
      name: account?.name || nextDoctor?.name || currentUser?.name || '',
      email: account?.email || nextDoctor?.email || currentUser?.email || '',
      mustChangePassword: false,
      doctor: nextDoctor ? { ...nextDoctor, mustChangePassword: false } : null,
      accessToken: token || undefined,
    })
    return nextDoctor ? { ...nextDoctor, mustChangePassword: false } : null
  }, [applyParsed])

  // Client-side inactivity enforcement
  useEffect(() => {
    if (status !== 'authenticated') return
    let warningTimer: ReturnType<typeof setTimeout>
    let logoutTimer: ReturnType<typeof setTimeout>
    const resetTimers = () => {
      clearTimeout(warningTimer)
      clearTimeout(logoutTimer)
      lastActivity.current = Date.now()
      warningTimer = setTimeout(() => {
        window.localStorage.setItem('hms-session-warning', String(Date.now()))
        window.dispatchEvent(new Event('hms-session-warning'))
      }, Math.max(1, (timeoutMinutes - 1) * 60_000))
      logoutTimer = setTimeout(() => {
        void logout()
        window.localStorage.setItem('hms-session-expired', String(Date.now()))
        window.dispatchEvent(new Event('hms-session-expired'))
      }, timeoutMinutes * 60_000)
    }
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, resetTimers, { passive: true }))
    resetTimers()
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimers))
      clearTimeout(warningTimer)
      clearTimeout(logoutTimer)
    }
  }, [status, timeoutMinutes, logout])

  return (
    <AuthContext.Provider
      value={{
        status,
        isAuthenticated: status === 'authenticated',
        user,
        userId,
        role,
        doctorProfile,
        mustChangePassword,
        timeoutMinutes,
        login,
        loginDoctor,
        signup,
        verifyMfa,
        logout,
        changeDoctorPassword,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
