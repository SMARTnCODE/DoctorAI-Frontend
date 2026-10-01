'use client'

/**
 * Doctor session facade. Authentication state lives in AuthProvider so a
 * doctor login cannot be stored as a second, role-less Super Admin session.
 */
import type { ReactNode } from 'react'
import { useAuth } from '@/components/hospital/auth-context'
import type { DoctorUser } from '@/lib/parse-auth'

export type { DoctorUser }

export type DoctorAuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface DoctorLoginResult {
  user: DoctorUser | null
  mustChangePassword: boolean
  access_token?: string
}

interface DoctorAuthContextValue {
  status: DoctorAuthStatus
  user: DoctorUser | null
  mustChangePassword: boolean
  timeoutMinutes: number
  login: (identifier: string, password: string, remember: boolean) => Promise<DoctorLoginResult>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<DoctorUser | null>
}

export function useDoctorAuth(): DoctorAuthContextValue {
  const auth = useAuth()
  return {
    status: auth.status,
    user: auth.doctorProfile,
    mustChangePassword: auth.mustChangePassword,
    timeoutMinutes: auth.timeoutMinutes,
    login: async (identifier, password, remember) => {
      const result = await auth.loginDoctor(identifier, password, remember)
      return {
        user: result.user,
        mustChangePassword: result.mustChangePassword,
      }
    },
    logout: () => auth.logout(),
    changePassword: (currentPassword, newPassword) => auth.changeDoctorPassword(currentPassword, newPassword),
  }
}

/** Kept so existing trees can still wrap children; it does not create a session. */
export function DoctorAuthProvider({ children }: { children: ReactNode }) {
  return children
}
