/**
 * Pure auth gate used by the hash router. Keeps Super Admin and Doctor
 * applications on separate route trees.
 */
import { homePathForRole, loginPathForArea, USER_ROLES, type UserRole } from '@/lib/roles'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type AuthDestination =
  | { kind: 'splash' }
  | { kind: 'super-admin-login' }
  | { kind: 'doctor-login' }
  | { kind: 'signup' }
  | { kind: 'super-admin' }
  | { kind: 'doctor' }
  | { kind: 'redirect'; to: string }

export function resolveAuthDestination(input: {
  status: AuthStatus
  role: UserRole | null
  path: string
}): AuthDestination {
  const { status, role, path } = input
  if (status === 'loading') return { kind: 'splash' }

  if (status === 'authenticated' && role) {
    const home = homePathForRole(role)
    const onPublicAuth =
      path === '' ||
      path === '/' ||
      path === '/super-admin' ||
      path === '/super-admin/login' ||
      path === '/super-admin/signup' ||
      path === '/doctor' ||
      path === '/doctor/login' ||
      path === '/doctor-portal'

    if (onPublicAuth) return { kind: 'redirect', to: home }

    if (path.startsWith('/super-admin')) {
      if (role !== USER_ROLES.SUPER_ADMIN) return { kind: 'redirect', to: home }
      return { kind: 'super-admin' }
    }

    if (path.startsWith('/doctor')) {
      if (role !== USER_ROLES.DOCTOR) return { kind: 'redirect', to: home }
      return { kind: 'doctor' }
    }

    if (path.startsWith('/telehealth/')) {
      if (role !== USER_ROLES.DOCTOR) return { kind: 'redirect', to: home }
      return { kind: 'doctor' }
    }

    return { kind: 'redirect', to: home }
  }

  if (path === '/super-admin/signup') return { kind: 'signup' }
  if (path === '/doctor/login' || path === '/doctor-portal') return { kind: 'doctor-login' }
  if (path === '/doctor' || path.startsWith('/doctor/')) return { kind: 'redirect', to: '/doctor/login' }
  if (path && path !== '/super-admin/login' && path !== '/' && path !== '/super-admin') {
    return { kind: 'redirect', to: loginPathForArea(path) }
  }
  return { kind: 'super-admin-login' }
}
